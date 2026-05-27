"""Unit tests for split.permissions — pattern matcher + decide engine."""
from __future__ import annotations

import json
import os

from split import permissions as P


# --- the pattern matcher ----------------------------------------------------
def test_plain_tool_name_is_catch_all():
    assert P._matches("WebSearch", "consultant", "WebSearch") is True
    assert P._matches("WebSearch", "consultant", "WebSearch(quantum computing)") is True
    assert P._matches("WebSearch", "consultant", "Bash(ls)") is False


def test_tool_with_exact_spec():
    assert P._matches("Bash(npm test)", "engineer", "Bash(npm test)") is True
    assert P._matches("Bash(npm test)", "engineer", "Bash(npm build)") is False


def test_tool_with_glob_spec():
    assert P._matches("Bash(npm *)", "engineer", "Bash(npm test)") is True
    assert P._matches("Bash(npm *)", "engineer", "Bash(npm run build)") is True
    assert P._matches("Bash(npm *)", "engineer", "Bash(pip install)") is False


def test_expert_prefix_only_matches_that_expert():
    rule = "engineer:Bash(npm *)"
    assert P._matches(rule, "engineer", "Bash(npm test)") is True
    assert P._matches(rule, "scientist", "Bash(npm test)") is False


def test_unprefixed_rule_applies_to_every_expert():
    rule = "WebSearch"
    for e in ("consultant", "engineer", "vision"):
        assert P._matches(rule, e, "WebSearch") is True


def test_mcp_server_rule_matches_every_tool_on_server():
    assert P._matches("mcp__cua_driver", "vision", "mcp__cua_driver__click") is True
    assert P._matches("mcp__cua_driver", "vision", "mcp__cua_driver__type_text") is True
    assert P._matches("mcp__cua_driver", "vision", "mcp__other__click") is False


def test_mcp_exact_tool_rule():
    assert P._matches("mcp__cua_driver__click", "vision", "mcp__cua_driver__click") is True
    assert P._matches("mcp__cua_driver__click", "vision", "mcp__cua_driver__type") is False


def test_mcp_glob_in_tool_name():
    assert P._matches("mcp__cua_driver__*", "vision", "mcp__cua_driver__click") is True
    assert P._matches("mcp__cua_driver__*", "vision", "mcp__other__click") is False


# --- decide engine ----------------------------------------------------------
def test_decide_default_is_ask():
    assert P.decide({}, "consultant", "WebSearch") == "ask"


def test_decide_allow_when_in_allow_list():
    rules = {"allow": ["WebSearch"]}
    assert P.decide(rules, "consultant", "WebSearch") == "allow"


def test_decide_deny_wins_over_allow():
    # deny > ask > allow — precedence is strict.
    rules = {"allow": ["Bash(*)"], "deny": ["Bash(rm *)"]}
    assert P.decide(rules, "engineer", "Bash(rm -rf foo)") == "deny"
    assert P.decide(rules, "engineer", "Bash(ls)") == "allow"


def test_decide_ask_wins_over_allow():
    rules = {"allow": ["Bash(*)"], "ask": ["Bash(git push *)"]}
    assert P.decide(rules, "engineer", "Bash(git push origin)") == "ask"


def test_default_deny_guards_are_always_active():
    # No user rules at all — the universal rm -rf / sudo / ~/.ssh guards still bite.
    assert P.decide({}, "engineer", "Bash(rm -rf /tmp/foo)") == "deny"
    assert P.decide({}, "engineer", "Bash(sudo apt install)") == "deny"
    assert P.decide({}, "engineer", "Write(~/.ssh/config)") == "deny"


def test_user_allow_cannot_override_default_deny():
    # Even if a user adds Bash(*) to allow, rm -rf still denies.
    rules = {"allow": ["Bash(*)"]}
    assert P.decide(rules, "engineer", "Bash(rm -rf /tmp/foo)") == "deny"


# --- load / save / add_rule -------------------------------------------------
def test_load_missing_file_returns_empty_lists(tmp_path):
    out = P.load(str(tmp_path / "nope.json"))
    assert out == {"allow": [], "ask": [], "deny": []}


def test_save_then_load_roundtrip(tmp_path):
    path = str(tmp_path / "permissions.json")
    P.save(path, {"allow": ["WebSearch"], "deny": []})
    assert P.load(path) == {"allow": ["WebSearch"], "ask": [], "deny": []}


def test_save_writes_restricted_perms_on_unix(tmp_path):
    if os.name != "posix":
        return  # Windows: chmod is mostly a no-op, skip
    path = str(tmp_path / "permissions.json")
    P.save(path, {"allow": ["WebSearch"]})
    mode = os.stat(path).st_mode & 0o777
    assert mode == 0o600


def test_add_rule_appends_and_is_idempotent(tmp_path):
    path = str(tmp_path / "permissions.json")
    P.add_rule(path, "allow", "WebSearch")
    P.add_rule(path, "allow", "WebSearch")  # dup
    P.add_rule(path, "allow", "Read(src/**)")
    assert json.load(open(path))["allow"] == ["WebSearch", "Read(src/**)"]


def test_load_tolerates_malformed_json(tmp_path):
    path = tmp_path / "permissions.json"
    path.write_text("{not json", encoding="utf-8")
    out = P.load(str(path))
    assert out == {"allow": [], "ask": [], "deny": []}


# --- generalize (what "Always allow" actually persists) ---------------------
def test_generalize_bash_keeps_first_real_token():
    assert P.generalize("Bash(npm test)") == "Bash(npm *)"
    assert P.generalize("Bash(npm run build --watch)") == "Bash(npm *)"
    assert P.generalize("Bash(git push origin main)") == "Bash(git *)"


def test_generalize_bash_skips_env_assignments():
    # `NODE_ENV=prod npm test` should still widen to `Bash(npm *)`.
    assert P.generalize("Bash(NODE_ENV=prod npm test)") == "Bash(npm *)"
    assert P.generalize("Bash(FOO=1 BAR=2 pytest -x)") == "Bash(pytest *)"


def test_generalize_bash_strips_absolute_binary_path():
    assert P.generalize("Bash(/usr/bin/curl -s example.com)") == "Bash(curl *)"


def test_generalize_bash_with_only_env_falls_back_to_star():
    # Edge case: no real binary token -> widest Bash rule.
    assert P.generalize("Bash(FOO=1)") == "Bash(*)"
    assert P.generalize("Bash()") == "Bash(*)"


def test_generalize_drops_path_for_kind_tools():
    # File-targeting kinds: trust is about the *kind* of action, not the path.
    assert P.generalize("Read(/Users/x/project/secrets.env)") == "Read(*)"
    assert P.generalize("Write(/tmp/out.txt)") == "Write(*)"
    assert P.generalize("Edit(src/foo.py)") == "Edit(*)"


def test_generalize_keeps_mcp_ids_canonical():
    assert P.generalize("mcp__cua_driver__click") == "mcp__cua_driver__click"
    assert P.generalize("mcp__notion__search") == "mcp__notion__search"


def test_generalize_keeps_bare_tool_names():
    # No `(...)` spec -> nothing to widen.
    assert P.generalize("WebSearch") == "WebSearch"
    assert P.generalize("WebFetch") == "WebFetch"


def test_generalized_rule_matches_subsequent_variants():
    # The whole point: persist Bash(npm *), then any future npm call passes.
    rule = P.generalize("Bash(npm run test --watch)")
    assert rule == "Bash(npm *)"
    rules = {"allow": [f"engineer:{rule}"]}
    assert P.decide(rules, "engineer", "Bash(npm run build)") == "allow"
    assert P.decide(rules, "engineer", "Bash(npm install)") == "allow"
    # And does NOT silently leak to other binaries.
    assert P.decide(rules, "engineer", "Bash(rm -rf foo)") == "deny"  # guard
    assert P.decide(rules, "engineer", "Bash(curl example.com)") == "ask"
