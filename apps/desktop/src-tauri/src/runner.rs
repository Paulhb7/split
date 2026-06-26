//! Native Rust ACP runner — the production replacement for `split.runner`
//! (Python). Speaks ACP directly via the canonical `agent-client-protocol`
//! crate, emits VEVT events identical to the Python path so React can route
//! sessions identically regardless of backend.
//!
//! Wire surface (per session):
//!
//!   * Inputs (mpsc channel) — `RunnerInput::{Turn, Auth, Logout, Stop}`.
//!   * Inputs (oneshot map)  — `PENDING_PERMS_RUST` resolves permission
//!     dialogs initiated by the agent's `request_permission` callbacks.
//!   * Outputs — `session-event` Tauri events tagged with the session id.
//!     Three tags coexist: `vevt` (VEVT JSON line), `log` (stderr / runtime
//!     messages), `exit: true` (one-shot, end of session).
//!
//! Parity coverage vs the Python runner:
//!
//!   * session/new + session/prompt          — turn loop
//!   * session/resume                        — opt-in via `resume` arg
//!   * session/cancel + session/close        — graceful Stop
//!   * authenticate                          — auth_required → Auth retry
//!   * logout                                — Logout input
//!   * request_permission                    — emits VEVT, awaits via oneshot
//!   * fs/read_text_file + fs/write_text_file — confined to workspace + vault
//!   * MCP servers (stdio)                   — passed from tools.json
//!   * Persona projection + first-turn inject
//!   * Per-session archive (events.ndjson + meta.json with acp_sid)
//!   * Agent stderr captured via `with_debug` → emitted as `log` events
//!   * Agent env: provider keys + OTLP forwards passed via `McpServerStdio.env`
//!
//! Known limitation today (matches Python parity, not a Rust issue): the
//! permission UI is only surfaced when `SPLIT_PERMISSION_MODE=prompt`.
//! The Rust runner uses `prompt` mode by default (matching Tauri spawn).

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::UNIX_EPOCH;

use agent_client_protocol::{
    schema::{
        AuthMethodId, AuthenticateRequest, AvailableCommandInput, CancelNotification,
        ClientCapabilities, CloseSessionRequest, ContentBlock, EnvVariable, FileSystemCapabilities,
        InitializeRequest, LogoutRequest, McpServer, McpServerStdio, NewSessionRequest,
        PromptRequest, ProtocolVersion, ReadTextFileRequest, ReadTextFileResponse,
        RequestPermissionOutcome, RequestPermissionRequest, RequestPermissionResponse,
        ResumeSessionRequest, SelectedPermissionOutcome, SessionId, SessionNotification,
        SessionUpdate, TextContent, WriteTextFileRequest, WriteTextFileResponse,
    },
    AcpAgent, Agent, Client, ConnectionTo, LineDirection,
};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot};

use split_core::archive::SessionArchive;
use split_core::permissions::{self, Decision};

/// Control inputs accepted by a running session task.
pub enum RunnerInput {
    /// User prompt to send via `session/prompt`.
    Turn(String),
    /// Authenticate with the given method (after `auth_required` was emitted).
    Auth { method_id: String },
    /// Log out (calls ACP `logout` if the agent supports it).
    Logout,
    /// Graceful shutdown — sends session/cancel + session/close, drops connection.
    Stop,
}

/// Handle to a running session. Drop = best-effort stop (channel sender close).
pub struct RunnerHandle {
    pub tx: mpsc::UnboundedSender<RunnerInput>,
}

/// Reply payload for an in-flight permission dialog: the picked option_id
/// (None = deny) and the persistence scope (`once` / `session` /
/// `always-allow` / `always-deny`) the user chose in the UI.
pub type PermissionReply = (Option<String>, String);

/// Oneshot senders for in-flight permission dialogs. The agent's
/// `request_permission` handler creates one entry per dialog, the
/// `send_permission_rust` Tauri command resolves it.
pub static PENDING_PERMS_RUST: LazyLock<Mutex<HashMap<String, oneshot::Sender<PermissionReply>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

static REQ_COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_req_id() -> String {
    let n = REQ_COUNTER.fetch_add(1, Ordering::Relaxed);
    let t = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("rp-{t:x}-{n:x}")
}

/// One `session-event` payload as the React side receives it.
#[derive(Clone, Debug, serde::Serialize)]
pub struct WireEvent {
    pub id: String,
    pub vevt: Option<String>,
    pub log: Option<String>,
    pub exit: bool,
}

/// Where runner events land: the Tauri event bus in production, an mpsc
/// channel in integration tests (which run `run_session` without a Tauri app).
#[derive(Clone)]
pub enum EventSink {
    Tauri(AppHandle),
    Channel(mpsc::UnboundedSender<WireEvent>),
}

impl EventSink {
    fn emit(&self, ev: WireEvent) {
        match self {
            EventSink::Tauri(app) => {
                let _ = app.emit("session-event", ev);
            }
            EventSink::Channel(tx) => {
                let _ = tx.send(ev);
            }
        }
    }
}

fn emit_vevt(app: &EventSink, id: &str, payload: Value, archive: Option<&SessionArchive>) {
    if let Some(a) = archive {
        a.write_event(&payload);
    }
    if let Ok(s) = serde_json::to_string(&payload) {
        app.emit(WireEvent {
            id: id.into(),
            vevt: Some(s),
            log: None,
            exit: false,
        });
    }
}

fn emit_log(app: &EventSink, id: &str, line: String) {
    app.emit(WireEvent {
        id: id.into(),
        vevt: None,
        log: Some(line),
        exit: false,
    });
}

fn emit_exit(app: &EventSink, id: &str) {
    app.emit(WireEvent {
        id: id.into(),
        vevt: None,
        log: None,
        exit: true,
    });
}

/// Newest image in `dir` by mtime → (path, file_name, size, mtime_secs).
/// `None` if the directory is missing/empty or holds no png/jpeg.
fn newest_frame(dir: &Path) -> Option<(PathBuf, String, u64, u64)> {
    let mut best: Option<(PathBuf, String, u64, u64)> = None;
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_ascii_lowercase(),
            None => continue,
        };
        if !(name.ends_with(".png") || name.ends_with(".jpg") || name.ends_with(".jpeg")) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let size = meta.len();
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if best.as_ref().map(|b| mtime > b.3).unwrap_or(true) {
            best = Some((path, name, size, mtime));
        }
    }
    best
}

/// Stream the operator's live browser view into the atelier. Alfred (and any
/// browser-using expert) drops one screenshot per step into `<cwd>/.frames/`;
/// this background task polls that directory and emits the NEWEST image as a
/// `frame` VEVT whenever it changes. Deliberately decoupled from ACP — it needs
/// no cooperation from the harness, works for headless Chromium (no OS window to
/// embed), and reuses the same `app.emit` broadcast as every other event.
/// Frames are NOT archived (base64 PNGs would bloat events.ndjson) — they are a
/// live-only surface. Polling (no `notify` dep) at 300 ms is plenty for a
/// human-watchable view; a file is only emitted once its (size, mtime) settle,
/// so a screenshot caught mid-write is skipped until the next tick.
fn spawn_frame_watcher(
    app: EventSink,
    id: String,
    frames_dir: PathBuf,
) -> tokio::task::JoinHandle<()> {
    use base64::Engine as _;
    tokio::spawn(async move {
        // (name, size, mtime) of the last frame we emitted, to skip duplicates.
        let mut last: Option<(String, u64, u64)> = None;
        let mut seq: u64 = 0;
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            let Some((path, name, size, mtime)) = newest_frame(&frames_dir) else {
                continue;
            };
            let key = (name.clone(), size, mtime);
            if last.as_ref() == Some(&key) {
                continue; // unchanged since last tick
            }
            let bytes = match std::fs::read(&path) {
                Ok(b) if !b.is_empty() => b,
                _ => continue, // missing or caught mid-write (0 bytes)
            };
            // Guard against a torn read: re-stat and bail if the file changed
            // size between our metadata scan and the read (still being written).
            if std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0) != size {
                continue;
            }
            let mime = if name.ends_with(".png") {
                "image/png"
            } else {
                "image/jpeg"
            };
            let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
            seq += 1;
            last = Some(key);
            emit_vevt(
                &app,
                &id,
                json!({ "type": "frame", "seq": seq, "mime": mime, "data": data, "ts": mtime }),
                None,
            );
        }
    })
}

/// Translate one ACP `SessionUpdate` into the VEVT payload Split's reducer
/// consumes — byte-for-byte identical to what the Python runner emits.
fn update_to_vevt(update: &SessionUpdate) -> Option<Value> {
    use SessionUpdate as U;
    match update {
        U::AgentMessageChunk(chunk) => match &chunk.content {
            ContentBlock::Text(t) => Some(json!({ "type": "say", "text": t.text })),
            _ => None,
        },
        U::AgentThoughtChunk(chunk) => match &chunk.content {
            ContentBlock::Text(t) => Some(json!({ "type": "thought", "text": t.text })),
            _ => None,
        },
        U::ToolCall(t) => Some(json!({
            "type": "step",
            "title": if t.title.is_empty() { format!("{:?}", t.kind) } else { t.title.clone() },
            "status": format!("{:?}", t.status),
        })),
        U::ToolCallUpdate(t) => Some(json!({
            "type": "step",
            "title": t.fields.title.clone().unwrap_or_else(|| "tool".to_string()),
            "status": t
                .fields
                .status
                .as_ref()
                .map(|s| format!("{:?}", s))
                .unwrap_or_default(),
        })),
        U::Plan(p) => {
            let entries: Vec<Value> = p
                .entries
                .iter()
                .map(|e| {
                    json!({
                        "content": e.content,
                        "status": format!("{:?}", e.status),
                    })
                })
                .collect();
            Some(json!({ "type": "plan", "entries": entries }))
        }
        U::AvailableCommandsUpdate(c) => {
            let cmds: Vec<Value> = c
                .available_commands
                .iter()
                .map(|cmd| {
                    let mut entry = serde_json::Map::new();
                    entry.insert("name".into(), json!(cmd.name));
                    entry.insert("description".into(), json!(cmd.description));
                    if let Some(AvailableCommandInput::Unstructured(u)) = &cmd.input {
                        if !u.hint.is_empty() {
                            entry.insert("hint".into(), json!(u.hint));
                        }
                    }
                    Value::Object(entry)
                })
                .collect();
            Some(json!({ "type": "commands", "commands": cmds }))
        }
        U::UsageUpdate(u) => Some(json!({
            "type": "usage",
            "used": u.used,
            "size": u.size,
            "cost": u.cost.as_ref().map(|c| c.amount),
        })),
        _ => None,
    }
}

/// Best-effort tool id for permission rule matching: `Bash(<cmd>)`,
/// `Read(<path>)`, `mcp__server__tool`, falling back to the title or kind.
/// `mcp_servers` are the configured MCP server names, used to reconstruct
/// MCP tool ids (see [`tool_id_from_parts`]).
fn extract_tool_id(req: &RequestPermissionRequest, mcp_servers: &[String]) -> String {
    let fields = &req.tool_call.fields;
    let title = fields.title.clone().unwrap_or_default();
    let kind_dbg = fields
        .kind
        .as_ref()
        .map(|k| format!("{:?}", k).to_lowercase())
        .unwrap_or_default();
    tool_id_from_parts(&title, &kind_dbg, fields.raw_input.as_ref(), mcp_servers)
}

/// Pure core of [`extract_tool_id`] — split out so it is unit-testable
/// without constructing ACP wire structs.
///
/// Order matters: built-in tools (resolved by argument shape) before MCP
/// (resolved by name), so a real `Read`/`Bash` is never misread as an MCP
/// tool. The MCP step is what makes rules like `mcp__cua_driver` actually
/// fire — previously a cua-driver call surfaced as the bare title `click`
/// and matched nothing.
fn tool_id_from_parts(
    title: &str,
    kind: &str, // lowercased ToolKind debug ("read" / "edit" / "write" / …)
    raw_input: Option<&Value>,
    mcp_servers: &[String],
) -> String {
    let raw_obj = raw_input.and_then(|v| v.as_object());

    // 1. Built-in tools, by argument shape.
    if let Some(raw) = raw_obj {
        if let Some(cmd) = raw
            .get("command")
            .or_else(|| raw.get("cmd"))
            .and_then(|v| v.as_str())
        {
            return format!("Bash({cmd})");
        }
        if let Some(path) = raw
            .get("path")
            .or_else(|| raw.get("file_path"))
            .and_then(|v| v.as_str())
        {
            if matches!(kind, "read" | "edit" | "write") {
                let mut k = kind.to_string();
                if let Some(c) = k.get_mut(0..1) {
                    c.make_ascii_uppercase();
                }
                return format!("{k}({path})");
            }
        }
    }

    // 2. MCP tools — normalize to `mcp__server__tool`. Candidate names: an
    //    explicit name field in raw_input, then the human title.
    if let Some(raw) = raw_obj {
        for key in ["name", "tool", "toolName", "tool_name"] {
            if let Some(s) = raw.get(key).and_then(|v| v.as_str()) {
                if let Some(id) = permissions::mcp_tool_id(s, mcp_servers) {
                    return id;
                }
            }
        }
    }
    if let Some(id) = permissions::mcp_tool_id(title, mcp_servers) {
        return id;
    }

    // 3. Fallback — the bare title, else the kind, else "tool".
    if !title.is_empty() {
        return title.to_string();
    }
    if kind.is_empty() {
        "tool".to_string()
    } else {
        kind.to_string()
    }
}

/// Loose match for auth-related failures coming back from the agent —
/// mirrors Python's `auth.is_auth_error` keyword scan. We use this when
/// `new_session` errors so we can surface the auth_required prompt instead
/// of dying.
fn looks_like_auth_error(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    for hint in [
        "auth",
        "login",
        "unauthor",
        "api key",
        "api_key",
        "credit",
        "401",
        "403",
        "forbidden",
        "sign in",
        "not permitted",
        "no_api_key",
    ] {
        if lower.contains(hint) {
            return true;
        }
    }
    false
}

/// Pick the agent-offered option whose `kind` matches what we want.
/// Preference for `*_always` when available; fall back to the first match.
/// Same algorithm as Python's `_pick_option`.
fn pick_option(
    options: &[agent_client_protocol::schema::PermissionOption],
    want: &str,
) -> Option<String> {
    let mut always_match: Option<String> = None;
    let mut once_match: Option<String> = None;
    for opt in options {
        let kind = format!("{:?}", opt.kind).to_lowercase();
        let matches = match want {
            "allow" => kind.contains("allow"),
            "deny" => kind.contains("deny") || kind.contains("reject"),
            _ => false,
        };
        if !matches {
            continue;
        }
        let id = (*opt.option_id.0).to_string();
        if kind.contains("always") && always_match.is_none() {
            always_match = Some(id);
        } else if once_match.is_none() {
            once_match = Some(id);
        }
    }
    always_match.or(once_match)
}

fn auth_methods_to_json(methods: &[agent_client_protocol::schema::AuthMethod]) -> Vec<Value> {
    methods
        .iter()
        .map(|m| {
            json!({
                "id": &*m.id().0,
                "name": m.name(),
                "description": m.description().unwrap_or(""),
            })
        })
        .collect()
}

/// One entry in the workspace snapshot used for artifact diffing.
#[derive(Clone, Copy)]
struct FileStamp {
    size: u64,
    mtime: u64,
}

/// Paths (relative path components) we never surface as artifacts —
/// projected personas, skill symlinks, agent caches, language tooling
/// noise. Anything starting with `.` is also skipped (covers `.git`,
/// `.venv`, `.DS_Store`, `.claude/`, `.agents/`, `.vibe/`, …). This list
/// is intentionally short — the goal is "is this a deliverable or
/// plumbing?", not a complete `.gitignore`.
const ARTIFACT_IGNORE_NAMES: &[&str] = &[
    // Personas projected by ensure_expert_workspace
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "QWEN.md",
    "VIBE.md",
    // Per-expert memory — separate concept from a deliverable
    "MEMORY.md",
    // Build / runtime cruft
    "node_modules",
    "__pycache__",
    "target",
    "dist",
    "build",
];

/// Walk `root` recursively, returning a relative-path → (size, mtime) map.
/// Symlinks are not followed (the projected skill links would explode the
/// scan and pull in non-deliverable content). Errors are silently skipped
/// so a half-readable workspace never crashes the runner.
fn snapshot_workspace(root: &Path) -> BTreeMap<String, FileStamp> {
    let mut out = BTreeMap::new();
    if !root.exists() {
        return out;
    }
    walk_into(root, root, &mut out);
    out
}

fn walk_into(root: &Path, dir: &Path, out: &mut BTreeMap<String, FileStamp>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_s = name.to_string_lossy();
        if name_s.starts_with('.') {
            continue;
        }
        if ARTIFACT_IGNORE_NAMES.iter().any(|n| *n == name_s) {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        // Don't follow symlinks — skill directories are projected as
        // symlinks and re-walking them would pull in tens of MB of
        // content that's not an expert deliverable.
        if meta.file_type().is_symlink() {
            continue;
        }
        let path = entry.path();
        if meta.is_dir() {
            walk_into(root, &path, out);
        } else if meta.is_file() {
            let rel = match path.strip_prefix(root) {
                Ok(p) => p.to_string_lossy().replace('\\', "/"),
                Err(_) => continue,
            };
            let size = meta.len();
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            out.insert(rel, FileStamp { size, mtime });
        }
    }
}

/// Pull file paths the agent referenced in its turn-final answer — markdown
/// link targets `[label](target)`, and bare absolute paths starting with `/`
/// or `~/`. Resolves each candidate to an absolute path and returns the
/// ones that point at an existing regular file. Used as a safety net when
/// the agent writes outside the workspace despite the persona rule —
/// classic case: "I saved it to ~/Desktop/foo.docx".
fn scan_referenced_paths(text: &str, workspace: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    let mut push = |candidate: &str, acc: &mut Vec<PathBuf>| {
        let trimmed = candidate
            .trim()
            .trim_end_matches([',', '.', ';', ')', ']', '"', '\'']);
        if trimmed.is_empty() {
            return;
        }
        // Skip URLs and anchors.
        if trimmed.starts_with("http://")
            || trimmed.starts_with("https://")
            || trimmed.starts_with("mailto:")
            || trimmed.starts_with('#')
        {
            return;
        }
        // Resolve ~ and relative paths against the workspace.
        let resolved: PathBuf = if let Some(rest) = trimmed.strip_prefix("~/") {
            match std::env::var("HOME") {
                Ok(home) => PathBuf::from(home).join(rest),
                Err(_) => return,
            }
        } else if trimmed.starts_with('/') {
            PathBuf::from(trimmed)
        } else {
            workspace.join(trimmed)
        };
        if !resolved.is_file() {
            return;
        }
        let canonical = resolved.canonicalize().unwrap_or(resolved);
        if seen.insert(canonical.clone()) {
            acc.push(canonical);
        }
    };

    // Markdown link targets: `](target)` — scan forward for ')' or whitespace.
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b']' && bytes[i + 1] == b'(' {
            let start = i + 2;
            let mut j = start;
            let mut depth = 1;
            while j < bytes.len() {
                match bytes[j] {
                    b'(' => depth += 1,
                    b')' => {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                    }
                    b'\n' => break,
                    _ => {}
                }
                j += 1;
            }
            if j > start {
                if let Ok(s) = std::str::from_utf8(&bytes[start..j]) {
                    // Strip an optional `"title"` suffix per CommonMark.
                    let target = s.split_whitespace().next().unwrap_or(s);
                    push(target, &mut out);
                }
            }
            i = j + 1;
            continue;
        }
        i += 1;
    }

    // Bare absolute paths starting with `/` or `~/` mentioned in prose
    // (covers "I saved it to ~/Desktop/foo.docx" with no markdown link).
    for token in text.split(|c: char| c.is_whitespace() || c == '`') {
        if token.starts_with('/') || token.starts_with("~/") {
            push(token, &mut out);
        }
    }
    out
}

/// Stamp a single referenced file (path is absolute), insert/update it in
/// the snapshot, and emit a synthetic `artifact` VEVT. The `rel` we surface
/// is the path relative to workspace when applicable, else the file name —
/// good enough for display, and unique enough to key by.
fn emit_referenced_artifact(
    app: &EventSink,
    id: &str,
    archive: &SessionArchive,
    workspace: &Path,
    path: &Path,
    snapshot: &mut BTreeMap<String, FileStamp>,
    min_mtime: u64,
) {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return,
    };
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Only surface files written/modified during this turn. A path the agent
    // merely read (tool `locations` includes reads) keeps its old mtime and is
    // skipped, so it can't masquerade as a fresh deliverable.
    if mtime < min_mtime {
        return;
    }
    let rel = match path.strip_prefix(workspace) {
        Ok(r) => r.to_string_lossy().replace('\\', "/"),
        Err(_) => path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string()),
    };
    let op = match snapshot.get(&rel) {
        None => "created",
        Some(p) if p.size != size || p.mtime != mtime => "modified",
        _ => return,
    };
    snapshot.insert(rel.clone(), FileStamp { size, mtime });
    emit_vevt(
        app,
        id,
        json!({
            "type": "artifact",
            "rel": rel,
            "path": path.to_string_lossy(),
            "op": op,
            "size": size,
            "mtime": mtime,
        }),
        Some(archive),
    );
}

/// Diff `prev` (last snapshot) against `next` (current scan) and emit one
/// VEVT `artifact` event per change. `root` is needed to materialize the
/// absolute `path` field the UI uses for `shell.open`.
fn emit_artifact_diff(
    app: &EventSink,
    id: &str,
    archive: &SessionArchive,
    root: &Path,
    prev: &BTreeMap<String, FileStamp>,
    next: &BTreeMap<String, FileStamp>,
) {
    // created / modified
    for (rel, stamp) in next.iter() {
        let op = match prev.get(rel) {
            None => "created",
            Some(p) if p.size != stamp.size || p.mtime != stamp.mtime => "modified",
            _ => continue,
        };
        let abs = root.join(rel);
        emit_vevt(
            app,
            id,
            json!({
                "type": "artifact",
                "rel": rel,
                "path": abs.to_string_lossy(),
                "op": op,
                "size": stamp.size,
                "mtime": stamp.mtime,
            }),
            Some(archive),
        );
    }
    // deleted
    for (rel, _) in prev.iter() {
        if next.contains_key(rel) {
            continue;
        }
        let abs = root.join(rel);
        emit_vevt(
            app,
            id,
            json!({
                "type": "artifact",
                "rel": rel,
                "path": abs.to_string_lossy(),
                "op": "deleted",
                "size": 0,
                "mtime": 0,
            }),
            Some(archive),
        );
    }
}

/// Spawn a per-session task on Tauri's tokio runtime. Returns immediately
/// with a handle whose `tx` accepts control inputs. The task exits when:
///   * the channel is closed (sender dropped),
///   * the connection drops on its own, or
///   * a `RunnerInput::Stop` triggers graceful teardown.
#[allow(clippy::too_many_arguments)]
pub fn start(
    app: AppHandle,
    id: String,
    harness: String,
    expert: String,
    sessions_dir: PathBuf,
    workspace: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    mcp_servers: Vec<McpServer>,
    persona_body: String,
    resume_requested: bool,
) -> RunnerHandle {
    let (tx, rx) = mpsc::unbounded_channel::<RunnerInput>();

    tauri::async_runtime::spawn(run_session(
        EventSink::Tauri(app),
        id,
        harness,
        expert,
        sessions_dir,
        workspace,
        command,
        args,
        env,
        mcp_servers,
        persona_body,
        resume_requested,
        rx,
    ));

    RunnerHandle { tx }
}

/// Confine an agent-supplied path to one of `roots` (the session workspace +
/// the vault). Defeats `..` traversal AND symlink escape by canonicalizing the
/// longest existing ancestor (which resolves symlinks) and rejecting any
/// `..`/`.` in the not-yet-existing tail. Returns the safe absolute path, or
/// `None` if it escapes every root.
///
/// The agent's own file IO over ACP (`fs/read_text_file` / `fs/write_text_file`)
/// otherwise hits the real filesystem on a raw path, bypassing the Bash/MCP
/// permission engine — so a prompt-injected agent could read `~/.ssh/id_rsa` or
/// overwrite `~/.zshrc`. The fs handlers turn `None` into a refusal to close
/// that back door.
fn confine_path(requested: &Path, roots: &[PathBuf]) -> Option<PathBuf> {
    // Resolve relative paths against the primary root (the workspace cwd).
    let abs = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        roots.first()?.join(requested)
    };
    // Peel the non-existing tail until an existing ancestor canonicalizes
    // (resolving symlinks). `/` always exists, so the loop terminates.
    let mut existing = abs.as_path();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    let resolved = loop {
        match existing.canonicalize() {
            Ok(c) => break c,
            Err(_) => {
                tail.push(existing.file_name()?.to_os_string());
                existing = existing.parent()?;
            }
        }
    };
    // Re-attach the tail, refusing `..`/`.` so it can't climb back out after
    // the canonicalized prefix.
    let mut full = resolved;
    for comp in tail.iter().rev() {
        if comp == ".." || comp == "." {
            return None;
        }
        full.push(comp);
    }
    // Must live under a canonicalized allowed root.
    let allowed: Vec<PathBuf> = roots.iter().filter_map(|r| r.canonicalize().ok()).collect();
    allowed
        .iter()
        .any(|root| full.starts_with(root))
        .then_some(full)
}

/// The per-session task body. Public so integration tests can run it on
/// their own tokio runtime against a fake ACP agent, capturing events via
/// `EventSink::Channel` — production goes through `start` above.
#[allow(clippy::too_many_arguments)]
pub async fn run_session(
    app: EventSink,
    id: String,
    harness: String,
    expert: String,
    sessions_dir: PathBuf,
    workspace: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    mcp_servers: Vec<McpServer>,
    persona_body: String,
    resume_requested: bool,
    mut rx: mpsc::UnboundedReceiver<RunnerInput>,
) {
    {
        // ── archive ───────────────────────────────────────────────────────
        let archive = Arc::new(SessionArchive::open(&sessions_dir, &id, &harness, &expert));
        // Mirror the Python runner's first-line: emit `ready` immediately so
        // the React side knows the session has started, even if the agent
        // hasn't responded to initialize yet.
        emit_vevt(
            &app,
            &id,
            json!({ "type": "ready", "harness": harness, "expert": expert, "resumed": resume_requested }),
            Some(&archive),
        );

        // ── build the AcpAgent with our custom env + stderr capture ───────
        let env_vars: Vec<EnvVariable> = env
            .into_iter()
            .map(|(k, v)| EnvVariable::new(k, v))
            .collect();
        let stdio = McpServerStdio::new(harness.as_str(), PathBuf::from(&command))
            .args(args)
            .env(env_vars);

        let app_dbg = app.clone();
        let id_dbg = id.clone();
        let agent = AcpAgent::new(McpServer::Stdio(stdio)).with_debug(move |line, direction| {
            // Surface stderr from the agent as log events (matches the
            // Python runner's `print(file=sys.stderr)` → Rust `emit_log`).
            // Stdin/stdout are noisy ACP JSON; skip them by default. To
            // debug raw JSON-RPC, set SPLIT_RUNNER_DEBUG=1 in the env.
            match direction {
                LineDirection::Stderr => emit_log(&app_dbg, &id_dbg, format!("⚠ {line}")),
                LineDirection::Stdin | LineDirection::Stdout => {
                    if std::env::var("SPLIT_RUNNER_DEBUG").ok().as_deref() == Some("1") {
                        emit_log(&app_dbg, &id_dbg, format!("[{:?}] {line}", direction));
                    }
                }
            }
        });

        // ── workspace cwd (persona projection happened in lib.rs) ─────────
        let cwd: PathBuf = if workspace.is_empty() {
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))
        } else {
            PathBuf::from(&workspace)
        };

        // Live browser view: stream `<cwd>/.frames/*.png` to the atelier for the
        // session's lifetime (aborted at teardown below). Cheap when idle —
        // a missing `.frames/` dir just yields no frames.
        let frame_watcher = spawn_frame_watcher(app.clone(), id.clone(), cwd.join(".frames"));

        // Per-turn buffer of the agent's `say` text — drained at idle so
        // we can scan for file paths the agent referenced (markdown links,
        // bare absolute paths) and surface them as synthetic artifacts even
        // when they live outside the workspace. Shared with the
        // notification handler.
        let say_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
        let say_buf_for_notif = say_buf.clone();

        // Per-turn buffer of file paths the agent's TOOLS touched — harvested
        // from ACP `fs/write_text_file` requests and from tool-call
        // `locations`. This is the AUTHORITATIVE source of "what file did the
        // agent write": it carries the real absolute path regardless of what
        // the prose says, so we surface deliverables the agent wrote outside
        // the workspace (e.g. `~/Documents/split-apps/foo/index.html`) even
        // when the final answer only names them by a relative shorthand or
        // mentions them solely in the plan. Drained at idle, mtime-gated so a
        // merely-read file can't masquerade as a fresh artifact.
        let touched_paths: Arc<Mutex<Vec<PathBuf>>> = Arc::new(Mutex::new(Vec::new()));
        let touched_for_notif = touched_paths.clone();
        let touched_for_write = touched_paths.clone();

        // Roots the agent's own ACP file IO is confined to: its workspace + the
        // boss's vault. Anything else (`~/.ssh`, `/etc`, a `..` escape, a symlink
        // out) is refused by the fs handlers below — see `confine_path`.
        let fs_roots: Vec<PathBuf> = vec![cwd.clone(), split_core::persona::vault_root()];
        let fs_roots_for_read = fs_roots.clone();
        let fs_roots_for_write = fs_roots;

        // Configured MCP server names — the permission handler uses these to
        // reconstruct `mcp__server__tool` ids from harness tool calls (so
        // rules like `mcp__cua_driver` can actually match). Captured here
        // while `mcp_servers` is still in scope; it's moved into the session
        // loop later.
        let mcp_server_names: Vec<String> = mcp_servers
            .iter()
            .filter_map(|s| match s {
                McpServer::Stdio(c) => Some(c.name.clone()),
                McpServer::Http(c) => Some(c.name.clone()),
                McpServer::Sse(c) => Some(c.name.clone()),
                _ => None,
            })
            .collect();

        // Captured by handler closures.
        let app_for_notif = app.clone();
        let id_for_notif = id.clone();
        let archive_for_notif = archive.clone();
        let app_for_perm = app.clone();
        let id_for_perm = id.clone();
        let expert_for_perm = expert.clone();
        let archive_for_perm = archive.clone();
        let app_for_loop = app.clone();
        let id_for_loop = id.clone();
        let archive_for_loop = archive.clone();
        let harness_for_loop = harness.clone();

        // Permissions: persisted rules path + in-memory session allowlist.
        // The set is Arc<Mutex<>> so the per-request closure can mutate it
        // when the user picks "allow for this session".
        let perms_path = sessions_dir
            .parent()
            .unwrap_or(&sessions_dir)
            .join("permissions.json");
        let session_allow: Arc<Mutex<std::collections::HashSet<String>>> =
            Arc::new(Mutex::new(std::collections::HashSet::new()));
        let session_allow_for_perm = session_allow.clone();
        let perms_path_for_perm = perms_path.clone();
        let mcp_names_for_perm = mcp_server_names.clone();

        let result = Client
            .builder()
            .on_receive_notification(
                async move |notification: SessionNotification, _cx| {
                    // Capture agent message chunks for the end-of-turn path
                    // scan. Append BEFORE forwarding so a downstream error
                    // can't leave the buffer half-drained.
                    if let SessionUpdate::AgentMessageChunk(chunk) = &notification.update {
                        if let ContentBlock::Text(t) = &chunk.content {
                            say_buf_for_notif.lock().unwrap().push_str(&t.text);
                        }
                    }
                    // Harvest tool-call file locations — the authoritative
                    // record of paths the agent's tools wrote to, used at idle
                    // to surface out-of-workspace deliverables (mtime-gated so
                    // a plain read can't masquerade as a fresh artifact).
                    match &notification.update {
                        SessionUpdate::ToolCall(t) => {
                            let mut buf = touched_for_notif.lock().unwrap();
                            buf.extend(t.locations.iter().map(|l| l.path.clone()));
                        }
                        SessionUpdate::ToolCallUpdate(t) => {
                            if let Some(locs) = &t.fields.locations {
                                let mut buf = touched_for_notif.lock().unwrap();
                                buf.extend(locs.iter().map(|l| l.path.clone()));
                            }
                        }
                        _ => {}
                    }
                    if let Some(payload) = update_to_vevt(&notification.update) {
                        emit_vevt(
                            &app_for_notif,
                            &id_for_notif,
                            payload,
                            Some(&archive_for_notif),
                        );
                    }
                    Ok(())
                },
                agent_client_protocol::on_receive_notification!(),
            )
            // fs/read_text_file — agent reads files via ACP (e.g. Codex
            // before edits). Confined to the workspace + vault so it can't be
            // turned into an arbitrary-file read (e.g. `~/.ssh/id_rsa`); with
            // optional line/limit windowing (1-based, matching the spec).
            .on_receive_request(
                async move |request: ReadTextFileRequest, responder, _conn| {
                    let Some(path) = confine_path(&request.path, &fs_roots_for_read) else {
                        return responder.respond_with_internal_error(
                            "permission denied: path is outside the session workspace and vault",
                        );
                    };
                    let result: Result<String, std::io::Error> = std::fs::read_to_string(&path);
                    match result {
                        Ok(mut content) => {
                            if request.line.is_some() || request.limit.is_some() {
                                let lines: Vec<&str> = content.split_inclusive('\n').collect();
                                let start = request
                                    .line
                                    .map(|l| l.saturating_sub(1) as usize)
                                    .unwrap_or(0);
                                let end = request
                                    .limit
                                    .map(|n| start + n as usize)
                                    .unwrap_or(lines.len())
                                    .min(lines.len());
                                let start = start.min(lines.len());
                                content = lines[start..end].concat();
                            }
                            responder.respond(ReadTextFileResponse::new(content))
                        }
                        Err(e) => responder.respond_with_internal_error(e.to_string()),
                    }
                },
                agent_client_protocol::on_receive_request!(),
            )
            // fs/write_text_file — agent writes files via ACP. Confined to the
            // workspace + vault (so it can't overwrite e.g. `~/.zshrc`); creates
            // the parent dir if missing (matches Python behaviour).
            .on_receive_request(
                async move |request: WriteTextFileRequest, responder, _conn| {
                    let Some(path) = confine_path(&request.path, &fs_roots_for_write) else {
                        return responder.respond_with_internal_error(
                            "permission denied: path is outside the session workspace and vault",
                        );
                    };
                    if let Some(parent) = path.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    match std::fs::write(&path, &request.content) {
                        Ok(()) => {
                            // Authoritative write — record the path so the
                            // end-of-turn scan surfaces it as a deliverable.
                            touched_for_write.lock().unwrap().push(path.clone());
                            responder.respond(WriteTextFileResponse::new())
                        }
                        Err(e) => responder.respond_with_internal_error(e.to_string()),
                    }
                },
                agent_client_protocol::on_receive_request!(),
            )
            .on_receive_request(
                async move |request: RequestPermissionRequest, responder, _conn| {
                    let tool_id = extract_tool_id(&request, &mcp_names_for_perm);

                    // Fast path 1: in-memory "allow for this session" set.
                    if session_allow_for_perm.lock().unwrap().contains(&tool_id) {
                        if let Some(opt) = pick_option(&request.options, "allow") {
                            return responder.respond(RequestPermissionResponse::new(
                                RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                                    opt,
                                )),
                            ));
                        }
                    }

                    // Fast path 2: persisted rules — deny > ask > allow,
                    // with the universal DEFAULT_DENY guards merged in.
                    let rules = permissions::load(&perms_path_for_perm);
                    match permissions::decide(&rules, &expert_for_perm, &tool_id) {
                        Decision::Allow => {
                            if let Some(opt) = pick_option(&request.options, "allow") {
                                return responder.respond(RequestPermissionResponse::new(
                                    RequestPermissionOutcome::Selected(
                                        SelectedPermissionOutcome::new(opt),
                                    ),
                                ));
                            }
                        }
                        Decision::Deny => {
                            return responder.respond(RequestPermissionResponse::new(
                                RequestPermissionOutcome::Cancelled,
                            ));
                        }
                        Decision::Ask => {}
                    }

                    // Slow path: ask the UI via VEVT, await oneshot.
                    let options_json: Vec<Value> = request
                        .options
                        .iter()
                        .map(|o| {
                            json!({
                                "id": &*o.option_id.0,
                                "name": o.name.clone(),
                                "kind": format!("{:?}", o.kind),
                            })
                        })
                        .collect();
                    let tool_call_val =
                        serde_json::to_value(&request.tool_call).unwrap_or(Value::Null);

                    let req_id = next_req_id();
                    let (perm_tx, perm_rx) = oneshot::channel::<PermissionReply>();
                    PENDING_PERMS_RUST
                        .lock()
                        .unwrap()
                        .insert(req_id.clone(), perm_tx);

                    emit_vevt(
                        &app_for_perm,
                        &id_for_perm,
                        json!({
                            "type": "permission_request",
                            "id": req_id,
                            "toolId": tool_id,
                            "expert": expert_for_perm,
                            "toolCall": tool_call_val,
                            "options": options_json,
                        }),
                        Some(&archive_for_perm),
                    );

                    let (picked, scope) =
                        perm_rx.await.unwrap_or_else(|_| (None, "once".to_string()));
                    PENDING_PERMS_RUST.lock().unwrap().remove(&req_id);

                    // Persistence per scope (matches the Python flow):
                    //   once          — nothing extra
                    //   session       — add tool_id to the per-runner set
                    //   always-allow  — append "<expert>:<generalized>" to allow
                    //   always-deny   — append to deny
                    if picked.is_some() && scope == "session" {
                        session_allow_for_perm
                            .lock()
                            .unwrap()
                            .insert(tool_id.clone());
                    } else if picked.is_some() && scope == "always-allow" {
                        let rule = format!(
                            "{}:{}",
                            expert_for_perm,
                            permissions::rule_for_persist(&tool_id)
                        );
                        permissions::add_rule(&perms_path_for_perm, Decision::Allow, &rule);
                    } else if picked.is_none() && scope == "always-deny" {
                        let rule = format!(
                            "{}:{}",
                            expert_for_perm,
                            permissions::rule_for_persist(&tool_id)
                        );
                        permissions::add_rule(&perms_path_for_perm, Decision::Deny, &rule);
                    }

                    match picked {
                        Some(option_id) => responder.respond(RequestPermissionResponse::new(
                            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                                option_id,
                            )),
                        )),
                        None => responder.respond(RequestPermissionResponse::new(
                            RequestPermissionOutcome::Cancelled,
                        )),
                    }
                },
                agent_client_protocol::on_receive_request!(),
            )
            .connect_with(agent, move |connection: ConnectionTo<Agent>| async move {
                // ── initialize ────────────────────────────────────────────
                // Advertise the fs caps so the agent will use our
                // `fs/read_text_file` + `fs/write_text_file` handlers
                // (instead of accessing the FS directly, which it might not
                // be able to do in sandboxed setups). Terminal stays off —
                // matches the Python `client_capabilities()` exactly.
                let fs_caps = FileSystemCapabilities::new()
                    .read_text_file(true)
                    .write_text_file(true);
                let caps = ClientCapabilities::default().fs(fs_caps).terminal(false);
                let init = connection
                    .send_request(
                        InitializeRequest::new(ProtocolVersion::V1).client_capabilities(caps),
                    )
                    .block_task()
                    .await?;

                let auth_methods = init.auth_methods.clone();
                let resume_supported = init
                    .agent_capabilities
                    .session_capabilities
                    .resume
                    .is_some();

                // ── pending state from `Turn` inputs received while a
                //    blocking flow (auth, etc.) is awaiting user action ───
                let mut pending_turn: Option<String> = None;

                // ── open session (resume → fallback to new_session, with
                //    inline auth loop) ──────────────────────────────────────
                let session_id: SessionId = open_session(
                    &connection,
                    &mut rx,
                    &cwd,
                    mcp_servers,
                    resume_requested,
                    resume_supported,
                    archive_for_loop.acp_sid(),
                    &auth_methods,
                    harness_for_loop.clone(),
                    &app_for_loop,
                    &id_for_loop,
                    &archive_for_loop,
                    &mut pending_turn,
                )
                .await?;

                let session_id_str: String = (*session_id.0).to_string();
                archive_for_loop.set_acp_sid(&session_id_str);

                // Persona injection is suppressed on a successful resume:
                // the agent already has its character in conversation history.
                let mut persona_injected =
                    resume_requested && Some(session_id_str) == archive_for_loop.acp_sid();

                // ── artifact snapshot ────────────────────────────────────
                // Capture the workspace state BEFORE the first turn so any
                // files the agent writes (via ACP fs/write_text_file, bash,
                // tool calls, anything) show up in the diff. Re-walked +
                // diffed inside `run_one_turn` on every status:idle.
                let mut artifact_snapshot = snapshot_workspace(&cwd);

                // ── main control loop ────────────────────────────────────
                // Turns run one at a time. A `RunnerInput::Stop` (the stop
                // button) must interrupt even a long, in-flight turn, so
                // `run_one_turn` races the prompt against this same control
                // channel and asks the agent to `session/cancel` on Stop.
                // Non-Stop inputs that land mid-turn are buffered in `deferred`
                // and drained before the next blocking `recv`, so a stray
                // follow-up is neither lost nor reordered.
                let mut deferred: VecDeque<RunnerInput> = VecDeque::new();
                // A turn stashed during the auth flow replays first.
                if let Some(text) = pending_turn.take() {
                    deferred.push_back(RunnerInput::Turn(text));
                }

                'control: loop {
                    let input = match deferred.pop_front() {
                        Some(buffered) => buffered,
                        None => match rx.recv().await {
                            Some(input) => input,
                            None => break 'control,
                        },
                    };
                    match input {
                        RunnerInput::Turn(text) => {
                            let outcome = run_one_turn(
                                &connection,
                                &session_id,
                                text,
                                &persona_body,
                                persona_injected,
                                &app_for_loop,
                                &id_for_loop,
                                &archive_for_loop,
                                &cwd,
                                &mut artifact_snapshot,
                                &say_buf,
                                &touched_paths,
                                &mut rx,
                                &mut deferred,
                            )
                            .await;
                            persona_injected = outcome.persona_injected;
                            if outcome.stopped {
                                break 'control;
                            }
                        }
                        RunnerInput::Auth { method_id } => {
                            authenticate_and_emit(
                                &connection,
                                method_id,
                                &harness_for_loop,
                                &auth_methods,
                                &app_for_loop,
                                &id_for_loop,
                                &archive_for_loop,
                            )
                            .await;
                        }
                        RunnerInput::Logout => {
                            logout_and_emit(
                                &connection,
                                &harness_for_loop,
                                &auth_methods,
                                &app_for_loop,
                                &id_for_loop,
                                &archive_for_loop,
                            )
                            .await;
                        }
                        RunnerInput::Stop => break 'control,
                    }
                }

                // ── graceful teardown ─────────────────────────────────────
                let _ = connection.send_notification(CancelNotification::new(session_id.clone()));
                let close_fut = connection
                    .send_request(CloseSessionRequest::new(session_id))
                    .block_task();
                let _ =
                    tokio::time::timeout(std::time::Duration::from_millis(400), close_fut).await;

                Ok(())
            })
            .await;

        if let Err(e) = result {
            emit_log(&app, &id, format!("acp connection error: {e}"));
            emit_vevt(
                &app,
                &id,
                json!({ "type": "status", "status": "error", "error": format!("{e}") }),
                Some(&archive),
            );
        }

        frame_watcher.abort();
        archive.close();
        emit_exit(&app, &id);
    }
}

/// Try `resume_session` if requested + supported + we have an `acp_sid`;
/// otherwise `new_session`. Both paths share the auth retry inner loop
/// (some agents only error with auth-needed at `session/new`).
#[allow(clippy::too_many_arguments)]
async fn open_session(
    connection: &ConnectionTo<Agent>,
    rx: &mut mpsc::UnboundedReceiver<RunnerInput>,
    cwd: &std::path::Path,
    mcp_servers: Vec<McpServer>,
    resume_requested: bool,
    resume_supported: bool,
    prior_acp_sid: Option<String>,
    auth_methods: &[agent_client_protocol::schema::AuthMethod],
    harness: String,
    app: &EventSink,
    id: &str,
    archive: &SessionArchive,
    pending_turn: &mut Option<String>,
) -> Result<SessionId, agent_client_protocol::Error> {
    if resume_requested && resume_supported {
        if let Some(prior) = prior_acp_sid.clone() {
            let resp = connection
                .send_request(
                    ResumeSessionRequest::new(prior.clone(), cwd.to_path_buf())
                        .mcp_servers(mcp_servers.clone()),
                )
                .block_task()
                .await;
            match resp {
                Ok(_) => {
                    emit_log(app, id, format!("resumed ACP session {prior}"));
                    return Ok(SessionId::from(prior));
                }
                Err(e) => {
                    emit_log(
                        app,
                        id,
                        format!("resume failed ({e}); falling back to new session"),
                    );
                }
            }
        }
    } else if resume_requested && !resume_supported {
        emit_log(
            app,
            id,
            "agent does not advertise sessionCapabilities.resume; new session".to_string(),
        );
    }

    // new_session with auth retry on error + MCP fallback if the agent
    // rejects servers at the wire (mirrors Python's "agent rejected MCP
    // servers ... retrying without" branch — Vibe is the canonical case).
    let mut mcp_attempt = mcp_servers.clone();
    let mut mcp_dropped = false;
    loop {
        let resp = connection
            .send_request(
                NewSessionRequest::new(cwd.to_path_buf()).mcp_servers(mcp_attempt.clone()),
            )
            .block_task()
            .await;
        match resp {
            Ok(s) => {
                // PROBE: log what the agent advertises natively at session/new.
                // `config_options` carries the model / mode / thought_level
                // selectors (SessionConfigOptionCategory); `modes` is the
                // ask/architect/code state. Tells us which harnesses expose
                // native model selection (`category: "model"`) vs. need the
                // spawn-time fallback in core-rs/src/harness_config.rs.
                let opts =
                    serde_json::to_string(&s.config_options).unwrap_or_else(|_| "null".to_string());
                let modes = serde_json::to_string(&s.modes).unwrap_or_else(|_| "null".to_string());
                let probe =
                    format!("[config-probe] harness={harness} configOptions={opts} modes={modes}");
                eprintln!("{probe}"); // terminal visibility in `tauri dev`
                emit_log(app, id, probe); // also into the app's log stream
                return Ok(s.session_id);
            }
            Err(e) => {
                let msg = format!("{e}");
                // First fallback: if we sent MCP and the error doesn't look
                // like auth, try once more without MCP. Some agents (Vibe)
                // reject `session/new` outright when servers are listed.
                if !mcp_attempt.is_empty() && !mcp_dropped && !looks_like_auth_error(&msg) {
                    emit_log(
                        app,
                        id,
                        format!("agent rejected MCP servers ({msg}); retrying without"),
                    );
                    mcp_attempt = Vec::new();
                    mcp_dropped = true;
                    continue;
                }
                if looks_like_auth_error(&msg) || !auth_methods.is_empty() {
                    // Surface auth_required and wait for an Auth input. Turns
                    // received in the meantime are stashed for replay.
                    emit_vevt(
                        app,
                        id,
                        json!({
                            "type": "auth_required",
                            "harness": harness,
                            "methods": auth_methods_to_json(auth_methods),
                            "hasLogin": has_browser_login(&harness),
                            "note": "",
                        }),
                        Some(archive),
                    );
                    // Inner loop: keep reading until Auth or Stop arrives.
                    loop {
                        match rx.recv().await {
                            Some(RunnerInput::Auth { method_id }) => {
                                let auth_resp = connection
                                    .send_request(AuthenticateRequest::new(AuthMethodId::from(
                                        method_id.clone(),
                                    )))
                                    .block_task()
                                    .await;
                                match auth_resp {
                                    Ok(_) => {
                                        emit_vevt(
                                            app,
                                            id,
                                            json!({
                                                "type": "auth_result",
                                                "harness": harness,
                                                "ok": true,
                                            }),
                                            Some(archive),
                                        );
                                        break; // back to outer: retry new_session
                                    }
                                    Err(ae) => {
                                        emit_vevt(
                                            app,
                                            id,
                                            json!({
                                                "type": "auth_result",
                                                "harness": harness,
                                                "ok": false,
                                                "error": format!("{ae}"),
                                            }),
                                            Some(archive),
                                        );
                                        // stay in the inner loop; user may retry
                                    }
                                }
                            }
                            Some(RunnerInput::Turn(text)) => {
                                // Stash the turn so we can replay it after auth
                                *pending_turn = Some(text);
                            }
                            Some(RunnerInput::Logout) => {
                                emit_log(
                                    app,
                                    id,
                                    "logout before authentication is a no-op".to_string(),
                                );
                            }
                            Some(RunnerInput::Stop) | None => return Err(e),
                        }
                    }
                } else {
                    return Err(e);
                }
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
/// Outcome of one turn. `stopped` tells the control loop to break into graceful
/// teardown — the boss hit Stop (or the control channel closed) mid-turn.
struct TurnOutcome {
    persona_injected: bool,
    stopped: bool,
}

#[allow(clippy::too_many_arguments)]
async fn run_one_turn(
    connection: &ConnectionTo<Agent>,
    session_id: &SessionId,
    text: String,
    persona_body: &str,
    persona_injected: bool,
    app: &EventSink,
    id: &str,
    archive: &SessionArchive,
    workspace: &Path,
    snapshot: &mut BTreeMap<String, FileStamp>,
    say_buf: &Arc<Mutex<String>>,
    touched_paths: &Arc<Mutex<Vec<PathBuf>>>,
    rx: &mut mpsc::UnboundedReceiver<RunnerInput>,
    deferred: &mut VecDeque<RunnerInput>,
) -> TurnOutcome {
    archive.write_turn(&text);
    // Fresh buffers for this turn — anything left over from a cancelled or
    // errored previous turn is irrelevant to what's being said now.
    say_buf.lock().unwrap().clear();
    touched_paths.lock().unwrap().clear();
    // Floor (whole seconds) of the turn's start. Any deliverable the agent
    // writes happens after this, so we use it to gate out merely-read files
    // (whose mtime predates the turn) from the end-of-turn artifact scan.
    let turn_start = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    emit_vevt(
        app,
        id,
        json!({ "type": "status", "status": "running" }),
        Some(archive),
    );
    let wire = if !persona_injected {
        format!(
            "{persona_body}\n\n---\n\n**The boss's first request follows below. Reply as the persona described above, in their tone, using only the skills listed for them. Do not introduce yourself unless asked — just do the work.**\n\n{text}"
        )
    } else {
        text
    };
    // Race the prompt against the control channel so a mid-turn Stop actually
    // interrupts a long-running turn instead of being seen only after it
    // finishes. Non-Stop inputs that arrive while the turn runs are buffered
    // for the control loop to process next.
    let prompt_fut = connection
        .send_request(PromptRequest::new(
            session_id.clone(),
            vec![ContentBlock::Text(TextContent::new(wire))],
        ))
        .block_task();
    tokio::pin!(prompt_fut);
    let resp = loop {
        tokio::select! {
            r = &mut prompt_fut => break r,
            input = rx.recv() => match input {
                Some(RunnerInput::Stop) | None => {
                    // Ask the agent to cancel, then briefly drain the
                    // now-cancelling prompt so the ACP session is left clean.
                    // Whatever streamed so far is committed by the idle below,
                    // so the boss sees the partial answer rather than a hang.
                    let _ = connection
                        .send_notification(CancelNotification::new(session_id.clone()));
                    let _ = tokio::time::timeout(
                        std::time::Duration::from_millis(400),
                        &mut prompt_fut,
                    )
                    .await;
                    emit_vevt(
                        app,
                        id,
                        json!({ "type": "status", "status": "idle", "stop": "Cancelled" }),
                        Some(archive),
                    );
                    return TurnOutcome { persona_injected, stopped: true };
                }
                Some(other) => deferred.push_back(other),
            },
        }
    };
    match resp {
        Ok(r) => {
            // Diff the workspace just before flipping the session to idle so
            // the React reducer (which commits the streamed answer on idle)
            // has the artifact list already in place.
            let next = snapshot_workspace(workspace);
            emit_artifact_diff(app, id, archive, workspace, snapshot, &next);
            *snapshot = next;
            // Safety net: agents sometimes write outside cwd despite the
            // persona rule. Surface those deliverables from two sources,
            // mtime-gated to this turn so a merely-read file can't masquerade
            // as a fresh artifact:
            //   1. Paths the agent's TOOLS touched (ACP fs/write_text_file +
            //      tool-call locations) — authoritative, carries the real
            //      absolute path even when the prose only names a shorthand.
            //   2. Paths referenced in the turn's final answer (markdown
            //      links, bare absolute paths) — covers tools that report no
            //      locations ("I saved it to ~/Desktop/foo.docx").
            let say_text = std::mem::take(&mut *say_buf.lock().unwrap());
            let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();
            let touched = std::mem::take(&mut *touched_paths.lock().unwrap());
            for path in touched
                .into_iter()
                .filter(|p| p.is_file())
                .map(|p| p.canonicalize().unwrap_or(p))
                .chain(scan_referenced_paths(&say_text, workspace))
            {
                if !seen.insert(path.clone()) {
                    continue;
                }
                emit_referenced_artifact(app, id, archive, workspace, &path, snapshot, turn_start);
            }
            emit_vevt(
                app,
                id,
                json!({
                    "type": "status",
                    "status": "idle",
                    "stop": format!("{:?}", r.stop_reason),
                }),
                Some(archive),
            );
            TurnOutcome {
                persona_injected: true,
                stopped: false,
            }
        }
        Err(e) => {
            emit_vevt(
                app,
                id,
                json!({
                    "type": "status",
                    "status": "error",
                    "error": format!("{e}"),
                }),
                Some(archive),
            );
            // Keep persona_injected at its previous value (caller maintains).
            TurnOutcome {
                persona_injected,
                stopped: false,
            }
        }
    }
}

async fn authenticate_and_emit(
    connection: &ConnectionTo<Agent>,
    method_id: String,
    harness: &str,
    auth_methods: &[agent_client_protocol::schema::AuthMethod],
    app: &EventSink,
    id: &str,
    archive: &SessionArchive,
) {
    let resp = connection
        .send_request(AuthenticateRequest::new(AuthMethodId::from(
            method_id.clone(),
        )))
        .block_task()
        .await;
    match resp {
        Ok(_) => emit_vevt(
            app,
            id,
            json!({ "type": "auth_result", "harness": harness, "ok": true }),
            Some(archive),
        ),
        Err(e) => emit_vevt(
            app,
            id,
            json!({
                "type": "auth_result",
                "harness": harness,
                "ok": false,
                "error": format!("{e}"),
            }),
            Some(archive),
        ),
    }
    // Refresh the auth_required prompt if it was open so the UI can re-pick.
    let _ = auth_methods; // kept for future "list methods on retry" wiring
}

async fn logout_and_emit(
    connection: &ConnectionTo<Agent>,
    harness: &str,
    auth_methods: &[agent_client_protocol::schema::AuthMethod],
    app: &EventSink,
    id: &str,
    archive: &SessionArchive,
) {
    let resp = connection
        .send_request(LogoutRequest::default())
        .block_task()
        .await;
    match resp {
        Ok(_) => {
            emit_vevt(
                app,
                id,
                json!({
                    "type": "auth_result",
                    "harness": harness,
                    "ok": true,
                    "loggedOut": true,
                }),
                Some(archive),
            );
            emit_vevt(
                app,
                id,
                json!({
                    "type": "auth_required",
                    "harness": harness,
                    "methods": auth_methods_to_json(auth_methods),
                    "hasLogin": has_browser_login(harness),
                    "note": "",
                }),
                Some(archive),
            );
        }
        Err(e) => emit_vevt(
            app,
            id,
            json!({
                "type": "auth_result",
                "harness": harness,
                "ok": false,
                "error": format!("logout failed: {e}"),
            }),
            Some(archive),
        ),
    }
}

/// Harnesses we know expose a browser-OAuth login command (mirrors
/// `split.auth.LOGIN_CMD`). React surfaces an "Open Terminal to sign in"
/// button when this is true and the agent's listed auth methods don't fit.
fn has_browser_login(harness: &str) -> bool {
    matches!(
        harness,
        "claude" | "codex" | "gemini" | "cursor" | "copilot"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn servers() -> Vec<String> {
        vec!["cua-driver".to_string(), "everything".to_string()]
    }

    #[test]
    fn confine_path_blocks_traversal_and_symlink_escape() {
        use std::fs;
        let tmp = std::env::temp_dir().join(format!("split-confine-{}", std::process::id()));
        let ws = tmp.join("workspace");
        let outside = tmp.join("outside");
        fs::create_dir_all(&ws).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(ws.join("ok.txt"), "hi").unwrap();
        fs::write(outside.join("secret.txt"), "sshhh").unwrap();
        let roots = vec![ws.clone()];

        // Inside the workspace → allowed (existing file, and a not-yet-existing
        // file in a new subdir).
        assert!(confine_path(&ws.join("ok.txt"), &roots).is_some());
        assert!(confine_path(&ws.join("sub/new.txt"), &roots).is_some());
        // `..` traversal and absolute paths out of the workspace → refused.
        assert!(confine_path(&ws.join("../outside/secret.txt"), &roots).is_none());
        assert!(confine_path(&outside.join("secret.txt"), &roots).is_none());

        // A symlink INSIDE the workspace pointing out → refused: canonicalizing
        // the existing ancestor follows the link out of the root.
        #[cfg(unix)]
        {
            let link = ws.join("escape");
            std::os::unix::fs::symlink(&outside, &link).unwrap();
            assert!(
                confine_path(&link.join("secret.txt"), &roots).is_none(),
                "symlink escape must be refused"
            );
        }

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn tool_id_built_in_tools_by_shape() {
        // Bash from command / cmd.
        assert_eq!(
            tool_id_from_parts("run", "execute", Some(&json!({"command": "npm test"})), &[]),
            "Bash(npm test)"
        );
        assert_eq!(
            tool_id_from_parts("run", "execute", Some(&json!({"cmd": "ls -la"})), &[]),
            "Bash(ls -la)"
        );
        // Read/Edit/Write from path + kind.
        assert_eq!(
            tool_id_from_parts("read", "read", Some(&json!({"path": "/a/b.txt"})), &[]),
            "Read(/a/b.txt)"
        );
        assert_eq!(
            tool_id_from_parts(
                "write",
                "write",
                Some(&json!({"file_path": "/a/c.txt"})),
                &[]
            ),
            "Write(/a/c.txt)"
        );
    }

    #[test]
    fn tool_id_reconstructs_mcp_from_name_and_title() {
        // Already-canonical name in raw_input (Claude Code convention).
        assert_eq!(
            tool_id_from_parts(
                "Clicking",
                "other",
                Some(&json!({"name": "mcp__cua-driver__click"})),
                &servers()
            ),
            "mcp__cua_driver__click"
        );
        // `<server>__<tool>` in the title for a known server.
        assert_eq!(
            tool_id_from_parts("cua-driver__type_text", "other", None, &servers()),
            "mcp__cua_driver__type_text"
        );
        // Built-in shape still wins over an MCP-looking title.
        assert_eq!(
            tool_id_from_parts(
                "cua-driver__x",
                "execute",
                Some(&json!({"command": "echo hi"})),
                &servers()
            ),
            "Bash(echo hi)"
        );
    }

    #[test]
    fn tool_id_falls_back_to_title_then_kind() {
        // Bare tool name with no resolvable server → title (today's behavior;
        // the server is genuinely unknown so we don't guess).
        assert_eq!(
            tool_id_from_parts("WebSearch", "fetch", None, &servers()),
            "WebSearch"
        );
        // No title → kind, then the literal "tool".
        assert_eq!(tool_id_from_parts("", "search", None, &servers()), "search");
        assert_eq!(tool_id_from_parts("", "", None, &servers()), "tool");
    }
}
