#!/usr/bin/env python3
"""Split's ACP engine — the shared core behind every front.

UI-free: the terminal front (`split.terminal`) and the desktop per-session
runner (`split.runner`) both import this; neither imports the other. It resolves
the project layout, loads the registries (harnesses / experts / tools), projects
an expert's persona + skills into a session workspace, and builds the MCP server
list passed to `session/new`.

Layout — config (portable, version-controlled) is kept separate from generated
state (the OpenClaw split: `~/.openclaw` config vs. the agent workspace):

    <repo>/config/   harnesses.json, experts.json, tools.json, experts/, skills/
    <repo>/var/      workspace/ (agent home), bin/ (downloaded harness binaries)
    <repo>/.env      provider keys (loaded here, once, for every front)
"""
from __future__ import annotations

import json
import os
import shutil

import acp

# --- layout ------------------------------------------------------------------
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # split/ -> repo
CONFIG_DIR = os.path.join(REPO_ROOT, "config")
VAR_DIR = os.path.join(REPO_ROOT, "var")

HARNESSES_SRC = os.path.join(CONFIG_DIR, "harnesses.json")          # the HARNESSES (brains)
EXPERTS_SRC = os.path.join(CONFIG_DIR, "experts.json")             # the EXPERT registry
TOOLS_SRC = os.path.join(CONFIG_DIR, "tools.json")                 # the TOOLS (MCP servers)
EXPERTS_DIR = os.path.join(CONFIG_DIR, "experts")                  # persona prompts (experts/<name>.md)
SKILLS_DIR = os.path.join(CONFIG_DIR, "skills")                    # portable SKILLs (skills/<name>/)

# Generated: the agent's PERSISTENT home. The desktop shell sets SPLIT_WORKSPACE
# per session; otherwise default to var/workspace.
WORKSPACE = os.environ.get("SPLIT_WORKSPACE") or os.path.join(VAR_DIR, "workspace")

# Provider keys: load <repo>/.env into the environment once, for every front
# (the desktop runner relied on this; the terminal front benefits too).
try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(REPO_ROOT, ".env"))
except Exception:
    pass


# --- registries --------------------------------------------------------------
def _load_object(path: str) -> dict:
    """Load a JSON object, dropping `_`-prefixed comment keys."""
    with open(path, encoding="utf-8") as fh:
        return {k: v for k, v in json.load(fh).items() if not k.startswith("_")}


def load_harnesses() -> dict:
    """The harnesses (the runtimes/brains; ACP calls each one an 'agent')."""
    return _load_object(HARNESSES_SRC)


def load_experts() -> dict:
    """The expert registry (persona = experts/<name>.md, skills = a name list)."""
    return _load_object(EXPERTS_SRC)


# --- projecting an expert into a workspace -----------------------------------
def install_persona(expert: str = "consultant", ws_dir: str | None = None) -> list[str]:
    """Project the EXPERT's persona into a workspace's cross-agent instruction
    files (AGENTS.md = the cross-vendor standard; CLAUDE/GEMINI/QWEN = per-vendor
    shims). ws_dir defaults to WORKSPACE; the desktop runner passes a PER-SESSION
    dir so concurrent experts don't overwrite each other.

    If `experts/_discipline.md` exists, its contents are prepended to every
    projected file — a shared compliance preamble that helps weaker
    instruction-followers (Mistral Vibe, some Qwen builds, etc.) stay on the
    persona's rails. Filename starts with `_` so the experts.json loader
    ignores it as a slug."""
    ws_dir = ws_dir or WORKSPACE
    os.makedirs(ws_dir, exist_ok=True)
    src = os.path.join(EXPERTS_DIR, f"{expert}.md")
    if not os.path.exists(src):
        src = os.path.join(EXPERTS_DIR, "consultant.md")
    discipline_path = os.path.join(EXPERTS_DIR, "_discipline.md")
    preamble = ""
    if os.path.exists(discipline_path):
        with open(discipline_path, encoding="utf-8") as f:
            preamble = f.read()
    with open(src, encoding="utf-8") as f:
        persona = f.read()
    body = (preamble + persona) if preamble else persona
    written = []
    for fname in ("AGENTS.md", "CLAUDE.md", "GEMINI.md", "QWEN.md"):
        out = os.path.join(ws_dir, fname)
        with open(out, "w", encoding="utf-8") as f:
            f.write(body)
        written.append(fname)
    return written


def install_skills(expert: str, skill_dir: str, ws_dir: str | None = None) -> list[str]:
    """Project the EXPERT's declared skills (experts.json `"skills": [...]`) into
    the agent's skill location.

    Per the Agent Skills standard (agentskills.io) a skill is a FOLDER —
    `SKILL.md` plus optional `scripts/`, `references/`, `assets/` — so we copy the
    whole directory, not just the SKILL.md (the gen-skills ship a scripts/*.py
    that does the real work). `skill_dir` is the per-harness mount path
    (.claude/skills for Claude, .agents/skills otherwise) — the only thing that
    differs across harnesses; the skill folder itself is invariant. A skill not
    yet vendored under config/skills/<name>/ (no SKILL.md) is skipped, so a
    persona may name a skill before it exists. Returns the names actually mounted."""
    ws_dir = ws_dir or WORKSPACE
    names = load_experts().get(expert, {}).get("skills") or []
    written = []
    for name in names:
        src = os.path.join(SKILLS_DIR, name)
        if not os.path.exists(os.path.join(src, "SKILL.md")):
            continue  # not vendored yet (or missing its SKILL.md)
        dest = os.path.join(ws_dir, skill_dir, name)
        shutil.rmtree(dest, ignore_errors=True)  # refresh the generated projection
        shutil.copytree(src, dest)
        written.append(name)
    return written


def load_mcp() -> list:
    """The agent's TOOLS: MCP servers from tools.json (de-facto `mcpServers`
    shape) -> McpServerStdio objects, fed to session/new. Fed via the ACP
    protocol, not the agents' native config files. env supports ${VAR}."""
    if not os.path.exists(TOOLS_SRC):
        return []
    data = json.load(open(TOOLS_SRC, encoding="utf-8"))
    servers = []
    for name, srv in (data.get("mcpServers") or {}).items():
        env = [acp.schema.EnvVariable(name=k, value=os.path.expandvars(v))
               for k, v in (srv.get("env") or {}).items()]
        servers.append(acp.schema.McpServerStdio(
            name=name, command=srv["command"],
            args=srv.get("args", []), env=env,
        ))
    return servers


def resolve_command(command: str) -> str:
    """Resolve a `./`-relative harness command (e.g. `./var/bin/opencode`) against
    the repo root; pass bare commands (npx / uvx / grok) through unchanged."""
    if command.startswith(("./", "../")):
        return os.path.normpath(os.path.join(REPO_ROOT, command))
    return command
