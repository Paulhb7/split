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
use std::path::Path;

use serde_json::{json, Value};

/// Result of applying the harness-specific config. `(extra_args, env_overrides)`.
pub type HarnessAdjustments = (Vec<String>, HashMap<String, String>);

pub fn apply(repo_root: &Path, var_dir: &Path, harness: &str) -> HarnessAdjustments {
    match harness {
        "hermes" => apply_hermes(repo_root, var_dir),
        "opencode" => apply_opencode(repo_root, var_dir),
        _ => (Vec::new(), HashMap::new()),
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
}
