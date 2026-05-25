use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{LazyLock, Mutex};

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow};

// The ACP backend: one `split.runner` process per session, run as
// `python -m split.runner` from the repo root (so the `split` package resolves).
// The repo root and the Python interpreter are resolved at RUNTIME — nothing
// machine-specific is baked in, so the app runs from wherever it's checked out.
// Resolution order, most explicit first:
//   1. env override  — SPLIT_REPO_ROOT / SPLIT_PYTHON
//   2. walk up from the executable to the dir holding our repo markers
//      (config/harnesses.json + split/core.py) — covers `tauri dev`, where the
//      binary lives under apps/desktop/src-tauri/target/<profile>/
//   3. compile-time fallback — this crate sits at apps/desktop/src-tauri, so the
//      repo root is three levels up from CARGO_MANIFEST_DIR
static REPO_ROOT: LazyLock<PathBuf> = LazyLock::new(resolve_repo_root);

fn resolve_repo_root() -> PathBuf {
    if let Ok(dir) = std::env::var("SPLIT_REPO_ROOT") {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    let is_root =
        |p: &Path| p.join("config/harnesses.json").is_file() && p.join("split/core.py").is_file();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(root) = exe.ancestors().find(|&p| is_root(p)) {
            return root.to_path_buf();
        }
    }
    let crate_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
    crate_root.canonicalize().unwrap_or(crate_root)
}

// The Python interpreter: explicit override, else the repo's venv, else `python3`.
fn python_bin() -> PathBuf {
    if let Ok(p) = std::env::var("SPLIT_PYTHON") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    let venv = REPO_ROOT.join(".venv/bin/python");
    if venv.is_file() {
        venv
    } else {
        PathBuf::from("python3")
    }
}

// --- multi-session ----------------------------------------------------------
// Each session is a long-lived `split.runner` speaking ACP to one agent.
// We keep its pid (to kill), its stdin (to feed turns + auth control), and what
// it is (harness/expert) so a window opened later can hydrate via list_sessions.
struct Session {
    pid: u32,
    stdin: ChildStdin,
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

fn emit_vevt(app: &AppHandle, id: &str, payload: String) {
    let _ = app.emit(
        "session-event",
        SessionEvent { id: id.into(), vevt: Some(payload), log: None, exit: false },
    );
}

fn emit_log(app: &AppHandle, id: &str, line: String) {
    let _ = app.emit(
        "session-event",
        SessionEvent { id: id.into(), vevt: None, log: Some(line), exit: false },
    );
}

fn emit_exit(app: &AppHandle, id: &str) {
    let _ = app.emit(
        "session-event",
        SessionEvent { id: id.into(), vevt: None, log: None, exit: true },
    );
}

// A GUI app launched from Finder gets a minimal PATH, so `npx`/`uvx`/`node`
// (the agent CLIs) aren't found. Prepend the usual install dirs so the spawned
// python — and the agent processes it spawns — can resolve them.
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

#[tauri::command]
fn hide_window(window: WebviewWindow) {
    let _ = window.hide();
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
    let _ = Command::new("open").arg(&target).status();
}

// Start a long-lived session: spawn `python -m split.runner --harness <h> --expert
// <e>` with a piped stdin (turns + auth control) and stream its stdout back as
// `session-event`s tagged `id`, broadcast to every window so the bar and the
// dashboard both materialize the session.
#[tauri::command]
fn start_session(app: AppHandle, id: String, harness: String, expert: String, workspace: String) {
    let harness = if harness.is_empty() { "claude".to_string() } else { harness };
    let expert = if expert.is_empty() { "consultant".to_string() } else { expert };
    let python = python_bin();
    eprintln!("[start_session] {id} ({harness}/{expert}) ws={workspace:?} py={python:?}");
    let mut child = match Command::new(&python)
        .arg("-u")
        .arg("-m")
        .arg("split.runner")
        .arg("--harness")
        .arg(&harness)
        .arg("--expert")
        .arg(&expert)
        .current_dir(&*REPO_ROOT)
        .env("SPLIT_SID", &id)
        .env("SPLIT_WORKSPACE", &workspace) // empty → runner uses the default root
        .env("PATH", child_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            emit_log(&app, &id, format!("spawn error: {e}"));
            emit_exit(&app, &id);
            return;
        }
    };

    let pid = child.id();
    let stdin = match child.stdin.take() {
        Some(s) => s,
        None => return,
    };
    SESSIONS.lock().unwrap().insert(
        id.clone(),
        Session { pid, stdin, harness: harness.clone(), expert: expert.clone() },
    );

    if let Some(err) = child.stderr.take() {
        let (a, sid) = (app.clone(), id.clone());
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                emit_log(&a, &sid, format!("⚠ {line}"));
            }
        });
    }

    // The stdout reader owns the child and waits on it; on exit it drops the
    // session from the registry and signals every window.
    std::thread::spawn(move || {
        let mut child = child;
        if let Some(out) = child.stdout.take() {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                match line.strip_prefix("VEVT ") {
                    Some(j) => emit_vevt(&app, &id, j.to_string()),
                    None => emit_log(&app, &id, line),
                }
            }
        }
        let _ = child.wait();
        SESSIONS.lock().unwrap().remove(&id);
        emit_exit(&app, &id);
    });
}

// Feed the next turn to a running session — one JSON line on its stdin, so
// multi-line tasks survive the line-delimited channel.
#[tauri::command]
fn send_turn(id: String, text: String) -> Result<(), String> {
    let mut map = SESSIONS.lock().unwrap();
    let s = map.get_mut(&id).ok_or("no such session")?;
    let line = format!("{}\n", json!({ "text": text }));
    s.stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    s.stdin.flush().map_err(|e| e.to_string())
}

// Answer an `auth_required` for a session — write the chosen ACP auth method on
// its stdin; the runner authenticates then auto-replays the pending prompt.
#[tauri::command]
fn send_auth(id: String, method_id: String) -> Result<(), String> {
    let mut map = SESSIONS.lock().unwrap();
    let s = map.get_mut(&id).ok_or("no such session")?;
    let line = format!("{}\n", json!({ "auth": { "methodId": method_id } }));
    s.stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    s.stdin.flush().map_err(|e| e.to_string())
}

// Stop one session: dropping its stdin closes the turn channel (Python sees EOF)
// and we hard-kill the process tree to tear down the agent CLI child too.
#[tauri::command]
fn stop_session(id: String) {
    if let Some(s) = SESSIONS.lock().unwrap().remove(&id) {
        let p = s.pid.to_string();
        let _ = Command::new("pkill").arg("-P").arg(&p).status(); // children (agent CLI)
        let _ = Command::new("kill").arg("-KILL").arg(&p).status();
    }
}

// The sessions Rust still tracks, for a window that opened after they started.
#[tauri::command]
fn list_sessions() -> String {
    let map = SESSIONS.lock().unwrap();
    let arr: Vec<_> = map
        .iter()
        .map(|(id, s)| json!({ "id": id, "harness": s.harness, "expert": s.expert }))
        .collect();
    json!(arr).to_string()
}

// The harness registry (harnesses.json), filtering `_`-prefixed comment keys.
#[tauri::command]
fn list_harnesses() -> Result<String, String> {
    read_json_object("harnesses.json")
}

// The expert registry (experts.json), filtering `_`-prefixed comment keys.
#[tauri::command]
fn list_experts() -> Result<String, String> {
    read_json_object("experts.json")
}

fn read_json_object(name: &str) -> Result<String, String> {
    let path = REPO_ROOT.join("config").join(name);
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let val: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if let serde_json::Value::Object(map) = val {
        let filtered: serde_json::Map<_, _> =
            map.into_iter().filter(|(k, _)| !k.starts_with('_')).collect();
        serde_json::to_string(&filtered).map_err(|e| e.to_string())
    } else {
        Ok(raw)
    }
}

// Open Terminal.app running a harness's CLI login command (for CLI-login agents).
fn login_cmd(harness: &str) -> Option<&'static str> {
    Some(match harness {
        "claude" => "claude login",
        "codex" => "codex login",
        "gemini" => "gemini",
        "cursor" => "cursor-agent login",
        "copilot" => "gh auth login",
        "qwen" => "qwen",
        "opencode" => "opencode auth login",
        "hermes" => "uvx --from 'hermes-agent[acp]==0.14.0' hermes-acp --setup",
        _ => return None,
    })
}

#[tauri::command]
fn terminal_login(harness: String) -> Result<String, String> {
    let cmd = login_cmd(&harness).ok_or_else(|| format!("No terminal login for {harness}"))?;
    let script = format!(
        "tell application \"Terminal\" to activate\ntell application \"Terminal\" to do script \"{cmd}\""
    );
    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .status()
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true, "cmd": cmd }).to_string())
}

// --- API keys ----------------------------------------------------------------
// Provider keys the ACP harnesses may need. The bar/dashboard collects them and
// we persist to the repo-root .env, which split.core loads via python-dotenv on
// every spawn. Allowlisted so the UI can't write arbitrary env vars.
const KNOWN_KEYS: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "MISTRAL_API_KEY",
    "NOUS_API_KEY",
    "DASHSCOPE_API_KEY",
    "GH_TOKEN",
    "GROK_CODE_XAI_API_KEY",
];

fn env_path() -> PathBuf {
    REPO_ROOT.join(".env")
}

#[tauri::command]
fn save_api_key(name: String, value: String) -> Result<(), String> {
    if !KNOWN_KEYS.contains(&name.as_str()) {
        return Err(format!("unknown key: {name}"));
    }
    let path = env_path();
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<String> = Vec::new();
    let mut replaced = false;
    for line in existing.lines() {
        if line.trim_start().starts_with(&format!("{name}=")) {
            lines.push(format!("{name}={value}"));
            replaced = true;
        } else {
            lines.push(line.to_string());
        }
    }
    if !replaced {
        lines.push(format!("{name}={value}"));
    }
    let mut out = lines.join("\n");
    out.push('\n');
    std::fs::write(&path, out).map_err(|e| e.to_string())
}

#[tauri::command]
fn api_keys_status() -> Result<String, String> {
    let existing = std::fs::read_to_string(env_path()).unwrap_or_default();
    let mut status = serde_json::Map::new();
    for key in KNOWN_KEYS {
        let set = existing.lines().any(|l| {
            let l = l.trim_start();
            l.starts_with(&format!("{key}="))
                && l.split_once('=').map(|x| x.1).map(|v| !v.trim().is_empty()).unwrap_or(false)
        });
        status.insert((*key).to_string(), serde_json::Value::Bool(set));
    }
    serde_json::to_string(&status).map_err(|e| e.to_string())
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
        out.push(FileAttachment { name, path: p, text, truncated, bytes: meta.len(), binary });
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // The single adaptive window: vibrancy + centered on first launch.
            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
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
                let cmd_j = Shortcut::new(Some(Modifiers::SUPER), Code::KeyJ);
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
            hide_window,
            open_workspace,
            start_session,
            send_turn,
            send_auth,
            stop_session,
            list_sessions,
            list_harnesses,
            list_experts,
            terminal_login,
            read_files_for_agent,
            save_api_key,
            api_keys_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
