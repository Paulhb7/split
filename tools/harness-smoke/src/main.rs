//! harness-smoke — spawn every harness in `config/harnesses.json`, run the ACP
//! handshake plus one tiny real turn ("reply with: hi"), and print a table of
//! which ones actually work.
//!
//! This is a MANUAL dev tool, not a CI test: it downloads agent CLIs on first
//! use (`npx`/`uvx`), needs each agent's own auth, and talks to the network.
//!
//!   cargo run -p harness-smoke               # all harnesses
//!   cargo run -p harness-smoke -- claude codex   # just these
//!
//! Per harness it reports:
//!   ✅ turn ok       — handshake + a real reply came back
//!   🔌 acp ok        — speaks ACP, but the turn failed (non-auth reason)
//!   ⚠️  auth required — launches + speaks ACP, but needs sign-in / a key
//!   ❌ failed        — couldn't spawn / no ACP / hard error (reason shown)
//!
//! It reuses the same path the production runner does (ACP SDK, `./var/bin`
//! command resolution, Hermes/OpenCode model config, the Windows cmd shim) —
//! minus Tauri — so a green row here means the real app would handshake too.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use agent_client_protocol::{
    schema::{
        ClientCapabilities, ContentBlock, EnvVariable, FileSystemCapabilities, InitializeRequest,
        McpServer, McpServerStdio, NewSessionRequest, ProtocolVersion, PromptRequest,
        ReadTextFileRequest, RequestPermissionOutcome, RequestPermissionRequest,
        RequestPermissionResponse, SessionNotification, SessionUpdate, TextContent,
        WriteTextFileRequest,
    },
    AcpAgent, Agent, Client, ConnectionTo, LineDirection,
};
use serde_json::Value;
use tokio::time::timeout;

// Generous timeouts: a cold `npx -y <pkg>@<ver>` can spend a while downloading
// before it even speaks ACP.
const INIT_TIMEOUT: Duration = Duration::from_secs(150);
const NEW_SESSION_TIMEOUT: Duration = Duration::from_secs(60);
const PROMPT_TIMEOUT: Duration = Duration::from_secs(120);

const PROVIDER_KEYS: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "MISTRAL_API_KEY",
    "DASHSCOPE_API_KEY",
    "GH_TOKEN",
    "H_API_KEY",
];

enum Outcome {
    TurnOk(String),
    AcpOk(String),
    AuthRequired,
    Failed(String),
}

#[tokio::main]
async fn main() {
    let repo = resolve_repo_root();
    let harnesses_path = repo.join("config").join("harnesses.json");
    let raw = match std::fs::read_to_string(&harnesses_path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("cannot read {}: {e}", harnesses_path.display());
            std::process::exit(2);
        }
    };
    let map: serde_json::Map<String, Value> = match serde_json::from_str(&raw) {
        Ok(Value::Object(m)) => m,
        _ => {
            eprintln!("harnesses.json is not a JSON object");
            std::process::exit(2);
        }
    };

    // Optional positional filter: only probe the named harnesses.
    let filter: Vec<String> = std::env::args().skip(1).collect();

    let var_dir = repo.join("var");
    load_dotenv(&repo.join(".env"));
    let cwd = std::env::temp_dir().join("split-harness-smoke");
    let _ = std::fs::create_dir_all(&cwd);

    let names: Vec<String> = map
        .keys()
        .filter(|k| !k.starts_with('_'))
        .filter(|k| filter.is_empty() || filter.iter().any(|f| f == *k))
        .cloned()
        .collect();

    if names.is_empty() {
        eprintln!("no matching harnesses");
        std::process::exit(2);
    }

    eprintln!(
        "Probing {} harness(es): {}\n(cold npx downloads can take a minute each)\n",
        names.len(),
        names.join(", ")
    );

    let mut results: Vec<(String, Outcome)> = Vec::new();
    for name in &names {
        let row = &map[name];
        let (command, args, env) = match build_spawn(&repo, &var_dir, name, row) {
            Some(t) => t,
            None => {
                results.push((
                    name.clone(),
                    Outcome::Failed("no `command` in harnesses.json".into()),
                ));
                continue;
            }
        };
        eprint!("→ {name:<13} … ");
        let outcome = probe(name, command, args, env, cwd.clone()).await;
        eprintln!("{}", short(&outcome));
        results.push((name.clone(), outcome));
    }

    print_table(&results);

    // Exit non-zero if any harness hard-failed (auth-required is not a failure).
    let any_failed = results
        .iter()
        .any(|(_, o)| matches!(o, Outcome::Failed(_)));
    if any_failed {
        std::process::exit(1);
    }
}

/// Resolve command + args + child env for one harness, mirroring the runner.
fn build_spawn(
    repo: &Path,
    var_dir: &Path,
    name: &str,
    row: &Value,
) -> Option<(String, Vec<String>, HashMap<String, String>)> {
    let command_raw = row.get("command").and_then(|v| v.as_str())?.to_string();
    // `./var/bin/...` resolves relative to the repo root (like core.resolve_command).
    let command = if command_raw.starts_with("./") || command_raw.starts_with("../") {
        repo.join(&command_raw).to_string_lossy().into_owned()
    } else {
        command_raw
    };
    let base_args: Vec<String> = row
        .get("args")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    // Hermes / OpenCode model-picker config → extra args (prepended) + env.
    let (extra_args, extra_env) = split_core::harness_config::apply(repo, var_dir, name);
    let mut args = Vec::with_capacity(extra_args.len() + base_args.len());
    args.extend(extra_args);
    args.extend(base_args);

    // Child env: PATH (so npx/uvx resolve) + forwarded provider keys + harness env.
    let mut env: HashMap<String, String> = HashMap::new();
    env.insert("PATH".to_string(), child_path());
    for k in PROVIDER_KEYS {
        if let Ok(v) = std::env::var(k) {
            if !v.is_empty() {
                env.insert((*k).to_string(), v);
            }
        }
    }
    for (k, v) in extra_env {
        env.insert(k, v);
    }

    #[cfg(target_os = "windows")]
    let (command, args) = windows_spawn_shim(command, args);

    Some((command, args, env))
}

/// Spawn the harness and run initialize → session/new → one prompt.
async fn probe(
    name: &str,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: PathBuf,
) -> Outcome {
    let env_vars: Vec<EnvVariable> = env.into_iter().map(|(k, v)| EnvVariable::new(k, v)).collect();
    let stdio = McpServerStdio::new(name, PathBuf::from(&command))
        .args(args)
        .env(env_vars);

    // Capture agent stderr so a hard failure can show *why*.
    let stderr = Arc::new(Mutex::new(String::new()));
    let stderr_c = stderr.clone();
    let agent = AcpAgent::new(McpServer::Stdio(stdio)).with_debug(move |line, dir| {
        if matches!(dir, LineDirection::Stderr) {
            let mut s = stderr_c.lock().unwrap();
            if s.len() < 4000 {
                s.push_str(line);
                s.push('\n');
            }
        }
    });

    // Collect streamed agent text so we can show a sample of the reply.
    let reply = Arc::new(Mutex::new(String::new()));
    let reply_c = reply.clone();

    let result: Result<Outcome, agent_client_protocol::Error> = Client
        .builder()
        .on_receive_notification(
            async move |n: SessionNotification, _cx| {
                if let SessionUpdate::AgentMessageChunk(chunk) = &n.update {
                    if let ContentBlock::Text(t) = &chunk.content {
                        let mut g = reply_c.lock().unwrap();
                        if g.len() < 400 {
                            g.push_str(&t.text);
                        }
                    }
                }
                Ok(())
            },
            agent_client_protocol::on_receive_notification!(),
        )
        // fs + permissions are disabled for the smoke turn — "say hi" needs
        // neither, and refusing keeps the probe from hanging on a tool call.
        .on_receive_request(
            async move |_r: ReadTextFileRequest, responder, _c| {
                responder.respond_with_internal_error("smoke: fs disabled".to_string())
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |_r: WriteTextFileRequest, responder, _c| {
                responder.respond_with_internal_error("smoke: fs disabled".to_string())
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |_r: RequestPermissionRequest, responder, _c| {
                responder.respond(RequestPermissionResponse::new(
                    RequestPermissionOutcome::Cancelled,
                ))
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(agent, move |conn: ConnectionTo<Agent>| async move {
            // ── initialize ──
            let caps = ClientCapabilities::default()
                .fs(FileSystemCapabilities::new()
                    .read_text_file(true)
                    .write_text_file(true))
                .terminal(false);
            let init_fut = conn
                .send_request(InitializeRequest::new(ProtocolVersion::V1).client_capabilities(caps))
                .block_task();
            let init = match timeout(INIT_TIMEOUT, init_fut).await {
                Err(_) => return Ok(Outcome::Failed("initialize timed out".into())),
                Ok(Err(e)) => {
                    let m = format!("{e}");
                    return Ok(if looks_like_auth_error(&m) {
                        Outcome::AuthRequired
                    } else {
                        Outcome::Failed(format!("initialize: {}", first_line(&m)))
                    });
                }
                Ok(Ok(i)) => i,
            };
            let has_auth_methods = !init.auth_methods.is_empty();

            // ── session/new (no MCP servers — keep the turn minimal) ──
            let ns_fut = conn
                .send_request(NewSessionRequest::new(cwd.clone()).mcp_servers(vec![]))
                .block_task();
            let session_id = match timeout(NEW_SESSION_TIMEOUT, ns_fut).await {
                Err(_) => return Ok(Outcome::Failed("session/new timed out".into())),
                Ok(Err(e)) => {
                    let m = format!("{e}");
                    return Ok(if looks_like_auth_error(&m) || has_auth_methods {
                        Outcome::AuthRequired
                    } else {
                        Outcome::Failed(format!("session/new: {}", first_line(&m)))
                    });
                }
                Ok(Ok(s)) => s.session_id,
            };

            // ── one tiny turn ──
            let prompt = PromptRequest::new(
                session_id,
                vec![ContentBlock::Text(TextContent::new(
                    "Reply with exactly: hi".to_string(),
                ))],
            );
            match timeout(PROMPT_TIMEOUT, conn.send_request(prompt).block_task()).await {
                Err(_) => Ok(Outcome::AcpOk("turn timed out".into())),
                Ok(Err(e)) => {
                    let m = format!("{e}");
                    Ok(if looks_like_auth_error(&m) {
                        Outcome::AuthRequired
                    } else {
                        Outcome::AcpOk(format!("turn error: {}", first_line(&m)))
                    })
                }
                Ok(Ok(_)) => {
                    let sample = reply.lock().unwrap().trim().replace('\n', " ");
                    let sample: String = sample.chars().take(60).collect();
                    Ok(Outcome::TurnOk(sample))
                }
            }
        })
        .await;

    match result {
        Ok(o) => o,
        Err(e) => {
            let last = {
                let s = stderr.lock().unwrap();
                s.trim().lines().last().unwrap_or("").to_string()
            };
            let msg = first_line(&format!("{e}"));
            Outcome::Failed(if last.is_empty() {
                msg
            } else {
                format!("{msg} | {last}")
            })
        }
    }
}

fn print_table(results: &[(String, Outcome)]) {
    let (mut ok, mut acp, mut auth, mut fail) = (0, 0, 0, 0);
    println!("\n┌─ harness smoke ──────────────────────────────────────────────");
    for (name, o) in results {
        let (icon, detail) = match o {
            Outcome::TurnOk(s) => {
                ok += 1;
                ("✅ turn ok", if s.is_empty() { String::new() } else { format!("“{s}”") })
            }
            Outcome::AcpOk(s) => {
                acp += 1;
                ("🔌 acp ok ", s.clone())
            }
            Outcome::AuthRequired => {
                auth += 1;
                ("⚠️  auth  ", "sign in / set a key, then re-run".into())
            }
            Outcome::Failed(s) => {
                fail += 1;
                ("❌ failed ", s.clone())
            }
        };
        println!("│ {icon}  {name:<13} {detail}");
    }
    println!("└──────────────────────────────────────────────────────────────");
    println!("  {ok} ok · {acp} acp-only · {auth} need-auth · {fail} failed");
}

fn short(o: &Outcome) -> &'static str {
    match o {
        Outcome::TurnOk(_) => "✅",
        Outcome::AcpOk(_) => "🔌",
        Outcome::AuthRequired => "⚠️",
        Outcome::Failed(_) => "❌",
    }
}

fn first_line(s: &str) -> String {
    s.lines().next().unwrap_or(s).chars().take(120).collect()
}

/// Same keyword scan as the runner's `looks_like_auth_error`.
fn looks_like_auth_error(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    [
        "auth", "login", "unauthor", "api key", "api_key", "credit", "401", "403", "forbidden",
        "sign in", "not permitted", "no_api_key",
    ]
    .iter()
    .any(|h| lower.contains(h))
}

/// PATH for spawned agents — mirrors the runner's `child_path`.
#[cfg(not(target_os = "windows"))]
fn child_path() -> String {
    let mut parts: Vec<String> = vec![
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
        "/usr/bin".into(),
        "/bin".into(),
        "/usr/sbin".into(),
        "/sbin".into(),
    ];
    if let Ok(home) = std::env::var("HOME") {
        parts.insert(0, format!("{home}/.local/bin"));
        parts.push(format!("{home}/.cargo/bin"));
        parts.push(format!("{home}/.bun/bin"));
    }
    if let Ok(existing) = std::env::var("PATH") {
        parts.push(existing);
    }
    parts.join(":")
}

#[cfg(target_os = "windows")]
fn child_path() -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Ok(existing) = std::env::var("PATH") {
        parts.push(existing);
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        parts.push(format!("{profile}\\.cargo\\bin"));
    }
    parts.join(";")
}

/// `cmd /C` wrap for bare command names on Windows — mirrors the runner.
#[cfg(target_os = "windows")]
fn windows_spawn_shim(command: String, args: Vec<String>) -> (String, Vec<String>) {
    let is_path = command.contains('/') || command.contains('\\');
    let is_exe = command.to_ascii_lowercase().ends_with(".exe");
    if is_path || is_exe {
        return (command, args);
    }
    let mut wrapped = Vec::with_capacity(args.len() + 2);
    wrapped.push("/C".to_string());
    wrapped.push(command);
    wrapped.extend(args);
    ("cmd".to_string(), wrapped)
}

/// Minimal `.env` loader (KEY=VALUE per line) — sets vars that aren't already
/// in the environment, so keys provisioned in the repo `.env` reach the agents.
fn load_dotenv(path: &Path) {
    let Ok(body) = std::fs::read_to_string(path) else {
        return;
    };
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            let (k, v) = (k.trim(), v.trim().trim_matches('"').trim_matches('\''));
            if !k.is_empty() && std::env::var(k).is_err() {
                std::env::set_var(k, v);
            }
        }
    }
}

/// `$SPLIT_REPO_ROOT`, else walk up from CWD to the dir holding
/// `config/harnesses.json`, else CWD.
fn resolve_repo_root() -> PathBuf {
    if let Ok(d) = std::env::var("SPLIT_REPO_ROOT") {
        if !d.is_empty() {
            return PathBuf::from(d);
        }
    }
    let start = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut dir = start.clone();
    loop {
        if dir.join("config/harnesses.json").is_file() {
            return dir;
        }
        if !dir.pop() {
            return start;
        }
    }
}
