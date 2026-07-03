//! Harness detection — the portable shape and pure classification behind the
//! desktop "scan your machine" onboarding.
//!
//! The I/O (resolving a binary on PATH, spawning `--version`, reading the
//! keychain, emitting Tauri events) lives in the desktop crate because it needs
//! `child_path()` / `command_on_path()` / the `keyring`. What lives HERE is the
//! pure, testable core: the wire types every front renders, and the
//! classification of a `--version` probe outcome into "invocable or not, and if
//! not, why".
//!
//! The design goal: **one shape answers
//! three questions** — is the harness detected? installed? authenticated? — and
//! every unavailable/unauthenticated result carries its own actionable remedy
//! (`Diagnostic { fix }`) so the UI binds buttons instead of re-deriving logic.

use serde::{Deserialize, Serialize};

/// Sign-in state of a detected harness.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum AuthState {
    /// Credentials present (creds dotfile, env var, or keychain key).
    Ok,
    /// No credentials found — the user must sign in.
    Missing,
    /// We can't tell (e.g. a model-agnostic local runtime that needs no key,
    /// or an `external` configure that only links to docs).
    Unknown,
}

/// What the UI should DO about a diagnostic — each renders as one button.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum FixAction {
    /// Install the vendor CLI / runtime (Install button or docs link).
    Install,
    /// Launch the browser/device sign-in.
    Login,
    /// Open an inline API-key field.
    SetKey,
    /// Open the install/usage docs.
    OpenDocs,
    /// Re-run the scan.
    Rescan,
}

/// Why a harness is unavailable or unauthenticated.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum DiagnosticKind {
    /// The vendor CLI was not found anywhere we looked.
    NotOnPath,
    /// Resolved, but the OS refused to exec it (EACCES / exit 126).
    NotExecutable,
    /// Resolved a shim/wrapper whose target is missing (ENOENT / exit 127).
    ShimBroken,
    /// Installed and invocable, but not signed in.
    AuthMissing,
}

impl DiagnosticKind {
    /// The button a diagnostic of this kind should offer by default.
    pub fn default_fix(self) -> FixAction {
        match self {
            DiagnosticKind::NotOnPath
            | DiagnosticKind::NotExecutable
            | DiagnosticKind::ShimBroken => FixAction::Install,
            DiagnosticKind::AuthMissing => FixAction::Login,
        }
    }
}

/// One actionable problem with a harness.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Diagnostic {
    pub kind: DiagnosticKind,
    pub message: String,
    pub fix: FixAction,
}

impl Diagnostic {
    /// Build a diagnostic with the kind's default fix action.
    pub fn new(kind: DiagnosticKind, message: impl Into<String>) -> Self {
        Self {
            fix: kind.default_fix(),
            kind,
            message: message.into(),
        }
    }

    /// Build a diagnostic overriding the fix action (e.g. an `external`
    /// runtime whose "install" is really an Open-Docs link).
    pub fn with_fix(kind: DiagnosticKind, message: impl Into<String>, fix: FixAction) -> Self {
        Self {
            kind,
            message: message.into(),
            fix,
        }
    }
}

/// The health record for one harness — the single shape the UI binds
/// (def minus closures, plus probe results).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectedHarness {
    pub id: String,
    /// The vendor CLI resolved AND `--version` was invocable.
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Absolute (or repo-relative) path the probe resolved.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub auth: AuthState,
    /// The harness's `install.kind` (npx / external / binary / script). Lets the
    /// UI gate usability correctly: npx launches lazily so only `auth` matters,
    /// while external/binary harnesses genuinely require `available`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub install_kind: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<Diagnostic>,
}

impl DetectedHarness {
    /// A harness whose vendor CLI we could not resolve/invoke.
    pub fn unavailable(id: impl Into<String>, diagnostic: Diagnostic) -> Self {
        Self {
            id: id.into(),
            available: false,
            version: None,
            path: None,
            auth: AuthState::Unknown,
            install_kind: None,
            diagnostics: vec![diagnostic],
        }
    }

    /// Set the install kind (builder-style), used by the desktop scan.
    pub fn with_install_kind(mut self, kind: Option<String>) -> Self {
        self.install_kind = kind;
        self
    }

    /// A harness that resolved and ran. `auth` still says whether it's signed
    /// in; an `AuthMissing` diagnostic is appended automatically when not.
    pub fn available(
        id: impl Into<String>,
        version: Option<String>,
        path: impl Into<String>,
        auth: AuthState,
    ) -> Self {
        let mut diagnostics = Vec::new();
        if auth == AuthState::Missing {
            diagnostics.push(Diagnostic::new(
                DiagnosticKind::AuthMissing,
                "Installed but not signed in.",
            ));
        }
        Self {
            id: id.into(),
            available: true,
            version,
            path: Some(path.into()),
            auth,
            install_kind: None,
            diagnostics,
        }
    }
}

/// Outcome of a `--version` probe, before we know the version string.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum VersionProbe {
    /// The bin spawned (whether or not `--version` was happy). Version, if read.
    Invocable(Option<String>),
    /// The bin could not be invoked; carries why.
    NotInvocable(DiagnosticKind),
}

/// Classify a finished `--version` run by its exit code: 126 = present-but-not-executable,
/// 127 = command-not-found (a broken shim that resolved but whose target is
/// gone). Any other exit (0, generic non-zero, an unsupported `--version` flag)
/// still means the binary itself ran, so it is "invocable" with no version.
pub fn classify_exit(exit_code: Option<i32>) -> VersionProbe {
    match exit_code {
        Some(126) => VersionProbe::NotInvocable(DiagnosticKind::NotExecutable),
        Some(127) => VersionProbe::NotInvocable(DiagnosticKind::ShimBroken),
        _ => VersionProbe::Invocable(None),
    }
}

/// Classify a spawn-time OS rejection (the bin resolved but `exec` failed).
/// `permission_denied`
/// → EACCES (not executable); everything else (NotFound / NotADirectory) → a
/// broken shim whose target is missing.
pub fn classify_spawn_error(permission_denied: bool) -> DiagnosticKind {
    if permission_denied {
        DiagnosticKind::NotExecutable
    } else {
        DiagnosticKind::ShimBroken
    }
}

/// Map the desktop crate's `install`/`configure` "ready|missing|external"
/// strings onto an [`AuthState`], so the scan reuses the (cheap, no-spawn)
/// credential detection `harness_states` already performs.
pub fn auth_from_state(state: &str) -> AuthState {
    match state {
        "ready" => AuthState::Ok,
        "missing" => AuthState::Missing,
        _ => AuthState::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_126_is_not_executable() {
        assert_eq!(
            classify_exit(Some(126)),
            VersionProbe::NotInvocable(DiagnosticKind::NotExecutable)
        );
    }

    #[test]
    fn exit_127_is_broken_shim() {
        assert_eq!(
            classify_exit(Some(127)),
            VersionProbe::NotInvocable(DiagnosticKind::ShimBroken)
        );
    }

    #[test]
    fn other_exits_still_invocable() {
        // exit 0, generic failure, and "no --version flag" all mean it ran.
        assert_eq!(classify_exit(Some(0)), VersionProbe::Invocable(None));
        assert_eq!(classify_exit(Some(1)), VersionProbe::Invocable(None));
        assert_eq!(classify_exit(None), VersionProbe::Invocable(None));
    }

    #[test]
    fn spawn_error_classification() {
        assert_eq!(classify_spawn_error(true), DiagnosticKind::NotExecutable);
        assert_eq!(classify_spawn_error(false), DiagnosticKind::ShimBroken);
    }

    #[test]
    fn fix_actions_match_kinds() {
        assert_eq!(DiagnosticKind::NotOnPath.default_fix(), FixAction::Install);
        assert_eq!(DiagnosticKind::AuthMissing.default_fix(), FixAction::Login);
    }

    #[test]
    fn auth_state_mapping() {
        assert_eq!(auth_from_state("ready"), AuthState::Ok);
        assert_eq!(auth_from_state("missing"), AuthState::Missing);
        assert_eq!(auth_from_state("external"), AuthState::Unknown);
        assert_eq!(auth_from_state("whatever"), AuthState::Unknown);
    }

    #[test]
    fn available_appends_auth_missing_diagnostic() {
        let d = DetectedHarness::available(
            "claude",
            Some("1.2.3".into()),
            "/x/claude",
            AuthState::Missing,
        );
        assert!(d.available);
        assert_eq!(d.diagnostics.len(), 1);
        assert_eq!(d.diagnostics[0].kind, DiagnosticKind::AuthMissing);
        assert_eq!(d.diagnostics[0].fix, FixAction::Login);

        let ok = DetectedHarness::available("claude", None, "/x/claude", AuthState::Ok);
        assert!(ok.diagnostics.is_empty());
    }

    #[test]
    fn wire_format_is_kebab_and_lowercase() {
        let d = DetectedHarness::unavailable(
            "codex",
            Diagnostic::new(DiagnosticKind::NotOnPath, "not found"),
        );
        let json = serde_json::to_string(&d).unwrap();
        assert!(json.contains("\"available\":false"));
        assert!(json.contains("\"auth\":\"unknown\""));
        assert!(json.contains("\"kind\":\"not-on-path\""));
        assert!(json.contains("\"fix\":\"install\""));
        // Round-trips.
        let back: DetectedHarness = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, "codex");
        assert!(!back.available);
    }
}
