//! `split-core` — Split's portable Rust engine.
//!
//! This crate holds the pure building blocks that the Tauri front (and any
//! future Rust front — a CLI runner, an HTTP gateway, a CI smoke harness)
//! consumes to drive an ACP session end-to-end:
//!
//! * [`persona`] — workspace projection (AGENTS.md + cross-vendor shims +
//!   skill symlinks). Mirrors `split.core.ensure_expert_workspace`.
//! * [`archive`] — per-session `events.ndjson` + `meta.json` with
//!   `acp_sid` persistence for session/resume. Mirrors
//!   `split.core.SessionArchive`.
//! * [`permissions`] — allow/ask/deny rule engine with `DEFAULT_DENY`
//!   guards, expert prefixes, MCP server matching, fnmatch globbing.
//!   Mirrors `split.permissions`.
//! * [`harness_config`] — Hermes/OpenCode model-picker translation
//!   (CLI args + managed config dir). Mirrors
//!   `split.core.apply_{hermes,opencode}_config`.
//! * [`detection`] — portable wire types + pure `--version`-probe
//!   classification behind the desktop "scan your machine" onboarding
//!   (the I/O lives in the desktop crate's `scan_harnesses`).
//!
//! What is NOT here, intentionally:
//!   * The ACP runner itself — it depends on the `agent-client-protocol`
//!     SDK + a transport-layer notion (Tauri's `AppHandle` for event emit).
//!     It lives in the desktop crate (`apps/desktop/src-tauri/src/runner.rs`)
//!     for now, with the option to extract once a second front needs it.
//!   * Tauri commands / IPC plumbing.

pub mod archive;
pub mod detection;
pub mod harness_config;
pub mod permissions;
pub mod persona;
