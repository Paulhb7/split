"""Unit tests for split.core — the pure engine (no network, no agent spawn)."""
from __future__ import annotations

import os

from split import core


# --- registries --------------------------------------------------------------
def test_load_harnesses_has_known_agents_and_no_comment_keys():
    h = core.load_harnesses()
    assert {"claude", "codex", "gemini", "mistral-vibe"} <= set(h)
    assert not any(k.startswith("_") for k in h)  # `_comment` filtered out
    assert h["claude"]["command"] == "npx"


def test_load_experts_have_skills_lists():
    e = core.load_experts()
    assert {"consultant", "scientist", "musician"} <= set(e)
    assert "slide-deck" in e["consultant"]["skills"]
    assert e["lawyer"]["skills"] == []  # advisor: no skills
    assert all(isinstance(v.get("skills", []), list) for v in e.values())


# --- resolve_command ---------------------------------------------------------
def test_resolve_command_relative_is_anchored_to_repo_root():
    got = core.resolve_command("./var/bin/opencode")
    assert got == os.path.join(core.REPO_ROOT, "var", "bin", "opencode")


def test_resolve_command_bare_passes_through():
    assert core.resolve_command("npx") == "npx"
    assert core.resolve_command("uvx") == "uvx"


# --- install_persona ---------------------------------------------------------
def test_install_persona_projects_all_instruction_files(tmp_path):
    written = core.install_persona("lawyer", str(tmp_path))
    assert written == ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "QWEN.md"]
    src = (tmp_path / "AGENTS.md").read_text(encoding="utf-8")
    expected = open(os.path.join(core.EXPERTS_DIR, "lawyer.md"), encoding="utf-8").read()
    assert src == expected
    # the per-vendor shims are identical copies of the same persona
    assert (tmp_path / "CLAUDE.md").read_text(encoding="utf-8") == expected


def test_install_persona_unknown_expert_falls_back_to_consultant(tmp_path):
    core.install_persona("does-not-exist", str(tmp_path))
    got = (tmp_path / "AGENTS.md").read_text(encoding="utf-8")
    consultant = open(os.path.join(core.EXPERTS_DIR, "consultant.md"), encoding="utf-8").read()
    assert got == consultant


# --- install_skills ----------------------------------------------------------
def test_install_skills_mounts_exactly_the_vendored_declared_skills(tmp_path):
    declared = core.load_experts()["consultant"]["skills"]
    expected = [s for s in declared if os.path.isfile(os.path.join(core.SKILLS_DIR, s, "SKILL.md"))]
    mounted = core.install_skills("consultant", ".claude/skills", str(tmp_path))
    assert mounted == expected  # only the vendored ones, in declared order
    assert "slide-deck" in mounted
    assert (tmp_path / ".claude/skills/slide-deck/SKILL.md").is_file()


def test_install_skills_copies_whole_folder_including_scripts(tmp_path):
    # gen-skills bundle a scripts/*.py — the whole folder must come, not just SKILL.md
    mounted = core.install_skills("musician", ".agents/skills", str(tmp_path))
    assert "music-gen" in mounted
    assert (tmp_path / ".agents/skills/music-gen/SKILL.md").is_file()
    assert (tmp_path / ".agents/skills/music-gen/scripts/music.py").is_file()


def test_install_skills_empty_for_advisor(tmp_path):
    assert core.install_skills("lawyer", ".agents/skills", str(tmp_path)) == []


def test_install_skills_unknown_expert_is_safe(tmp_path):
    assert core.install_skills("does-not-exist", ".agents/skills", str(tmp_path)) == []
