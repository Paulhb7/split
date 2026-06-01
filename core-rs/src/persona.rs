//! Persona + skill projection for the native Rust runner — Rust port of the
//! relevant pieces of `split/core.py` (memory_text, persona_text,
//! _refresh_persona, _refresh_skills, ensure_expert_workspace).
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
use std::os::unix::fs::symlink;
use std::path::{Path, PathBuf};

/// Project an expert's persona + allowed skills into a per-expert workspace
/// under `<workspace_root>/<expert>/`. Returns that path (the agent's cwd).
///
/// Arguments:
/// * `repo_root` — where `config/experts/`, `config/experts.json`,
///   `config/skills/`, `config/harnesses.json` live.
/// * `var_dir` — where `var/memory/` (cross-session memory snapshot) lives.
/// * `workspace_root` — usually `<var_dir>/workspace/`, overridable via the
///   caller's `SPLIT_WORKSPACE` env var.
/// * `expert` — slug to project. Falls back to `consultant` if no
///   `<expert>.md` is on disk.
pub fn ensure_expert_workspace(
    repo_root: &Path,
    var_dir: &Path,
    workspace_root: &Path,
    expert: &str,
) -> PathBuf {
    let expert = resolve_expert(repo_root, expert);
    let ws = workspace_root.join(&expert);
    let _ = std::fs::create_dir_all(&ws);

    refresh_persona(repo_root, var_dir, &expert, &ws);
    refresh_skills(repo_root, &expert, &ws);
    ws
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
fn refresh_persona(repo_root: &Path, var_dir: &Path, expert: &str, ws: &Path) {
    // Memory dirs created upfront so the agent's first write never fails.
    let _ = std::fs::create_dir_all(var_dir.join("memory/_user"));
    let _ = std::fs::create_dir_all(var_dir.join("memory").join(expert));

    let body = persona_text(repo_root, var_dir, expert);
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

/// Date header + `_discipline.md` preamble + memory snapshot + persona body.
/// Same composition as Python's `core.persona_text`.
fn persona_text(repo_root: &Path, var_dir: &Path, expert: &str) -> String {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let year = &today[..4];
    let date_header = format!(
        "**Today is {today}.** Current year: {year}. \
         For \"this year\" / \"latest\" / \"recent\" / \"now\" queries, \
         resolve to {year} — never default to your training cutoff. \
         When formulating web searches, prefer freshness keywords \
         (\"latest\", \"this week\", \"past 30 days\") over hard-coded years.\n\n"
    );

    let preamble =
        read_if_exists(&repo_root.join("config/experts/_discipline.md")).unwrap_or_default();
    let memory = memory_text(var_dir, expert);
    let persona = read_if_exists(
        &repo_root
            .join("config/experts")
            .join(format!("{expert}.md")),
    )
    .unwrap_or_default();

    format!("{date_header}{preamble}{memory}{persona}")
}

/// "What you remember" section — projected into every persona at session
/// start. Empty bodies show a stub (mirrors Python).
fn memory_text(var_dir: &Path, expert: &str) -> String {
    let user_path = var_dir.join("memory/_user/USER.md");
    let expert_path = var_dir.join("memory").join(expert).join("MEMORY.md");
    let user_body = read_if_exists(&user_path).unwrap_or_else(|| {
        "_(nothing yet — append here when the boss tells you something to remember about them)_"
            .to_string()
    });
    let expert_body = read_if_exists(&expert_path).unwrap_or_else(|| {
        "_(nothing yet — append here when you learn something useful for next session)_".to_string()
    });
    format!(
        "## What you remember (read first)\n\n\
         Persistent notes from past sessions. Plain Markdown — read them, let \
         them shape your reply, append when you learn something durable. \
         Tight entries (1-3 lines), no chronology.\n\n\
         **About the boss** — `{}`\n\n{}\n\n\
         **Your own notes** — `{}`\n\n{}\n\n---\n\n\n",
        user_path.display(),
        user_body,
        expert_path.display(),
        expert_body,
    )
}

/// Reconcile each harness's skill_dir (read from harnesses.json) with the
/// expert's allowed list (read from experts.json). Idempotent: the symlinks
/// that should be there end up there, the obsolete ones are gone.
fn refresh_skills(repo_root: &Path, expert: &str, ws: &Path) {
    let skill_dirs = all_harness_skill_dirs(repo_root);
    let allowed = expert_skills(repo_root, expert);
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
pub fn persona_text_for_injection(repo_root: &Path, var_dir: &Path, expert: &str) -> String {
    let expert = resolve_expert(repo_root, expert);
    persona_text(repo_root, var_dir, &expert)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_repo_fixture(tmp: &Path) -> (PathBuf, PathBuf) {
        // Minimal fixture mirroring `<repo>/config/{experts.json, experts/,
        // skills/, harnesses.json}` so the persona projection can run end-
        // to-end without network or external state.
        let repo = tmp.join("repo");
        let var = tmp.join("var");
        fs::create_dir_all(repo.join("config/experts")).unwrap();
        fs::create_dir_all(repo.join("config/skills/foo")).unwrap();
        fs::create_dir_all(repo.join("config/skills/bar")).unwrap();
        fs::create_dir_all(&var).unwrap();

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

        (repo, var)
    }

    #[test]
    fn projects_persona_and_shims() {
        let tmp = tempfile_in();
        let (repo, var) = make_repo_fixture(&tmp);
        let ws_root = tmp.join("workspaces");
        fs::create_dir_all(&ws_root).unwrap();

        let ws = ensure_expert_workspace(&repo, &var, &ws_root, "lawyer");
        assert!(ws.join("AGENTS.md").is_file());
        let body = fs::read_to_string(ws.join("AGENTS.md")).unwrap();
        assert!(body.contains("# Lawyer persona body"));
        // Cross-vendor shims must symlink AGENTS.md.
        for shim in &["CLAUDE.md", "GEMINI.md", "QWEN.md", "VIBE.md"] {
            let p = ws.join(shim);
            assert!(p.symlink_metadata().is_ok(), "{shim} missing");
            let target = fs::read_link(&p).unwrap();
            assert_eq!(target, std::path::PathBuf::from("AGENTS.md"));
        }
        assert!(ws.join(".vibe/AGENTS.md").symlink_metadata().is_ok());
    }

    #[test]
    fn projects_skill_symlinks_filtered_by_experts_json() {
        let tmp = tempfile_in();
        let (repo, var) = make_repo_fixture(&tmp);
        let ws_root = tmp.join("workspaces");
        fs::create_dir_all(&ws_root).unwrap();

        let ws = ensure_expert_workspace(&repo, &var, &ws_root, "lawyer");
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
        let (repo, var) = make_repo_fixture(&tmp);
        let ws_root = tmp.join("workspaces");
        fs::create_dir_all(&ws_root).unwrap();

        // No `nonsense.md` on disk → resolve to consultant.
        let ws = ensure_expert_workspace(&repo, &var, &ws_root, "nonsense");
        assert_eq!(ws, ws_root.join("consultant"));
        let body = fs::read_to_string(ws.join("AGENTS.md")).unwrap();
        assert!(body.contains("# Consultant persona body"));
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
