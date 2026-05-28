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


# --- memory_text -------------------------------------------------------------
def test_memory_text_always_projects_the_contract_even_when_empty(tmp_path, monkeypatch):
    """Day-1 chicken-and-egg fix: the agent must see the surface (paths +
    when-to-write trigger) on the FIRST session, before any content exists.
    The block is always projected; empty halves show a stub."""
    monkeypatch.setattr(core, "MEMORY_DIR", str(tmp_path))
    got = core.memory_text("consultant")
    assert got  # not empty
    assert "USER.md" in got
    assert "MEMORY.md" in got
    assert "nothing yet" in got  # stub copy that doubles as the write trigger


def test_memory_text_includes_both_files_and_their_paths(tmp_path, monkeypatch):
    monkeypatch.setattr(core, "MEMORY_DIR", str(tmp_path))
    user_dir = tmp_path / "_user"
    user_dir.mkdir()
    (user_dir / "USER.md").write_text("- Boss is left-handed.", encoding="utf-8")
    exp_dir = tmp_path / "lawyer"
    exp_dir.mkdir()
    (exp_dir / "MEMORY.md").write_text("- Boss's NDA template uses NY law.", encoding="utf-8")
    got = core.memory_text("lawyer")
    assert "- Boss is left-handed." in got
    assert "- Boss's NDA template uses NY law." in got
    # Absolute paths embedded so the agent writes back to the right place
    # regardless of session cwd.
    assert str(user_dir / "USER.md") in got
    assert str(exp_dir / "MEMORY.md") in got


def test_memory_text_partial_shows_stub_for_missing_half(tmp_path, monkeypatch):
    """Only one of the two files exists → still project, with a stub for the other."""
    monkeypatch.setattr(core, "MEMORY_DIR", str(tmp_path))
    user_dir = tmp_path / "_user"
    user_dir.mkdir()
    (user_dir / "USER.md").write_text("- Boss prefers French.", encoding="utf-8")
    got = core.memory_text("consultant")
    assert "- Boss prefers French." in got
    assert "nothing yet" in got  # stub for the missing expert MEMORY.md


def test_persona_text_prepends_memory_when_present(tmp_path, monkeypatch):
    monkeypatch.setattr(core, "MEMORY_DIR", str(tmp_path))
    (tmp_path / "_user").mkdir()
    (tmp_path / "_user" / "USER.md").write_text("- Memory marker XYZZY.", encoding="utf-8")
    got = core.persona_text("consultant")
    persona = open(os.path.join(core.EXPERTS_DIR, "consultant.md"), encoding="utf-8").read()
    assert "XYZZY" in got
    # Memory block appears BEFORE the persona body.
    assert got.index("XYZZY") < got.index(persona[:80])


def test_install_persona_pre_creates_memory_dirs(tmp_path, monkeypatch):
    """First session for an expert creates the memory dirs so the agent's
    first append doesn't fail on a missing parent."""
    monkeypatch.setattr(core, "MEMORY_DIR", str(tmp_path / "memory"))
    core.install_persona("scientist", str(tmp_path / "ws"))
    assert (tmp_path / "memory" / "_user").is_dir()
    assert (tmp_path / "memory" / "scientist").is_dir()


def test_install_persona_unknown_expert_does_not_litter_memory_dir(tmp_path, monkeypatch):
    """Fallback to consultant must also apply to the memory dir layout —
    no var/memory/does-not-exist/ for personas that don't exist."""
    monkeypatch.setattr(core, "MEMORY_DIR", str(tmp_path / "memory"))
    core.install_persona("does-not-exist", str(tmp_path / "ws"))
    assert not (tmp_path / "memory" / "does-not-exist").exists()
    assert (tmp_path / "memory" / "consultant").is_dir()
