#!/usr/bin/env python3
"""Tiny terminal front for the ACP client (official SDK).

Switch agents live with @mentions — like Split's @expert:

    @claude                     # switch to Claude
    @codex research EVs in 2026 # switch to Codex AND send the prompt
    @vibe                       # alias for mistral-vibe
    @                           # list agents

Each agent = a persona (projected into workspace/AGENTS.md + CLAUDE.md) + skills
(projected into the agent's skill dir) + tools (MCP). Every session/update is
streamed live. /quit to exit.

    .venv/bin/python -m split.terminal            # start with no agent (pick with @)
    .venv/bin/python -m split.terminal claude     # or start on one
"""
from __future__ import annotations

import asyncio
import os
import sys

import acp

from . import core
from .acp_client import ConsoleClient, client_capabilities

# @mention aliases -> harness key in harnesses.json
ALIASES = {"vibe": "mistral-vibe", "mistral": "mistral-vibe",
           "claude-code": "claude", "google": "gemini", "nous": "hermes",
           "qwen-code": "qwen", "github-copilot": "copilot",
           "github-copilot-cli": "copilot", "xai": "grok", "langchain": "deepagents",
           "claw": "openclaw"}


# --- terminal coloring (stdlib only) -----------------------------------------

def c(code: str, txt: str) -> str:
    return f"\033[{code}m{txt}\033[0m" if sys.stdout.isatty() else txt


DIM, BOLD, CYAN, GREEN, YELLOW, MAGENTA, RED = "2", "1", "36", "32", "33", "35", "31"


class Renderer:
    """Typed SessionUpdate -> readable terminal output. In Split this seam
    becomes bus.say / bus.step / bus.frame."""

    def __init__(self) -> None:
        self._in_text = False

    def _break(self) -> None:
        if self._in_text:
            print()
            self._in_text = False

    @staticmethod
    def _block_text(block) -> str:
        if getattr(block, "type", None) == "text":
            return getattr(block, "text", "")
        return f"[content:{getattr(block, 'type', '?')}]"

    def __call__(self, update) -> None:
        name = type(update).__name__

        if name == "AgentMessageChunk":
            block = update.content
            if getattr(block, "type", None) == "text":
                sys.stdout.write(block.text)
                sys.stdout.flush()
                self._in_text = True
            else:
                self._break()
                print(c(YELLOW, "  " + self._block_text(block)))

        elif name == "AgentThoughtChunk":
            self._break()
            print(c(DIM, "  " + self._block_text(update.content)))

        elif name == "ToolCallStart":
            self._break()
            print(c(CYAN, f"  → tool: {update.title or update.kind}")
                  + c(DIM, f"  ({update.status})"))

        elif name == "ToolCallProgress":
            self._break()
            print(c(DIM, f"    · {update.title or update.tool_call_id}: {update.status}"))

        elif name == "AgentPlanUpdate":
            self._break()
            print(c(MAGENTA, "  plan:"))
            for e in update.entries or []:
                print(c(MAGENTA, f"    - [{e.status}] {e.content}"))

        elif name == "UsageUpdate":
            self._break()
            amt = getattr(update.cost, "amount", None) if update.cost else None
            extra = f"  ${amt}" if amt is not None else ""
            print(c(DIM, f"  [usage {update.used}/{update.size}{extra}]"))

        elif name in ("UserMessageChunk", "AvailableCommandsUpdate", "CurrentModeUpdate"):
            pass
        else:
            self._break()
            print(c(DIM, f"  [{name}]"))


def resolve_agent(token: str, agents: dict) -> str | None:
    t = token.lower()
    if t in agents:
        return t
    if t in ALIASES and ALIASES[t] in agents:
        return ALIASES[t]
    pref = [k for k in agents if k.startswith(t)]
    if len(pref) == 1:
        return pref[0]
    contains = [k for k in agents if t in k]
    return contains[0] if len(contains) == 1 else None


# --- one live agent connection -----------------------------------------------

class AgentSession:
    """Owns the spawned agent process + ACP connection for one agent. Switching
    @agent closes this and opens a new one."""

    def __init__(self, key: str, cfg: dict) -> None:
        self.key = key
        self.cfg = cfg
        self._client = ConsoleClient(on_update=Renderer(),
                                     on_log=lambda s: print(c(DIM, s)))
        self._cm = None
        self.conn = None
        self.sid = None

    async def open(self) -> None:
        core.install_persona()
        skills = core.install_skills("consultant", self.cfg["skill_dir"])
        command = core.resolve_command(self.cfg["command"])

        print(c(BOLD, f"\n== {self.cfg['name']} =="))
        print(c(DIM, f"auth: {self.cfg.get('auth', '-')}"))
        print(c(DIM, f"prompt → workspace/AGENTS.md+CLAUDE.md   skills → {', '.join(skills) or 'none'}"))
        print(c(DIM, f"launching: {command} {' '.join(self.cfg['args'])}"))

        self._cm = acp.spawn_agent_process(
            self._client, command, *self.cfg["args"],
            cwd=core.WORKSPACE, env=dict(os.environ),
        )
        self.conn, _proc = await self._cm.__aenter__()
        init = await self.conn.initialize(
            protocol_version=acp.PROTOCOL_VERSION,
            client_capabilities=client_capabilities(),
            client_info=acp.schema.Implementation(name="split-acp-client", version="0.1.0"),
        )
        print(c(GREEN, f"initialized (protocol v{init.protocol_version})"))

        mcp = core.load_mcp()
        if mcp:
            print(c(DIM, f"tools (MCP) → {', '.join(m.name for m in mcp)}"))
        try:
            sess = await self.conn.new_session(cwd=core.WORKSPACE, mcp_servers=mcp)
        except Exception as exc:
            if mcp:  # some agents (e.g. Vibe) won't take MCP over ACP — degrade
                print(c(YELLOW, f"agent rejected MCP servers ({exc}); retrying without"))
                sess = await self.conn.new_session(cwd=core.WORKSPACE, mcp_servers=[])
            else:
                raise
        self.sid = sess.session_id
        print(c(GREEN, f"session: {self.sid}\n"))

    async def prompt(self, text: str):
        return await self.conn.prompt(prompt=[acp.text_block(text)], session_id=self.sid)

    async def close(self) -> None:
        if self._cm is not None:
            try:
                await self._cm.__aexit__(None, None, None)
            except Exception:
                pass
            self._cm = None


# --- main --------------------------------------------------------------------

def banner(agents: dict) -> None:
    names = "  ".join(f"@{k}" for k in agents)
    print(c(BOLD, "ACP console") + c(DIM, " — switch agent with @mention:"))
    print(c(DIM, f"  {names}   (@vibe = @mistral-vibe)"))
    print(c(DIM, "  @<agent> <prompt>  switch + send · @  list · /quit\n"))


async def switch(session, key, agents):
    """Close the current session (if any) and open `key`. Returns the new
    session, or the old one on failure."""
    if session and session.key == key:
        print(c(DIM, f"already on @{key}"))
        return session
    if session:
        await session.close()
    new = AgentSession(key, agents[key])
    try:
        await new.open()
        return new
    except Exception as exc:
        print(c(RED, f"failed to start @{key}: {exc}"))
        return None


async def main() -> None:
    agents = core.load_harnesses()  # ACP-speak: each harness is an "agent"
    # The workspace is the agent's PERSISTENT home/memory (like OpenClaw's) — do
    # NOT wipe it. install_persona/install_skills only overwrite the generated
    # projections; anything the agent wrote there survives across runs.
    # Want a clean slate? `rm -rf var/workspace/` yourself.
    os.makedirs(core.WORKSPACE, exist_ok=True)
    banner(agents)

    session = None
    if len(sys.argv) > 1:
        key = resolve_agent(sys.argv[1], agents)
        if key:
            session = await switch(None, key, agents)

    loop = asyncio.get_event_loop()
    try:
        while True:
            label = f"{session.key} › " if session else "(pick @agent) › "
            try:
                text = await loop.run_in_executor(None, input, c(BOLD, label))
            except (EOFError, KeyboardInterrupt):
                break
            text = text.strip()
            if not text:
                continue
            if text in ("/quit", "/exit", "/q"):
                break

            if text.startswith("@"):
                token, _, rest = text[1:].partition(" ")
                if not token:
                    print(c(DIM, "agents: " + ", ".join(agents)))
                    continue
                key = resolve_agent(token, agents)
                if not key:
                    print(c(RED, f"unknown agent @{token}; try: {', '.join(agents)}"))
                    continue
                session = await switch(session, key, agents)
                text = rest.strip()
                if not text:
                    continue  # just switched

            if session is None:
                print(c(YELLOW, "pick an agent first, e.g. @claude / @codex / @vibe"))
                continue

            print(c(BOLD, "agent ›"))
            resp = await session.prompt(text)
            print(c(GREEN, f"\n[turn done: {resp.stop_reason}]\n"))
    finally:
        if session:
            await session.close()
        print(c(DIM, "closed."))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
