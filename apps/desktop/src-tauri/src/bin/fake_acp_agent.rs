//! Scriptable fake ACP agent for the runner integration tests.
//!
//! Speaks real ACP over stdio via the same `agent-client-protocol` crate the
//! runner uses, so the wire format is correct by construction. The behaviour
//! is selected with the `FAKE_ACP_SCENARIO` env var (passed by the tests
//! through the runner's agent-env plumbing, which doubles as a test of that
//! path):
//!
//!   * `happy` (default) — initialize, open a session, echo every prompt
//!     back as `echo:<received text>` with a thought + a tool_call first.
//!   * `auth` — advertise one auth method and fail `session/new` with a 401
//!     until `authenticate` is called.
//!   * `perm` — on every prompt, send `session/request_permission`
//!     (a `Bash(echo hi)`-shaped tool call) and echo the outcome as
//!     `perm:allowed:<optionId>` / `perm:denied`.
//!   * `mcp_reject` — reject `session/new` while MCP servers are listed,
//!     accept once the client retries without (the Vibe quirk).
//!   * `slow` — park the turn after streaming a thought + tool_call until a
//!     `session/cancel` arrives, then respond `Cancelled`. Lets a test prove
//!     the runner interrupts an in-flight turn on Stop.
//!
//! Lifecycle messages (`session/cancel`, `session/close`) are acknowledged
//! and logged to stderr as `fake-agent: …` lines, which the runner surfaces
//! as `log` events — the Stop test asserts on those.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use agent_client_protocol::schema::{
    AgentCapabilities, AuthMethod, AuthMethodAgent, AuthenticateRequest, AuthenticateResponse,
    CancelNotification, CloseSessionRequest, CloseSessionResponse, ContentBlock, ContentChunk,
    InitializeRequest, InitializeResponse, NewSessionRequest, NewSessionResponse, PermissionOption,
    PermissionOptionKind, PromptRequest, PromptResponse, RequestPermissionOutcome,
    RequestPermissionRequest, SessionNotification, SessionUpdate, StopReason, TextContent,
    ToolCall, ToolCallStatus, ToolCallUpdate, ToolCallUpdateFields,
};
use agent_client_protocol::{Agent, Client, ConnectionTo, Result, Stdio};

const SESSION_ID: &str = "fake-sess-1";

fn scenario() -> String {
    std::env::var("FAKE_ACP_SCENARIO").unwrap_or_else(|_| "happy".to_string())
}

fn say(cx: &ConnectionTo<Client>, text: &str) {
    let _ = cx.send_notification(SessionNotification::new(
        SESSION_ID,
        SessionUpdate::AgentMessageChunk(ContentChunk::new(ContentBlock::Text(TextContent::new(
            text,
        )))),
    ));
}

#[tokio::main]
async fn main() -> Result<()> {
    let authed = Arc::new(AtomicBool::new(false));
    let authed_for_new = authed.clone();
    let authed_for_auth = authed.clone();
    // `slow` scenario: the prompt handler parks until a `session/cancel`
    // arrives, so a test can interrupt an in-flight turn. The cancel handler
    // flips this flag.
    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_for_prompt = cancelled.clone();
    let cancelled_for_cancel = cancelled.clone();

    Agent
        .builder()
        .name("fake-acp-agent")
        .on_receive_request(
            async move |req: InitializeRequest, responder, _cx| {
                let mut resp = InitializeResponse::new(req.protocol_version)
                    .agent_capabilities(AgentCapabilities::new());
                if scenario() == "auth" {
                    resp = resp.auth_methods(vec![AuthMethod::Agent(AuthMethodAgent::new(
                        "test-method",
                        "Test Method",
                    ))]);
                }
                responder.respond(resp)
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |req: NewSessionRequest, responder, _cx| match scenario().as_str() {
                "auth" if !authed_for_new.load(Ordering::SeqCst) => {
                    responder.respond_with_internal_error("401 unauthorized: please sign in first")
                }
                "mcp_reject" if !req.mcp_servers.is_empty() => {
                    responder.respond_with_internal_error("mcp servers are not supported")
                }
                _ => responder.respond(NewSessionResponse::new(SESSION_ID)),
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |_req: AuthenticateRequest, responder, _cx| {
                authed_for_auth.store(true, Ordering::SeqCst);
                responder.respond(AuthenticateResponse::new())
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_request(
            async move |req: PromptRequest, responder, cx: ConnectionTo<Client>| {
                let text = req
                    .prompt
                    .iter()
                    .filter_map(|b| match b {
                        ContentBlock::Text(t) => Some(t.text.as_str()),
                        _ => None,
                    })
                    .collect::<Vec<_>>()
                    .join("");
                // Permission round-trips must run OUTSIDE the dispatch loop
                // (awaiting the client's reply inside the handler would
                // deadlock it), so the whole turn body is spawned and the
                // responder answers from the spawned task.
                let cancelled = cancelled_for_prompt.clone();
                cx.clone().spawn(async move {
                    let _ = cx.send_notification(SessionNotification::new(
                        SESSION_ID,
                        SessionUpdate::AgentThoughtChunk(ContentChunk::new(ContentBlock::Text(
                            TextContent::new("thinking..."),
                        ))),
                    ));
                    let _ = cx.send_notification(SessionNotification::new(
                        SESSION_ID,
                        SessionUpdate::ToolCall(
                            ToolCall::new("tc-1", "fake-tool").status(ToolCallStatus::InProgress),
                        ),
                    ));
                    if scenario() == "slow" {
                        // Park mid-turn until the runner asks us to cancel (the
                        // Stop path), then return Cancelled. A ~5s ceiling keeps
                        // a misfiring test from hanging forever.
                        for _ in 0..100 {
                            if cancelled.load(Ordering::SeqCst) {
                                say(&cx, "partial work before cancel");
                                responder.respond(PromptResponse::new(StopReason::Cancelled))?;
                                return Ok(());
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                        }
                        responder.respond(PromptResponse::new(StopReason::EndTurn))?;
                        return Ok(());
                    }
                    if scenario() == "perm" {
                        let perm = cx
                            .send_request(RequestPermissionRequest::new(
                                SESSION_ID,
                                ToolCallUpdate::new(
                                    "tc-perm",
                                    ToolCallUpdateFields::new()
                                        .title("run echo hi")
                                        .raw_input(serde_json::json!({ "command": "echo hi" })),
                                ),
                                vec![
                                    PermissionOption::new(
                                        "opt-allow",
                                        "Allow once",
                                        PermissionOptionKind::AllowOnce,
                                    ),
                                    PermissionOption::new(
                                        "opt-reject",
                                        "Reject once",
                                        PermissionOptionKind::RejectOnce,
                                    ),
                                ],
                            ))
                            .block_task()
                            .await;
                        match perm {
                            Ok(resp) => match resp.outcome {
                                RequestPermissionOutcome::Selected(sel) => {
                                    say(&cx, &format!("perm:allowed:{}", &*sel.option_id.0));
                                }
                                _ => say(&cx, "perm:denied"),
                            },
                            Err(e) => say(&cx, &format!("perm:error:{e}")),
                        }
                    }
                    say(&cx, &format!("echo:{text}"));
                    responder.respond(PromptResponse::new(StopReason::EndTurn))?;
                    Ok(())
                })?;
                Ok(())
            },
            agent_client_protocol::on_receive_request!(),
        )
        .on_receive_notification(
            async move |_n: CancelNotification, _cx| {
                eprintln!("fake-agent: cancel received");
                cancelled_for_cancel.store(true, Ordering::SeqCst);
                Ok(())
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            async move |_req: CloseSessionRequest, responder, _cx| {
                eprintln!("fake-agent: close received");
                responder.respond(CloseSessionResponse::new())
            },
            agent_client_protocol::on_receive_request!(),
        )
        // No `on_receive_dispatch` catch-all here: it would intercept the
        // RESPONSES to this agent's own outbound requests (request_permission)
        // before the internal response router sees them. The Agent role's
        // default dispatch handles unknown messages correctly.
        .connect_to(Stdio::new())
        .await
}
