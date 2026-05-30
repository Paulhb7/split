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
from datetime import date, datetime, timezone

import acp
from filelock import FileLock

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
# per session; otherwise default to var/workspace. Each expert gets its OWN
# subdir under here (`<WORKSPACE>/<expert>/`) — created and projected once,
# reused across every session of that expert (regardless of harness).
WORKSPACE = os.environ.get("SPLIT_WORKSPACE") or os.path.join(VAR_DIR, "workspace")

# Cross-session memory. Plain Markdown, two scopes:
#   var/memory/_user/USER.md           — about the boss; shared by every expert
#   var/memory/<expert>/MEMORY.md      — expert-specific notes (Wolfgang's, …)
# Read at session start by `memory_text(expert)` and prepended to the persona.
# Mid-session writes hit disk immediately but only appear in the NEXT session's
# snapshot (frozen-snapshot pattern, like Hermes' built-in memory tool).
MEMORY_DIR = os.path.join(VAR_DIR, "memory")

# Per-session archive: raw VEVT stream + user turns + meta. One folder per session
# under `var/sessions/<sid>/`, written live by the runner/terminal — survives the
# process exit so the desktop can list "past conversations" (ChatGPT-style) and
# replay them through the same reducer that draws live sessions. See SessionArchive.
SESSIONS_DIR = os.path.join(VAR_DIR, "sessions")

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
    its character". Both `ensure_expert_workspace` (cwd file projection) and
    the runner's first-turn prompt injection consume this — same content, two
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
    today = date.today().isoformat()
    date_header = (
        f"**Today is {today}.** Current year: {today[:4]}. "
        f"For \"this year\" / \"latest\" / \"recent\" / \"now\" queries, "
        f"resolve to {today[:4]} — never default to your training cutoff. "
        f"When formulating web searches, prefer freshness keywords "
        f"(\"latest\", \"this week\", \"past 30 days\") over hard-coded years.\n\n"
    )
    return date_header + preamble + memory + persona


def _all_skill_dirs() -> list[str]:
    """The distinct `skill_dir` values across the harness registry — the set
    of `.claude/skills` / `.agents/skills` / `.vibe/skills` we need to project
    inside an expert's workspace so that ANY harness running the expert finds
    its catalogue at the path it scans."""
    seen, out = set(), []
    for h in load_harnesses().values():
        d = h.get("skill_dir")
        if d and d not in seen:
            seen.add(d)
            out.append(d)
    return out


def _resolve_expert(expert: str) -> str:
    """Fall back to consultant when the requested persona isn't vendored."""
    if not os.path.exists(os.path.join(EXPERTS_DIR, f"{expert}.md")):
        return "consultant"
    return expert


def _persona_sources_mtime(expert: str) -> float:
    """Newest mtime across every file that contributes to the persona body —
    persona, shared preamble, both memory files. Drives the persona-refresh
    check in `ensure_expert_workspace`."""
    paths = [
        os.path.join(EXPERTS_DIR, f"{expert}.md"),
        os.path.join(EXPERTS_DIR, "_discipline.md"),
        os.path.join(MEMORY_DIR, "_user", "USER.md"),
        os.path.join(MEMORY_DIR, expert, "MEMORY.md"),
    ]
    return max((os.path.getmtime(p) for p in paths if os.path.exists(p)), default=0.0)


def _safe_unlink(path: str) -> None:
    """Unlink that swallows FileNotFoundError — race-tolerant if the lock is
    bypassed (ad-hoc scripts, future code paths, agent self-edits)."""
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def _refresh_persona(expert: str, ws_dir: str) -> None:
    """Project the persona into `<ws_dir>` if any source file is newer than
    the existing `AGENTS.md` (or if it's missing). Layout:

      AGENTS.md             — canonical persona body
      CLAUDE.md / GEMINI.md / QWEN.md / VIBE.md  — symlinks to AGENTS.md
      .vibe/AGENTS.md       — symlink to ../AGENTS.md (Vibe scans its own dir)

    Memory dirs (`var/memory/_user/`, `var/memory/<expert>/`) are pre-created
    so the agent's first "remember this" write never fails on a missing parent."""
    canonical = os.path.join(ws_dir, "AGENTS.md")
    src_newest = _persona_sources_mtime(expert)
    # Existing AGENTS.md still up-to-date? Skip entirely.
    if (os.path.isfile(canonical) and not os.path.islink(canonical)
            and os.path.getmtime(canonical) >= src_newest):
        return
    for sub in ("_user", expert):
        os.makedirs(os.path.join(MEMORY_DIR, sub), exist_ok=True)
    body = persona_text(expert)
    if os.path.islink(canonical) or os.path.isfile(canonical):
        _safe_unlink(canonical)
    with open(canonical, "w", encoding="utf-8") as f:
        f.write(body)
    for fname in ("CLAUDE.md", "GEMINI.md", "QWEN.md", "VIBE.md"):
        out = os.path.join(ws_dir, fname)
        if os.path.islink(out) or os.path.isfile(out):
            _safe_unlink(out)
        try:
            os.symlink("AGENTS.md", out)
        except (OSError, NotImplementedError):
            with open(out, "w", encoding="utf-8") as f:
                f.write(body)
    vibe = os.path.join(ws_dir, ".vibe")
    os.makedirs(vibe, exist_ok=True)
    vibe_shim = os.path.join(vibe, "AGENTS.md")
    if os.path.islink(vibe_shim) or os.path.isfile(vibe_shim):
        _safe_unlink(vibe_shim)
    try:
        os.symlink(os.path.join("..", "AGENTS.md"), vibe_shim)
    except (OSError, NotImplementedError):
        with open(vibe_shim, "w", encoding="utf-8") as f:
            f.write(body)


def _refresh_skills(expert: str, ws_dir: str) -> list[str]:
    """Reconcile each harness skill_dir with `experts.json[expert].skills`.

    For every distinct skill_dir (`.claude/skills`, `.agents/skills`,
    `.vibe/skills`): the directory ends up containing **exactly** one symlink
    per allowed skill, each pointing direct at `config/skills/<name>`. No
    intermediate mount — the FS reflects the persona's allowed list, full stop.

    Idempotent: an existing symlink with the right target is left alone; a
    stale or wrong one is replaced; an obsolete one (skill removed from the
    expert's list) is unlinked. Returns the canonical list of skills allowed
    for this expert that also exist on disk under `config/skills/`."""
    experts = load_experts()
    requested = experts.get(expert, {}).get("skills") or []
    # Drop entries whose source folder doesn't actually exist (or lacks a
    # SKILL.md) — keeps the FS honest if experts.json drifts.
    valid = [
        name for name in requested
        if os.path.isfile(os.path.join(SKILLS_DIR, name, "SKILL.md"))
    ]
    wanted = set(valid)
    for skill_dir in _all_skill_dirs():
        target_dir = os.path.join(ws_dir, skill_dir)
        os.makedirs(target_dir, exist_ok=True)
        existing = set(os.listdir(target_dir))
        for name in existing - wanted:
            stale = os.path.join(target_dir, name)
            if os.path.islink(stale) or os.path.isfile(stale):
                _safe_unlink(stale)
            elif os.path.isdir(stale):
                shutil.rmtree(stale, ignore_errors=True)
        for name in wanted:
            src = os.path.abspath(os.path.join(SKILLS_DIR, name))
            dest = os.path.join(target_dir, name)
            # Already pointing at the right place? Skip.
            if os.path.islink(dest) and os.path.realpath(dest) == src:
                continue
            if os.path.islink(dest) or os.path.isfile(dest):
                _safe_unlink(dest)
            elif os.path.isdir(dest):
                shutil.rmtree(dest, ignore_errors=True)
            try:
                os.symlink(src, dest, target_is_directory=True)
            except (OSError, NotImplementedError):
                shutil.copytree(src, dest)
    return valid


def expert_workspace_dir(expert: str, ws_root: str | None = None) -> str:
    """The on-disk home for one expert under `ws_root` (or WORKSPACE).
    Pure path computation — no side effects. Used by callers that need the
    path without (re)projecting (UI reveal, log paths, …)."""
    return os.path.join(ws_root or WORKSPACE, _resolve_expert(expert))


def ensure_expert_workspace(expert: str, ws_root: str | None = None) -> str:
    """Idempotently set up an expert's persistent workspace and return its path.

    Layout (`<ws_root>/<expert>/`):

      AGENTS.md             persona + memory snapshot (the only real content)
      CLAUDE.md / GEMINI.md / QWEN.md / VIBE.md   → AGENTS.md (cross-vendor shims)
      .claude/skills/<name> → config/skills/<name>  (for Claude harnesses)
      .agents/skills/<name> → config/skills/<name>  (Codex / Gemini / Qwen / …)
      .vibe/skills/<name>   → config/skills/<name>  (Mistral Vibe)
      .vibe/AGENTS.md       → ../AGENTS.md

    Single source of truth for "set up an expert's home". Replaces the older
    per-session `install_persona` + `install_skills` + shared skill mount.
    Why a per-expert dir (not per-session-UUID): the persona + skills are a
    property of the EXPERT, not of a particular conversation. Re-projecting
    them per session was pure wasted work — and the agent now keeps its
    scratch files across sessions of the same expert, which is what we want
    for cross-session memory of work-in-progress.

    Refresh policy:
      - **Persona** files are refreshed only when one of their source mtimes
        has advanced (mtime check, no diffing).
      - **Skills** are reconciled every call against `experts.json[expert].skills`
        (O(N) where N = the expert's allowed skills — cheap, and lets a change
        in experts.json take effect on the next session without explicit refresh).

    Concurrency: serialized per-expert via a cross-process file lock at
    `<ws_root>/.locks/<expert>.lock` (a sibling of `<expert>/`, not inside it,
    so the agent's cwd `ls` stays clean). Two runners spawning sessions of the
    same expert at the same time project sequentially, not in a race; different
    experts proceed in parallel. The lock is held only for the projection,
    not for the session — once `ensure_expert_workspace` returns, the agent
    runs freely in its workspace (where two sessions of the same expert still
    share the cwd and so can collide on artifact writes — out of scope here)."""
    expert = _resolve_expert(expert)
    root = ws_root or WORKSPACE
    ws = os.path.join(root, expert)
    locks_dir = os.path.join(root, ".locks")
    os.makedirs(ws, exist_ok=True)
    os.makedirs(locks_dir, exist_ok=True)
    with FileLock(os.path.join(locks_dir, f"{expert}.lock"), timeout=30):
        _refresh_persona(expert, ws)
        _refresh_skills(expert, ws)
    return ws


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


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def update_to_vevt(update) -> dict | None:
    """Translate one ACP `SessionUpdate` into the VEVT payload Split's reducer
    consumes. Returns `None` if the update has no representation in our vocab
    (UserMessageChunk, AvailableCommandsUpdate, …). Single source of truth so
    the runner (desktop) and the terminal front speak the exact same dialect —
    archives produced by either replay identically through the React reducer."""
    n = type(update).__name__
    if n == "AgentMessageChunk" and getattr(update.content, "type", None) == "text":
        return {"type": "say", "text": update.content.text}
    if n == "AgentThoughtChunk" and getattr(update.content, "type", None) == "text":
        return {"type": "thought", "text": update.content.text}
    if n in ("ToolCallStart", "ToolCallProgress"):
        return {"type": "step", "title": update.title or update.kind, "status": str(update.status)}
    if n == "AgentPlanUpdate":
        return {
            "type": "plan",
            "entries": [
                {"content": e.content, "status": str(e.status)} for e in (update.entries or [])
            ],
        }
    if n == "UsageUpdate":
        cost = getattr(update.cost, "amount", None) if update.cost else None
        return {"type": "usage", "used": update.used, "size": update.size, "cost": cost}
    return None


class SessionArchive:
    """Append-only per-session log: `events.ndjson` (one VEVT-shaped event per
    line) + `meta.json` (`{id, harness, expert, title, started_at, ended_at}`).

    Lives at `<SESSIONS_DIR>/<sid>/`. Written live — every event is flushed so
    the archive is replayable even if the process is killed mid-turn. Meta is
    rewritten on each title/ended_at change; events are append-only.

    The title comes from the first user turn (≤63 chars, Hermes-style). User
    turns are written as a synthetic `{"type":"turn","text":...}` event so the
    ndjson alone is enough to rebuild the thread (no separate transcript file)."""

    def __init__(self, sid: str, harness: str, expert: str, root: str | None = None) -> None:
        self.sid = sid
        self.harness = harness
        self.expert = expert
        self.dir = os.path.join(root or SESSIONS_DIR, sid)
        os.makedirs(self.dir, exist_ok=True)
        self.events_path = os.path.join(self.dir, "events.ndjson")
        self.meta_path = os.path.join(self.dir, "meta.json")
        self.meta = {
            "id": sid,
            "harness": harness,
            "expert": expert,
            "title": "",
            "started_at": _iso_now(),
            "ended_at": "",
        }
        # Don't clobber a pre-existing meta (resumed session id) — only seed
        # if the file isn't there yet.
        if not os.path.exists(self.meta_path):
            self._save_meta()
        self._events_fh = open(self.events_path, "a", encoding="utf-8")

    def _save_meta(self) -> None:
        tmp = self.meta_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.meta, f, indent=2)
        os.replace(tmp, self.meta_path)

    def _append(self, record: dict) -> None:
        try:
            self._events_fh.write(json.dumps(record) + "\n")
            self._events_fh.flush()
        except Exception:
            # Archive is best-effort — never break the live session over an I/O hiccup.
            pass

    def write_event(self, payload: dict) -> None:
        """Append one VEVT payload (already shaped {type, ...}). Adds a timestamp."""
        self._append({"at": _iso_now(), **payload})

    def write_turn(self, text: str) -> None:
        """Append a user turn AND set the title if this is the first turn."""
        self._append({"at": _iso_now(), "type": "turn", "text": text})
        if not self.meta["title"]:
            t = " ".join(text.split())[:63].strip()
            if t:
                self.meta["title"] = t
                self._save_meta()

    def close(self) -> None:
        self.meta["ended_at"] = _iso_now()
        self._save_meta()
        try:
            self._events_fh.close()
        except Exception:
            pass


def resolve_command(command: str) -> str:
    """Resolve a `./`-relative harness command (e.g. `./var/bin/opencode`) against
    the repo root; pass bare commands (npx / uvx / …) through unchanged."""
    if command.startswith(("./", "../")):
        return os.path.normpath(os.path.join(REPO_ROOT, command))
    return command


def apply_hermes_config() -> tuple[list[str], dict[str, str]]:
    """Translate the desktop panel's saved choice into Hermes spawn-time
    overrides. The panel writes `var/state/hermes.config.json` via the Tauri
    `save_hermes_config` command; here we read it and produce:
      - extra CLI args appended to `hermes acp` (`-m <provider/model>
        --provider <name>`), since Hermes accepts these as per-invocation
        overrides without touching the user's ~/.hermes/config.yaml
      - extra env vars to merge into the spawn env (for local Ollama we point
        `HERMES_HOME` at a managed config dir holding `base_url`, since the
        OpenAI-compat endpoint isn't a top-level CLI flag)

    Returns ([], {}) when no config is saved or the file is malformed — the
    harness then falls back to whatever the user's ~/.hermes/ says.
    """
    cfg_path = os.path.join(VAR_DIR, "state", "hermes.config.json")
    if not os.path.exists(cfg_path):
        return [], {}
    try:
        with open(cfg_path, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
    except Exception:
        return [], {}

    mode = cfg.get("mode")
    if mode == "cloud":
        cloud = cfg.get("cloud") or {}
        provider = cloud.get("providerId")
        model = cloud.get("modelId")
        if provider and model:
            return ["-m", f"{provider}/{model}", "--provider", provider], {}
    elif mode == "local":
        local = cfg.get("local") or {}
        model = local.get("modelId")
        if model:
            home = os.path.join(VAR_DIR, "state", "hermes-home")
            os.makedirs(home, exist_ok=True)
            # Hermes reads model.base_url from config.yaml; no top-level CLI
            # flag exposes it. We seed a minimal config here so the user's
            # ~/.hermes/ stays untouched.
            with open(os.path.join(home, "config.yaml"), "w", encoding="utf-8") as fh:
                fh.write(
                    'model:\n'
                    f'  default: "ollama/{model}"\n'
                    '  provider: "ollama"\n'
                    '  base_url: "http://localhost:11434/v1"\n'
                )
            return (
                ["-m", f"ollama/{model}", "--provider", "ollama"],
                {"HERMES_HOME": home},
            )
    return [], {}
