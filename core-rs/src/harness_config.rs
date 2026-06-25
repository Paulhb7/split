//! Rust port of `core.apply_hermes_config` / `core.apply_opencode_config`.
//!
//! Translates the user's local/cloud model-picker choice (saved by the
//! React panel via the `save_model_config` Tauri command into
//! `<repo>/var/state/<harness>.config.json`) into the per-harness spawn
//! adjustments the runner needs:
//!
//!   * extra CLI args prepended to the harness command line,
//!   * extra env vars applied to the child process,
//!   * for OpenCode: a managed `XDG_CONFIG_HOME` with `opencode.json`,
//!   * for Hermes: a managed `HERMES_HOME` with `config.yaml`.
//!
//! Without this port, sessions on the Rust path ignore the user's model
//! pick and fall back to whatever each harness defaults to.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

/// Result of applying the harness-specific config. `(extra_args, env_overrides)`.
pub type HarnessAdjustments = (Vec<String>, HashMap<String, String>);

pub fn apply(repo_root: &Path, var_dir: &Path, harness: &str) -> HarnessAdjustments {
    match harness {
        "hermes" => apply_hermes(repo_root, var_dir),
        "opencode" => apply_opencode(repo_root, var_dir),
        // Single-vendor subscription CLIs. They're launched via `npx`, so we
        // CANNOT prepend CLI args (those would hit `npx`, not the agent) — the
        // model is selected through env / a managed config home instead.
        // Config shape: `{ "model": "<id>", "reasoning": "<level>"? }`.
        "claude" => apply_env_model(var_dir, "claude", "ANTHROPIC_MODEL"),
        "gemini" => apply_env_model(var_dir, "gemini", "GEMINI_MODEL"),
        "codex" => apply_codex(var_dir),
        _ => (Vec::new(), HashMap::new()),
    }
}

/// Built-in default model for the env-var subscription harnesses (Claude,
/// Gemini), applied when the user hasn't picked one — so a fresh Split runs
/// these without any config (e.g. Claude defaults to Opus rather than the CLI's
/// own Sonnet). Keep in sync with `models[0]` in
/// apps/desktop/src/shared/model-picker.ts.
///
/// Codex is deliberately absent: it has NO forced default (see `apply_codex`).
/// Forcing one is account-type-dependent and breaks ChatGPT-subscription users
/// (the `*-codex` frontier models 400 with "model is not supported when using
/// Codex with a ChatGPT account"), so codex defers to its own `~/.codex` config.
fn default_model(harness: &str) -> &'static str {
    match harness {
        "claude" => "opus",
        "gemini" => "gemini-3.5-flash",
        _ => "",
    }
}

/// The model to run for a subscription harness: the user's saved choice if
/// any, else the built-in default. Empty only for an unknown harness.
fn configured_model(var_dir: &Path, harness: &str) -> String {
    load_model_config(var_dir, harness)
        .and_then(|c| c.get("model").and_then(|v| v.as_str()).map(str::to_string))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default_model(harness).to_string())
}

/// Subscription CLIs whose model is selected by a single env var
/// (Claude → `ANTHROPIC_MODEL`, Gemini → `GEMINI_MODEL`). Auth lives in a
/// separate file, so setting the model env is non-invasive.
fn apply_env_model(var_dir: &Path, harness: &str, env_key: &str) -> HarnessAdjustments {
    let model = configured_model(var_dir, harness);
    if model.is_empty() {
        return (Vec::new(), HashMap::new());
    }
    let mut env = HashMap::new();
    env.insert(env_key.to_string(), model);
    (Vec::new(), env)
}

/// Codex has no model env var; its model lives in `$CODEX_HOME/config.toml`.
/// We write a managed home with the chosen model (+ optional reasoning effort)
/// and link the user's real `auth.json` in so the session stays signed in
/// (hijacking `CODEX_HOME` without it would log the agent out).
///
/// We only do this when the user has EXPLICITLY picked a model in Split's
/// picker. With no pick we return empty adjustments — leaving `CODEX_HOME`
/// unset so codex runs against the real `~/.codex` (its own config + auth) and
/// chooses the model its account type allows. Forcing a default here is harmful:
/// `gpt-5.5-codex` (and the other `*-codex` models) are rejected for
/// ChatGPT-subscription accounts, and overriding a working `~/.codex/config.toml`
/// (e.g. the account-correct `gpt-5.5`) with it breaks the session.
fn apply_codex(var_dir: &Path) -> HarnessAdjustments {
    let cfg = load_model_config(var_dir, "codex");
    let model = cfg
        .as_ref()
        .and_then(|c| c.get("model").and_then(|v| v.as_str()))
        .map(str::to_string)
        .filter(|s| !s.is_empty());
    let Some(model) = model else {
        return (Vec::new(), HashMap::new());
    };
    let home = var_dir.join("state").join("codex-home");
    let _ = std::fs::create_dir_all(&home);

    let mut toml = format!("model = \"{model}\"\n");
    if let Some(r) = cfg
        .as_ref()
        .and_then(|c| c.get("reasoning").and_then(|v| v.as_str()))
    {
        if !r.is_empty() {
            toml.push_str(&format!("model_reasoning_effort = \"{r}\"\n"));
        }
    }
    let _ = std::fs::write(home.join("config.toml"), toml);
    link_codex_auth(&home);

    let mut env = HashMap::new();
    env.insert(
        "CODEX_HOME".to_string(),
        home.to_string_lossy().into_owned(),
    );
    (Vec::new(), env)
}

/// Link the real `~/.codex/auth.json` into the managed Codex home so the
/// session stays authenticated. Refreshed each spawn; no-op if the user
/// hasn't signed in to Codex yet.
fn link_codex_auth(home: &Path) {
    let Some(real) = home_dir().map(|h| h.join(".codex").join("auth.json")) else {
        return;
    };
    if !real.exists() {
        return;
    }
    let dest = home.join("auth.json");
    let _ = std::fs::remove_file(&dest);
    #[cfg(unix)]
    let _ = std::os::unix::fs::symlink(&real, &dest);
    #[cfg(windows)]
    let _ = std::fs::copy(&real, &dest);
}

fn home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("USERPROFILE").map(PathBuf::from)
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("HOME").map(PathBuf::from)
    }
}

fn load_model_config(var_dir: &Path, harness: &str) -> Option<Value> {
    let path = var_dir.join("state").join(format!("{harness}.config.json"));
    let raw = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn apply_hermes(_repo_root: &Path, var_dir: &Path) -> HarnessAdjustments {
    let Some(cfg) = load_model_config(var_dir, "hermes") else {
        return (Vec::new(), HashMap::new());
    };
    let mode = cfg.get("mode").and_then(|v| v.as_str()).unwrap_or("");
    if mode == "cloud" {
        let cloud = cfg.get("cloud").cloned().unwrap_or(Value::Null);
        let provider = cloud
            .get("providerId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let model = cloud.get("modelId").and_then(|v| v.as_str()).unwrap_or("");
        if !provider.is_empty() && !model.is_empty() {
            return (
                vec![
                    "-m".into(),
                    format!("{provider}/{model}"),
                    "--provider".into(),
                    provider.to_string(),
                ],
                HashMap::new(),
            );
        }
    } else if mode == "local" {
        let local = cfg.get("local").cloned().unwrap_or(Value::Null);
        let model = local.get("modelId").and_then(|v| v.as_str()).unwrap_or("");
        if !model.is_empty() {
            let home = var_dir.join("state").join("hermes-home");
            let _ = std::fs::create_dir_all(&home);
            let yaml = format!(
                "model:\n  default: \"ollama/{model}\"\n  provider: \"ollama\"\n  base_url: \"http://localhost:11434/v1\"\n"
            );
            let _ = std::fs::write(home.join("config.yaml"), yaml);
            let mut env = HashMap::new();
            env.insert(
                "HERMES_HOME".to_string(),
                home.to_string_lossy().into_owned(),
            );
            return (
                vec![
                    "-m".into(),
                    format!("ollama/{model}"),
                    "--provider".into(),
                    "ollama".into(),
                ],
                env,
            );
        }
    }
    (Vec::new(), HashMap::new())
}

fn apply_opencode(_repo_root: &Path, var_dir: &Path) -> HarnessAdjustments {
    let Some(cfg) = load_model_config(var_dir, "opencode") else {
        return (Vec::new(), HashMap::new());
    };
    let mode = cfg.get("mode").and_then(|v| v.as_str()).unwrap_or("");
    let xdg = var_dir.join("state").join("opencode-home");
    let _ = std::fs::create_dir_all(xdg.join("opencode"));
    let cfg_path = xdg.join("opencode").join("opencode.json");

    if mode == "cloud" {
        let cloud = cfg.get("cloud").cloned().unwrap_or(Value::Null);
        let provider = cloud
            .get("providerId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let model = cloud.get("modelId").and_then(|v| v.as_str()).unwrap_or("");
        if !provider.is_empty() && !model.is_empty() {
            let payload = json!({
                "$schema": "https://opencode.ai/config.json",
                "model": format!("{provider}/{model}"),
            });
            let _ = std::fs::write(
                &cfg_path,
                serde_json::to_string_pretty(&payload).unwrap_or_default(),
            );
            let mut env = HashMap::new();
            env.insert(
                "XDG_CONFIG_HOME".to_string(),
                xdg.to_string_lossy().into_owned(),
            );
            return (Vec::new(), env);
        }
    } else if mode == "local" {
        let local = cfg.get("local").cloned().unwrap_or(Value::Null);
        let model = local.get("modelId").and_then(|v| v.as_str()).unwrap_or("");
        if !model.is_empty() {
            let payload = json!({
                "$schema": "https://opencode.ai/config.json",
                "model": format!("ollama/{model}"),
                "provider": {
                    "ollama": {
                        "npm": "@ai-sdk/openai-compatible",
                        "name": "Ollama (local)",
                        "options": { "baseURL": "http://localhost:11434/v1" },
                        "models": { model: { "name": model } },
                    },
                },
            });
            let _ = std::fs::write(
                &cfg_path,
                serde_json::to_string_pretty(&payload).unwrap_or_default(),
            );
            let mut env = HashMap::new();
            env.insert(
                "XDG_CONFIG_HOME".to_string(),
                xdg.to_string_lossy().into_owned(),
            );
            return (Vec::new(), env);
        }
    }
    (Vec::new(), HashMap::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmpdir() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "split-harness-cfg-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(p.join("state")).unwrap();
        p
    }

    #[test]
    fn no_config_returns_empty_adjustments() {
        let var = tmpdir();
        let (args, env) = apply(Path::new("/repo"), &var, "hermes");
        assert!(args.is_empty());
        assert!(env.is_empty());
    }

    #[test]
    fn hermes_cloud_emits_cli_overrides() {
        let var = tmpdir();
        fs::write(
            var.join("state").join("hermes.config.json"),
            r#"{ "mode": "cloud", "cloud": { "providerId": "anthropic", "modelId": "claude-sonnet" } }"#,
        )
        .unwrap();
        let (args, env) = apply(Path::new("/repo"), &var, "hermes");
        assert_eq!(
            args,
            vec!["-m", "anthropic/claude-sonnet", "--provider", "anthropic"]
        );
        assert!(env.is_empty());
    }

    #[test]
    fn hermes_local_writes_managed_home_and_emits_env() {
        let var = tmpdir();
        fs::write(
            var.join("state").join("hermes.config.json"),
            r#"{ "mode": "local", "local": { "modelId": "llama3.2" } }"#,
        )
        .unwrap();
        let (args, env) = apply(Path::new("/repo"), &var, "hermes");
        assert_eq!(args, vec!["-m", "ollama/llama3.2", "--provider", "ollama"]);
        let home = env
            .get("HERMES_HOME")
            .expect("HERMES_HOME should be set in local mode");
        let cfg = fs::read_to_string(PathBuf::from(home).join("config.yaml")).unwrap();
        assert!(cfg.contains("ollama/llama3.2"));
        assert!(cfg.contains("http://localhost:11434/v1"));
    }

    #[test]
    fn opencode_cloud_writes_xdg_config_only() {
        let var = tmpdir();
        fs::write(
            var.join("state").join("opencode.config.json"),
            r#"{ "mode": "cloud", "cloud": { "providerId": "openai", "modelId": "gpt-4o" } }"#,
        )
        .unwrap();
        let (args, env) = apply(Path::new("/repo"), &var, "opencode");
        assert!(args.is_empty(), "opencode acp doesn't accept -m");
        let xdg = env
            .get("XDG_CONFIG_HOME")
            .expect("XDG_CONFIG_HOME should be set");
        let cfg_path = PathBuf::from(xdg).join("opencode/opencode.json");
        let cfg: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(cfg_path).unwrap()).unwrap();
        assert_eq!(cfg["model"], "openai/gpt-4o");
    }

    #[test]
    fn claude_model_emits_anthropic_env() {
        let var = tmpdir();
        fs::write(
            var.join("state").join("claude.config.json"),
            r#"{ "model": "claude-opus-4-8" }"#,
        )
        .unwrap();
        let (args, env) = apply(Path::new("/repo"), &var, "claude");
        assert!(args.is_empty(), "claude is npx-launched; no CLI args");
        assert_eq!(
            env.get("ANTHROPIC_MODEL").map(String::as_str),
            Some("claude-opus-4-8")
        );
    }

    #[test]
    fn gemini_model_emits_gemini_env() {
        let var = tmpdir();
        fs::write(
            var.join("state").join("gemini.config.json"),
            r#"{ "model": "gemini-2.5-pro" }"#,
        )
        .unwrap();
        let (args, env) = apply(Path::new("/repo"), &var, "gemini");
        assert!(args.is_empty());
        assert_eq!(
            env.get("GEMINI_MODEL").map(String::as_str),
            Some("gemini-2.5-pro")
        );
    }

    #[test]
    fn no_config_applies_default_model() {
        let var = tmpdir();
        let (_, claude) = apply(Path::new("/repo"), &var, "claude");
        assert_eq!(
            claude.get("ANTHROPIC_MODEL").map(String::as_str),
            Some("opus")
        );
        let (_, gemini) = apply(Path::new("/repo"), &var, "gemini");
        assert_eq!(
            gemini.get("GEMINI_MODEL").map(String::as_str),
            Some("gemini-3.5-flash")
        );
    }

    #[test]
    fn empty_model_falls_back_to_default() {
        let var = tmpdir();
        fs::write(
            var.join("state").join("claude.config.json"),
            r#"{ "model": "" }"#,
        )
        .unwrap();
        let (_, env) = apply(Path::new("/repo"), &var, "claude");
        assert_eq!(env.get("ANTHROPIC_MODEL").map(String::as_str), Some("opus"));
    }

    #[test]
    fn codex_no_config_leaves_codex_native() {
        // No explicit pick → no managed home, no CODEX_HOME override, so codex
        // runs against the real ~/.codex (its own config + auth + account-correct
        // default model). Forcing a default here breaks ChatGPT-subscription
        // accounts, so we deliberately do nothing.
        let var = tmpdir();
        let (args, env) = apply(Path::new("/repo"), &var, "codex");
        assert!(args.is_empty());
        assert!(env.is_empty(), "no CODEX_HOME should be set without a pick");
    }

    #[test]
    fn codex_writes_managed_home_with_model_and_reasoning() {
        let var = tmpdir();
        fs::write(
            var.join("state").join("codex.config.json"),
            r#"{ "model": "gpt-5-codex", "reasoning": "high" }"#,
        )
        .unwrap();
        let (args, env) = apply(Path::new("/repo"), &var, "codex");
        assert!(args.is_empty(), "codex is npx-launched; no CLI args");
        let home = env.get("CODEX_HOME").expect("CODEX_HOME should be set");
        let toml = fs::read_to_string(PathBuf::from(home).join("config.toml")).unwrap();
        assert!(toml.contains("model = \"gpt-5-codex\""));
        assert!(toml.contains("model_reasoning_effort = \"high\""));
    }
}
