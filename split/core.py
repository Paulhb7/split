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

# Cross-session memory. Plain Markdown, two scopes:
#   var/memory/_user/USER.md           — about the boss; shared by every expert
#   var/memory/<expert>/MEMORY.md      — expert-specific notes (Wolfgang's, …)
# Read at session start by `memory_text(expert)` and prepended to the persona.
# Mid-session writes hit disk immediately but only appear in the NEXT session's
# snapshot (frozen-snapshot pattern, like Hermes' built-in memory tool).
MEMORY_DIR = os.path.join(VAR_DIR, "memory")

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
def _read_if_exists(path: str) -> str:
    if not os.path.exists(path):
        return ""
    with open(path, encoding="utf-8") as f:
        return f.read().strip()


def memory_text(expert: str) -> str:
    """Compose the memory block prepended to a persona at session start.

    Two persistent files, both outside any per-session workspace so they survive
    `rm -rf var/workspace/`:

      - `var/memory/_user/USER.md`        — about the boss; every expert sees it
      - `var/memory/<expert>/MEMORY.md`   — this expert's own notes

    Always projected, even on a fresh install (empty content shows a stub that
    tells the agent *when* to write — otherwise we'd have a chicken-and-egg
    where the agent never learns the surface exists). Absolute paths are
    embedded so writes hit the right place regardless of session cwd."""
    user_path = os.path.join(MEMORY_DIR, "_user", "USER.md")
    expert_path = os.path.join(MEMORY_DIR, expert, "MEMORY.md")
    user_body = _read_if_exists(user_path)
    expert_body = _read_if_exists(expert_path)
    lines = [
        "## What you remember (read first)",
        "",
        "Persistent notes from past sessions. Plain Markdown — read them, let",
        "them shape your reply, append when you learn something durable.",
        "Tight entries (1-3 lines), no chronology.",
        "",
        f"**About the boss** — `{user_path}`",
        "",
        user_body or "_(nothing yet — append here when the boss tells you something to remember about them)_",
        "",
        f"**Your own notes** — `{expert_path}`",
        "",
        expert_body or "_(nothing yet — append here when you learn something useful for next session)_",
        "",
        "---",
        "",
        "",
    ]
    return "\n".join(lines)


def persona_text(expert: str = "consultant") -> str:
    """Compose the persona text for an expert: `_discipline.md` preamble (if
    present) + `memory_text(expert)` (if any notes exist) + `experts/<expert>.md`
    body. Falls back to `consultant.md` if the requested expert isn't on disk yet.

    This is the single source of truth for "what the agent should be told about
    its character". Both `install_persona` (cwd file projection) and the
    runner's first-turn prompt injection consume this — same content, two
    delivery channels."""
    src = os.path.join(EXPERTS_DIR, f"{expert}.md")
    if not os.path.exists(src):
        expert = "consultant"
        src = os.path.join(EXPERTS_DIR, "consultant.md")
    preamble = ""
    discipline_path = os.path.join(EXPERTS_DIR, "_discipline.md")
    if os.path.exists(discipline_path):
        with open(discipline_path, encoding="utf-8") as f:
            preamble = f.read()
    memory = memory_text(expert)
    with open(src, encoding="utf-8") as f:
        persona = f.read()
    return preamble + memory + persona


def install_persona(expert: str = "consultant", ws_dir: str | None = None) -> list[str]:
    """Project the EXPERT's persona into a workspace's cross-agent instruction
    files. Two layers:

    1. **Universal shims at the workspace root** — `AGENTS.md` is the
       cross-vendor standard; `CLAUDE.md` / `GEMINI.md` / `QWEN.md` / `VIBE.md`
       are per-vendor shims. Most agents scan one of these and Just Work.
    2. **Per-harness scoped copies** — some agents only read their own config
       subdir (Mistral Vibe scans `.vibe/`; Codex/Claude have their own). For
       those we also write the persona into the matching subdir so the agent
       finds it even if it ignores root-level files.

    ws_dir defaults to WORKSPACE; the desktop runner passes a PER-SESSION dir
    so concurrent experts don't overwrite each other.

    The persona body comes from `persona_text(expert)` so cwd projection and
    runner injection stay byte-identical."""
    ws_dir = ws_dir or WORKSPACE
    os.makedirs(ws_dir, exist_ok=True)
    # Pre-create the memory dirs so the agent's first append never fails on a
    # missing parent. Use the effective slug (falls back to consultant when the
    # requested persona isn't vendored) so we don't litter var/memory/ with
    # dirs for non-existent experts.
    effective = expert if os.path.exists(os.path.join(EXPERTS_DIR, f"{expert}.md")) else "consultant"
    for sub in ("_user", effective):
        os.makedirs(os.path.join(MEMORY_DIR, sub), exist_ok=True)
    body = persona_text(expert)
    written = []
    # 1. Write ONE canonical file per session — `AGENTS.md` is the cross-vendor
    #    standard. The other shims (CLAUDE.md, GEMINI.md, QWEN.md, VIBE.md) point
    #    to the same content; symlinking them avoids writing the same ~10 KB
    #    body four extra times. All shims live in the same dir so the symlink
    #    targets are bare filenames (relative, move-safe).
    canonical = os.path.join(ws_dir, "AGENTS.md")
    if os.path.islink(canonical) or os.path.isfile(canonical):
        os.unlink(canonical)
    with open(canonical, "w", encoding="utf-8") as f:
        f.write(body)
    written.append("AGENTS.md")
    for fname in ("CLAUDE.md", "GEMINI.md", "QWEN.md", "VIBE.md"):
        out = os.path.join(ws_dir, fname)
        if os.path.islink(out) or os.path.isfile(out):
            os.unlink(out)
        try:
            os.symlink("AGENTS.md", out)
        except (OSError, NotImplementedError):
            # Symlinks not supported on this FS — write a real copy as fallback.
            with open(out, "w", encoding="utf-8") as f:
                f.write(body)
        written.append(fname)
    # 2. Per-harness scoped copies — agents that only scan their own config dir.
    #    Each tuple is (subdir, filename). The subdir is created if missing,
    #    and the shim symlinks back UP to the canonical AGENTS.md at the root.
    for subdir, fname in (
        (".vibe", "AGENTS.md"),     # Mistral Vibe — scans its own .vibe/ dir
    ):
        sub = os.path.join(ws_dir, subdir)
        os.makedirs(sub, exist_ok=True)
        out = os.path.join(sub, fname)
        if os.path.islink(out) or os.path.isfile(out):
            os.unlink(out)
        try:
            # Relative target: one level up, then AGENTS.md (move-safe).
            os.symlink(os.path.join("..", "AGENTS.md"), out)
        except (OSError, NotImplementedError):
            with open(out, "w", encoding="utf-8") as f:
                f.write(body)
        written.append(f"{subdir}/{fname}")
    return written


def install_skills(expert: str, skill_dir: str, ws_dir: str | None = None) -> list[str]:
    """Project the EXPERT's declared skills (experts.json `"skills": [...]`) into
    the agent's skill location.

    Per the Agent Skills standard (agentskills.io) a skill is a FOLDER —
    `SKILL.md` plus optional `scripts/`, `references/`, `assets/`. Skills are
    **read-only**: agents read SKILL.md and run scripts but write their outputs
    elsewhere (`~/Desktop`, `~/Documents`, `/tmp`). So we **symlink** the source
    folder into the session workspace instead of `shutil.copytree`-ing it.

    Win: vendored packs (`ui-ux-pro-max` ~1.7 MB, `frontend-slides/bold-template-pack`
    ~1.9 MB) live in **one place on disk** instead of being duplicated for every
    session. Updates to a skill propagate instantly to running sessions; cleanup
    of `var/workspace/sessions/<sid>/` is cheap.

    `skill_dir` is the per-harness mount path (`.claude/skills` for Claude,
    `.agents/skills` otherwise, `.vibe/skills` for Mistral Vibe) — the only thing
    that differs across harnesses; the skill folder itself is invariant. A skill
    not yet vendored under `config/skills/<name>/` (no SKILL.md) is skipped, so a
    persona may name a skill before it exists. Returns the names actually mounted.

    Symlink fallback: if `os.symlink` fails (Windows without Developer Mode, or
    a filesystem that doesn't support symlinks), we fall back to `copytree` for
    that one skill so the session still runs."""
    ws_dir = ws_dir or WORKSPACE
    names = load_experts().get(expert, {}).get("skills") or []
    target_root = os.path.join(ws_dir, skill_dir)
    os.makedirs(target_root, exist_ok=True)
    written = []
    for name in names:
        src = os.path.join(SKILLS_DIR, name)
        if not os.path.exists(os.path.join(src, "SKILL.md")):
            continue  # not vendored yet (or missing its SKILL.md)
        dest = os.path.join(target_root, name)
        # Refresh: remove whatever's there (symlink, dir, or stale broken link).
        if os.path.islink(dest) or os.path.isfile(dest):
            os.unlink(dest)
        elif os.path.isdir(dest):
            shutil.rmtree(dest, ignore_errors=True)
        try:
            # Use an absolute target so it resolves regardless of cwd. Skills are
            # read-only by convention so sharing the source across sessions is safe.
            os.symlink(os.path.abspath(src), dest, target_is_directory=True)
        except (OSError, NotImplementedError):
            # Symlinks not supported (Windows w/o Developer Mode, exotic FS, …).
            # Fall back to copying so the session still has the skill on hand.
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
    the repo root; pass bare commands (npx / uvx / …) through unchanged."""
    if command.startswith(("./", "../")):
        return os.path.normpath(os.path.join(REPO_ROOT, command))
    return command
