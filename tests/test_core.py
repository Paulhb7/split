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


# --- ensure_expert_workspace -------------------------------------------------
def test_ensure_expert_workspace_projects_persona_and_shims(tmp_path):
    ws = core.ensure_expert_workspace("lawyer", str(tmp_path))
    assert ws == os.path.join(str(tmp_path), "lawyer")
    body = open(os.path.join(ws, "AGENTS.md"), encoding="utf-8").read()
    persona = open(os.path.join(core.EXPERTS_DIR, "lawyer.md"), encoding="utf-8").read()
    assert persona in body  # tolerant of the discipline preamble + memory block
    # Cross-vendor shims all point at AGENTS.md.
    for shim in ("CLAUDE.md", "GEMINI.md", "QWEN.md", "VIBE.md"):
        link = os.path.join(ws, shim)
        assert os.path.islink(link)
        assert os.readlink(link) == "AGENTS.md"
    # Vibe scans its own .vibe/ dir — needs a shim there too.
    vibe_shim = os.path.join(ws, ".vibe", "AGENTS.md")
    assert os.path.islink(vibe_shim)


def test_ensure_expert_workspace_filters_skills_to_experts_json(tmp_path):
    """Hard FS-level filter: a lawyer's `.claude/skills/` contains EXACTLY the
    skills `experts.json[lawyer].skills` lists (intersected with what's vendored
    in `config/skills/`). No more, no less."""
    ws = core.ensure_expert_workspace("lawyer", str(tmp_path))
    allowed = core.load_experts()["lawyer"]["skills"]
    expected = {
        name for name in allowed
        if os.path.isfile(os.path.join(core.SKILLS_DIR, name, "SKILL.md"))
    }
    for skill_dir in (".claude/skills", ".agents/skills", ".vibe/skills"):
        present = set(os.listdir(os.path.join(ws, skill_dir)))
        assert present == expected, f"{skill_dir} drifted: {present} vs {expected}"
        for name in expected:
            link = os.path.join(ws, skill_dir, name)
            assert os.path.islink(link)
            # Each symlink points DIRECTLY at config/skills/<name> — no mount.
            assert os.path.realpath(link) == os.path.realpath(
                os.path.join(core.SKILLS_DIR, name)
            )


def test_ensure_expert_workspace_unknown_expert_falls_back_to_consultant(tmp_path):
    ws = core.ensure_expert_workspace("does-not-exist", str(tmp_path))
    assert ws == os.path.join(str(tmp_path), "consultant")
    body = open(os.path.join(ws, "AGENTS.md"), encoding="utf-8").read()
    consultant = open(os.path.join(core.EXPERTS_DIR, "consultant.md"), encoding="utf-8").read()
    assert consultant in body


def test_ensure_expert_workspace_is_idempotent_no_persona_rewrite(tmp_path):
    """Persona is mtime-gated: a second call with no source changes must NOT
    rewrite AGENTS.md (the whole point of the per-expert workspace)."""
    ws = core.ensure_expert_workspace("lawyer", str(tmp_path))
    agents = os.path.join(ws, "AGENTS.md")
    first_mtime = os.path.getmtime(agents)
    core.ensure_expert_workspace("lawyer", str(tmp_path))
    assert os.path.getmtime(agents) == first_mtime  # untouched


def test_ensure_expert_workspace_refreshes_persona_when_source_newer(tmp_path, monkeypatch):
    """If a persona source file (memory) gets touched, the next call rewrites
    AGENTS.md so the in-context snapshot reflects the new content."""
    mem = tmp_path / "memory"
    monkeypatch.setattr(core, "MEMORY_DIR", str(mem))
    ws = core.ensure_expert_workspace("lawyer", str(tmp_path))
    agents = os.path.join(ws, "AGENTS.md")
    first_mtime = os.path.getmtime(agents)
    # Touch the expert's memory file so its mtime is strictly newer.
    (mem / "lawyer").mkdir(parents=True, exist_ok=True)
    memory_file = mem / "lawyer" / "MEMORY.md"
    memory_file.write_text("- Boss likes NY law.", encoding="utf-8")
    future = first_mtime + 2
    os.utime(memory_file, (future, future))
    core.ensure_expert_workspace("lawyer", str(tmp_path))
    assert os.path.getmtime(agents) > first_mtime
    assert "NY law" in open(agents, encoding="utf-8").read()  # picked up the new note


def test_ensure_expert_workspace_reconciles_skills_on_rerun(tmp_path):
    """A symlink for a skill no longer in the expert's list is removed; a
    newly-added skill gets symlinked. Exercises the diff-based reconcile."""
    ws = core.ensure_expert_workspace("lawyer", str(tmp_path))
    claude_skills = os.path.join(ws, ".claude/skills")
    # Drop a fake stale symlink + remove an expected one, then reconcile.
    stale = os.path.join(claude_skills, "ghost-skill")
    os.symlink("/nonexistent/somewhere", stale)
    # Remove one of the wanted symlinks to see it restored.
    wanted_names = list(os.listdir(claude_skills))
    if "ghost-skill" in wanted_names:
        wanted_names.remove("ghost-skill")
    victim = wanted_names[0]
    os.unlink(os.path.join(claude_skills, victim))
    core.ensure_expert_workspace("lawyer", str(tmp_path))
    after = set(os.listdir(claude_skills))
    assert "ghost-skill" not in after  # obsolete removed
    assert victim in after              # missing restored


def test_ensure_expert_workspace_empty_skills_list_leaves_dirs_empty(tmp_path):
    """An expert with `skills: []` (like chief_of_staff/operator) gets empty
    skill dirs — the FS filter matches the persona's intent literally."""
    ws = core.ensure_expert_workspace("operator", str(tmp_path))
    for skill_dir in (".claude/skills", ".agents/skills", ".vibe/skills"):
        d = os.path.join(ws, skill_dir)
        assert os.path.isdir(d)
        assert os.listdir(d) == []


def test_ensure_expert_workspace_pre_creates_memory_dirs(tmp_path, monkeypatch):
    """First-session bootstrap: the agent's first `remember X` write must not
    fail on a missing parent dir."""
    monkeypatch.setattr(core, "MEMORY_DIR", str(tmp_path / "memory"))
    core.ensure_expert_workspace("scientist", str(tmp_path / "ws-root"))
    assert (tmp_path / "memory" / "_user").is_dir()
    assert (tmp_path / "memory" / "scientist").is_dir()


def test_expert_workspace_dir_is_pure_path(tmp_path):
    """The path helper must not create anything on disk."""
    p = core.expert_workspace_dir("lawyer", str(tmp_path))
    assert p == os.path.join(str(tmp_path), "lawyer")
    assert not os.path.exists(p)


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


def test_ensure_expert_workspace_unknown_expert_does_not_litter_memory_dir(tmp_path, monkeypatch):
    """Fallback to consultant must also apply to the memory dir layout —
    no var/memory/does-not-exist/ for personas that don't exist."""
    monkeypatch.setattr(core, "MEMORY_DIR", str(tmp_path / "memory"))
    core.ensure_expert_workspace("does-not-exist", str(tmp_path / "ws"))
    assert not (tmp_path / "memory" / "does-not-exist").exists()
    assert (tmp_path / "memory" / "consultant").is_dir()


# --- concurrency -------------------------------------------------------------
def _hammer_ensure_expert_workspace(args):
    """Module-level so multiprocessing can pickle it. Each worker imports its
    own `core` fresh — matches the desktop's process-per-runner reality."""
    expert, ws_root = args
    from split import core as _core
    return _core.ensure_expert_workspace(expert, ws_root=ws_root)


def _init_concurrent_worker(memory_dir):
    """Pool initializer: each worker process needs MEMORY_DIR pointed at the
    test's tmp dir. Monkeypatch in the parent doesn't cross the `spawn`
    boundary, so we re-assign in the worker after its fresh import."""
    from split import core as _core
    _core.MEMORY_DIR = memory_dir


def test_ensure_expert_workspace_concurrent_processes_dont_race(tmp_path):
    """N parallel `python -m split.runner` processes projecting the SAME
    expert must complete without FileNotFoundError on the unlink-then-symlink
    pattern, and leave a consistent workspace.

    multiprocessing.Pool defaults to `spawn` on macOS — this is a true
    cross-process race (matches the Tauri shell spawning one runner per
    session), not a threading scenario the GIL would hide. Pre-fix this hit
    `os.unlink` after another worker had already removed the file."""
    import multiprocessing as mp
    ws_root = str(tmp_path / "ws")
    memory = str(tmp_path / "memory")
    expert = "consultant"
    ctx = mp.get_context("spawn")
    with ctx.Pool(8, initializer=_init_concurrent_worker, initargs=(memory,)) as pool:
        results = pool.map(_hammer_ensure_expert_workspace, [(expert, ws_root)] * 16)
    # Every worker returned the same canonical workspace path.
    assert all(r == os.path.join(ws_root, expert) for r in results)
    ws = os.path.join(ws_root, expert)
    # Persona + vendor shims survived the parallel projection.
    assert os.path.isfile(os.path.join(ws, "AGENTS.md"))
    for shim in ("CLAUDE.md", "GEMINI.md", "QWEN.md", "VIBE.md"):
        assert os.path.exists(os.path.join(ws, shim))
    # Skills are exactly the expected set (no extras, no missing, no half-replaced).
    allowed = core.load_experts()[expert]["skills"]
    expected = {n for n in allowed
                if os.path.isfile(os.path.join(core.SKILLS_DIR, n, "SKILL.md"))}
    for skill_dir in (".claude/skills", ".agents/skills", ".vibe/skills"):
        present = set(os.listdir(os.path.join(ws, skill_dir)))
        assert present == expected, f"{skill_dir}: {present} vs {expected}"
    # Lock dir lives at the workspace root (sibling of <expert>/), NOT inside
    # the agent's cwd — matches the "out of the agent's `ls`" invariant. (The
    # lock file itself may be reaped by filelock after release; only the dir
    # is a reliable post-condition.)
    assert os.path.isdir(os.path.join(ws_root, ".locks"))
    assert not os.path.exists(os.path.join(ws, ".locks"))
