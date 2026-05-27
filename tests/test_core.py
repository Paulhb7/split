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
    # Structural only — what's in experts.json drifts as the roster grows.
    e = core.load_experts()
    assert "consultant" in e  # the default expert is stable
    for slug, ent in e.items():
        assert isinstance(ent.get("skills", []), list), slug


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
    # Universal shims at the workspace root + per-harness scoped copies
    # (Mistral Vibe scans its own .vibe/ dir). Order matches install_persona.
    assert written == [
        "AGENTS.md", "CLAUDE.md", "GEMINI.md", "QWEN.md", "VIBE.md",
        ".vibe/AGENTS.md",
    ]
    src = (tmp_path / "AGENTS.md").read_text(encoding="utf-8")
    persona = open(os.path.join(core.EXPERTS_DIR, "lawyer.md"), encoding="utf-8").read()
    # core may prepend a shared `_discipline.md` preamble — assert the persona
    # body ends up inside the projection (tolerant of the preamble).
    assert persona in src
    # The per-vendor shims (root + .vibe/) are identical copies of AGENTS.md.
    assert (tmp_path / "CLAUDE.md").read_text(encoding="utf-8") == src
    assert (tmp_path / ".vibe" / "AGENTS.md").read_text(encoding="utf-8") == src


def test_install_persona_unknown_expert_falls_back_to_consultant(tmp_path):
    core.install_persona("does-not-exist", str(tmp_path))
    got = (tmp_path / "AGENTS.md").read_text(encoding="utf-8")
    consultant = open(os.path.join(core.EXPERTS_DIR, "consultant.md"), encoding="utf-8").read()
    assert consultant in got


# --- install_skills ----------------------------------------------------------
def test_install_skills_mounts_exactly_the_vendored_declared_skills(tmp_path):
    """Pick any expert with a vendored skill — assert install_skills mounts
    the vendored subset, in declared order. Data-agnostic to experts.json drift."""
    e = core.load_experts()
    pick = next(
        (slug for slug, ent in e.items()
         if any(os.path.isfile(os.path.join(core.SKILLS_DIR, s, "SKILL.md"))
                for s in (ent.get("skills") or []))),
        None,
    )
    assert pick is not None, "no expert with at least one vendored skill"
    declared = e[pick]["skills"]
    expected = [s for s in declared if os.path.isfile(os.path.join(core.SKILLS_DIR, s, "SKILL.md"))]
    mounted = core.install_skills(pick, ".claude/skills", str(tmp_path))
    assert mounted == expected
    # The whole folder is copied (including any scripts/), not just SKILL.md.
    for name in mounted:
        assert (tmp_path / ".claude/skills" / name / "SKILL.md").is_file()


def test_install_skills_unknown_expert_is_safe(tmp_path):
    assert core.install_skills("does-not-exist", ".agents/skills", str(tmp_path)) == []
