"""One-time integration of Split's skills into harness-specific config dirs
that don't honour cwd-relative scanning (Vibe, …).

Usage:
    python -m split.setup vibe install     # add <repo>/config/skills to ~/.vibe/config.toml
    python -m split.setup vibe uninstall   # remove it
    python -m split.setup vibe check       # verify it's there

The repo path is **resolved dynamically** from `core.SKILLS_DIR`, so this works
on any machine, in any user's home, with the repo cloned anywhere. The patch is
idempotent (re-running `install` is a no-op).

Why a one-time setup? Most harnesses (Claude, Codex, Gemini, Qwen, Copilot,
OpenCode, Cursor, DeepAgents) scan `<cwd>/.claude/skills` or `<cwd>/.agents/skills`
at session-start, so Split's per-session `install_skills` is enough. But a few
harnesses only scan their own home-dir config (`~/.vibe/skills/`) — for those,
we point their config at Split's central `config/skills/` once, and they pick up
updates automatically forever after.
"""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

from . import core


# --- per-harness setup actions ----------------------------------------------


def _resolve_skills_path() -> str:
    """Absolute path to Split's central skill source, resolved from core.

    `core.SKILLS_DIR` is computed at import time from `__file__`, so it is
    always correct for the machine running this command — no hardcoding."""
    return str(Path(core.SKILLS_DIR).resolve())


def vibe_install() -> int:
    """Add `<repo>/config/skills` to `~/.vibe/config.toml::skill_paths`.
    Idempotent; preserves the rest of the TOML byte-for-byte by doing a
    targeted regex replacement rather than re-emitting the file."""
    cfg = Path.home() / ".vibe" / "config.toml"
    if not cfg.exists():
        _err(f"vibe: config not found at {cfg}. Install Vibe first.")
        return 1
    skills = _resolve_skills_path()
    text = cfg.read_text(encoding="utf-8")
    m = re.search(r"^skill_paths\s*=\s*(\[[^\]]*\])", text, re.MULTILINE)
    if not m:
        _err("vibe: no `skill_paths = [...]` line found in config.toml.")
        return 1
    if f'"{skills}"' in m.group(1):
        print(f"vibe: ✓ skill_paths already includes {skills} — nothing to do")
        return 0
    # Insert our path before the closing `]`, keeping the existing items.
    inner = m.group(1)[1:-1].strip()
    new_arr = f'["{skills}"]' if not inner else f'[{inner}, "{skills}"]'
    # Backup once.
    bak = cfg.with_suffix(".toml.bak")
    if not bak.exists():
        shutil.copy(cfg, bak)
        print(f"vibe: backup saved at {bak}")
    new_text = text[: m.start(1)] + new_arr + text[m.end(1) :]
    cfg.write_text(new_text, encoding="utf-8")
    print(f"vibe: ✓ added {skills} to skill_paths")
    return 0


def vibe_uninstall() -> int:
    """Remove our path from `skill_paths`. Leaves any other entries alone."""
    cfg = Path.home() / ".vibe" / "config.toml"
    if not cfg.exists():
        _err(f"vibe: config not found at {cfg}.")
        return 1
    skills = _resolve_skills_path()
    text = cfg.read_text(encoding="utf-8")
    m = re.search(r"^skill_paths\s*=\s*\[([^\]]*)\]", text, re.MULTILINE)
    if not m:
        _err("vibe: no `skill_paths = [...]` line found.")
        return 1
    items = [x.strip() for x in m.group(1).split(",") if x.strip()]
    items = [x for x in items if skills not in x]
    new_arr = "[" + ", ".join(items) + "]"
    new_text = text[: m.start(0)] + f"skill_paths = {new_arr}" + text[m.end(0) :]
    cfg.write_text(new_text, encoding="utf-8")
    print(f"vibe: ✓ removed {skills} from skill_paths")
    return 0


def vibe_check() -> int:
    """Verify Split's skills path is in the config + that the path actually
    exists on disk and contains skills (catches a moved repo)."""
    cfg = Path.home() / ".vibe" / "config.toml"
    if not cfg.exists():
        _err(f"vibe: config not found at {cfg} — install Vibe first.")
        return 1
    skills = _resolve_skills_path()
    text = cfg.read_text(encoding="utf-8")
    m = re.search(r"^skill_paths\s*=\s*\[([^\]]*)\]", text, re.MULTILINE)
    listed = m and f'"{skills}"' in m.group(1)
    exists = Path(skills).is_dir()
    count = (
        sum(1 for p in Path(skills).iterdir() if (p / "SKILL.md").is_file())
        if exists
        else 0
    )
    print(f"vibe: skills source            : {skills}")
    print(f"vibe: source exists on disk    : {'✓' if exists else '✗ (path missing)'}")
    print(f"vibe: skills found in source   : {count}")
    print(f"vibe: listed in config.toml    : {'✓' if listed else '✗'}")
    if not listed:
        print("\nFix: python -m split.setup vibe install")
        return 2
    if not exists:
        print("\nThe repo moved? Run `python -m split.setup vibe install` to retarget.")
        return 2
    return 0


# --- CLI --------------------------------------------------------------------


_ACTIONS = {
    "vibe": {
        "install": vibe_install,
        "uninstall": vibe_uninstall,
        "check": vibe_check,
    },
}


def _err(msg: str) -> None:
    print(msg, file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    args = (argv if argv is not None else sys.argv[1:])
    if not args or args[0] in {"-h", "--help", "help"}:
        print(__doc__, file=sys.stderr)
        return 0
    if len(args) < 2:
        _err("usage: python -m split.setup <harness> <install|uninstall|check>")
        return 1
    harness, action = args[0], args[1]
    if harness not in _ACTIONS:
        _err(
            f"unknown harness '{harness}'. Available: {', '.join(sorted(_ACTIONS))}\n"
            f"(Claude, Codex, Gemini, Qwen, Copilot, OpenCode, Cursor, DeepAgents work\n"
            f" out-of-the-box via per-session cwd projection — no setup needed.)"
        )
        return 1
    actions = _ACTIONS[harness]
    if action not in actions:
        _err(f"unknown action '{action}' for {harness}. Try: {', '.join(actions)}")
        return 1
    return actions[action]()


if __name__ == "__main__":
    sys.exit(main())
