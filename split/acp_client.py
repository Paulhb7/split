"""Client-side of ACP, built on the official SDK (`agent-client-protocol`).

This replaces the hand-rolled wire in `acp_client_raw.py` (kept as a zero-dep
fallback). The SDK gives us typed Pydantic models with spec-parity, the stdio
transport, and the spawn helper — so this file only has to *implement the
`Client` protocol*: the callbacks an agent invokes on us.

In Split terms, this class is the seam where ACP turns into the bar's events:
`session_update` -> bus.say / bus.step / bus.frame, permissions -> the approval
UX (engine in split.permissions + UI prompt via on_prompt), fs -> reading
dropped files / writing deliverables.
"""
from __future__ import annotations

import os
from typing import Any, Awaitable, Callable, Literal

import acp
from acp import schema as s

from . import permissions as P

UpdateHandler = Callable[[Any], None]
LogHandler = Callable[[str], None]
# on_prompt(tool_id, options, tool_call_dict) -> option_id to allow, or None to deny.
# The runner registers this; ConsoleClient only calls it when the engine says "ask".
PromptHandler = Callable[[str, list, dict], Awaitable[str | None]]

PermissionMode = Literal["prompt", "auto-allow", "auto-deny"]


def _extract_tool_id(tool_call: Any) -> str:
    """Best-effort `ToolName(spec)` id used to match against permission rules.

    ACP tool_calls don't have one universal shape; we cover the common cases:
    MCP tools keep their `mcp__server__tool` name; `execute`-kind calls become
    `Bash(<command>)`; read/write/edit become `Tool(<path>)`; everything else
    falls back to the title or kind."""
    title = getattr(tool_call, "title", None)
    kind = getattr(tool_call, "kind", None)
    raw = getattr(tool_call, "raw_input", None) or {}
    if isinstance(raw, dict):
        cmd = raw.get("command") or raw.get("cmd")
        if cmd:
            return f"Bash({cmd})"
        path = raw.get("path") or raw.get("file_path")
        if path and kind in {"read", "edit", "write"}:
            return f"{str(kind).capitalize()}({path})"
    name = title or kind or "tool"
    if isinstance(name, str) and name.startswith("mcp__"):
        return name
    return str(name)


def _pick_option(options: list, want: Literal["allow", "deny"]) -> str | None:
    """Pick the agent-offered option whose `kind` matches what we want.
    Preference for `*_always` when available; fall back to the first match."""
    candidates_always: list[str] = []
    candidates: list[str] = []
    for opt in options:
        kind = str(getattr(opt, "kind", "")).lower()
        match = ("allow" in kind) if want == "allow" else (
            "deny" in kind or "reject" in kind
        )
        if match:
            (candidates_always if "always" in kind else candidates).append(opt.option_id)
    return (candidates_always or candidates or [None])[0]


class ConsoleClient:
    """A `Client` implementation that streams updates and routes tool-call
    permissions through `split.permissions` (+ a UI prompt callback)."""

    def __init__(
        self,
        on_update: UpdateHandler,
        on_log: LogHandler,
        *,
        permission_mode: PermissionMode = "auto-allow",
        rules_provider: Callable[[], dict] | None = None,
        expert: str = "consultant",
        session_allow: set[str] | None = None,
        on_prompt: PromptHandler | None = None,
    ) -> None:
        self._on_update = on_update
        self._on_log = on_log
        self._permission_mode = permission_mode
        self._rules_provider = rules_provider or (lambda: {})
        self._expert = expert
        # Mutable set shared with the runner: tools the user said "allow for
        # this session" for — checked before consulting the persisted rules.
        self._session_allow = session_allow if session_allow is not None else set()
        self._on_prompt = on_prompt

    # --- the update stream (the whole point) ---------------------------------

    async def session_update(self, session_id: str, update: Any, **_: Any) -> None:
        self._on_update(update)

    # --- permission --------------------------------------------------------

    async def request_permission(
        self, options: list[Any], session_id: str, tool_call: Any, **_: Any
    ) -> s.RequestPermissionResponse:
        tool_id = _extract_tool_id(tool_call)

        # 1) session-scoped "allow for this session" — fastest path, in-memory.
        if tool_id in self._session_allow:
            opt = _pick_option(options, "allow")
            if opt:
                self._on_log(f"[permission] session-allow {tool_id}")
                return s.RequestPermissionResponse(
                    outcome=s.AllowedOutcome(outcome="selected", option_id=opt)
                )

        # 2) persisted rules — deny > ask > allow, with universal guard-rails.
        decision = P.decide(self._rules_provider(), self._expert, tool_id)
        if decision == "allow":
            opt = _pick_option(options, "allow")
            if opt:
                self._on_log(f"[permission] allow {tool_id} (rule)")
                return s.RequestPermissionResponse(
                    outcome=s.AllowedOutcome(outcome="selected", option_id=opt)
                )
        if decision == "deny":
            self._on_log(f"[permission] deny {tool_id} (rule / guard-rail)")
            return s.RequestPermissionResponse(outcome=s.DeniedOutcome(outcome="cancelled"))

        # 3) "ask" — what we do depends on the mode.
        if self._permission_mode == "auto-deny":
            self._on_log(f"[permission] auto-deny {tool_id}")
            return s.RequestPermissionResponse(outcome=s.DeniedOutcome(outcome="cancelled"))
        if self._permission_mode == "auto-allow" or self._on_prompt is None:
            opt = _pick_option(options, "allow")
            if opt is None:
                return s.RequestPermissionResponse(outcome=s.DeniedOutcome(outcome="cancelled"))
            self._on_log(f"[permission] auto-allow {tool_id}")
            return s.RequestPermissionResponse(
                outcome=s.AllowedOutcome(outcome="selected", option_id=opt)
            )

        # 4) prompt mode — ask the UI; persistence + session-add happens runner-side.
        try:
            tool_call_dict = (
                tool_call.model_dump() if hasattr(tool_call, "model_dump")
                else {"title": getattr(tool_call, "title", None),
                      "kind": getattr(tool_call, "kind", None)}
            )
        except Exception:
            tool_call_dict = {"title": getattr(tool_call, "title", None)}
        option_id = await self._on_prompt(tool_id, options, tool_call_dict)
        if option_id is None:
            return s.RequestPermissionResponse(outcome=s.DeniedOutcome(outcome="cancelled"))
        return s.RequestPermissionResponse(
            outcome=s.AllowedOutcome(outcome="selected", option_id=option_id)
        )

    # --- filesystem (we advertise fs read/write) -----------------------------

    async def read_text_file(
        self, path: str, session_id: str, limit: int | None = None,
        line: int | None = None, **_: Any
    ) -> s.ReadTextFileResponse:
        with open(path, encoding="utf-8") as fh:
            content = fh.read()
        if line or limit:
            lines = content.splitlines(keepends=True)
            start = (line - 1) if line else 0
            end = (start + limit) if limit else len(lines)
            content = "".join(lines[start:end])
        return s.ReadTextFileResponse(content=content)

    async def write_text_file(
        self, content: str, path: str, session_id: str, **_: Any
    ) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(content)
        return None

    # --- terminal: unsupported (we advertise terminal=False) -----------------

    async def create_terminal(self, *a: Any, **k: Any) -> Any:
        raise acp.RequestError(-32601, "terminal/create not supported by this client")

    async def terminal_output(self, *a: Any, **k: Any) -> Any:
        raise acp.RequestError(-32601, "terminal/output not supported by this client")

    async def wait_for_terminal_exit(self, *a: Any, **k: Any) -> Any:
        raise acp.RequestError(-32601, "terminal/wait not supported by this client")

    async def kill_terminal(self, *a: Any, **k: Any) -> Any:
        raise acp.RequestError(-32601, "terminal/kill not supported by this client")

    async def release_terminal(self, *a: Any, **k: Any) -> Any:
        raise acp.RequestError(-32601, "terminal/release not supported by this client")

    # --- misc protocol hooks --------------------------------------------------

    def on_connect(self, *a: Any, **k: Any) -> None:
        # Called synchronously by the SDK at connection time — not a coroutine.
        return None

    async def ext_method(self, *a: Any, **k: Any) -> Any:
        raise acp.RequestError(-32601, "ext_method not supported")

    async def ext_notification(self, *a: Any, **k: Any) -> None:
        return None


def client_capabilities() -> s.ClientCapabilities:
    """Advertise fs read/write, no terminal — validated from the wire shape."""
    return s.ClientCapabilities.model_validate(
        {"fs": {"readTextFile": True, "writeTextFile": True}, "terminal": False}
    )
