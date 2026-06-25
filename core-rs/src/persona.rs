//! Persona + skill projection for the native Rust runner — Rust port of the
//! relevant pieces of `split/core.py` (persona_text, _refresh_persona,
//! _refresh_skills, ensure_expert_workspace).
//!
//! Why a port and not a shell-out to Python: the whole point of the rust-port
//! branch is the bundled `.dmg` standing on its own. Calling Python from here
//! would defeat that goal.
//!
//! Scoped down for the first pass:
//!   - SHIPPED experts only (config/experts/<slug>.md + config/experts.json).
//!     Custom experts under var/experts/ (Paul's parallel work on the
//!     Recruiter flow) come back when his branch lands and we re-merge.
//!   - No cross-process file lock. The Python runner uses `filelock` to
//!     serialise per-expert projection across runners; the Rust path is
//!     single-threaded per expert inside one Tauri process and we expect
//!     users to pick one backend at a time, so the race window is small.
//!   - Always refresh, no mtime gate. Costs a few ms of fs::write on every
//!     session start; far less risky than getting the mtime comparison
//!     subtly wrong and serving stale persona.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The user-chosen vault location (set in onboarding, persisted by the desktop
/// shell and re-applied at startup). `None` = fall back to the default. Takes
/// precedence over the built-in default but NOT over an explicit `SPLIT_VAULT`
/// env var, so tests and power users keep that escape hatch.
static VAULT_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Set (or clear, with `None`) the in-process vault-location override. Only
/// touches process state; persistence to disk is the desktop shell's job.
pub fn set_vault_override(path: Option<PathBuf>) {
    if let Ok(mut g) = VAULT_OVERRIDE.lock() {
        *g = path.filter(|p| !p.as_os_str().is_empty());
    }
}

// Cross-platform symlink shim. On Unix we create real symlinks, so the
// projected workspace stays a thin view over `config/`. On Windows symlink
// creation needs elevated privilege / Developer Mode, so we deliberately fail
// here and let every call site fall back to copying the skill dir / writing the
// persona body — the projection is correct either way, just not deduplicated
// (re-copied each session).
#[cfg(unix)]
fn symlink<P: AsRef<Path>, Q: AsRef<Path>>(src: P, dst: Q) -> std::io::Result<()> {
    std::os::unix::fs::symlink(src, dst)
}

#[cfg(not(unix))]
fn symlink<P: AsRef<Path>, Q: AsRef<Path>>(_src: P, _dst: Q) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "symlinks not used on this platform; falling back to copy",
    ))
}

/// Project an expert's persona + allowed skills into a per-expert workspace
/// under `<workspace_root>/<expert>/`. Returns that path (the agent's cwd).
///
/// Arguments:
/// * `repo_root` — where `config/experts/`, `config/experts.json`,
///   `config/skills/`, `config/harnesses.json` live.
/// * `workspace_root` — usually `<var_dir>/workspace/`, overridable via the
///   caller's `SPLIT_WORKSPACE` env var.
/// * `expert` — slug to project. Falls back to `consultant` if no
///   `<expert>.md` is on disk.
/// * `project` — the vault project pinned on this session (the composer's
///   `#project` chip); empty = none. Per-session, NOT process state: it only
///   shapes the projected persona's "Your vault" block.
pub fn ensure_expert_workspace(
    repo_root: &Path,
    workspace_root: &Path,
    expert: &str,
    project: &str,
) -> PathBuf {
    let expert = resolve_expert(repo_root, expert);
    let ws = workspace_root.join(&expert);
    let _ = std::fs::create_dir_all(&ws);

    refresh_persona(repo_root, &expert, &ws, project);
    refresh_skills(repo_root, &expert, &ws);
    ws
}

/// The boss's vault — the plain-markdown folder where every expert files
/// durable work and durable facts (the native successor to the retired
/// Obsidian / Notion workspace backends). Resolution order: `SPLIT_VAULT` env
/// (tests, power users) → the user's onboarding choice (`set_vault_override`)
/// → `~/Documents/SplitVault`. Deliberately OUTSIDE `var/` because it's the
/// boss's data, not app state: it survives a reinstall, syncs with iCloud, and
/// opens in any other markdown tool.
pub fn vault_root() -> PathBuf {
    if let Ok(p) = std::env::var("SPLIT_VAULT") {
        if !p.trim().is_empty() {
            return PathBuf::from(p);
        }
    }
    if let Some(p) = VAULT_OVERRIDE.lock().ok().and_then(|g| g.clone()) {
        return p;
    }
    #[cfg(windows)]
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    #[cfg(not(windows))]
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join("Documents").join("SplitVault")
}

/// Create the vault skeleton + seed files. Idempotent: existing files are
/// never overwritten. Called from the desktop shell at session start (NOT
/// from `persona_text`, so unit-testing the projection never writes into a
/// real `~/Documents`).
pub fn ensure_vault(root: &Path) {
    let _ = std::fs::create_dir_all(root.join("_meta"));
    let _ = std::fs::create_dir_all(root.join("notes"));
    let _ = std::fs::create_dir_all(root.join("projects"));

    let index = root.join("INDEX.md");
    if !index.exists() {
        let _ = std::fs::write(
            &index,
            "# Vault index — the scope list\n\n\
             One line per scope. Agents: when you create `projects/<slug>/`, add its \
             line here (path + one-line description). Keep this file SHORT — it is \
             injected into every session.\n\n\
             - `_meta/boss-profile.md` — durable facts about the boss (read first)\n\
             - `notes/` — one-off outputs and facts not tied to a project\n",
        );
    }
    let profile = root.join("_meta").join("boss-profile.md");
    if !profile.exists() {
        let _ = std::fs::write(
            &profile,
            "# Boss profile\n\n## Role\n\n## Working preferences\n\n## Tone\n\n## Constraints\n",
        );
    }
}

/// Fallback to `consultant` when the requested persona isn't vendored.
fn resolve_expert(repo_root: &Path, expert: &str) -> String {
    if repo_root
        .join("config/experts")
        .join(format!("{expert}.md"))
        .is_file()
    {
        expert.to_string()
    } else {
        "consultant".to_string()
    }
}

/// Write `<ws>/AGENTS.md` from the composed persona body, then symlink the
/// cross-vendor shims (CLAUDE.md / GEMINI.md / QWEN.md / VIBE.md + .vibe/
/// AGENTS.md) so any harness finds its character file at the path it scans.
fn refresh_persona(repo_root: &Path, expert: &str, ws: &Path, project: &str) {
    let body = persona_text(repo_root, expert, project);
    let canonical = ws.join("AGENTS.md");
    let _ = std::fs::remove_file(&canonical);
    let _ = std::fs::write(&canonical, &body);

    for shim in &["CLAUDE.md", "GEMINI.md", "QWEN.md", "VIBE.md"] {
        let out = ws.join(shim);
        let _ = std::fs::remove_file(&out);
        if symlink("AGENTS.md", &out).is_err() {
            // Fallback when symlinks aren't permitted (sandboxed FS): copy.
            let _ = std::fs::write(&out, &body);
        }
    }

    let vibe = ws.join(".vibe");
    let _ = std::fs::create_dir_all(&vibe);
    let vibe_shim = vibe.join("AGENTS.md");
    let _ = std::fs::remove_file(&vibe_shim);
    if symlink("../AGENTS.md", &vibe_shim).is_err() {
        let _ = std::fs::write(&vibe_shim, &body);
    }
}

/// Date header + `_discipline.md` preamble + vault block + persona body.
/// Same composition as Python's `core.persona_text`.
fn persona_text(repo_root: &Path, expert: &str, project: &str) -> String {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let year = &today[..4];
    let date_header = format!(
        "**Today is {today}.** Current year: {year}. \
         For \"this year\" / \"latest\" / \"recent\" / \"now\" queries, \
         resolve to {year} — never default to your training cutoff. \
         When formulating web searches, prefer freshness keywords \
         (\"latest\", \"this week\", \"past 30 days\") over hard-coded years.\n\n"
    );

    // Workspace boundary + format preference. Two rules in one block because
    // they share the same motivation: make the deliverable visible AND
    // useful inside Split's in-app viewer.
    //   (1) cwd-only — files outside the workspace are invisible to the
    //       snapshot/diff and never reach the artifact strip.
    //   (2) prefer .md — Split renders markdown inline and offers an edit
    //       + PDF-export flow on it; .docx becomes a "Binary file" card
    //       that only opens in Word.
    let workspace_rule = "**Deliverables stay in your workspace.** Every file you produce \
        — documents, code, images, exports — must be written inside the current working \
        directory. Do NOT write to `~/Desktop`, `~/Documents`, `~/Downloads`, or any \
        absolute path outside cwd. If the boss says \"put it on the Desktop\" or names a \
        path outside cwd, save it under cwd anyway and tell them the local path in your \
        reply. Split watches cwd to surface what you produce — files outside it are \
        invisible to the app. The ONE exception is the boss's vault (`$SPLIT_VAULT`, see \
        \"Your vault\" below) — durable work and durable facts are filed there per the \
        `vault` skill.\n\n\
        **For text deliverables (briefs, essays, notes, reports, plans, drafts) default \
        to Markdown (`.md`).** Split renders markdown inline in the viewer; the boss can \
        edit it in-app and export to PDF in one click. Only reach for `.docx`/`.pptx`/\
        `.xlsx` when the boss explicitly asks for that format (template requirement, \
        track-changes, Excel formulas, etc.) — those open in Word/Excel and can't be \
        previewed inside Split.\n\n";

    let preamble =
        read_if_exists(&repo_root.join("config/experts/_discipline.md")).unwrap_or_default();
    let workspace = vault_text(expert, project);
    let persona = read_if_exists(
        &repo_root
            .join("config/experts")
            .join(format!("{expert}.md")),
    )
    .unwrap_or_default();

    format!("{date_header}{workspace_rule}{preamble}{workspace}{persona}")
}

/// The expert slug as it appears in the `agent:` frontmatter / property of
/// every note this expert writes. Strips the internal `genius_` taxonomy
/// prefix (the boss reads "davinci", not "genius_davinci"). Keeps `coach_`
/// because "diet" alone is ambiguous. Otherwise the slug passes through.
fn agent_tag(expert: &str) -> String {
    if let Some(rest) = expert.strip_prefix("genius_") {
        rest.to_string()
    } else {
        expert.to_string()
    }
}

/// Dynamic "Your vault" block — the native filesystem vault, always present
/// (no connect step). Slim by design: the heavy doctrine (buckets, frontmatter
/// vocab, index discipline, propose-a-project flow) lives in the auto-mounted
/// `vault` skill. This block states the session-specific facts: the vault
/// path, your agent slug, the scope list (INDEX.md inlined — that's the
/// boot-time recall trigger), and the resolved write target for the session's
/// pinned project (the composer's `#project` chip; empty = none).
fn vault_text(expert: &str, project: &str) -> String {
    let root = vault_root();
    let path = root.display();
    let agent = agent_tag(expert);
    let project_hint = project.trim().to_string();
    let index = read_if_exists(&root.join("INDEX.md"))
        .unwrap_or_else(|| "_(vault not initialized yet — created at first session)_".into());
    let write_target = if project_hint.is_empty() {
        format!("`{path}/notes/<today>-{agent}-<short>.md`")
    } else {
        format!("`{path}/projects/{project_hint}/<today>-{agent}-<short>.md`")
    };
    let project_state = if project_hint.is_empty() {
        "no project set — default to `notes/`. Apply rule 2 of the `vault` \
         skill: if the conversation produces durable work tied to a named entity \
         + horizon, propose a project at the end of your reply."
            .to_string()
    } else {
        format!(
            "project `{project_hint}` is set on this session. Write directly to \
             `projects/{project_hint}/` and keep its `MEMORY.md` index current \
             (one line per file — see the `vault` skill)."
        )
    };
    format!(
        "## Your vault\n\n\
         The boss's vault is a plain-markdown folder at `{path}` (also exported \
         as `$SPLIT_VAULT`). It is the ONE exception to the \"stay in cwd\" rule: \
         durable deliverables and durable facts go in the vault; scratch work \
         stays in cwd.\n\n\
         - Your `agent:` slug for every frontmatter is `{agent}`.\n\
         - Read `{path}/_meta/boss-profile.md` FIRST every session.\n\
         - Write target this session: {write_target}\n\
         - Project state: {project_state}\n\n\
         ### Vault index (scope list, as of session start)\n\n\
         {index}\n\n\
         Before working inside a project, read its `MEMORY.md` index; open \
         individual files only when their index line is relevant. The full \
         doctrine (buckets, frontmatter vocab, index discipline, when to write / \
         when not to, how to propose a project) is in the `vault` skill — read \
         it once if you haven't.\n\n---\n\n\n"
    )
}

/// Reconcile each harness's skill_dir (read from harnesses.json) with the
/// expert's allowed list (read from experts.json). Idempotent: the symlinks
/// that should be there end up there, the obsolete ones are gone.
fn refresh_skills(repo_root: &Path, expert: &str, ws: &Path) {
    let skill_dirs = all_harness_skill_dirs(repo_root);
    let mut allowed = expert_skills(repo_root, expert);
    // The `vault` skill is the doctrine for the vault — the bucket model,
    // the frontmatter vocab, the index discipline, the "propose a project"
    // gesture. Mounted on EVERY expert: the vault is always there, and writes
    // go through plain filesystem operations (no per-backend API skill).
    if !allowed.contains(&"vault".to_string()) {
        allowed.push("vault".to_string());
    }
    let skills_root = repo_root.join("config/skills");
    let valid: Vec<String> = allowed
        .into_iter()
        .filter(|name| skills_root.join(name).join("SKILL.md").is_file())
        .collect();
    let wanted: HashSet<&str> = valid.iter().map(|s| s.as_str()).collect();

    for skill_dir in &skill_dirs {
        let target_dir = ws.join(skill_dir);
        let _ = std::fs::create_dir_all(&target_dir);

        // Drop obsolete entries.
        if let Ok(entries) = std::fs::read_dir(&target_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !wanted.contains(name.as_str()) {
                    let stale = entry.path();
                    if stale.is_symlink() || stale.is_file() {
                        let _ = std::fs::remove_file(&stale);
                    } else if stale.is_dir() {
                        let _ = std::fs::remove_dir_all(&stale);
                    }
                }
            }
        }

        // Add (or refresh) wanted entries as symlinks to config/skills/<name>.
        for name in &valid {
            let src = skills_root.join(name);
            let src_abs = src.canonicalize().unwrap_or(src);
            let dest = target_dir.join(name);

            if dest.is_symlink() {
                if std::fs::read_link(&dest).ok().as_deref() == Some(&src_abs) {
                    continue;
                }
                let _ = std::fs::remove_file(&dest);
            } else if dest.is_dir() {
                let _ = std::fs::remove_dir_all(&dest);
            } else if dest.is_file() {
                let _ = std::fs::remove_file(&dest);
            }
            if symlink(&src_abs, &dest).is_err() {
                let _ = copy_dir(&src_abs, &dest);
            }
        }
    }
}

/// Distinct `skill_dir` values across `config/harnesses.json`. Mirrors
/// Python's `_all_skill_dirs`.
fn all_harness_skill_dirs(repo_root: &Path) -> Vec<String> {
    let Ok(raw) = std::fs::read_to_string(repo_root.join("config/harnesses.json")) else {
        return vec![];
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return vec![];
    };
    let Some(obj) = val.as_object() else {
        return vec![];
    };
    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<String> = Vec::new();
    for (k, v) in obj {
        if k.starts_with('_') {
            continue;
        }
        if let Some(d) = v.get("skill_dir").and_then(|x| x.as_str()) {
            if seen.insert(d.to_string()) {
                out.push(d.to_string());
            }
        }
    }
    out
}

/// Allowed skills for one expert. Mirrors `experts.json[expert].skills`.
fn expert_skills(repo_root: &Path, expert: &str) -> Vec<String> {
    let Ok(raw) = std::fs::read_to_string(repo_root.join("config/experts.json")) else {
        return vec![];
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return vec![];
    };
    val.get(expert)
        .and_then(|v| v.get("skills"))
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn read_if_exists(path: &Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir(&entry.path(), &dst_path)?;
        } else {
            std::fs::copy(entry.path(), dst_path)?;
        }
    }
    Ok(())
}

/// Compose the persona body for first-turn injection (cross-vendor system
/// prompt shim). Exposed to the runner so it can prepend it to the user's
/// first prompt, matching what `split.runner` does today.
pub fn persona_text_for_injection(repo_root: &Path, expert: &str, project: &str) -> String {
    let expert = resolve_expert(repo_root, expert);
    persona_text(repo_root, &expert, project)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_repo_fixture(tmp: &Path) -> PathBuf {
        // Minimal fixture mirroring `<repo>/config/{experts.json, experts/,
        // skills/, harnesses.json}` so the persona projection can run end-
        // to-end without network or external state.
        let repo = tmp.join("repo");
        fs::create_dir_all(repo.join("config/experts")).unwrap();
        fs::create_dir_all(repo.join("config/skills/foo")).unwrap();
        fs::create_dir_all(repo.join("config/skills/bar")).unwrap();

        fs::write(
            repo.join("config/harnesses.json"),
            r#"{
              "claude": { "skill_dir": ".claude/skills" },
              "codex":  { "skill_dir": ".agents/skills" }
            }"#,
        )
        .unwrap();
        fs::write(
            repo.join("config/experts.json"),
            r#"{ "lawyer": { "skills": ["foo"] }, "consultant": { "skills": [] } }"#,
        )
        .unwrap();
        fs::write(
            repo.join("config/experts/lawyer.md"),
            "# Lawyer persona body\n",
        )
        .unwrap();
        fs::write(
            repo.join("config/experts/consultant.md"),
            "# Consultant persona body\n",
        )
        .unwrap();
        fs::write(repo.join("config/skills/foo/SKILL.md"), "# foo skill\n").unwrap();
        fs::write(repo.join("config/skills/bar/SKILL.md"), "# bar skill\n").unwrap();

        repo
    }

    #[test]
    fn projects_persona_and_shims() {
        let tmp = tempfile_in();
        let repo = make_repo_fixture(&tmp);
        let ws_root = tmp.join("workspaces");
        fs::create_dir_all(&ws_root).unwrap();

        let ws = ensure_expert_workspace(&repo, &ws_root, "lawyer", "");
        assert!(ws.join("AGENTS.md").is_file());
        let body = fs::read_to_string(ws.join("AGENTS.md")).unwrap();
        assert!(body.contains("# Lawyer persona body"));
        // Cross-vendor shims must exist and carry the persona body. On Unix they
        // are symlinks to AGENTS.md; on platforms without symlinks they are
        // copies (same content) — assert the strong symlink shape only on Unix.
        for shim in &["CLAUDE.md", "GEMINI.md", "QWEN.md", "VIBE.md"] {
            let p = ws.join(shim);
            assert!(p.symlink_metadata().is_ok(), "{shim} missing");
            #[cfg(unix)]
            {
                let target = fs::read_link(&p).unwrap();
                assert_eq!(target, std::path::PathBuf::from("AGENTS.md"));
            }
            #[cfg(not(unix))]
            {
                assert!(fs::read_to_string(&p)
                    .unwrap()
                    .contains("# Lawyer persona body"));
            }
        }
        assert!(ws.join(".vibe/AGENTS.md").symlink_metadata().is_ok());
    }

    #[test]
    fn projects_skill_symlinks_filtered_by_experts_json() {
        let tmp = tempfile_in();
        let repo = make_repo_fixture(&tmp);
        let ws_root = tmp.join("workspaces");
        fs::create_dir_all(&ws_root).unwrap();

        let ws = ensure_expert_workspace(&repo, &ws_root, "lawyer", "");
        // Lawyer allows `foo` only — `bar` exists in config/skills but isn't
        // listed, so it MUST NOT appear under any skill_dir.
        for skill_dir in &[".claude/skills", ".agents/skills"] {
            assert!(
                ws.join(skill_dir).join("foo").exists(),
                "foo missing under {skill_dir}"
            );
            assert!(
                !ws.join(skill_dir).join("bar").exists(),
                "bar leaked under {skill_dir}"
            );
        }
    }

    #[test]
    fn falls_back_to_consultant_when_persona_missing() {
        let tmp = tempfile_in();
        let repo = make_repo_fixture(&tmp);
        let ws_root = tmp.join("workspaces");
        fs::create_dir_all(&ws_root).unwrap();

        // No `nonsense.md` on disk → resolve to consultant.
        let ws = ensure_expert_workspace(&repo, &ws_root, "nonsense", "");
        assert_eq!(ws, ws_root.join("consultant"));
        let body = fs::read_to_string(ws.join("AGENTS.md")).unwrap();
        assert!(body.contains("# Consultant persona body"));
    }

    #[test]
    fn ensure_vault_seeds_layout_idempotently() {
        let tmp = tempfile_in();
        let vault = tmp.join("vault");

        ensure_vault(&vault);
        for sub in &["_meta", "notes", "projects"] {
            assert!(vault.join(sub).is_dir(), "{sub} missing");
        }
        let index = vault.join("INDEX.md");
        let profile = vault.join("_meta/boss-profile.md");
        assert!(index.is_file());
        assert!(profile.is_file());

        // Idempotent: a second run must NOT clobber user content.
        fs::write(&index, "# customized index\n").unwrap();
        fs::write(&profile, "# customized profile\n").unwrap();
        ensure_vault(&vault);
        assert_eq!(fs::read_to_string(&index).unwrap(), "# customized index\n");
        assert_eq!(
            fs::read_to_string(&profile).unwrap(),
            "# customized profile\n"
        );
    }

    fn tempfile_in() -> PathBuf {
        // Lightweight per-test tempdir — std doesn't ship a tempdir helper.
        let p = std::env::temp_dir().join(format!(
            "split-core-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }
}
