"""One-time integration of Split's skills + MCP tools into harness-specific
config dirs that don't honour the ACP-level mechanisms (Vibe, …).

Usage:
    python -m split.setup vibe install     # add skill_paths + mcp_servers
    python -m split.setup vibe uninstall   # remove both
    python -m split.setup vibe check       # verify both are there

Two integrations folded into one command:

  - **skill_paths**: append `<repo>/config/skills` to Vibe's `skill_paths`.
  - **mcp_servers**: replace Vibe's `mcp_servers` with the Split-owned set
    from `config/tools.json` (ddg-search, cua-driver, …). Vibe's ACP wrapper
    rejects the `mcpServers` parameter of `session/new` (the runner falls
    back to no-MCP-over-ACP), so we wire the same MCPs through Vibe's
    native config instead. Equivalent observability, same tools.

The repo path is **resolved dynamically** from `core.REPO_ROOT`, so this works
on any machine, in any user's home, with the repo cloned anywhere. The patch is
idempotent (re-running `install` reconciles to the current `tools.json`).

Why a one-time setup? Most harnesses (Claude, Codex, Gemini, Qwen, Copilot,
OpenCode, Cursor) consume skills via `<cwd>/.claude/skills` /
`<cwd>/.agents/skills` (handled by `core.ensure_expert_workspace`) and MCPs via
ACP's `mcpServers` (handled by the runner). Vibe respects neither at the ACP
seam, so we patch its native config once.
"""
from __future__ import annotations

import json
import os
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


def _split_mcp_servers() -> dict[str, dict]:
    """Read Split's MCP registry from `config/tools.json`.

    Returns `{name: {command, args, env}}` for every MCP server (skipping
    `_comment` keys + the `_example_real_tool` section). Mirrors what
    `core.load_mcp()` reads, but as plain dicts (we don't want acp.schema
    objects here — we're going to serialize to TOML)."""
    path = Path(core.REPO_ROOT) / "config" / "tools.json"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    servers = data.get("mcpServers") or {}
    return {
        name: {
            "command": srv["command"],
            "args": srv.get("args", []),
            "env": {k: os.path.expandvars(v) for k, v in (srv.get("env") or {}).items()},
        }
        for name, srv in servers.items()
        if not name.startswith("_")
    }


def _format_vibe_mcp_entry(name: str, srv: dict) -> str:
    """Serialize ONE MCP server as an inline TOML object Vibe accepts.

    Schema from `vibe/core/config.py::MCPStdio`: `transport`, `name`,
    `command`, `args`, `env`. `env` only appears when non-empty so the line
    stays readable."""
    args = ", ".join(f'"{a}"' for a in srv.get("args", []))
    parts = [
        'transport = "stdio"',
        f'name = "{name}"',
        f'command = "{srv["command"]}"',
        f'args = [{args}]',
    ]
    if srv.get("env"):
        env_kv = ", ".join(f'{k} = "{v}"' for k, v in srv["env"].items())
        parts.append(f"env = {{ {env_kv} }}")
    return "{ " + ", ".join(parts) + " }"


def _patch_mcp_servers(text: str, entries: list[str]) -> str:
    """Replace the `mcp_servers = …` line/block in Vibe's config with the
    given inline-object array. Tolerates either the empty form
    (`mcp_servers = []`) or a previously-installed multi-line form."""
    pattern = re.compile(
        r"^mcp_servers\s*=\s*\[(?:[^\[\]]*|\[[^\[\]]*\])*\]",
        re.MULTILINE | re.DOTALL,
    )
    m = pattern.search(text)
    if not m:
        raise ValueError("vibe: no `mcp_servers = [...]` line found in config.toml.")
    if not entries:
        new_arr = "mcp_servers = []"
    else:
        body = ",\n  ".join(entries)
        new_arr = f"mcp_servers = [\n  {body},\n]"
    return text[: m.start()] + new_arr + text[m.end() :]


def _backup_once(cfg: Path) -> None:
    """Stash a one-time backup of the user's pristine config (the first time
    we touch it). Lets the user diff or roll back if anything goes wrong."""
    bak = cfg.with_suffix(".toml.bak")
    if not bak.exists():
        shutil.copy(cfg, bak)
        print(f"vibe: backup saved at {bak}")


def vibe_install() -> int:
    """Install Split's skills + MCP integration into `~/.vibe/config.toml`.

    Two patches, both idempotent:
      1. `skill_paths` gains `<repo>/config/skills` (appended, dedup-checked).
      2. `mcp_servers` is **replaced** by the current Split MCP registry —
         Split owns this section. If you want to add user-only MCPs to Vibe,
         either add them to `config/tools.json` (where every harness will see
         them) or run this after editing them in (we won't re-run on next
         install). Re-running `install` reconciles to whatever `tools.json`
         currently declares."""
    cfg = Path.home() / ".vibe" / "config.toml"
    if not cfg.exists():
        _err(f"vibe: config not found at {cfg}. Install Vibe first.")
        return 1
    skills = _resolve_skills_path()
    text = cfg.read_text(encoding="utf-8")
    _backup_once(cfg)
    # --- skill_paths --------------------------------------------------------
    m = re.search(r"^skill_paths\s*=\s*(\[[^\]]*\])", text, re.MULTILINE)
    if not m:
        _err("vibe: no `skill_paths = [...]` line found in config.toml.")
        return 1
    if f'"{skills}"' in m.group(1):
        print(f"vibe: ✓ skill_paths already includes {skills}")
    else:
        inner = m.group(1)[1:-1].strip()
        new_arr = f'["{skills}"]' if not inner else f'[{inner}, "{skills}"]'
        text = text[: m.start(1)] + new_arr + text[m.end(1) :]
        print(f"vibe: ✓ added {skills} to skill_paths")
    # --- mcp_servers --------------------------------------------------------
    mcps = _split_mcp_servers()
    entries = [_format_vibe_mcp_entry(name, srv) for name, srv in mcps.items()]
    try:
        text = _patch_mcp_servers(text, entries)
    except ValueError as exc:
        _err(str(exc))
        return 1
    cfg.write_text(text, encoding="utf-8")
    print(f"vibe: ✓ wrote {len(entries)} MCP server{'s' if len(entries) != 1 else ''} to mcp_servers ({', '.join(mcps) or 'none'})")
    return 0


def vibe_uninstall() -> int:
    """Remove Split's integration: drop our skill path, clear mcp_servers."""
    cfg = Path.home() / ".vibe" / "config.toml"
    if not cfg.exists():
        _err(f"vibe: config not found at {cfg}.")
        return 1
    skills = _resolve_skills_path()
    text = cfg.read_text(encoding="utf-8")
    # --- skill_paths --------------------------------------------------------
    m = re.search(r"^skill_paths\s*=\s*\[([^\]]*)\]", text, re.MULTILINE)
    if m:
        items = [x.strip() for x in m.group(1).split(",") if x.strip()]
        items = [x for x in items if skills not in x]
        new_arr = "[" + ", ".join(items) + "]"
        text = text[: m.start(0)] + f"skill_paths = {new_arr}" + text[m.end(0) :]
        print(f"vibe: ✓ removed {skills} from skill_paths")
    # --- mcp_servers --------------------------------------------------------
    try:
        text = _patch_mcp_servers(text, [])
        print("vibe: ✓ cleared mcp_servers")
    except ValueError as exc:
        _err(str(exc))
    cfg.write_text(text, encoding="utf-8")
    return 0


def vibe_check() -> int:
    """Verify Split's skills path AND mcp_servers are wired into Vibe's
    config + that the underlying source paths still resolve."""
    cfg = Path.home() / ".vibe" / "config.toml"
    if not cfg.exists():
        _err(f"vibe: config not found at {cfg} — install Vibe first.")
        return 1
    skills = _resolve_skills_path()
    text = cfg.read_text(encoding="utf-8")
    # --- skill_paths --------------------------------------------------------
    m = re.search(r"^skill_paths\s*=\s*\[([^\]]*)\]", text, re.MULTILINE)
    skills_listed = bool(m and f'"{skills}"' in m.group(1))
    skills_exists = Path(skills).is_dir()
    skill_count = (
        sum(1 for p in Path(skills).iterdir() if (p / "SKILL.md").is_file())
        if skills_exists else 0
    )
    # --- mcp_servers --------------------------------------------------------
    declared = _split_mcp_servers()
    # Find each declared MCP by name in the config's mcp_servers section.
    pattern = re.compile(
        r"^mcp_servers\s*=\s*\[((?:[^\[\]]*|\[[^\[\]]*\])*)\]",
        re.MULTILINE | re.DOTALL,
    )
    mcp_block = pattern.search(text)
    in_config = {
        name for name in declared
        if mcp_block and f'name = "{name}"' in mcp_block.group(1)
    }
    print(f"vibe: skills source            : {skills}")
    print(f"vibe: skills exists on disk    : {'✓' if skills_exists else '✗ (path missing)'}")
    print(f"vibe: skills found in source   : {skill_count}")
    print(f"vibe: skill_paths listed       : {'✓' if skills_listed else '✗'}")
    print(f"vibe: MCP servers declared     : {len(declared)} ({', '.join(declared) or 'none'})")
    print(f"vibe: MCP servers in config    : {len(in_config)} ({', '.join(sorted(in_config)) or 'none'})")
    missing_mcps = set(declared) - in_config
    if missing_mcps:
        print(f"vibe: MCP servers MISSING      : {', '.join(sorted(missing_mcps))}")
    problems = (not skills_listed) or (not skills_exists) or bool(missing_mcps)
    if problems:
        print("\nFix: python -m split.setup vibe install")
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
            f"(Claude, Codex, Gemini, Qwen, Copilot, OpenCode, Cursor work\n"
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
