#!/usr/bin/env python3
"""One live ACP session, driven over stdin/stdout — the Tauri sidecar.

The Tauri shell spawns ONE of these per session:

    .venv/bin/python -m split.runner --harness claude --expert consultant

It speaks ACP to a single agent (via the official SDK) and translates the
agent's session/update stream into `VEVT <json>` lines on stdout, exactly the
line protocol the Rust side already parses (see desktop/src-tauri/src/lib.rs).
Turns, auth, and permission decisions arrive as JSON lines on stdin:

    {"text": "..."}                                # a prompt (multi-turn)
    {"auth": {"methodId": "..."}}                  # answer an auth_required
    {"permission": {"id": "...",                   # answer a permission_request
                    "optionId": "..." | null,      #   (null = deny)
                    "scope": "once|session|always-allow|always-deny"}}
    {"type": "stop"}                               # graceful stop (EOF stops too)

This is the process-per-session refactor of server.py's `Sess`: same ACP logic,
but `_emit` prints VEVT instead of sending over a shared WebSocket, and logs go
to stderr so stdout stays a clean event stream.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from typing import Any

import acp

from . import core, permissions as P
from .acp_client import ConsoleClient, client_capabilities
from .auth import LOGIN_CMD, is_auth_error

# Where persisted allow/deny rules live (one file for the whole user).
PERMS_PATH = os.path.join(core.VAR_DIR, "permissions.json")
# prompt = UI asks, auto-allow = open bench, auto-deny = strict CI. Set by Rust spawn.
PERMISSION_MODE = (os.environ.get("SPLIT_PERMISSION_MODE") or "auto-allow").strip()


class Runner:
    """One live ACP session bound to this process's stdout."""

    def __init__(self, sid: str, harness: str, expert: str) -> None:
        self.sid, self.harness, self.expert = sid, harness, expert
        self.cfg = core.load_harnesses()[harness]
        # The workspace belongs to the EXPERT, not the session. Every session
        # of <expert> (across every harness) lands in the same dir, so the
        # agent's scratch + notes persist. Projection is idempotent and
        # mtime-gated in core.ensure_expert_workspace.
        self.ws_dir = core.expert_workspace_dir(expert)
        self._cm = None
        self.conn = None
        self.acp_sid = None
        self.auth_methods: list = []
        self.pending: str | None = None  # prompt awaiting auth
        self._out_lock = asyncio.Lock()
        # --- permissions: session-scoped allowlist + pending UI prompts --------
        self._session_allow: set[str] = set()
        # request_id -> (asyncio.Future for option_id|None, tool_id used to scope persistence)
        self._pending_perms: dict[str, tuple[asyncio.Future, str]] = {}
        # --- persona injection (universal — works across every ACP harness) ----
        # ACP has no standardised "system prompt" parameter; per-harness cwd
        # conventions (AGENTS.md / .vibe/agents/*.toml / SOUL.md) all differ.
        # We side-step that by prepending the persona to the FIRST user prompt
        # of the session. The persona is then in the agent's conversation
        # history and persists across turns for the rest of the session. The
        # cwd projection (AGENTS.md + shims) stays as defence-in-depth.
        self._persona_injected = False

    # --- permission engine integration ---------------------------------------

    def _get_rules(self) -> dict:
        """Re-read every call so persistence (add_rule from the stdin handler)
        is picked up without restart."""
        return P.load(PERMS_PATH)

    async def _on_prompt(self, tool_id: str, options: list, tool_call: dict) -> str | None:
        """Called by ConsoleClient when the engine says "ask". Emits a VEVT to
        the UI and awaits the user's choice."""
        req_id = uuid.uuid4().hex[:12]
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending_perms[req_id] = (fut, tool_id)
        self._emit(
            type="permission_request",
            id=req_id,
            toolId=tool_id,
            expert=self.expert,
            toolCall=tool_call,
            options=[
                {"id": opt.option_id,
                 "name": getattr(opt, "name", ""),
                 "kind": str(getattr(opt, "kind", ""))}
                for opt in options
            ],
        )
        try:
            return await fut  # the stdin handler resolves this
        finally:
            self._pending_perms.pop(req_id, None)

    async def handle_permission(self, msg: dict) -> None:
        """Resolve a pending prompt with the user's decision. `scope` controls
        persistence: once = nothing extra; session = in-memory allow; always-allow
        / always-deny = write a rule scoped to the current expert."""
        req_id = msg.get("id")
        option_id = msg.get("optionId")  # None => deny
        scope = msg.get("scope", "once")
        entry = self._pending_perms.get(req_id) if req_id else None
        if not entry:
            self.on_log(f"[permission] unknown request id {req_id!r}")
            return
        fut, tool_id = entry
        if scope == "session" and option_id is not None:
            self._session_allow.add(tool_id)
        elif scope == "always-allow" and option_id is not None:
            # Persist the *family* (e.g. `Bash(npm *)`), not the exact command —
            # otherwise the next variant re-prompts. See P.generalize().
            P.add_rule(PERMS_PATH, "allow", f"{self.expert}:{P.generalize(tool_id)}")
        elif scope == "always-deny":
            P.add_rule(PERMS_PATH, "deny", f"{self.expert}:{P.generalize(tool_id)}")
        if not fut.done():
            fut.set_result(option_id)

    # --- emit: one VEVT line per structured event ----------------------------

    def _emit(self, **msg: Any) -> None:
        asyncio.create_task(self._send(msg))

    async def _send(self, msg: dict) -> None:
        async with self._out_lock:  # serialize writes so lines never interleave
            sys.stdout.write("VEVT " + json.dumps(msg) + "\n")
            sys.stdout.flush()

    @staticmethod
    def on_log(line: str) -> None:
        # logs go to stderr; Rust classifies stderr lines as `.log`
        print(line, file=sys.stderr, flush=True)

    # ACP Client.session_update -> VEVT (mirrors server.py:Sess.on_update)
    def on_update(self, update) -> None:
        n = type(update).__name__
        if n == "AgentMessageChunk" and getattr(update.content, "type", None) == "text":
            self._emit(type="say", text=update.content.text)
        elif n == "AgentThoughtChunk" and getattr(update.content, "type", None) == "text":
            self._emit(type="thought", text=update.content.text)
        elif n in ("ToolCallStart", "ToolCallProgress"):
            self._emit(type="step", title=update.title or update.kind, status=str(update.status))
        elif n == "AgentPlanUpdate":
            self._emit(type="plan", entries=[
                {"content": e.content, "status": str(e.status)} for e in (update.entries or [])
            ])
        elif n == "UsageUpdate":
            cost = getattr(update.cost, "amount", None) if update.cost else None
            self._emit(type="usage", used=update.used, size=update.size, cost=cost)

    # --- lifecycle -----------------------------------------------------------

    async def open(self) -> None:
        core.ensure_expert_workspace(self.expert)
        command = core.resolve_command(self.cfg["command"])
        client = ConsoleClient(
            on_update=self.on_update, on_log=self.on_log,
            permission_mode=PERMISSION_MODE,
            rules_provider=self._get_rules,
            expert=self.expert,
            session_allow=self._session_allow,
            on_prompt=self._on_prompt,
        )
        # asyncio.StreamReader defaults to 64 KB per line — a single big
        # session/update (e.g. a 10-slide HTML deck the agent emits in one
        # frame) blows past that and crashes the receive loop with
        # "Separator is found, but chunk is longer than limit". Bump the
        # JSON-RPC line buffer to 16 MB; the agent's stdout is the ceiling.
        self._cm = acp.spawn_agent_process(
            client, command, *self.cfg["args"], cwd=self.ws_dir, env=dict(os.environ),
            transport_kwargs={"limit": 16 * 1024 * 1024},
        )
        self.conn, _ = await self._cm.__aenter__()
        init = await self.conn.initialize(
            protocol_version=acp.PROTOCOL_VERSION,
            client_capabilities=client_capabilities(),
            client_info=acp.schema.Implementation(name="split-acp", version="0.1.0"),
        )
        self.auth_methods = init.auth_methods or []
        mcp = core.load_mcp()
        try:
            sess = await self.conn.new_session(cwd=self.ws_dir, mcp_servers=mcp)
        except Exception as exc:
            if mcp:  # some agents (e.g. Vibe) reject MCP over ACP — degrade
                self.on_log(f"agent rejected MCP servers ({exc}); retrying without")
                sess = await self.conn.new_session(cwd=self.ws_dir, mcp_servers=[])
            else:
                raise
        self.acp_sid = sess.session_id

    async def run(self, text: str) -> None:
        self._emit(type="status", status="running")
        try:
            if self.conn is None:
                await self.open()
            # First user turn of this session — prepend the persona so the
            # agent has its character + discipline in the conversation history,
            # even if the harness ignores cwd files (Vibe, OpenClaw).
            # Subsequent turns send the user's text as-is (the persona stays
            # in the agent's context window from this first exchange).
            wire = text
            inject_now = not self._persona_injected
            if inject_now:
                persona = core.persona_text(self.expert)
                wire = (
                    f"{persona}\n\n"
                    "---\n\n"
                    "**The boss's first request follows below. Reply as the persona "
                    "described above, in their tone, using only the skills listed "
                    "for them. Do not introduce yourself unless asked — just do the "
                    "work.**\n\n"
                    f"{text}"
                )
            resp = await self.conn.prompt(prompt=[acp.text_block(wire)], session_id=self.acp_sid)
            # Mark the persona as injected only AFTER prompt() succeeded — if it
            # raised (auth error, transport hiccup), we want the replay via
            # self.pending to inject again.
            if inject_now:
                self._persona_injected = True
            # status:idle == turn finished (the React reducer commits the answer here)
            self._emit(type="status", status="idle", stop=str(getattr(resp, "stop_reason", "")))
        except Exception as exc:
            if is_auth_error(exc) or self.auth_methods:
                self.pending = text
                self._emit(type="auth_required", harness=self.harness,
                           methods=self._auth_methods_json(),
                           hasLogin=self.harness in LOGIN_CMD,
                           note=self.cfg.get("auth", ""))
            else:
                self._emit(type="status", status="error", error=str(exc)[:400])

    def _auth_methods_json(self) -> list:
        out = []
        for m in self.auth_methods:
            out.append({"id": getattr(m, "id", None) or getattr(m, "method_id", ""),
                        "name": getattr(m, "name", ""), "description": getattr(m, "description", "")})
        return out

    async def authenticate(self, method_id: str) -> None:
        try:
            if self.conn is None:
                await self.open()
            await self.conn.authenticate(method_id=method_id)
            self._emit(type="auth_result", harness=self.harness, ok=True)
            if self.pending:
                text, self.pending = self.pending, None
                await self.run(text)
        except Exception as exc:
            self._emit(type="auth_result", harness=self.harness, ok=False, error=str(exc)[:300])

    async def close(self) -> None:
        if self._cm is not None:
            try:
                await self._cm.__aexit__(None, None, None)
            except Exception:
                pass
            self._cm = None


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--harness", required=True)
    ap.add_argument("--expert", default="consultant")
    a = ap.parse_args()

    sid = os.environ.get("SPLIT_SID") or a.harness
    os.makedirs(core.WORKSPACE, exist_ok=True)
    runner = Runner(sid, a.harness, a.expert)
    runner._emit(type="ready", harness=a.harness, expert=a.expert)

    loop = asyncio.get_event_loop()
    # Long-running ops (turns + auth) must NOT block the stdin reader, otherwise
    # in-turn permission replies from the UI can never reach handle_permission
    # and the ACP request_permission future deadlocks. We detach them as tasks;
    # permission itself stays awaited because it's just resolving a future.
    inflight: set[asyncio.Task] = set()

    def _spawn(coro) -> None:
        t = asyncio.create_task(coro)
        inflight.add(t)
        t.add_done_callback(inflight.discard)

    try:
        while True:
            line = await loop.run_in_executor(None, sys.stdin.readline)
            if not line:  # EOF — Rust dropped stdin
                break
            line = line.strip()
            if not line:
                continue
            try:
                m = json.loads(line)
            except Exception:
                continue
            if "text" in m:
                _spawn(runner.run(m["text"]))
            elif "auth" in m:
                _spawn(runner.authenticate(m["auth"]["methodId"]))
            elif "permission" in m:
                await runner.handle_permission(m["permission"])
            elif m.get("type") == "stop":
                break
    finally:
        # Give in-flight turns a beat to wrap up cleanly, then tear down.
        if inflight:
            await asyncio.gather(*inflight, return_exceptions=True)
        await runner.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
