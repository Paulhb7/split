//! Per-session on-disk archive — Rust port of `core.SessionArchive` (Python).
//! Each session gets `<var>/sessions/<sid>/{events.ndjson, meta.json}`. Events
//! are append-only; meta is rewritten atomically when fields change.
//!
//! Symmetry with the Python path: the SAME directory layout + the SAME event
//! shapes are produced. A session started on the Rust path replays in the
//! React reducer identically to one from Python — past-conversations and
//! session/resume both work regardless of which backend created the session.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::Utc;
use serde_json::{json, Value};

pub struct SessionArchive {
    // Kept for external inspection (e.g. future reveal-in-Finder action);
    // not read by the runner itself today.
    #[allow(dead_code)]
    pub dir: PathBuf,
    events_path: PathBuf,
    meta_path: PathBuf,
    meta: Mutex<serde_json::Map<String, Value>>,
}

impl SessionArchive {
    /// Open (or create) the archive dir for one session. Loads any existing
    /// meta.json so persisted fields (`acp_sid`, `title`, `started_at`)
    /// survive across runners — the same fix [we landed in core.py earlier
    /// today](split-archive-fix).
    pub fn open(sessions_dir: &std::path::Path, sid: &str, harness: &str, expert: &str) -> Self {
        let dir = sessions_dir.join(sid);
        let _ = std::fs::create_dir_all(&dir);
        let events_path = dir.join("events.ndjson");
        let meta_path = dir.join("meta.json");

        let mut existing: serde_json::Map<String, Value> = std::fs::read_to_string(&meta_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .and_then(|v| match v {
                Value::Object(m) => Some(m),
                _ => None,
            })
            .unwrap_or_default();

        // Defaults — existing keys win, missing keys filled. Matches Python.
        existing.entry("id".to_string()).or_insert(json!(sid));
        existing
            .entry("harness".to_string())
            .or_insert(json!(harness));
        existing
            .entry("expert".to_string())
            .or_insert(json!(expert));
        existing.entry("title".to_string()).or_insert(json!(""));
        existing
            .entry("started_at".to_string())
            .or_insert(json!(iso_now()));
        existing.entry("ended_at".to_string()).or_insert(json!(""));

        let archive = Self {
            dir,
            events_path,
            meta_path,
            meta: Mutex::new(existing),
        };
        archive.save_meta();
        archive
    }

    /// Append one VEVT-shaped event to events.ndjson with a wall-clock
    /// timestamp. Best-effort — failures don't propagate (matches Python).
    pub fn write_event(&self, payload: &Value) {
        let mut record = serde_json::Map::new();
        record.insert("at".to_string(), json!(iso_now()));
        if let Some(obj) = payload.as_object() {
            for (k, v) in obj {
                record.insert(k.clone(), v.clone());
            }
        }
        if let Ok(line) = serde_json::to_string(&Value::Object(record)) {
            if let Ok(mut fh) = OpenOptions::new()
                .append(true)
                .create(true)
                .open(&self.events_path)
            {
                let _ = writeln!(fh, "{line}");
            }
        }
    }

    /// Append a synthetic `{type: "turn"}` event for the user's prompt AND
    /// set the title from the first turn (≤63 chars, whitespace-collapsed).
    pub fn write_turn(&self, text: &str) {
        let record = json!({ "at": iso_now(), "type": "turn", "text": text });
        if let Ok(line) = serde_json::to_string(&record) {
            if let Ok(mut fh) = OpenOptions::new()
                .append(true)
                .create(true)
                .open(&self.events_path)
            {
                let _ = writeln!(fh, "{line}");
            }
        }
        // Title from first turn.
        let mut meta = self.meta.lock().unwrap();
        let needs_title = meta
            .get("title")
            .and_then(|v| v.as_str())
            .map(str::is_empty)
            .unwrap_or(true);
        if needs_title {
            let collapsed: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
            let title: String = collapsed.chars().take(63).collect();
            let title = title.trim().to_string();
            if !title.is_empty() {
                meta.insert("title".to_string(), json!(title));
                drop(meta);
                self.save_meta();
            }
        }
    }

    /// Persist the agent's ACP session id so a future runner with --resume
    /// can hand it back via `session/resume`. Overwrites any prior value.
    pub fn set_acp_sid(&self, acp_sid: &str) {
        self.meta
            .lock()
            .unwrap()
            .insert("acp_sid".to_string(), json!(acp_sid));
        self.save_meta();
    }

    /// Read the persisted ACP session id, if any. Used by the resume path
    /// to decide whether to call `resume_session` instead of `new_session`.
    pub fn acp_sid(&self) -> Option<String> {
        self.meta
            .lock()
            .unwrap()
            .get("acp_sid")
            .and_then(|v| v.as_str())
            .map(String::from)
    }

    /// Stamp the ended_at field. Called on graceful teardown so past-
    /// conversations sorting / "ended" badges work.
    pub fn close(&self) {
        self.meta
            .lock()
            .unwrap()
            .insert("ended_at".to_string(), json!(iso_now()));
        self.save_meta();
    }

    fn save_meta(&self) {
        let snapshot: Value = Value::Object(self.meta.lock().unwrap().clone());
        let tmp = self.meta_path.with_extension("json.tmp");
        if let Ok(serialized) = serde_json::to_string_pretty(&snapshot) {
            if let Ok(mut fh) = std::fs::File::create(&tmp) {
                if fh.write_all(serialized.as_bytes()).is_ok() {
                    let _ = std::fs::rename(&tmp, &self.meta_path);
                }
            }
        }
    }
}

fn iso_now() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S+00:00").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmpdir() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "split-archive-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn fresh_archive_writes_meta_with_defaults() {
        let dir = tmpdir();
        let arch = SessionArchive::open(&dir, "s1", "claude", "consultant");
        let meta_path = dir.join("s1").join("meta.json");
        assert!(meta_path.is_file());
        let raw = fs::read_to_string(&meta_path).unwrap();
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(v["id"], "s1");
        assert_eq!(v["harness"], "claude");
        assert_eq!(v["expert"], "consultant");
        assert_eq!(v["title"], "");
        assert!(arch.acp_sid().is_none());
    }

    #[test]
    fn reopen_preserves_acp_sid_and_title() {
        let dir = tmpdir();
        {
            let arch = SessionArchive::open(&dir, "s2", "codex", "lawyer");
            arch.set_acp_sid("acp-xyz");
            arch.write_turn("hello world");
        }
        // Re-open with the same sid: persisted fields survive.
        let arch = SessionArchive::open(&dir, "s2", "codex", "lawyer");
        assert_eq!(arch.acp_sid().as_deref(), Some("acp-xyz"));
        let meta_path = dir.join("s2").join("meta.json");
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&meta_path).unwrap()).unwrap();
        assert_eq!(v["title"], "hello world");
    }

    #[test]
    fn write_event_appends_one_line_per_call() {
        let dir = tmpdir();
        let arch = SessionArchive::open(&dir, "s3", "claude", "consultant");
        arch.write_event(&serde_json::json!({ "type": "say", "text": "hi" }));
        arch.write_event(&serde_json::json!({ "type": "status", "status": "idle" }));
        let lines: Vec<_> = fs::read_to_string(dir.join("s3").join("events.ndjson"))
            .unwrap()
            .lines()
            .map(String::from)
            .collect();
        assert_eq!(lines.len(), 2);
        let first: serde_json::Value = serde_json::from_str(&lines[0]).unwrap();
        assert_eq!(first["type"], "say");
        assert_eq!(first["text"], "hi");
        assert!(first["at"].is_string());
    }
}
