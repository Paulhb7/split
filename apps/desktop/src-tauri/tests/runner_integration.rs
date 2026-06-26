//! Integration tests for the native Rust ACP runner.
//!
//! Each test drives `runner::run_session` end-to-end against the scriptable
//! fake ACP agent (`src/bin/fake_acp_agent.rs`) — a real subprocess speaking
//! real ACP over stdio — and asserts on the VEVT stream captured through
//! `EventSink::Channel` plus the on-disk session archive. No Tauri app is
//! involved.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use agent_client_protocol::schema::{McpServer, McpServerStdio};
use serde_json::Value;
use split_desktop_lib::runner::{self, EventSink, RunnerInput, WireEvent, PENDING_PERMS_RUST};
use tokio::sync::mpsc;
use tokio::time::timeout;

const WAIT: Duration = Duration::from_secs(30);

static DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestSession {
    tx: mpsc::UnboundedSender<RunnerInput>,
    rx: mpsc::UnboundedReceiver<WireEvent>,
    /// Per-test scratch root: `sessions/` + `workspace/` live under it, and
    /// `permissions.json` lands directly in it (= sessions_dir.parent()).
    base: PathBuf,
    id: String,
}

fn start_session(tag: &str, scenario: &str, mcp_servers: Vec<McpServer>) -> TestSession {
    let n = DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
    let base =
        std::env::temp_dir().join(format!("split-runner-it-{tag}-{}-{n}", std::process::id()));
    let sessions_dir = base.join("sessions");
    let workspace = base.join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();

    let (in_tx, in_rx) = mpsc::unbounded_channel::<RunnerInput>();
    let (ev_tx, ev_rx) = mpsc::unbounded_channel::<WireEvent>();

    let mut env = HashMap::new();
    env.insert("FAKE_ACP_SCENARIO".to_string(), scenario.to_string());

    let id = format!("sess-{tag}");
    tokio::spawn(runner::run_session(
        EventSink::Channel(ev_tx),
        id.clone(),
        "fake".to_string(),
        "tester".to_string(),
        sessions_dir,
        workspace.to_string_lossy().to_string(),
        env!("CARGO_BIN_EXE_fake_acp_agent").to_string(),
        Vec::new(),
        env,
        mcp_servers,
        "PERSONA_MARK_42".to_string(),
        false,
        in_rx,
    ));

    TestSession {
        tx: in_tx,
        rx: ev_rx,
        base,
        id,
    }
}

impl TestSession {
    async fn next_event(&mut self) -> WireEvent {
        timeout(WAIT, self.rx.recv())
            .await
            .expect("timed out waiting for a session event")
            .expect("event channel closed unexpectedly")
    }

    /// Read until the next VEVT of the given type, skipping logs and other
    /// VEVTs. Panics on `exit` or `status:error`.
    async fn next_vevt(&mut self, ty: &str) -> Value {
        loop {
            let ev = self.next_event().await;
            assert!(!ev.exit, "session exited while waiting for vevt `{ty}`");
            let Some(raw) = ev.vevt else { continue };
            let v: Value = serde_json::from_str(&raw).unwrap();
            if v["type"] == "status" && v["status"] == "error" && ty != "status" {
                panic!("session errored while waiting for `{ty}`: {v}");
            }
            if v["type"] == ty {
                return v;
            }
        }
    }

    /// Collect every VEVT + log line until `status` flips to idle or error
    /// (the turn-finished signal). Returns (vevts, logs).
    async fn drain_turn(&mut self) -> (Vec<Value>, Vec<String>) {
        let mut vevts = Vec::new();
        let mut logs = Vec::new();
        loop {
            let ev = self.next_event().await;
            assert!(!ev.exit, "session exited mid-turn");
            if let Some(line) = ev.log {
                logs.push(line);
                continue;
            }
            let Some(raw) = ev.vevt else { continue };
            let v: Value = serde_json::from_str(&raw).unwrap();
            let done = v["type"] == "status" && (v["status"] == "idle" || v["status"] == "error");
            vevts.push(v);
            if done {
                return (vevts, logs);
            }
        }
    }

    /// Drain the channel to the end (all senders dropped = session task and
    /// agent fully torn down). Returns (saw_exit, logs).
    async fn drain_to_close(&mut self) -> (bool, Vec<String>) {
        let mut saw_exit = false;
        let mut logs = Vec::new();
        loop {
            match timeout(WAIT, self.rx.recv()).await {
                Ok(Some(ev)) => {
                    if ev.exit {
                        saw_exit = true;
                    }
                    if let Some(line) = ev.log {
                        logs.push(line);
                    }
                }
                Ok(None) => return (saw_exit, logs),
                Err(_) => panic!("timed out waiting for the session to close"),
            }
        }
    }

    fn send(&self, input: RunnerInput) {
        self.tx.send(input).expect("runner input channel closed");
    }
}

fn says(vevts: &[Value]) -> String {
    vevts
        .iter()
        .filter(|v| v["type"] == "say")
        .filter_map(|v| v["text"].as_str())
        .collect::<Vec<_>>()
        .join("")
}

/// Resolve the in-flight permission dialog `req_id` the way the
/// `send_permission` Tauri command does.
fn reply_permission(req_id: &str, picked: Option<&str>, scope: &str) {
    let tx = PENDING_PERMS_RUST
        .lock()
        .unwrap()
        .remove(req_id)
        .expect("no pending permission for that request id");
    tx.send((picked.map(String::from), scope.to_string()))
        .expect("runner dropped the permission oneshot");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn happy_turn_streams_vevts_injects_persona_once_and_archives() {
    let mut s = start_session("happy", "happy", Vec::new());

    // `ready` is the very first event, emitted before the agent even spawns.
    let ready = s.next_vevt("ready").await;
    assert_eq!(ready["harness"], "fake");
    assert_eq!(ready["expert"], "tester");
    assert_eq!(ready["resumed"], false);

    // ── first turn: persona must be prepended to the wire text ──────────
    s.send(RunnerInput::Turn("hello world".to_string()));
    let (vevts, _) = s.drain_turn().await;

    assert_eq!(vevts.first().unwrap()["type"], "status");
    assert_eq!(vevts.first().unwrap()["status"], "running");
    let idle = vevts.last().unwrap();
    assert_eq!(idle["status"], "idle");
    assert_eq!(idle["stop"], "EndTurn");

    assert!(
        vevts
            .iter()
            .any(|v| v["type"] == "thought" && v["text"] == "thinking..."),
        "expected the fake agent's thought chunk"
    );
    assert!(
        vevts
            .iter()
            .any(|v| v["type"] == "step" && v["title"] == "fake-tool"),
        "expected the tool_call to surface as a step VEVT"
    );

    let echoed = says(&vevts);
    assert!(echoed.starts_with("echo:"), "say should echo the wire text");
    assert!(
        echoed.contains("PERSONA_MARK_42"),
        "first turn must carry the persona"
    );
    assert!(echoed.contains("hello world"));

    // ── second turn: persona must NOT be re-injected ─────────────────────
    s.send(RunnerInput::Turn("second".to_string()));
    let (vevts, _) = s.drain_turn().await;
    assert_eq!(says(&vevts), "echo:second");

    // ── archive on disk ──────────────────────────────────────────────────
    let dir = s.base.join("sessions").join(&s.id);
    let events = std::fs::read_to_string(dir.join("events.ndjson")).unwrap();
    let first: Value = serde_json::from_str(events.lines().next().unwrap()).unwrap();
    assert_eq!(first["type"], "ready");
    assert!(events.contains("\"say\""));
    let meta: Value =
        serde_json::from_str(&std::fs::read_to_string(dir.join("meta.json")).unwrap()).unwrap();
    assert_eq!(meta["acp_sid"], "fake-sess-1");
    assert_eq!(meta["harness"], "fake");

    // ── graceful stop ────────────────────────────────────────────────────
    s.send(RunnerInput::Stop);
    let (saw_exit, logs) = s.drain_to_close().await;
    assert!(saw_exit, "Stop must end with an exit event");
    assert!(
        logs.iter()
            .any(|l| l.contains("fake-agent: cancel received")),
        "agent should have received session/cancel; logs: {logs:?}"
    );
    assert!(
        logs.iter()
            .any(|l| l.contains("fake-agent: close received")),
        "agent should have received session/close; logs: {logs:?}"
    );

    let _ = std::fs::remove_dir_all(&s.base);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn stop_interrupts_in_flight_turn() {
    // The `slow` agent parks the turn after streaming a thought, until it's
    // asked to cancel — so Stop must interrupt a genuinely in-flight prompt.
    let mut s = start_session("slow", "slow", Vec::new());
    let _ready = s.next_vevt("ready").await;

    s.send(RunnerInput::Turn("take your time".to_string()));
    // Confirm the turn is actually running before we interrupt it.
    let running = s.next_vevt("status").await;
    assert_eq!(running["status"], "running");
    let thought = s.next_vevt("thought").await;
    assert_eq!(thought["text"], "thinking...");

    // Hit Stop while the prompt is still outstanding. The runner must observe
    // it mid-turn (not only after the prompt resolves), cancel the agent, and
    // flip the turn to idle/Cancelled.
    s.send(RunnerInput::Stop);

    let idle = s.next_vevt("status").await;
    assert_eq!(
        idle["status"], "idle",
        "Stop should flip the in-flight turn to idle"
    );
    assert_eq!(
        idle["stop"], "Cancelled",
        "the interrupted turn must report Cancelled, not EndTurn"
    );

    let (saw_exit, logs) = s.drain_to_close().await;
    assert!(saw_exit, "Stop must end with an exit event");
    assert!(
        logs.iter()
            .any(|l| l.contains("fake-agent: cancel received")),
        "agent should have received session/cancel; logs: {logs:?}"
    );

    let _ = std::fs::remove_dir_all(&s.base);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn auth_required_stashes_turn_and_replays_after_auth() {
    let mut s = start_session("auth", "auth", Vec::new());
    s.next_vevt("ready").await;

    // Send the turn before authenticating — it must be stashed, not lost.
    s.send(RunnerInput::Turn("first-question".to_string()));

    let auth = s.next_vevt("auth_required").await;
    assert_eq!(auth["harness"], "fake");
    assert_eq!(auth["methods"][0]["id"], "test-method");
    assert_eq!(auth["hasLogin"], false);

    s.send(RunnerInput::Auth {
        method_id: "test-method".to_string(),
    });
    let result = s.next_vevt("auth_result").await;
    assert_eq!(result["ok"], true);

    // The stashed turn replays without further input.
    let (vevts, _) = s.drain_turn().await;
    assert_eq!(vevts.last().unwrap()["status"], "idle");
    let echoed = says(&vevts);
    assert!(echoed.contains("first-question"));
    assert!(
        echoed.contains("PERSONA_MARK_42"),
        "replayed first turn still carries the persona"
    );

    s.send(RunnerInput::Stop);
    s.drain_to_close().await;
    let _ = std::fs::remove_dir_all(&s.base);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn permission_flow_allow_deny_and_session_scope() {
    let mut s = start_session("perm", "perm", Vec::new());
    s.next_vevt("ready").await;

    // ── turn 1: allow once ───────────────────────────────────────────────
    s.send(RunnerInput::Turn("t1".to_string()));
    let req = s.next_vevt("permission_request").await;
    assert_eq!(req["toolId"], "Bash(echo hi)");
    assert_eq!(req["expert"], "tester");
    assert_eq!(req["options"].as_array().unwrap().len(), 2);
    reply_permission(req["id"].as_str().unwrap(), Some("opt-allow"), "once");
    let (vevts, _) = s.drain_turn().await;
    assert!(
        says(&vevts).contains("perm:allowed:opt-allow"),
        "got: {}",
        says(&vevts)
    );

    // ── turn 2: deny once ────────────────────────────────────────────────
    s.send(RunnerInput::Turn("t2".to_string()));
    let req = s.next_vevt("permission_request").await;
    reply_permission(req["id"].as_str().unwrap(), None, "once");
    let (vevts, _) = s.drain_turn().await;
    assert!(
        says(&vevts).contains("perm:denied"),
        "got: {}",
        says(&vevts)
    );

    // ── turn 3: allow for this session ───────────────────────────────────
    s.send(RunnerInput::Turn("t3".to_string()));
    let req = s.next_vevt("permission_request").await;
    reply_permission(req["id"].as_str().unwrap(), Some("opt-allow"), "session");
    let (vevts, _) = s.drain_turn().await;
    assert!(
        says(&vevts).contains("perm:allowed:opt-allow"),
        "got: {}",
        says(&vevts)
    );

    // ── turn 4: same tool — auto-approved, no dialog ─────────────────────
    s.send(RunnerInput::Turn("t4".to_string()));
    let (vevts, _) = s.drain_turn().await;
    assert!(
        !vevts.iter().any(|v| v["type"] == "permission_request"),
        "session-scoped allow must skip the dialog"
    );
    assert!(
        says(&vevts).contains("perm:allowed:opt-allow"),
        "got: {}",
        says(&vevts)
    );

    s.send(RunnerInput::Stop);
    s.drain_to_close().await;
    let _ = std::fs::remove_dir_all(&s.base);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn always_allow_persists_a_generalized_rule() {
    let mut s = start_session("permrule", "perm", Vec::new());
    s.next_vevt("ready").await;

    s.send(RunnerInput::Turn("t1".to_string()));
    let req = s.next_vevt("permission_request").await;
    reply_permission(
        req["id"].as_str().unwrap(),
        Some("opt-allow"),
        "always-allow",
    );
    let (vevts, _) = s.drain_turn().await;
    assert!(
        says(&vevts).contains("perm:allowed:opt-allow"),
        "got: {}",
        says(&vevts)
    );

    // The rule lands in <sessions_dir.parent()>/permissions.json, generalized.
    let perms = std::fs::read_to_string(s.base.join("permissions.json")).unwrap();
    assert!(
        perms.contains("tester:Bash(echo *)"),
        "expected the generalized rule, got: {perms}"
    );

    // Next request with the same shape hits the persisted fast path.
    s.send(RunnerInput::Turn("t2".to_string()));
    let (vevts, _) = s.drain_turn().await;
    assert!(
        !vevts.iter().any(|v| v["type"] == "permission_request"),
        "persisted allow rule must skip the dialog"
    );
    assert!(
        says(&vevts).contains("perm:allowed:opt-allow"),
        "got: {}",
        says(&vevts)
    );

    s.send(RunnerInput::Stop);
    s.drain_to_close().await;
    let _ = std::fs::remove_dir_all(&s.base);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn mcp_rejection_falls_back_to_no_servers() {
    let mcp = vec![McpServer::Stdio(McpServerStdio::new(
        "dummy",
        PathBuf::from("/bin/echo"),
    ))];
    let mut s = start_session("mcp", "mcp_reject", mcp);
    s.next_vevt("ready").await;

    s.send(RunnerInput::Turn("after fallback".to_string()));
    let (vevts, logs) = s.drain_turn().await;
    assert!(
        logs.iter()
            .any(|l| l.contains("agent rejected MCP servers")),
        "expected the fallback log; logs: {logs:?}"
    );
    assert_eq!(vevts.last().unwrap()["status"], "idle");
    assert!(says(&vevts).contains("after fallback"));

    s.send(RunnerInput::Stop);
    s.drain_to_close().await;
    let _ = std::fs::remove_dir_all(&s.base);
}
