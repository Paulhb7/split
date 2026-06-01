use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{LazyLock, Mutex};

use serde_json::json;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

// The native Rust ACP runner — the sole session backend. `start_session`
// drives ACP in-process via `runner.rs` + the portable `split-core` engine,
// so the shipped `.dmg` needs no Python runtime. (The retired Python sidecar
// lives, reference-only, in the gitignored `split-python/`; it is no longer
// wired into the app.)
mod runner;

// Engine modules from the workspace's `split-core` crate. `lib.rs` uses
// `harness_config` (model picker translation) + `persona` (workspace
// projection); `runner.rs` reaches for the rest directly.
use split_core::{harness_config, persona};

// The repo root is resolved at RUNTIME — nothing machine-specific is baked
// in. Resolution order:
//   1. env override   — `SPLIT_REPO_ROOT`
//   2. walk up from the executable to the dir holding `config/harnesses.json`
//      + `Cargo.toml` (the workspace root marker — covers `tauri dev` and
//      `tauri build`).
//   3. compile-time fallback — three levels up from `CARGO_MANIFEST_DIR`.
static REPO_ROOT: LazyLock<PathBuf> = LazyLock::new(resolve_repo_root);

fn resolve_repo_root() -> PathBuf {
    if let Ok(dir) = std::env::var("SPLIT_REPO_ROOT") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    let is_root =
        |p: &Path| p.join("config/harnesses.json").is_file() && p.join("Cargo.toml").is_file();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(root) = exe.ancestors().find(|&p| is_root(p)) {
            return root.to_path_buf();
        }
    }
    let crate_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    crate_root.canonicalize().unwrap_or(crate_root)
}

// --- multi-session ----------------------------------------------------------
// Each session is a long-lived agent driven by the native Rust ACP runner
// (see `runner.rs`). We keep the control-channel sender (to feed turns / auth
// / stop) plus what it is (harness/expert) so a window opened later can
// hydrate via `list_sessions`.
struct Session {
    tx: tokio::sync::mpsc::UnboundedSender<runner::RunnerInput>,
    harness: String,
    expert: String,
}

static SESSIONS: LazyLock<Mutex<HashMap<String, Session>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// One stdout/stderr line from a session, tagged with its id. Exactly one of
// `vevt` / `log` / `exit` carries meaning per event. Broadcast to ALL windows.
#[derive(Clone, serde::Serialize)]
struct SessionEvent {
    id: String,
    vevt: Option<String>,
    log: Option<String>,
    exit: bool,
}

fn emit_log(app: &AppHandle, id: &str, line: String) {
    let _ = app.emit(
        "session-event",
        SessionEvent {
            id: id.into(),
            vevt: None,
            log: Some(line),
            exit: false,
        },
    );
}

fn emit_exit(app: &AppHandle, id: &str) {
    let _ = app.emit(
        "session-event",
        SessionEvent {
            id: id.into(),
            vevt: None,
            log: None,
            exit: true,
        },
    );
}

// A GUI app launched from Finder (macOS) gets a minimal PATH, so `npx`/`uvx`/
// `node` (the agent CLIs) aren't found. Prepend the usual install dirs so the
// agent processes the runner spawns can resolve them.
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

// Windows GUI processes inherit the user PATH normally (no Finder-minimal-PATH
// problem), so we pass it through, appending the per-user cargo bin so
// locally-built harness binaries resolve. PATH separator is `;`.
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

// Open a file path or URL with the OS default handler (Finder/Explorer/xdg,
// default browser). Cross-platform replacement for the macOS `open` command.
fn open_external(target: &str) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(target);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        // `start` is a cmd builtin; the empty "" is the (required) window title.
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", target]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(target);
        c
    };
    cmd.status().map(|_| ())
}

// Windows spawn shim: `npx`/`uvx`/`npm`/`node`-style launchers are `.cmd`
// batch shims, and the spawn the ACP SDK does (`Command::new(<name>)`) does NOT
// honour PATHEXT, so a bare name fails to launch. Rewrite a bare command into
// `cmd /C <command> <args…>` so the Windows shell resolves it. Path-qualified
// commands (containing `/` or `\`, e.g. the resolved `./var/bin/...` binaries)
// and `.exe`s are left untouched.
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

// Resize the borderless window to a content-fitted height. The React side
// computes the desired height via a ResizeObserver on the natural content
// (compact = just the composer row, expanded = thread/stage/teams + composer),
// dedupes via `lastHeightRef`, and calls this. Width is normally fixed at
// BAR_WIDTH but the React layer can swap to a wider mode via `set_bar_width`
// (e.g. the "Your agents" overlay that needs more room to breathe).
static BAR_WIDTH: LazyLock<Mutex<f64>> = LazyLock::new(|| Mutex::new(680.0));

#[tauri::command]
fn set_bar_height(window: WebviewWindow, height: f64) {
    let h = height.clamp(48.0, 1400.0); // sane clamp; React already clamps too
    let w = *BAR_WIDTH.lock().unwrap();
    let _ = window.set_size(LogicalSize::new(w, h));
}

// Switch the bar's logical width. Updates the shared state so subsequent
// `set_bar_height` calls honour the new width, AND resizes immediately so the
// change is visible without waiting for the next ResizeObserver tick.
#[tauri::command]
fn set_bar_width(window: WebviewWindow, width: f64) {
    let w = width.clamp(400.0, 2200.0);
    *BAR_WIDTH.lock().unwrap() = w;
    let scale = window.scale_factor().unwrap_or(1.0);
    if let Ok(sz) = window.outer_size() {
        let h_logical = (sz.height as f64) / scale;
        let _ = window.set_size(LogicalSize::new(w, h_logical));
    }
}

// Reveal the workspace folder (or one session's subfolder) in Finder. `workspace`
// empty → the default root (<repo>/var/workspace).
#[tauri::command]
fn open_workspace(workspace: String, session_id: Option<String>) {
    let root = if workspace.is_empty() {
        REPO_ROOT.join("var").join("workspace")
    } else {
        std::path::PathBuf::from(workspace)
    };
    let target = match session_id {
        Some(id) if !id.is_empty() => root.join("sessions").join(id),
        _ => root,
    };
    let _ = std::fs::create_dir_all(&target);
    let _ = open_external(&target.to_string_lossy());
}

// Read `config/tools.json` and build the list of MCP servers to pass to the
// Rust runner's `NewSessionRequest`. Mirrors `core.load_mcp` (Python). Only
// the stdio transport is supported here — the HTTP / SSE / ACP variants
// require capability negotiation we don't surface yet.
fn load_mcp_servers() -> Vec<agent_client_protocol::schema::McpServer> {
    use agent_client_protocol::schema::{EnvVariable, McpServer, McpServerStdio};
    let path = REPO_ROOT.join("config").join("tools.json");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return vec![];
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return vec![];
    };
    let Some(servers_obj) = val.get("mcpServers").and_then(|v| v.as_object()) else {
        return vec![];
    };
    let mut out: Vec<McpServer> = Vec::new();
    for (name, srv) in servers_obj {
        let Some(command) = srv.get("command").and_then(|v| v.as_str()) else {
            continue;
        };
        let args: Vec<String> = srv
            .get("args")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        // `${VAR}` expansion mirrors Python's `os.path.expandvars`.
        let env: Vec<EnvVariable> = srv
            .get("env")
            .and_then(|v| v.as_object())
            .map(|env_obj| {
                env_obj
                    .iter()
                    .filter_map(|(k, v)| {
                        let raw = v.as_str()?;
                        Some(EnvVariable::new(k.clone(), expand_env(raw)))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let stdio = McpServerStdio::new(name.as_str(), PathBuf::from(command))
            .args(args)
            .env(env);
        out.push(McpServer::Stdio(stdio));
    }
    out
}

// `${VAR}` and `$VAR` expansion — minimal port of Python's `os.path.expandvars`.
// Used by `load_mcp_servers` so tools.json can reference provider keys without
// hardcoding them in the repo.
fn expand_env(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'$' && i + 1 < bytes.len() {
            let (name, advance) = if bytes[i + 1] == b'{' {
                // `${NAME}` form — read until matching `}`.
                let end = bytes[i + 2..].iter().position(|&b| b == b'}');
                if let Some(end) = end {
                    let name = std::str::from_utf8(&bytes[i + 2..i + 2 + end]).unwrap_or("");
                    (name.to_string(), end + 3)
                } else {
                    out.push('$');
                    i += 1;
                    continue;
                }
            } else {
                // `$NAME` form — read while alphanumeric or `_`.
                let end = bytes[i + 1..]
                    .iter()
                    .position(|&b| !b.is_ascii_alphanumeric() && b != b'_')
                    .unwrap_or(bytes.len() - i - 1);
                let name = std::str::from_utf8(&bytes[i + 1..i + 1 + end]).unwrap_or("");
                if name.is_empty() {
                    out.push('$');
                    i += 1;
                    continue;
                }
                (name.to_string(), end + 1)
            };
            match std::env::var(&name) {
                Ok(v) => out.push_str(&v),
                Err(_) => {
                    // Leave the placeholder in-place (Python `os.path.expandvars`
                    // semantics — unknown vars are kept verbatim).
                    out.push('$');
                    if s.as_bytes()[i + 1] == b'{' {
                        out.push('{');
                        out.push_str(&name);
                        out.push('}');
                    } else {
                        out.push_str(&name);
                    }
                }
            }
            i += advance;
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    out
}

// Start a long-lived session: spawn the agent directly via the ACP Rust SDK
// inside this process (one tokio task per session — no subprocess middleman),
// stream its VEVT output back over the `session-event` channel, and persist a
// per-session archive under `var/sessions/<id>/`. Resolves the harness command
// + args from `config/harnesses.json`, projects the expert's persona + skills
// into its workspace, mounts MCP tools, and routes auth / resume / logout /
// cancel through the control channel.
//
// `resume=Some(true)` reconnects to the agent's prior ACP session (read from
// `var/sessions/<id>/meta.json::acp_sid`); the runner falls back to a new
// session if the agent doesn't advertise `sessionCapabilities.resume`.
#[tauri::command]
fn start_session(
    app: AppHandle,
    id: String,
    harness: String,
    expert: String,
    workspace: String,
    resume: Option<bool>,
) {
    let harness = if harness.is_empty() {
        "claude".to_string()
    } else {
        harness
    };
    let expert = if expert.is_empty() {
        "consultant".to_string()
    } else {
        expert
    };
    eprintln!("[start_session] {id} ({harness}/{expert}) ws={workspace:?}");

    // Resolve the harness's launch command from harnesses.json (same source
    // the Python runner reads via `core.load_harnesses`).
    let map = match read_harnesses_map() {
        Ok(m) => m,
        Err(e) => {
            emit_log(&app, &id, format!("harnesses.json error: {e}"));
            emit_exit(&app, &id);
            return;
        }
    };
    let row = match map.get(&harness) {
        Some(r) => r,
        None => {
            emit_log(&app, &id, format!("unknown harness: {harness}"));
            emit_exit(&app, &id);
            return;
        }
    };
    let command_raw = row
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    // Resolve `./var/bin/...` relative to REPO_ROOT (mirrors `core.resolve_command`).
    let command = if command_raw.starts_with("./") || command_raw.starts_with("../") {
        REPO_ROOT.join(&command_raw).to_string_lossy().into_owned()
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

    // Apply per-harness model-picker config (Hermes / OpenCode). Returns
    // extra CLI args prepended to the harness's own args, plus env vars
    // applied to the spawned child. Other harnesses pass through unchanged.
    let var_dir_for_cfg = REPO_ROOT.join("var");
    let (extra_args, extra_env) = harness_config::apply(&REPO_ROOT, &var_dir_for_cfg, &harness);
    // Top-level Hermes flags must precede the `acp` subcommand — `-m` /
    // `--provider` are global, not subcommand-scoped. Putting them after
    // breaks with "unrecognised arguments". OpenCode produces empty
    // extra_args (XDG_CONFIG_HOME drives everything), so the order is
    // harmless there.
    let mut args = Vec::with_capacity(extra_args.len() + base_args.len());
    args.extend(extra_args);
    args.extend(base_args);

    // Compute + project the per-expert workspace. Mirrors the Python path's
    // `core.expert_workspace_dir` + `core.ensure_expert_workspace`: each
    // expert gets `<repo>/var/workspace/<expert>/`, the persona body lands
    // in `AGENTS.md` (with CLAUDE.md / GEMINI.md / QWEN.md / VIBE.md +
    // .vibe/AGENTS.md shims), and allowed skills are symlinked into the
    // harness-specific skill dirs (`.claude/skills/`, `.agents/skills/`,
    // `.vibe/skills/`). Empty `workspace` from the caller means "default".
    let var_dir = REPO_ROOT.join("var");
    let workspace_root = if workspace.is_empty() {
        var_dir.join("workspace")
    } else {
        PathBuf::from(&workspace)
    };
    let ws = persona::ensure_expert_workspace(&REPO_ROOT, &var_dir, &workspace_root, &expert);
    let resolved_workspace = ws.to_string_lossy().into_owned();

    // First-turn persona injection — ACP has no standardised system prompt,
    // and per-harness cwd conventions all differ. Prepending the persona to
    // the first user prompt of the session lands it in the agent's history
    // and persists across turns, exactly like the runner does.
    let persona_body = persona::persona_text_for_injection(&REPO_ROOT, &var_dir, &expert);

    let mcp_servers = load_mcp_servers();
    let sessions_dir = var_dir.join("sessions");
    let _ = std::fs::create_dir_all(&sessions_dir);

    // Build the env we'll inject into the agent child (provider keys from the
    // OS keychain + OTLP forwards if the user has them in their env). The
    // Python path does this via the Python child's env; we do it via the
    // `McpServerStdio.env` the SDK applies on spawn.
    let mut agent_env: HashMap<String, String> = HashMap::new();
    for key in KNOWN_KEYS {
        if let Some(val) = secret_get(key) {
            if !val.is_empty() {
                agent_env.insert((*key).to_string(), val);
            }
        }
    }
    if let Ok(endpoint) = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT") {
        if !endpoint.is_empty() {
            agent_env.insert("OTEL_EXPORTER_OTLP_ENDPOINT".into(), endpoint);
            agent_env.insert("OTEL_SERVICE_NAME".into(), format!("split-{harness}"));
            agent_env.insert(
                "OTEL_RESOURCE_ATTRIBUTES".into(),
                format!("split.session_id={id},split.expert={expert}"),
            );
            for k in [
                "OTEL_EXPORTER_OTLP_HEADERS",
                "OTEL_EXPORTER_OTLP_PROTOCOL",
                "OTEL_TRACES_EXPORTER",
            ] {
                if let Ok(v) = std::env::var(k) {
                    if !v.is_empty() {
                        agent_env.insert(k.to_string(), v);
                    }
                }
            }
        }
    }
    // PATH gets `child_path()` so npx / uvx / node resolve in a Finder-
    // launched bundle (same fix the Python path needed).
    agent_env.insert("PATH".to_string(), child_path());
    // Harness-specific env (HERMES_HOME, XDG_CONFIG_HOME for OpenCode).
    for (k, v) in extra_env {
        agent_env.insert(k, v);
    }

    // On Windows, `npx`/`uvx`/`npm`/… are `.cmd` shims; `Command::new("npx")`
    // (what the ACP SDK does under the hood) does NOT resolve them via PATHEXT
    // and fails with "program not found". Route bare command names through
    // `cmd /C` so Windows performs the resolution. No-op on Unix and for
    // path-qualified commands (e.g. the `./var/bin/...` binaries).
    #[cfg(target_os = "windows")]
    let (command, args) = windows_spawn_shim(command, args);

    let handle = runner::start(
        app,
        id.clone(),
        harness.clone(),
        expert.clone(),
        sessions_dir,
        resolved_workspace,
        command,
        args,
        agent_env,
        mcp_servers,
        persona_body,
        resume.unwrap_or(false),
    );

    SESSIONS.lock().unwrap().insert(
        id,
        Session {
            tx: handle.tx,
            harness,
            expert,
        },
    );
}

// Feed the next turn to a running session — send `RunnerInput::Turn` on the
// session's control channel.
#[tauri::command]
fn send_turn(id: String, text: String) -> Result<(), String> {
    let map = SESSIONS.lock().unwrap();
    let s = map.get(&id).ok_or("no such session")?;
    s.tx.send(runner::RunnerInput::Turn(text))
        .map_err(|e| e.to_string())
}

// Answer an `auth_required` for a session — send `RunnerInput::Auth` on the
// control channel. The runner authenticates and auto-replays the pending prompt.
#[tauri::command]
fn send_auth(id: String, method_id: String) -> Result<(), String> {
    let map = SESSIONS.lock().unwrap();
    let s = map.get(&id).ok_or("no such session")?;
    s.tx.send(runner::RunnerInput::Auth { method_id })
        .map_err(|e| e.to_string())
}

// Trigger an ACP logout for a session. The runner calls the agent's `logout`
// method (gated by `agentCapabilities.auth.logout`) and re-surfaces `auth_required`.
#[tauri::command]
fn send_logout(id: String) -> Result<(), String> {
    let map = SESSIONS.lock().unwrap();
    let s = map.get(&id).ok_or("no such session")?;
    s.tx.send(runner::RunnerInput::Logout)
        .map_err(|e| e.to_string())
}

// Answer a `permission_request`: pop the oneshot from `PENDING_PERMS_RUST`
// keyed by request_id and hand the runner the picked option + scope. The
// runner persists per scope (`session` / `always-allow` / `always-deny`)
// before responding to the agent. `id` is accepted for API symmetry with the
// other session commands but isn't needed (the request_id is globally unique).
#[tauri::command]
fn send_permission(
    id: String,
    request_id: String,
    option_id: Option<String>,
    scope: String,
) -> Result<(), String> {
    let _ = id;
    if let Some(tx) = runner::PENDING_PERMS_RUST
        .lock()
        .unwrap()
        .remove(&request_id)
    {
        let _ = tx.send((option_id, scope));
        Ok(())
    } else {
        Err("no such pending permission".into())
    }
}

// Stop one session: send `RunnerInput::Stop` on the control channel. The
// runner task observes it, sends session/cancel + session/close to the agent,
// drops the ACP connection, and emits exit.
#[tauri::command]
fn stop_session(id: String) {
    if let Some(s) = SESSIONS.lock().unwrap().remove(&id) {
        let _ = s.tx.send(runner::RunnerInput::Stop);
    }
}

// The sessions the runner is still tracking, for a window that opened after
// they started (it missed their `ready` broadcast).
#[tauri::command]
fn list_sessions() -> String {
    let map = SESSIONS.lock().unwrap();
    let arr: Vec<serde_json::Value> = map
        .iter()
        .map(|(id, s)| json!({ "id": id, "harness": s.harness, "expert": s.expert }))
        .collect();
    json!(arr).to_string()
}

// Scan `var/sessions/` for archived (past) conversations. Each subfolder is a
// session id with a `meta.json`. Returns a JSON array sorted by started_at
// desc, so the desktop's "past conversations" menu shows the most recent first.
// Best-effort: malformed dirs are skipped silently.
#[tauri::command]
fn list_archived_sessions() -> String {
    let root = REPO_ROOT.join("var").join("sessions");
    let mut out: Vec<serde_json::Value> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&root) {
        for ent in entries.flatten() {
            let dir = ent.path();
            if !dir.is_dir() {
                continue;
            }
            let meta_path = dir.join("meta.json");
            let Ok(raw) = std::fs::read_to_string(&meta_path) else {
                continue;
            };
            let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
                continue;
            };
            out.push(val);
        }
    }
    out.sort_by(|a, b| {
        let sb = b.get("started_at").and_then(|v| v.as_str()).unwrap_or("");
        let sa = a.get("started_at").and_then(|v| v.as_str()).unwrap_or("");
        sb.cmp(sa)
    });
    json!(out).to_string()
}

// Read one archived session's full event stream as a single string (the raw
// NDJSON content of `var/sessions/<id>/events.ndjson`). The renderer parses
// it line-by-line and folds each event through the same reducer that draws
// live sessions, so the read-only replay is pixel-identical to the original.
#[tauri::command]
fn read_session_events(id: String) -> Result<String, String> {
    // Defence in depth: refuse anything that looks like a path traversal.
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("invalid session id".into());
    }
    let path = REPO_ROOT
        .join("var")
        .join("sessions")
        .join(&id)
        .join("events.ndjson");
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// Delete one archived session's folder (meta + events). Used by the UI's
// "remove from history" action. Returns Ok(()) if the dir was missing too.
#[tauri::command]
fn delete_archived_session(id: String) -> Result<(), String> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("invalid session id".into());
    }
    let path = REPO_ROOT.join("var").join("sessions").join(&id);
    if path.exists() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// The expert registry: shipped (`config/experts.json`) merged with user-custom
// (`<VAR_DIR>/experts/*.json`, one entry per file, slug = filename stem).
// Shipped wins on slug collision — users can't shadow built-ins. Mirrors the
// Python contract in `split.core::load_experts` so the desktop picker sees the
// same roster Recruiter wrote on disk.
#[tauri::command]
fn list_experts() -> Result<String, String> {
    let raw = std::fs::read_to_string(REPO_ROOT.join("config").join("experts.json"))
        .map_err(|e| e.to_string())?;
    let val: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let mut merged = match val {
        serde_json::Value::Object(map) => map
            .into_iter()
            .filter(|(k, _)| !k.starts_with('_'))
            .collect::<serde_json::Map<_, _>>(),
        _ => return Ok(raw),
    };
    let custom_dir = REPO_ROOT.join("var").join("experts");
    if let Ok(entries) = std::fs::read_dir(&custom_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let slug = match path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_string(),
                None => continue,
            };
            if merged.contains_key(&slug) {
                continue; // shipped wins
            }
            let Ok(body) = std::fs::read_to_string(&path) else {
                continue;
            };
            let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body) else {
                continue;
            };
            merged.insert(slug, parsed);
        }
    }
    serde_json::to_string(&merged).map_err(|e| e.to_string())
}

// Spawn a harness's login command directly (no Terminal). These CLIs all do
// browser-based OAuth — running them as a detached subprocess is enough; the
// CLI opens the user's default browser itself. Stdout/stderr are dropped (the
// CLI's logs live in its own session); stdin is null so it can't block on TTY.
fn login_cmd(harness: &str) -> Option<&'static [&'static str]> {
    Some(match harness {
        "claude" => &["claude", "login"],
        "codex" => &["codex", "login"],
        "gemini" => &["gemini"],
        "cursor" => &["cursor-agent", "login"],
        "copilot" => &["gh", "auth", "login", "-w"],
        _ => return None,
    })
}

#[tauri::command]
fn browser_login(harness: String) -> Result<String, String> {
    let argv = login_cmd(&harness).ok_or_else(|| format!("No browser login for {harness}"))?;
    let (program, args) = argv.split_first().expect("login_cmd entries are non-empty");
    Command::new(program)
        .args(args)
        .env("PATH", child_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "cmd": argv.join(" ") }).to_string())
}

// --- API keys ----------------------------------------------------------------
// Provider keys the ACP harnesses may need. The bar collects them and we persist
// to the OS secret store (macOS Keychain / Windows Credential Manager / Linux
// Secret Service via the `keyring` crate), so keys never touch disk in plaintext.
// At session spawn we read them back and inject them into the agent child's
// env (via `McpServerStdio.env`). A legacy `.env` at the repo root is still
// consulted for the UI's "configured?" detection (see `env_in_dotenv`), and
// any key the user exported in their shell is inherited by the agent — but the
// app no longer auto-loads `.env` itself. Allowlisted so the UI can't store
// arbitrary secrets in the OS keychain.
const KNOWN_KEYS: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "MISTRAL_API_KEY",
    "DASHSCOPE_API_KEY",
    "GH_TOKEN",
];

// Service identifier under which all Split-owned secrets are stored. Keychain
// records appear under (service="split", account=KEY_NAME).
const KEYCHAIN_SERVICE: &str = "split";

fn env_path() -> PathBuf {
    REPO_ROOT.join(".env")
}

fn secret_entry(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, name).map_err(|e| e.to_string())
}

fn secret_set(name: &str, value: &str) -> Result<(), String> {
    secret_entry(name)?
        .set_password(value)
        .map_err(|e| e.to_string())
}

fn secret_get(name: &str) -> Option<String> {
    secret_entry(name).ok()?.get_password().ok()
}

fn secret_present(name: &str) -> bool {
    secret_get(name)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

#[tauri::command]
fn save_api_key(name: String, value: String) -> Result<(), String> {
    if !KNOWN_KEYS.contains(&name.as_str()) {
        return Err(format!("unknown key: {name}"));
    }
    secret_set(&name, &value)
}

// --- harness lifecycle (install + configure state) --------------------------
// Each harness card in the UI shows an install/configure status pastille; the
// `Install` button bootstraps the runtime (npx-cache warm, binary fetch, or a
// docs link), the `Configure` button surfaces the auth path declared in
// harnesses.json. Detection logic mirrors how the runner actually finds things
// at launch — file exists, env var set, or command on PATH.

fn expand_tilde(p: &str) -> PathBuf {
    if let Some(rest) = p.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(p)
}

fn env_in_dotenv(key: &str) -> bool {
    let env = std::fs::read_to_string(env_path()).unwrap_or_default();
    env.lines().any(|l| {
        let l = l.trim_start();
        l.starts_with(&format!("{key}="))
            && l.split_once('=')
                .map(|x| !x.1.trim().is_empty())
                .unwrap_or(false)
    })
}

fn env_set(key: &str) -> bool {
    std::env::var(key)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
        || secret_present(key)
        || env_in_dotenv(key)
}

fn command_on_path(cmd: &str) -> bool {
    if cmd.starts_with("./") || cmd.starts_with("../") {
        return REPO_ROOT.join(cmd).exists();
    }
    // `where` on Windows, `which` elsewhere.
    let probe = if cfg!(target_os = "windows") {
        "where"
    } else {
        "/usr/bin/which"
    };
    Command::new(probe)
        .arg(cmd)
        .env("PATH", child_path())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// `install`: "npx" → always ready (npx -y warms on first launch);
// "binary"/"external"/"script" → check that the launch command resolves
// (post-install the binary should be on PATH, e.g. ~/.local/bin/hermes).
fn install_state_for(install_kind: Option<&str>, command: &str) -> &'static str {
    match install_kind {
        Some("npx") => "ready",
        Some("external") | Some("binary") | Some("script") => {
            if command_on_path(command) {
                "ready"
            } else {
                "missing"
            }
        }
        _ => "ready",
    }
}

// `configure`: "oauth" → a creds dotfile OR a fallback env key signals ready;
// "api-key" → the declared env key is in .env or process env; "external" → the
// UI just shows a docs link (always reported as "external"); "hermes-config" →
// custom panel (local/cloud + model picker); ready when at least one provider
// key is in the keychain OR Hermes's own OAuth file exists.
fn configure_state_for(cfg: Option<&serde_json::Value>) -> &'static str {
    let Some(cfg) = cfg else { return "ready" };
    let kind = cfg.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    match kind {
        "oauth" => {
            let file_ok = cfg
                .get("check_file")
                .and_then(|v| v.as_str())
                .map(|p| expand_tilde(p).exists())
                .unwrap_or(false);
            let env_ok = cfg
                .get("check_env")
                .and_then(|v| v.as_str())
                .map(env_set)
                .unwrap_or(false);
            if file_ok || env_ok {
                "ready"
            } else {
                "missing"
            }
        }
        "api-key" => {
            let ok = cfg
                .get("key")
                .and_then(|v| v.as_str())
                .map(env_set)
                .unwrap_or(false);
            if ok {
                "ready"
            } else {
                "missing"
            }
        }
        "external" => "external",
        "model-picker" => {
            // The generic picker is "ready" once the user has either picked
            // anything (cloud or local — we treat the existence of either
            // var/state/<harness>.config.json as a strong signal), or there's
            // at least one provider key in the keychain (so a cloud-mode
            // session can spawn even without our state file).
            let any_key = [
                "ANTHROPIC_API_KEY",
                "OPENAI_API_KEY",
                "GEMINI_API_KEY",
                "MISTRAL_API_KEY",
                "DASHSCOPE_API_KEY",
            ]
            .iter()
            .any(|k| secret_present(k));
            if any_key {
                "ready"
            } else {
                "missing"
            }
        }
        _ => "ready",
    }
}

fn read_harnesses_map() -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let path = REPO_ROOT.join("config").join("harnesses.json");
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let val: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    match val {
        serde_json::Value::Object(m) => {
            Ok(m.into_iter().filter(|(k, _)| !k.starts_with('_')).collect())
        }
        _ => Err("harnesses.json is not an object".into()),
    }
}

#[tauri::command]
fn harness_states() -> Result<String, String> {
    let map = read_harnesses_map()?;
    let mut out = serde_json::Map::new();
    for (id, val) in map {
        let install_spec = val.get("install");
        let cfg_spec = val.get("configure");
        let install_kind = install_spec
            .and_then(|i| i.get("kind"))
            .and_then(|v| v.as_str());
        let cfg_kind = cfg_spec
            .and_then(|c| c.get("kind"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let command = val.get("command").and_then(|v| v.as_str()).unwrap_or("");
        let install_state = install_state_for(install_kind, command);
        let configure_state = configure_state_for(cfg_spec);

        let mut install_obj = serde_json::Map::new();
        install_obj.insert("kind".into(), json!(install_kind.unwrap_or("")));
        install_obj.insert("state".into(), json!(install_state));
        if let Some(u) = install_spec.and_then(|i| i.get("docUrl")) {
            install_obj.insert("docUrl".into(), u.clone());
        }

        let mut cfg_obj = serde_json::Map::new();
        cfg_obj.insert("kind".into(), json!(cfg_kind));
        cfg_obj.insert("state".into(), json!(configure_state));
        if let Some(k) = cfg_spec.and_then(|c| c.get("key")) {
            cfg_obj.insert("key".into(), k.clone());
        }
        if let Some(u) = cfg_spec.and_then(|c| c.get("docUrl")) {
            cfg_obj.insert("docUrl".into(), u.clone());
        }

        out.insert(id, json!({ "install": install_obj, "configure": cfg_obj }));
    }
    serde_json::to_string(&out).map_err(|e| e.to_string())
}

fn emit_install(app: &AppHandle, id: &str, line: &str, done: bool, ok: bool) {
    let _ = app.emit(
        "install-event",
        json!({ "id": id, "line": line, "done": done, "ok": ok }),
    );
}

// Install dispatch:
// - "npx" → `npm cache add <pkg>@<ver>` warms the npm tarball cache, so the
//   first real `npx -y <pkg>` launch doesn't pay the download.
// - "external" → opens the declared docUrl in the user's browser.
// - "script" → `bash -c "curl -fsSL <url> | bash"` runs the official installer,
//   streaming both stdout and stderr as install-event lines. On exit, if
//   `install.binary` is set, verifies it resolves on PATH.
// - "binary" → reserved for v2 (curl|chmod download into var/bin/).
#[tauri::command]
fn install_harness(app: AppHandle, id: String) -> Result<String, String> {
    let map = read_harnesses_map()?;
    let row = map
        .get(&id)
        .ok_or_else(|| format!("unknown harness: {id}"))?;
    let install = row
        .get("install")
        .ok_or_else(|| "no install spec".to_string())?;
    let kind = install.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    match kind {
        "npx" => {
            let args = row.get("args").and_then(|v| v.as_array());
            let pkg = args
                .and_then(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str())
                        .find(|s| !s.starts_with('-'))
                })
                .ok_or_else(|| "no npm package in args".to_string())?
                .to_string();
            let app2 = app.clone();
            let id2 = id.clone();
            let pkg2 = pkg.clone();
            std::thread::spawn(move || {
                emit_install(&app2, &id2, &format!("npm cache add {pkg2}"), false, false);
                let result = Command::new("npm")
                    .arg("cache")
                    .arg("add")
                    .arg(&pkg2)
                    .env("PATH", child_path())
                    .output();
                match result {
                    Ok(o) if o.status.success() => emit_install(&app2, &id2, "cached", true, true),
                    Ok(o) => {
                        let err = String::from_utf8_lossy(&o.stderr).into_owned();
                        emit_install(&app2, &id2, &format!("failed: {}", err.trim()), true, false);
                    }
                    Err(e) => emit_install(&app2, &id2, &format!("error: {e}"), true, false),
                }
            });
            Ok(json!({ "ok": true, "kind": "npx", "pkg": pkg }).to_string())
        }
        "external" => {
            let url = install
                .get("docUrl")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "external install missing docUrl".to_string())?;
            open_external(url).map_err(|e| e.to_string())?;
            emit_install(&app, &id, &format!("opened {url}"), true, true);
            Ok(json!({ "ok": true, "kind": "external", "url": url }).to_string())
        }
        "script" => {
            let url = install
                .get("url")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "script install missing url".to_string())?
                .to_string();
            let binary = install
                .get("binary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let app_outer = app.clone();
            let id_outer = id.clone();
            let url_outer = url.clone();
            std::thread::spawn(move || {
                emit_install(
                    &app_outer,
                    &id_outer,
                    &format!("curl -fsSL {url_outer} | bash"),
                    false,
                    false,
                );
                let spawn_result = Command::new("bash")
                    .arg("-c")
                    .arg(format!("curl -fsSL '{url_outer}' | bash"))
                    .env("PATH", child_path())
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn();
                let mut child = match spawn_result {
                    Ok(c) => c,
                    Err(e) => {
                        emit_install(
                            &app_outer,
                            &id_outer,
                            &format!("spawn error: {e}"),
                            true,
                            false,
                        );
                        return;
                    }
                };
                let app_out = app_outer.clone();
                let id_out = id_outer.clone();
                let t_out = child.stdout.take().map(|out| {
                    std::thread::spawn(move || {
                        for line in BufReader::new(out).lines().map_while(Result::ok) {
                            emit_install(&app_out, &id_out, &line, false, false);
                        }
                    })
                });
                let app_err = app_outer.clone();
                let id_err = id_outer.clone();
                let t_err = child.stderr.take().map(|err| {
                    std::thread::spawn(move || {
                        for line in BufReader::new(err).lines().map_while(Result::ok) {
                            emit_install(&app_err, &id_err, &format!("⚠ {line}"), false, false);
                        }
                    })
                });
                let status = child.wait();
                if let Some(t) = t_out {
                    let _ = t.join();
                }
                if let Some(t) = t_err {
                    let _ = t.join();
                }
                match status {
                    Ok(s) if s.success() => {
                        let ok = binary.is_empty() || command_on_path(&binary);
                        if ok {
                            emit_install(&app_outer, &id_outer, "✓ installed", true, true);
                        } else {
                            emit_install(
                                &app_outer,
                                &id_outer,
                                &format!("script ran but {binary} not on PATH"),
                                true,
                                false,
                            );
                        }
                    }
                    Ok(s) => emit_install(
                        &app_outer,
                        &id_outer,
                        &format!("installer exited with {s}"),
                        true,
                        false,
                    ),
                    Err(e) => emit_install(
                        &app_outer,
                        &id_outer,
                        &format!("wait error: {e}"),
                        true,
                        false,
                    ),
                }
            });
            Ok(json!({ "ok": true, "kind": "script", "url": url }).to_string())
        }
        other => Err(format!("install kind not supported: {other}")),
    }
}

// Configure dispatch: the UI handles `api-key` directly via save_api_key, and
// `external` opens the docUrl. This command exists so an `oauth` configure can
// be triggered without exposing the full login_cmd plumbing twice.
#[tauri::command]
fn configure_harness(app: AppHandle, id: String) -> Result<String, String> {
    let map = read_harnesses_map()?;
    let row = map
        .get(&id)
        .ok_or_else(|| format!("unknown harness: {id}"))?;
    let cfg = row
        .get("configure")
        .ok_or_else(|| "no configure spec".to_string())?;
    let kind = cfg.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    match kind {
        "oauth" => browser_login(id.clone()).map(|_| {
            let _ = app.emit(
                "install-event",
                json!({ "id": id, "line": "browser login launched", "done": true, "ok": true }),
            );
            json!({ "ok": true, "kind": "oauth" }).to_string()
        }),
        "external" => {
            let url = cfg
                .get("docUrl")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "external configure missing docUrl".to_string())?;
            open_external(url).map_err(|e| e.to_string())?;
            Ok(json!({ "ok": true, "kind": "external", "url": url }).to_string())
        }
        "api-key" => {
            Ok(json!({ "ok": true, "kind": "api-key", "key": cfg.get("key") }).to_string())
        }
        "model-picker" => {
            // The dedicated React panel drives the whole flow (mode toggle,
            // provider/model picker, API-key save through save_api_key, Ollama
            // detect/install/pull through the check_ollama / install_ollama /
            // pull_ollama_model commands, persistence through save_model_config).
            // This dispatch only acknowledges the click so the UI knows to
            // expand its inline panel.
            let _ = app;
            Ok(json!({ "ok": true, "kind": "model-picker" }).to_string())
        }
        other => Err(format!("configure kind not supported: {other}")),
    }
}

// --- Model picker config persistence ----------------------------------------
// The generic Local/Cloud picker panel (used by Hermes, OpenCode, …) writes
// its mode + provider/model choice to localStorage (so the UI repopulates),
// AND mirrors it to disk here so the Rust runner can read it at spawn time and
// translate to the harness-specific CLI args via `harness_config::apply`.

fn model_config_path(harness: &str) -> PathBuf {
    REPO_ROOT
        .join("var")
        .join("state")
        .join(format!("{harness}.config.json"))
}

#[tauri::command]
fn save_model_config(harness: String, cfg: String) -> Result<(), String> {
    if harness.is_empty() || harness.contains('/') || harness.contains("..") {
        return Err("invalid harness id".into());
    }
    // Validate the payload is well-formed JSON before touching disk.
    let _: serde_json::Value = serde_json::from_str(&cfg).map_err(|e| e.to_string())?;
    let path = model_config_path(&harness);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, cfg).map_err(|e| e.to_string())
}

// Reading + translation to CLI args happens in `harness_config::apply`
// (`core-rs`) at session spawn, since the runner is what spawns the harness.

// --- Ollama integration (Hermes local mode) ---------------------------------
// Hermes's local-LLM mode points at any OpenAI-compatible endpoint; the
// frictionless default we surface in the UI is Ollama (localhost:11434).
// These three commands cover the lifecycle: detect, install, pull.

// Probe Ollama's CLI + HTTP API:
// - `ollama` resolves on PATH → installed
// - GET /api/tags returns 200 → daemon running; list its installed models
#[tauri::command]
fn check_ollama() -> String {
    let installed = command_on_path("ollama");
    let mut models: Vec<String> = Vec::new();
    let mut running = false;
    if installed {
        if let Ok(out) = Command::new("curl")
            .args(["-s", "--max-time", "2", "http://localhost:11434/api/tags"])
            .env("PATH", child_path())
            .output()
        {
            if out.status.success() && !out.stdout.is_empty() {
                if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                    if let Some(arr) = val.get("models").and_then(|v| v.as_array()) {
                        running = true;
                        for m in arr {
                            if let Some(name) = m.get("name").and_then(|v| v.as_str()) {
                                models.push(name.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    json!({ "installed": installed, "running": running, "models": models }).to_string()
}

// Install Ollama. Brew if available (cleanest path on macOS), else open the
// official download page in the user's browser. Streams progress over
// `install-event` so the Hermes panel reads the same channel as other installs.
#[tauri::command]
fn install_ollama(app: AppHandle, harness_id: String) -> Result<String, String> {
    let sid = if harness_id.is_empty() {
        "hermes".to_string()
    } else {
        harness_id
    };
    if command_on_path("brew") {
        let app2 = app.clone();
        let sid2 = sid.clone();
        std::thread::spawn(move || {
            emit_install(&app2, &sid2, "brew install --cask ollama", false, false);
            let spawn_result = Command::new("brew")
                .args(["install", "--cask", "ollama"])
                .env("PATH", child_path())
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn();
            let mut child = match spawn_result {
                Ok(c) => c,
                Err(e) => {
                    emit_install(&app2, &sid2, &format!("spawn error: {e}"), true, false);
                    return;
                }
            };
            let app_out = app2.clone();
            let sid_out = sid2.clone();
            let t_out = child.stdout.take().map(|out| {
                std::thread::spawn(move || {
                    for line in BufReader::new(out).lines().map_while(Result::ok) {
                        emit_install(&app_out, &sid_out, &line, false, false);
                    }
                })
            });
            let app_err = app2.clone();
            let sid_err = sid2.clone();
            let t_err = child.stderr.take().map(|err| {
                std::thread::spawn(move || {
                    for line in BufReader::new(err).lines().map_while(Result::ok) {
                        emit_install(&app_err, &sid_err, &format!("⚠ {line}"), false, false);
                    }
                })
            });
            let status = child.wait();
            if let Some(t) = t_out {
                let _ = t.join();
            }
            if let Some(t) = t_err {
                let _ = t.join();
            }
            match status {
                Ok(s) if s.success() => {
                    let ok = command_on_path("ollama");
                    if ok {
                        emit_install(&app2, &sid2, "✓ ollama installed", true, true);
                    } else {
                        emit_install(
                            &app2,
                            &sid2,
                            "brew finished but ollama not on PATH",
                            true,
                            false,
                        );
                    }
                }
                Ok(s) => emit_install(&app2, &sid2, &format!("brew exited with {s}"), true, false),
                Err(e) => emit_install(&app2, &sid2, &format!("wait error: {e}"), true, false),
            }
        });
        Ok(json!({ "ok": true, "via": "brew" }).to_string())
    } else {
        let url = "https://ollama.com/download";
        open_external(url).map_err(|e| e.to_string())?;
        emit_install(
            &app,
            &sid,
            &format!("opened {url} (no brew on PATH)"),
            true,
            true,
        );
        Ok(json!({ "ok": true, "via": "browser", "url": url }).to_string())
    }
}

// Pull an Ollama model. Streams the (large, multi-minute) download progress
// over `install-event` to the same panel as install/configure progress.
#[tauri::command]
fn pull_ollama_model(app: AppHandle, harness_id: String, model: String) -> Result<String, String> {
    if model.is_empty() {
        return Err("model is required".into());
    }
    let sid = if harness_id.is_empty() {
        "hermes".to_string()
    } else {
        harness_id
    };
    let app2 = app.clone();
    let sid2 = sid.clone();
    let model2 = model.clone();
    std::thread::spawn(move || {
        emit_install(&app2, &sid2, &format!("ollama pull {model2}"), false, false);
        let spawn_result = Command::new("ollama")
            .args(["pull", &model2])
            .env("PATH", child_path())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();
        let mut child = match spawn_result {
            Ok(c) => c,
            Err(e) => {
                emit_install(&app2, &sid2, &format!("spawn error: {e}"), true, false);
                return;
            }
        };
        let app_out = app2.clone();
        let sid_out = sid2.clone();
        let t_out = child.stdout.take().map(|out| {
            std::thread::spawn(move || {
                for line in BufReader::new(out).lines().map_while(Result::ok) {
                    emit_install(&app_out, &sid_out, &line, false, false);
                }
            })
        });
        let app_err = app2.clone();
        let sid_err = sid2.clone();
        let t_err = child.stderr.take().map(|err| {
            std::thread::spawn(move || {
                for line in BufReader::new(err).lines().map_while(Result::ok) {
                    // ollama writes its progress bar to stderr — show it raw.
                    emit_install(&app_err, &sid_err, &line, false, false);
                }
            })
        });
        let status = child.wait();
        if let Some(t) = t_out {
            let _ = t.join();
        }
        if let Some(t) = t_err {
            let _ = t.join();
        }
        match status {
            Ok(s) if s.success() => {
                emit_install(&app2, &sid2, &format!("✓ pulled {model2}"), true, true)
            }
            Ok(s) => emit_install(
                &app2,
                &sid2,
                &format!("ollama pull exited with {s}"),
                true,
                false,
            ),
            Err(e) => emit_install(&app2, &sid2, &format!("wait error: {e}"), true, false),
        }
    });
    Ok(json!({ "ok": true, "model": model }).to_string())
}

// --- file drops --------------------------------------------------------------
#[derive(serde::Serialize)]
struct FileAttachment {
    name: String,
    path: String,
    text: String,
    truncated: bool,
    bytes: u64,
    binary: bool,
}

#[tauri::command]
fn read_files_for_agent(paths: Vec<String>) -> Result<String, String> {
    const CAP: usize = 200_000; // ~200 KB of text inlined per file
    let mut out: Vec<FileAttachment> = Vec::new();
    for p in paths {
        let meta = match std::fs::metadata(&p) {
            Ok(m) if m.is_file() => m,
            _ => continue,
        };
        let data = std::fs::read(&p).map_err(|e| e.to_string())?;
        let truncated = data.len() > CAP;
        let slice = &data[..data.len().min(CAP)];
        let binary = slice.contains(&0);
        let text = if binary {
            String::new()
        } else {
            String::from_utf8_lossy(slice).into_owned()
        };
        let name = std::path::Path::new(&p)
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| p.clone());
        out.push(FileAttachment {
            name,
            path: p,
            text,
            truncated,
            bytes: meta.len(),
            binary,
        });
    }
    serde_json::to_string(&out).map_err(|e| e.to_string())
}

// Center the window on first launch (Tauri's center() mis-places Y on macOS).
fn center_on_screen(window: &WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let screen = monitor.size();
        if let Ok(win) = window.outer_size() {
            let x = (screen.width as i32 - win.width as i32) / 2;
            let y = (screen.height as i32 - win.height as i32) / 2;
            let _ = window.set_position(PhysicalPosition::new(x, y));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // The single adaptive window: vibrancy + centered on first launch.
            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{
                        apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
                    };
                    let _ = apply_vibrancy(
                        &win,
                        NSVisualEffectMaterial::HudWindow,
                        Some(NSVisualEffectState::Active),
                        Some(18.0),
                    );
                }
                center_on_screen(&win);
                let _ = win.set_focus();
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };
                // ⌘J on macOS; Ctrl+J on Windows/Linux (SUPER is the Win key).
                #[cfg(target_os = "macos")]
                let toggle_mod = Modifiers::SUPER;
                #[cfg(not(target_os = "macos"))]
                let toggle_mod = Modifiers::CONTROL;
                let cmd_j = Shortcut::new(Some(toggle_mod), Code::KeyJ);
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if shortcut == &cmd_j && event.state() == ShortcutState::Pressed {
                                if let Some(w) = app.get_webview_window("main") {
                                    if w.is_visible().unwrap_or(false) {
                                        let _ = w.hide();
                                    } else {
                                        let _ = w.show();
                                        let _ = w.set_focus();
                                    }
                                }
                            }
                        })
                        .build(),
                )?;
                app.global_shortcut().register(cmd_j)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_bar_height,
            set_bar_width,
            open_workspace,
            start_session,
            send_turn,
            send_auth,
            send_logout,
            send_permission,
            stop_session,
            list_sessions,
            list_archived_sessions,
            read_session_events,
            delete_archived_session,
            list_experts,
            browser_login,
            read_files_for_agent,
            save_api_key,
            harness_states,
            install_harness,
            configure_harness,
            check_ollama,
            install_ollama,
            pull_ollama_model,
            save_model_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
