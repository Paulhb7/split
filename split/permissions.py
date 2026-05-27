#!/usr/bin/env python3
"""Permission engine — decide allow / ask / deny for a tool call.

Mirrors Claude Code's rule model (so users get a familiar contract): three lists
under a single JSON file, evaluated `deny > ask > allow`, first match wins.

Rule grammar (strings):
    ToolName                  catch-all for that tool        e.g. "WebSearch"
    ToolName(spec)            scoped (glob on the arg)       e.g. "Bash(npm *)"
    mcp__server               all tools from one MCP server  e.g. "mcp__cua_driver"
    mcp__server__tool         exact MCP tool                 e.g. "mcp__cua_driver__click"
    expert:<rule>             only when the active expert    e.g. "engineer:Bash(*)"
                              matches the prefix             (an unprefixed rule applies
                                                              to every expert)

Storage: a single `var/permissions.json` at the repo root:
    {
      "allow": ["WebSearch", "engineer:Bash(npm *)"],
      "ask":   [],
      "deny":  ["Bash(rm -rf *)", "Write(~/.ssh/**)"]
    }

The engine is pure: callers (the ACP runner) own I/O and the UI prompt — they
ask `decide(...)` first, only prompt if it returns "ask".
"""
from __future__ import annotations

import fnmatch
import json
import os
from typing import Literal

Decision = Literal["allow", "ask", "deny"]

# Garde-fous universels — toujours présents même si l'utilisateur ne les déclare pas.
# Mirrors Claude Code's protected paths + obvious foot-guns.
DEFAULT_DENY: list[str] = [
    "Bash(rm -rf *)",
    "Bash(rm -rf /*)",
    "Bash(rm -rf ~*)",
    "Bash(sudo *)",
    "Write(~/.ssh/**)",
    "Write(~/.aws/**)",
    "Write(~/.gnupg/**)",
    "Write(/etc/**)",
    "Edit(~/.ssh/**)",
    "Edit(~/.aws/**)",
]


def _split_expert_prefix(rule: str) -> tuple[str | None, str]:
    """`engineer:Bash(npm *)` -> ("engineer", "Bash(npm *)"); plain rule -> (None, rule)."""
    head, _, tail = rule.partition(":")
    # Heuristic: only treat as expert-prefix if the head is a bare ident (no '(' / '_').
    # That keeps "Bash(foo:bar)" or "mcp__server__tool" out of the prefix branch.
    if tail and head.isidentifier():
        return head, tail
    return None, rule


def _parse_tool_id(tool_id: str) -> tuple[str, str | None]:
    """`Bash(npm test)` -> ("Bash", "npm test"); `WebSearch` -> ("WebSearch", None);
    `mcp__cua_driver__click` -> ("mcp__cua_driver__click", None)."""
    if tool_id.endswith(")") and "(" in tool_id:
        head, _, tail = tool_id.partition("(")
        return head, tail[:-1]
    return tool_id, None


def _matches(rule: str, expert: str, tool_id: str) -> bool:
    """Does this rule apply to (expert, tool_id)?"""
    rule_expert, rule_body = _split_expert_prefix(rule)
    if rule_expert is not None and rule_expert != expert:
        return False

    r_tool, r_spec = _parse_tool_id(rule_body)
    t_tool, t_spec = _parse_tool_id(tool_id)

    # MCP rules: support `mcp__server` matching every `mcp__server__*` tool,
    # plus exact and trailing-wildcard. Otherwise fall through to glob-on-tool.
    if r_tool.startswith("mcp__") and t_tool.startswith("mcp__"):
        if r_tool == t_tool:
            return r_spec is None or (t_spec is not None and fnmatch.fnmatchcase(t_spec, r_spec))
        # `mcp__server` -> matches every tool on that server
        if "__" not in r_tool[len("mcp__"):] and t_tool.startswith(r_tool + "__"):
            return True
        # `mcp__server__*` glob
        if "*" in r_tool and fnmatch.fnmatchcase(t_tool, r_tool):
            return True
        return False

    # Tool head must match (with glob support — e.g. `*` for every tool).
    if not fnmatch.fnmatchcase(t_tool, r_tool):
        return False
    # No spec on the rule means catch-all for that tool.
    if r_spec is None:
        return True
    # Spec required: glob on the actual argument string.
    return t_spec is not None and fnmatch.fnmatchcase(t_spec, r_spec)


def decide(rules: dict, expert: str, tool_id: str) -> Decision:
    """Apply the loaded ruleset. Precedence: deny > ask > allow.
    Default DENY guards are always merged in. Default for unmatched = "ask"
    (the runner will then prompt the UI or fall back per its mode)."""
    deny = list(DEFAULT_DENY) + list(rules.get("deny") or [])
    if any(_matches(r, expert, tool_id) for r in deny):
        return "deny"
    if any(_matches(r, expert, tool_id) for r in (rules.get("ask") or [])):
        return "ask"
    if any(_matches(r, expert, tool_id) for r in (rules.get("allow") or [])):
        return "allow"
    return "ask"


# --- persistence -------------------------------------------------------------

def _ensure_lists(data: dict) -> dict:
    for k in ("allow", "ask", "deny"):
        if not isinstance(data.get(k), list):
            data[k] = []
    return data


def load(path: str) -> dict:
    """Load a permissions file; missing file -> empty ruleset. Tolerant of
    malformed JSON (returns empty + caller can log)."""
    if not os.path.exists(path):
        return _ensure_lists({})
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return _ensure_lists(data if isinstance(data, dict) else {})
    except (json.JSONDecodeError, OSError):
        return _ensure_lists({})


def save(path: str, rules: dict) -> None:
    """Atomic-ish write of the rules JSON, restricted perms (0600) on Unix."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(_ensure_lists(rules), fh, indent=2, sort_keys=False)
        fh.write("\n")
    try:
        os.chmod(tmp, 0o600)  # secrets-adjacent; no-op on Windows
    except OSError:
        pass
    os.replace(tmp, path)


def add_rule(path: str, list_name: Decision, rule: str) -> dict:
    """Append a rule to allow/ask/deny if not already present, persist, return
    the updated ruleset."""
    rules = load(path)
    bucket = rules.setdefault(list_name, [])
    if rule not in bucket:
        bucket.append(rule)
    save(path, rules)
    return rules
