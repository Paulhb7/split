use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{LazyLock, Mutex};

use serde_json::json;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

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

// Resize the borderless window to a content-fitted height. The React side
// computes the desired height via a ResizeObserver on the natural content
// (compact = just the composer row, expanded = thread/stage/teams + composer),
// dedupes via `lastHeightRef`, and calls this. Width is fixed to BAR_WIDTH so
// the UI never changes horizontal dimensions during a session.
const BAR_WIDTH: f64 = 680.0;
#[tauri::command]
fn set_bar_height(window: WebviewWindow, height: f64) {
    let h = height.clamp(48.0, 1400.0); // sane clamp; React already clamps too
    let _ = window.set_size(LogicalSize::new(BAR_WIDTH, h));
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
        .env("SPLIT_PERMISSION_MODE", "prompt") // route every tool ask to the UI
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

// Answer a `permission_request` for a session — the chosen ACP option (None =
// deny) plus the persistence scope (once / session / always-allow / always-deny).
// The runner resolves the pending Future and optionally writes a rule.
#[tauri::command]
fn send_permission(
    id: String,
    request_id: String,
    option_id: Option<String>,
    scope: String,
) -> Result<(), String> {
    let mut map = SESSIONS.lock().unwrap();
    let s = map.get_mut(&id).ok_or("no such session")?;
    let line = format!(
        "{}\n",
        json!({ "permission": { "id": request_id, "optionId": option_id, "scope": scope } })
    );
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
// Provider keys the ACP harnesses may need. The bar/dashboard collects them and
// we persist to the repo-root .env, which split.core loads via python-dotenv on
// every spawn. Allowlisted so the UI can't write arbitrary env vars.
const KNOWN_KEYS: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "MISTRAL_API_KEY",
    "DASHSCOPE_API_KEY",
    "GH_TOKEN",
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
            && l.split_once('=').map(|x| !x.1.trim().is_empty()).unwrap_or(false)
    })
}

fn env_set(key: &str) -> bool {
    std::env::var(key).map(|v| !v.trim().is_empty()).unwrap_or(false) || env_in_dotenv(key)
}

fn command_on_path(cmd: &str) -> bool {
    if cmd.starts_with("./") || cmd.starts_with("../") {
        return REPO_ROOT.join(cmd).exists();
    }
    Command::new("/usr/bin/which")
        .arg(cmd)
        .env("PATH", child_path())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// `install`: "npx" → always ready (npx -y warms on first launch);
// "binary"/"external" → check that the launch command resolves.
fn install_state_for(install_kind: Option<&str>, command: &str) -> &'static str {
    match install_kind {
        Some("npx") => "ready",
        Some("external") | Some("binary") => {
            if command_on_path(command) { "ready" } else { "missing" }
        }
        _ => "ready",
    }
}

// `configure`: "oauth" → a creds dotfile OR a fallback env key signals ready;
// "api-key" → the declared env key is in .env or process env; "external" → the
// UI just shows a docs link (always reported as "external").
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
            let env_ok = cfg.get("check_env").and_then(|v| v.as_str()).map(env_set).unwrap_or(false);
            if file_ok || env_ok { "ready" } else { "missing" }
        }
        "api-key" => {
            let ok = cfg.get("key").and_then(|v| v.as_str()).map(env_set).unwrap_or(false);
            if ok { "ready" } else { "missing" }
        }
        "external" => "external",
        _ => "ready",
    }
}

fn read_harnesses_map() -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let path = REPO_ROOT.join("config").join("harnesses.json");
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let val: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    match val {
        serde_json::Value::Object(m) => Ok(m.into_iter().filter(|(k, _)| !k.starts_with('_')).collect()),
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
        let install_kind = install_spec.and_then(|i| i.get("kind")).and_then(|v| v.as_str());
        let cfg_kind = cfg_spec.and_then(|c| c.get("kind")).and_then(|v| v.as_str()).unwrap_or("");
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
    let _ = app.emit("install-event", json!({ "id": id, "line": line, "done": done, "ok": ok }));
}

// Install dispatch:
// - "npx" → `npm cache add <pkg>@<ver>` warms the npm tarball cache, so the
//   first real `npx -y <pkg>` launch doesn't pay the download.
// - "external" → opens the declared docUrl in the user's browser.
// - "binary" → reserved for v2 (curl|chmod download into var/bin/).
#[tauri::command]
fn install_harness(app: AppHandle, id: String) -> Result<String, String> {
    let map = read_harnesses_map()?;
    let row = map.get(&id).ok_or_else(|| format!("unknown harness: {id}"))?;
    let install = row.get("install").ok_or_else(|| "no install spec".to_string())?;
    let kind = install.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    match kind {
        "npx" => {
            let args = row.get("args").and_then(|v| v.as_array());
            let pkg = args
                .and_then(|a| a.iter().filter_map(|v| v.as_str()).find(|s| !s.starts_with('-')))
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
            Command::new("open").arg(url).status().map_err(|e| e.to_string())?;
            emit_install(&app, &id, &format!("opened {url}"), true, true);
            Ok(json!({ "ok": true, "kind": "external", "url": url }).to_string())
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
    let row = map.get(&id).ok_or_else(|| format!("unknown harness: {id}"))?;
    let cfg = row.get("configure").ok_or_else(|| "no configure spec".to_string())?;
    let kind = cfg.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    match kind {
        "oauth" => browser_login(id.clone()).map(|_| {
            let _ = app.emit("install-event", json!({ "id": id, "line": "browser login launched", "done": true, "ok": true }));
            json!({ "ok": true, "kind": "oauth" }).to_string()
        }),
        "external" => {
            let url = cfg
                .get("docUrl")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "external configure missing docUrl".to_string())?;
            Command::new("open").arg(url).status().map_err(|e| e.to_string())?;
            Ok(json!({ "ok": true, "kind": "external", "url": url }).to_string())
        }
        "api-key" => Ok(json!({ "ok": true, "kind": "api-key", "key": cfg.get("key") }).to_string()),
        other => Err(format!("configure kind not supported: {other}")),
    }
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
            set_bar_height,
            open_workspace,
            start_session,
            send_turn,
            send_auth,
            send_permission,
            stop_session,
            list_sessions,
            list_harnesses,
            list_experts,
            browser_login,
            read_files_for_agent,
            save_api_key,
            api_keys_status,
            harness_states,
            install_harness,
            configure_harness
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
