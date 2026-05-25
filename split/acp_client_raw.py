"""A minimal Agent Client Protocol (ACP) client.

This is the "meta-harness base" reduced to its essence: spawn an ACP agent as a
subprocess, talk JSON-RPC 2.0 over stdio (newline-delimited), and stream its
`session/update` notifications back out. Any agent in the ACP registry — Claude,
Codex, Mistral Vibe, OpenCode, Gemini… — speaks this exact protocol, so one
client drives them all. The brain and the harness live in the agent; this file
is only the wire.

What it implements (the client side of ACP):
  - initialize           -> negotiate version + advertise our capabilities
  - session/new          -> open a session rooted at a cwd (the workspace)
  - session/prompt       -> send a user turn, await its stopReason
  - session/update       <- stream agent text + tool calls (the "steps")
And the requests an agent can make back to the client:
  - session/request_permission -> auto-approve (this is a test harness)
  - fs/read_text_file / fs/write_text_file -> serve from the real filesystem

Deliberately omitted (advertised as unsupported): terminal/*. Agents that run
their own tools in-process (Claude SDK, Codex) don't need it; if one does, that
absence is itself a finding.
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Callable

# ACP wire version we speak. The agent echoes its own in the initialize result;
# we proceed regardless and just record what it reports.
PROTOCOL_VERSION = 1

# Callback the front passes in to render a session/update however it likes
# (print to terminal here; in Split this would become bus.step / bus.frame).
UpdateHandler = Callable[[dict[str, Any]], None]


class ACPError(RuntimeError):
    pass


class ACPClient:
    def __init__(
        self,
        command: str,
        args: list[str],
        cwd: str,
        on_update: UpdateHandler,
        env: dict[str, str] | None = None,
        on_log: Callable[[str], None] | None = None,
    ) -> None:
        self._command = command
        self._args = args
        self._cwd = cwd
        self._on_update = on_update
        self._on_log = on_log or (lambda _s: None)
        self._env = {**os.environ, **(env or {})}

        self._proc: asyncio.subprocess.Process | None = None
        self._next_id = 0
        self._pending: dict[int, asyncio.Future] = {}
        self._reader_task: asyncio.Task | None = None
        self._stderr_task: asyncio.Task | None = None

        self.agent_capabilities: dict[str, Any] = {}
        self.session_id: str | None = None

    # --- lifecycle ------------------------------------------------------------

    async def start(self) -> None:
        self._proc = await asyncio.create_subprocess_exec(
            self._command,
            *self._args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._cwd,
            env=self._env,
        )
        self._reader_task = asyncio.create_task(self._read_loop())
        self._stderr_task = asyncio.create_task(self._drain_stderr())

    async def close(self) -> None:
        if self._proc and self._proc.returncode is None:
            try:
                self._proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                self._proc.kill()

    # --- JSON-RPC plumbing ----------------------------------------------------

    def _send(self, msg: dict[str, Any]) -> None:
        assert self._proc and self._proc.stdin
        line = (json.dumps(msg) + "\n").encode()
        self._proc.stdin.write(line)

    async def request(self, method: str, params: dict[str, Any]) -> Any:
        self._next_id += 1
        rid = self._next_id
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[rid] = fut
        self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        result = await fut
        return result

    def _respond(self, rid: Any, result: Any = None, error: dict | None = None) -> None:
        msg: dict[str, Any] = {"jsonrpc": "2.0", "id": rid}
        if error is not None:
            msg["error"] = error
        else:
            msg["result"] = result
        self._send(msg)

    async def _read_loop(self) -> None:
        assert self._proc and self._proc.stdout
        while True:
            line = await self._proc.stdout.readline()
            if not line:
                break  # agent closed stdout / exited
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                self._on_log(f"[non-json stdout] {line.decode(errors='replace')}")
                continue
            await self._dispatch(msg)

        # stdout closed: fail any in-flight requests so callers don't hang.
        for fut in self._pending.values():
            if not fut.done():
                fut.set_exception(ACPError("agent exited"))
        self._pending.clear()

    async def _drain_stderr(self) -> None:
        assert self._proc and self._proc.stderr
        while True:
            line = await self._proc.stderr.readline()
            if not line:
                break
            self._on_log("[stderr] " + line.decode(errors="replace").rstrip())

    async def _dispatch(self, msg: dict[str, Any]) -> None:
        # Response to one of our requests?
        if "id" in msg and ("result" in msg or "error" in msg) and "method" not in msg:
            fut = self._pending.pop(msg["id"], None)
            if fut and not fut.done():
                if "error" in msg:
                    fut.set_exception(ACPError(json.dumps(msg["error"])))
                else:
                    fut.set_result(msg.get("result"))
            return

        method = msg.get("method")
        if method is None:
            return

        # Notification (no id) — the important one is session/update.
        if "id" not in msg:
            if method == "session/update":
                self._on_update(msg.get("params", {}))
            else:
                self._on_log(f"[notify] {method}")
            return

        # Request from the agent -> we must answer.
        await self._handle_request(msg["id"], method, msg.get("params", {}))

    async def _handle_request(self, rid: Any, method: str, params: dict) -> None:
        if method == "session/request_permission":
            self._respond(rid, self._auto_permission(params))
        elif method == "fs/read_text_file":
            self._respond(rid, self._read_file(params))
        elif method == "fs/write_text_file":
            self._write_file(params)
            self._respond(rid, None)
        else:
            # Anything we didn't advertise (terminal/*, etc.) -> method not found.
            self._respond(rid, error={"code": -32601, "message": f"unsupported: {method}"})

    # --- client-side capability handlers -------------------------------------

    def _auto_permission(self, params: dict) -> dict:
        """Auto-approve tool calls (this is a test bench). Prefer an 'allow'
        option, falling back to the first offered."""
        options = params.get("options", []) or []
        chosen = None
        for opt in options:
            kind = (opt.get("kind") or "").lower()
            if "allow" in kind:
                chosen = opt.get("optionId")
                if "always" in kind:
                    break
        if chosen is None and options:
            chosen = options[0].get("optionId")
        tc = params.get("toolCall", {}) or {}
        self._on_log(f"[permission] auto-allow {tc.get('title') or tc.get('kind') or 'tool'}")
        return {"outcome": {"outcome": "selected", "optionId": chosen}}

    def _read_file(self, params: dict) -> dict:
        path = params["path"]
        with open(path, "r", encoding="utf-8") as fh:
            content = fh.read()
        line = params.get("line")
        limit = params.get("limit")
        if line or limit:
            lines = content.splitlines(keepends=True)
            start = (line - 1) if line else 0
            end = (start + limit) if limit else len(lines)
            content = "".join(lines[start:end])
        return {"content": content}

    def _write_file(self, params: dict) -> None:
        path = params["path"]
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(params.get("content", ""))

    # --- high-level ACP calls -------------------------------------------------

    async def initialize(self) -> dict:
        result = await self.request(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "clientCapabilities": {
                    "fs": {"readTextFile": True, "writeTextFile": True},
                    "terminal": False,
                },
            },
        )
        self.agent_capabilities = (result or {}).get("agentCapabilities", {})
        return result or {}

    async def new_session(self, cwd: str, mcp_servers: list[dict] | None = None) -> str:
        result = await self.request(
            "session/new",
            {"cwd": cwd, "mcpServers": mcp_servers or []},
        )
        self.session_id = (result or {}).get("sessionId")
        if not self.session_id:
            raise ACPError(f"no sessionId in session/new result: {result}")
        return self.session_id

    async def prompt(self, text: str) -> dict:
        """Send one user turn; resolves with {stopReason} when the turn ends.
        session/update notifications stream in via on_update while we await."""
        result = await self.request(
            "session/prompt",
            {
                "sessionId": self.session_id,
                "prompt": [{"type": "text", "text": text}],
            },
        )
        return result or {}
