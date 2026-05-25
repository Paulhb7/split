"""Client-side of ACP, built on the official SDK (`agent-client-protocol`).

This replaces the hand-rolled wire in `acp_client_raw.py` (kept as a zero-dep
fallback). The SDK gives us typed Pydantic models with spec-parity, the stdio
transport, and the spawn helper — so this file only has to *implement the
`Client` protocol*: the callbacks an agent invokes on us.

In Split terms, this class is the seam where ACP turns into the bar's events:
`session_update` -> bus.say / bus.step / bus.frame, permissions -> the approval
UX, fs -> reading dropped files / writing deliverables.
"""
from __future__ import annotations

import os
from typing import Any, Callable

import acp
from acp import schema as s

UpdateHandler = Callable[[Any], None]
LogHandler = Callable[[str], None]


class ConsoleClient:
    """A `Client` implementation that streams updates to a callback and
    auto-approves tool calls (this is a test bench)."""

    def __init__(self, on_update: UpdateHandler, on_log: LogHandler) -> None:
        self._on_update = on_update
        self._on_log = on_log

    # --- the update stream (the whole point) ---------------------------------

    async def session_update(self, session_id: str, update: Any, **_: Any) -> None:
        self._on_update(update)

    # --- permission: auto-approve, preferring an "allow" option --------------

    async def request_permission(
        self, options: list[Any], session_id: str, tool_call: Any, **_: Any
    ) -> s.RequestPermissionResponse:
        chosen = None
        for opt in options:
            kind = str(getattr(opt, "kind", "")).lower()
            if "allow" in kind:
                chosen = opt.option_id
                if "always" in kind:
                    break
        if chosen is None and options:
            chosen = options[0].option_id
        title = getattr(tool_call, "title", None) or getattr(tool_call, "kind", "tool")
        if chosen is None:
            self._on_log(f"[permission] no option offered for {title} — cancelling")
            return s.RequestPermissionResponse(outcome=s.DeniedOutcome(outcome="cancelled"))
        self._on_log(f"[permission] auto-allow {title}")
        # outcome union is {AllowedOutcome, DeniedOutcome}; "allow" = AllowedOutcome
        # (outcome='selected' + the chosen optionId).
        return s.RequestPermissionResponse(
            outcome=s.AllowedOutcome(outcome="selected", option_id=chosen)
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
