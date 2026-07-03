//! Permission rule engine — Rust port of `split/permissions.py`.
//!
//! Three lists evaluated `deny > ask > allow`, first match wins. Rule syntax
//! is the Claude-Code-compatible mini-language documented in the Python file:
//!
//! ```text
//! ToolName                 — catch-all for that tool
//! ToolName(spec)           — scoped glob match on the arg (fnmatch-style)
//! mcp__server              — every tool from one MCP server
//! mcp__server__tool        — exact MCP tool
//! expert:<rule>            — only when the active expert matches
//! ```
//!
//! Storage: a single `var/permissions.json` with `allow` / `ask` / `deny` lists.
//!
//! Atomic, deny-safe by default: `DEFAULT_DENY` guards (the `rm -rf /` family,
//! `~/.ssh`, `/etc/**`, etc.) are merged into every `decide()` call so the user
//! can't accidentally allow them via an empty allow rule. The deny pass is
//! hardened beyond a literal glob: home-relative path guards expand `~` to the
//! resolved home so they fire on the absolute paths the runner actually passes,
//! and Bash guards match per command-segment with a path-stripped binary and
//! flag-order-insensitive `rm -rf`/`sudo` detection — so chaining
//! (`cd /tmp && rm -rf /`), an absolute `/bin/rm`, extra whitespace, or a flag
//! reorder no longer slip past. Best-effort, not a sandbox: treat it as a floor,
//! not a complete security boundary.

use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Ask,
    Deny,
}

/// Default deny guards — mirrors Claude Code's protected paths + obvious
/// foot-guns. Always merged into the deny list.
pub const DEFAULT_DENY: &[&str] = &[
    "Bash(rm -rf *)",
    "Bash(rm -rf /*)",
    "Bash(rm -rf ~*)",
    "Bash(sudo *)",
    "Write(~/.ssh/**)",
    "Write(~/.aws/**)",
    "Write(~/.gnupg/**)",
    "Write(/etc/**)",
    "Edit(~/.ssh/**)",
    "Edit(~/.aws/**)",
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Rules {
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub ask: Vec<String>,
    #[serde(default)]
    pub deny: Vec<String>,
}

/// Widen a literal tool_id into a reusable rule body before persisting.
/// Same algorithm as Python's `generalize`.
pub fn generalize(tool_id: &str) -> String {
    if tool_id.starts_with("mcp__") {
        return tool_id.to_string();
    }
    let Some((head, spec)) = parse_tool_id(tool_id) else {
        return tool_id.to_string();
    };
    let spec = match spec {
        Some(s) => s,
        None => return tool_id.to_string(),
    };
    if head == "Bash" {
        for tok in spec.split_whitespace() {
            // Skip env-var assignments: NODE_ENV=prod npm test
            if tok.contains('=') && !tok.starts_with('-') {
                continue;
            }
            // Strip path prefix on absolute binaries: /usr/bin/npm -> npm
            let bare = tok.rsplit('/').next().unwrap_or(tok);
            if !bare.is_empty() {
                return format!("Bash({bare} *)");
            }
        }
        return "Bash(*)".to_string();
    }
    format!("{head}(*)")
}

/// The rule we persist when the user picks "always allow / always deny",
/// scoped to what the dialog actually showed. Unlike [`generalize`] — which
/// widens a path tool to `Tool(*)`, a scope the user never saw and a quiet
/// privilege-widening foot-gun — this only widens where it is expected and
/// safe:
///   * `Bash(<cmd …>)` → `Bash(<bin> *)` (the command-head convenience),
///   * `mcp__…`        → kept verbatim (the exact tool / server),
///   * everything else → the EXACT id (e.g. `Read(/path/x)` stays scoped to
///     that path), so "always allow this one file" never silently becomes
///     "allow every file this expert ever reads".
pub fn rule_for_persist(tool_id: &str) -> String {
    if tool_id.starts_with("mcp__") {
        return tool_id.to_string();
    }
    match parse_tool_id(tool_id) {
        Some((head, Some(_spec))) if head == "Bash" => generalize(tool_id),
        _ => tool_id.to_string(),
    }
}

/// Normalize a server name to the rule convention: hyphens become
/// underscores, so the configured server `cua-driver` and the rule
/// `mcp__cua_driver` line up.
fn canon_server(s: &str) -> String {
    s.replace('-', "_")
}

/// Canonicalize a possibly-MCP tool name into the `mcp__<server>__<tool>`
/// form the rule engine matches on (`mcp__server` / `mcp__server__tool`).
///
/// ACP does not carry the MCP server/tool identity in one standard field, so
/// harnesses encode it differently: Claude Code already names the tool
/// `mcp__<server>__<tool>`, others surface `<server>__<tool>` or
/// `<server>:<tool>`. We accept those shapes. For the ambiguous separators we
/// require the leading segment to be a *known* configured MCP server, so a
/// human title ("Searching: foo") is never misread as a tool id. The server
/// segment is emitted with `-`→`_` to match rule syntax.
///
/// Returns `None` when the name doesn't look like an MCP tool — the caller
/// falls back to the built-in / `title` id. A bare tool name with no server
/// prefix (some harnesses send just `click`) is intentionally NOT
/// reconstructed here: the server is genuinely unknown, so we leave it to the
/// fallback rather than guess wrong.
pub fn mcp_tool_id(name: &str, known_servers: &[String]) -> Option<String> {
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    // Already MCP-shaped: `mcp__server[__tool…]`. Normalize the server
    // segment only; keep the tool tail verbatim.
    if let Some(rest) = name.strip_prefix("mcp__") {
        return Some(match rest.split_once("__") {
            Some((server, tool)) => format!("mcp__{}__{}", canon_server(server), tool),
            None => format!("mcp__{}", canon_server(rest)),
        });
    }
    // Human titles carry whitespace; real tool ids don't. Bail early so we
    // never treat "Reading notes.md" as `mcp__reading__…`.
    if name.contains(char::is_whitespace) {
        return None;
    }
    // `<server><sep><tool>` for a known configured server.
    for sep in ["__", "::", ":", "/", "."] {
        if let Some((head, tool)) = name.split_once(sep) {
            if tool.is_empty() {
                continue;
            }
            if known_servers
                .iter()
                .any(|k| canon_server(k) == canon_server(head))
            {
                return Some(format!("mcp__{}__{}", canon_server(head), tool));
            }
        }
    }
    None
}

fn parse_tool_id(tool_id: &str) -> Option<(String, Option<String>)> {
    if tool_id.ends_with(')') {
        if let Some(open) = tool_id.find('(') {
            let head = &tool_id[..open];
            let spec = &tool_id[open + 1..tool_id.len() - 1];
            return Some((head.to_string(), Some(spec.to_string())));
        }
    }
    Some((tool_id.to_string(), None))
}

/// `engineer:Bash(...)` → (Some("engineer"), "Bash(...)"); plain rule → (None, rule).
fn split_expert_prefix(rule: &str) -> (Option<&str>, &str) {
    if let Some(idx) = rule.find(':') {
        let head = &rule[..idx];
        let tail = &rule[idx + 1..];
        // Only treat as expert prefix if head is a bare identifier.
        if !tail.is_empty()
            && !head.is_empty()
            && head.chars().all(|c| c.is_alphanumeric() || c == '_')
            && head
                .chars()
                .next()
                .map(|c| c.is_alphabetic() || c == '_')
                .unwrap_or(false)
        {
            return (Some(head), tail);
        }
    }
    (None, rule)
}

/// Glob-style match — supports `*` (zero or more chars), `?` (one char),
/// and `**` (zero or more chars including `/`). Same behaviour as Python's
/// `fnmatch.fnmatchcase`, anchored.
pub fn fnmatch(name: &str, pattern: &str) -> bool {
    fn helper(n: &[u8], p: &[u8]) -> bool {
        let mut ni = 0;
        let mut pi = 0;
        let mut star: Option<(usize, usize)> = None;
        while ni < n.len() {
            if pi < p.len() {
                match p[pi] {
                    b'*' => {
                        // Collapse runs of `*`.
                        while pi < p.len() && p[pi] == b'*' {
                            pi += 1;
                        }
                        if pi == p.len() {
                            return true;
                        }
                        star = Some((pi, ni));
                        continue;
                    }
                    b'?' => {
                        ni += 1;
                        pi += 1;
                        continue;
                    }
                    c => {
                        if n[ni] == c {
                            ni += 1;
                            pi += 1;
                            continue;
                        }
                    }
                }
            }
            if let Some((sp, sn)) = star {
                pi = sp;
                ni = sn + 1;
                star = Some((sp, sn + 1));
            } else {
                return false;
            }
        }
        while pi < p.len() && p[pi] == b'*' {
            pi += 1;
        }
        pi == p.len()
    }
    helper(name.as_bytes(), pattern.as_bytes())
}

/// The boss's home directory, for expanding a leading `~` in path guards.
/// `HOME` on unix, `USERPROFILE` on Windows. `None` when neither is set —
/// guards then fall back to literal `~` matching (still correct for the
/// tilde-form rules a user types by hand).
fn home_dir() -> Option<String> {
    std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok())
        .filter(|s| !s.is_empty())
}

/// Expand a leading `~` / `~/` in a path spec to the resolved home directory.
/// Anything else (already-absolute paths, non-path specs) is returned as-is.
fn expand_tilde(spec: &str, home: Option<&str>) -> String {
    match home {
        Some(h) if spec == "~" => h.trim_end_matches('/').to_string(),
        Some(h) if spec.starts_with("~/") => {
            format!("{}/{}", h.trim_end_matches('/'), &spec[2..])
        }
        _ => spec.to_string(),
    }
}

/// Split a shell command line on the separators that start a new simple
/// command (`&&`, `||`, `;`, `|`, `&`, newline, command substitution and
/// grouping). Intentionally over-splits (e.g. inside quotes): used only for
/// deny evaluation, where more segments can only ever catch MORE dangerous
/// invocations, never permit one. ASCII separators only, so every cut lands
/// on a UTF-8 boundary.
fn split_command_segments(command: &str) -> Vec<&str> {
    let bytes = command.as_bytes();
    let mut out = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        let next = bytes.get(i + 1).copied();
        let sep_len = match b {
            b'&' if next == Some(b'&') => 2,
            b'|' if next == Some(b'|') => 2,
            b'$' if next == Some(b'(') => 2,
            b';' | b'|' | b'\n' | b'&' | b'(' | b')' | b'`' | b'{' | b'}' | b'<' | b'>' => 1,
            _ => 0,
        };
        if sep_len > 0 {
            if start < i {
                out.push(&command[start..i]);
            }
            i += sep_len;
            start = i;
        } else {
            i += 1;
        }
    }
    if start < command.len() {
        out.push(&command[start..]);
    }
    out
}

/// Normalize one command segment so the real binary surfaces as the first
/// token: drop leading `FOO=bar` env-assignments and benign wrappers (`env`,
/// `exec`, …), then path-strip the binary (`/bin/rm` → `rm`) and collapse
/// runs of whitespace. `sudo`/`doas` are deliberately NOT stripped — we want
/// to detect them. Returns "" if the segment has no command.
fn normalize_segment(seg: &str) -> String {
    const WRAPPERS: &[&str] = &[
        "env", "command", "builtin", "exec", "nohup", "nice", "ionice", "time", "stdbuf", "setsid",
    ];
    let toks: Vec<&str> = seg.split_whitespace().collect();
    let mut i = 0;
    while i < toks.len() {
        let t = toks[i];
        let bare = t.rsplit('/').next().unwrap_or(t);
        if (t.contains('=') && !t.starts_with('-')) || WRAPPERS.contains(&bare) {
            i += 1;
        } else {
            break;
        }
    }
    let rest = &toks[i..];
    let Some(first) = rest.first() else {
        return String::new();
    };
    let bin = first.rsplit('/').next().unwrap_or(first);
    let mut out = String::from(bin);
    for t in &rest[1..] {
        out.push(' ');
        out.push_str(t);
    }
    out
}

/// Is `seg` a recursive-and-forced `rm`, regardless of flag spelling/order?
/// Catches `rm -rf`, `rm -fr`, `rm -r -f`, `rm -Rf`, `rm --recursive --force`.
fn is_rm_rf(seg: &str) -> bool {
    let mut toks = seg.split_whitespace();
    if toks.next() != Some("rm") {
        return false;
    }
    let (mut recursive, mut force) = (false, false);
    for t in toks {
        match t {
            "--recursive" => recursive = true,
            "--force" => force = true,
            _ if t.starts_with("--") => {}
            _ => {
                if let Some(flags) = t.strip_prefix('-') {
                    if flags.contains('r') || flags.contains('R') {
                        recursive = true;
                    }
                    if flags.contains('f') {
                        force = true;
                    }
                }
            }
        }
    }
    recursive && force
}

/// Does `seg` invoke a privilege-escalating command head?
fn is_sudo(seg: &str) -> bool {
    matches!(seg.split_whitespace().next(), Some("sudo") | Some("doas"))
}

/// Deny-only Bash matcher. Splits the command on shell separators and matches
/// the deny `pattern` against each NORMALIZED segment (path-stripped binary,
/// wrappers/env-assignments removed, whitespace collapsed), plus flag-order-
/// insensitive detection for the `rm -rf …` / `sudo …` guards we ship. Because
/// it runs only on the deny pass, broadening here can only ever block more.
fn bash_deny_matches(pattern: &str, command: &str) -> bool {
    let rm_family = pattern.starts_with("rm ") && pattern.contains("-rf");
    let sudo_family = pattern.starts_with("sudo");
    for seg in split_command_segments(command) {
        let norm = normalize_segment(seg);
        if norm.is_empty() {
            continue;
        }
        if fnmatch(&norm, pattern) {
            return true;
        }
        if rm_family && is_rm_rf(&norm) {
            return true;
        }
        if sudo_family && is_sudo(&norm) {
            return true;
        }
    }
    false
}

fn matches(rule: &str, expert: &str, tool_id: &str, home: Option<&str>, deny: bool) -> bool {
    let (rule_expert, rule_body) = split_expert_prefix(rule);
    if let Some(exp) = rule_expert {
        if exp != expert {
            return false;
        }
    }
    let Some((r_tool, r_spec)) = parse_tool_id(rule_body) else {
        return false;
    };
    let Some((t_tool, t_spec)) = parse_tool_id(tool_id) else {
        return false;
    };

    // MCP-specific matching.
    if r_tool.starts_with("mcp__") && t_tool.starts_with("mcp__") {
        if r_tool == t_tool {
            return r_spec.is_none()
                || (t_spec.is_some()
                    && fnmatch(t_spec.as_ref().unwrap(), r_spec.as_ref().unwrap()));
        }
        // mcp__server matches every mcp__server__*
        if !r_tool[5..].contains("__") && t_tool.starts_with(&format!("{r_tool}__")) {
            return true;
        }
        if r_tool.contains('*') && fnmatch(&t_tool, &r_tool) {
            return true;
        }
        return false;
    }

    if !fnmatch(&t_tool, &r_tool) {
        return false;
    }
    let Some(r_spec) = r_spec else {
        return true;
    };
    let Some(t_spec) = t_spec else {
        return false;
    };

    // Bash *deny* hardening: a single anchored glob over the raw command is
    // trivially bypassed (chaining, extra whitespace, flag reorder, an
    // absolute `/bin/rm`). On the deny pass we split the command into segments,
    // path-strip the binary, and apply flag-order-insensitive detection for the
    // guards we ship. Scoped to deny so it can only ever BLOCK more — an allow
    // rule never widens.
    if deny && r_tool == "Bash" && t_tool == "Bash" {
        return bash_deny_matches(&r_spec, &t_spec);
    }

    // Path-bearing specs: expand a leading `~` on BOTH sides, so a home-relative
    // guard (`Write(~/.ssh/**)`) matches the absolute path the runner actually
    // passes (`Write(/Users/<me>/.ssh/...)`) and vice-versa.
    let rp = expand_tilde(&r_spec, home);
    let tp = expand_tilde(&t_spec, home);
    fnmatch(&tp, &rp)
}

/// Apply the loaded ruleset + default deny guards. Precedence: deny > ask >
/// allow. Default for unmatched = `Ask`.
pub fn decide(rules: &Rules, expert: &str, tool_id: &str) -> Decision {
    decide_with_home(rules, expert, tool_id, home_dir().as_deref())
}

/// [`decide`] with an explicit home directory for the `~` expansion in path
/// guards. Split out so tests are deterministic regardless of the runner's
/// environment.
fn decide_with_home(rules: &Rules, expert: &str, tool_id: &str, home: Option<&str>) -> Decision {
    let default_deny = DEFAULT_DENY.iter().copied();
    let user_deny = rules.deny.iter().map(|s| s.as_str());
    for r in default_deny.chain(user_deny) {
        if matches(r, expert, tool_id, home, true) {
            return Decision::Deny;
        }
    }
    for r in rules.ask.iter() {
        if matches(r, expert, tool_id, home, false) {
            return Decision::Ask;
        }
    }
    for r in rules.allow.iter() {
        if matches(r, expert, tool_id, home, false) {
            return Decision::Allow;
        }
    }
    Decision::Ask
}

/// Load `var/permissions.json`. Missing or malformed file → empty ruleset.
pub fn load(path: &Path) -> Rules {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Rules::default();
    };
    serde_json::from_str::<Rules>(&raw).unwrap_or_default()
}

/// Atomic-ish write with 0600 perms.
pub fn save(path: &Path, rules: &Rules) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let tmp = path.with_extension("json.tmp");
    let body = match serde_json::to_string_pretty(rules) {
        Ok(s) => s,
        Err(_) => return,
    };
    if let Ok(()) = std::fs::write(&tmp, format!("{body}\n")) {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
        }
        let _ = std::fs::rename(&tmp, path);
    }
}

/// Append `rule` to the named list (`allow` / `ask` / `deny`) if not already
/// present, persist, return the updated ruleset.
pub fn add_rule(path: &Path, decision: Decision, rule: &str) -> Rules {
    let mut rules = load(path);
    let bucket = match decision {
        Decision::Allow => &mut rules.allow,
        Decision::Ask => &mut rules.ask,
        Decision::Deny => &mut rules.deny,
    };
    if !bucket.iter().any(|r| r == rule) {
        bucket.push(rule.to_string());
    }
    save(path, &rules);
    rules
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnmatch_simple_wildcards() {
        assert!(fnmatch("npm test", "npm *"));
        assert!(!fnmatch("yarn test", "npm *"));
        assert!(fnmatch("Bash", "Bash"));
        assert!(fnmatch("WebSearch", "WebSearch"));
        assert!(fnmatch("anything", "*"));
    }

    #[test]
    fn generalize_matches_python() {
        // From split/permissions.py — mirror tests
        assert_eq!(generalize("Bash(npm test --watch)"), "Bash(npm *)");
        assert_eq!(generalize("Bash(NODE_ENV=prod npm test)"), "Bash(npm *)");
        assert_eq!(generalize("Bash(/usr/bin/npm run build)"), "Bash(npm *)");
        assert_eq!(generalize("Read(/tmp/foo.txt)"), "Read(*)");
        assert_eq!(generalize("Write(~/.ssh/config)"), "Write(*)");
        assert_eq!(
            generalize("mcp__cua_driver__click"),
            "mcp__cua_driver__click"
        );
        assert_eq!(generalize("WebSearch"), "WebSearch");
    }

    #[test]
    fn default_deny_blocks_rm_rf() {
        let rules = Rules::default();
        assert_eq!(
            decide(&rules, "engineer", "Bash(rm -rf /tmp)"),
            Decision::Deny
        );
        assert_eq!(
            decide(&rules, "engineer", "Write(~/.ssh/known_hosts)"),
            Decision::Deny
        );
        assert_eq!(decide(&rules, "engineer", "Bash(sudo rm)"), Decision::Deny);
    }

    #[test]
    fn default_deny_resists_bash_bypasses() {
        let r = Rules::default();
        // Every one of these defeated the old start-anchored glob.
        let denied = [
            "Bash(cd /tmp && rm -rf /)",      // command chaining
            "Bash(  rm -rf /)",               // leading whitespace
            "Bash(rm  -rf  /important)",      // collapsed inner whitespace
            "Bash(rm -fr /)",                 // flag reorder
            "Bash(rm -r -f /important)",      // split short flags
            "Bash(rm --recursive --force /)", // long flags
            "Bash(/bin/rm -rf /)",            // absolute binary path
            "Bash(env rm -rf /)",             // benign wrapper
            "Bash(true; sudo reboot)",        // chained sudo
            "Bash(echo hi | sudo tee /etc/x)",
        ];
        for c in denied {
            assert_eq!(
                decide(&r, "engineer", c),
                Decision::Deny,
                "should deny: {c}"
            );
        }
        // …without sweeping up a benign, non-recursive `rm` or unrelated commands.
        assert_eq!(decide(&r, "engineer", "Bash(rm notes.txt)"), Decision::Ask);
        assert_eq!(decide(&r, "engineer", "Bash(git status)"), Decision::Ask);
        assert_eq!(decide(&r, "engineer", "Bash(rumple -rf x)"), Decision::Ask);
    }

    #[test]
    fn deny_wins_over_allow_for_chained_danger() {
        // An explicit allow can't smuggle a dangerous segment past deny —
        // deny is evaluated first AND now sees each chained command.
        let rules = Rules {
            allow: vec!["engineer:Bash(git *)".to_string()],
            ..Rules::default()
        };
        assert_eq!(
            decide(&rules, "engineer", "Bash(git status)"),
            Decision::Allow
        );
        assert_eq!(
            decide(&rules, "engineer", "Bash(git status && rm -rf /)"),
            Decision::Deny
        );
    }

    #[test]
    fn home_relative_guards_fire_on_absolute_paths() {
        // The realistic case the runner produces: an ABSOLUTE path against a
        // home-relative guard. Both forms must deny now.
        let rules = Rules::default();
        let home = Some("/Users/paul");
        assert_eq!(
            decide_with_home(&rules, "e", "Write(/Users/paul/.ssh/authorized_keys)", home),
            Decision::Deny
        );
        assert_eq!(
            decide_with_home(&rules, "e", "Edit(/Users/paul/.aws/credentials)", home),
            Decision::Deny
        );
        assert_eq!(
            decide_with_home(&rules, "e", "Write(~/.gnupg/secring.gpg)", home),
            Decision::Deny
        );
        // A file outside the protected dirs is unaffected.
        assert_eq!(
            decide_with_home(&rules, "e", "Write(/Users/paul/project/notes.md)", home),
            Decision::Ask
        );
    }

    #[test]
    fn expert_prefix_scopes_rule() {
        let rules = Rules {
            allow: vec!["engineer:Bash(npm *)".to_string()],
            ..Rules::default()
        };
        assert_eq!(
            decide(&rules, "engineer", "Bash(npm test)"),
            Decision::Allow
        );
        // Different expert — rule doesn't apply.
        assert_eq!(
            decide(&rules, "consultant", "Bash(npm test)"),
            Decision::Ask
        );
    }

    #[test]
    fn mcp_tool_id_normalizes_known_shapes() {
        let known = vec!["cua-driver".to_string(), "everything".to_string()];
        // Already canonical (Claude Code) — server segment hyphen-normalized.
        assert_eq!(
            mcp_tool_id("mcp__cua-driver__click", &known).as_deref(),
            Some("mcp__cua_driver__click")
        );
        assert_eq!(
            mcp_tool_id("mcp__cua_driver__type_text", &known).as_deref(),
            Some("mcp__cua_driver__type_text")
        );
        // `<server>__<tool>` / `<server>:<tool>` for a KNOWN server.
        assert_eq!(
            mcp_tool_id("cua-driver__click", &known).as_deref(),
            Some("mcp__cua_driver__click")
        );
        assert_eq!(
            mcp_tool_id("everything:echo", &known).as_deref(),
            Some("mcp__everything__echo")
        );
        // Whole-server reference stays a server rule.
        assert_eq!(
            mcp_tool_id("mcp__cua-driver", &known).as_deref(),
            Some("mcp__cua_driver")
        );
        // Unknown server head, human titles, and built-in names → no MCP id.
        assert_eq!(mcp_tool_id("other:tool", &known), None);
        assert_eq!(mcp_tool_id("Searching: foo", &known), None);
        assert_eq!(mcp_tool_id("click", &known), None);
        assert_eq!(mcp_tool_id("", &known), None);
    }

    #[test]
    fn mcp_tool_id_matches_through_decide() {
        // The whole point: a normalized cua-driver tool id is actually
        // matchable by the server rule `mcp__cua_driver` (which it never was
        // when extract_tool_id emitted the bare title `click`).
        let known = vec!["cua-driver".to_string()];
        let id = mcp_tool_id("click", &known); // bare → unreconstructable
        assert_eq!(id, None);
        let id = mcp_tool_id("mcp__cua-driver__click", &known).unwrap();
        let rules = Rules {
            allow: vec!["operator:mcp__cua_driver".to_string()],
            ..Rules::default()
        };
        assert_eq!(decide(&rules, "operator", &id), Decision::Allow);
        // and a DEFAULT_DENY-style deny on the whole server still wins.
        let rules = Rules {
            deny: vec!["mcp__cua_driver".to_string()],
            ..Rules::default()
        };
        assert_eq!(decide(&rules, "operator", &id), Decision::Deny);
    }

    #[test]
    fn rule_for_persist_scopes_to_what_user_saw() {
        // Bash keeps the useful command-head widening.
        assert_eq!(rule_for_persist("Bash(npm test --watch)"), "Bash(npm *)");
        // Path tools persist the EXACT path — NOT Read(*)/Write(*). This is
        // the foot-gun fix: allowing one file never widens to all files.
        assert_eq!(rule_for_persist("Read(/tmp/foo.txt)"), "Read(/tmp/foo.txt)");
        assert_eq!(
            rule_for_persist("Write(~/.ssh/config)"),
            "Write(~/.ssh/config)"
        );
        // MCP + plain tools pass through unchanged.
        assert_eq!(
            rule_for_persist("mcp__cua_driver__click"),
            "mcp__cua_driver__click"
        );
        assert_eq!(rule_for_persist("WebSearch"), "WebSearch");
    }

    #[test]
    fn always_allow_one_path_does_not_widen_to_all() {
        // Persisting the rule the runner now writes for "always allow this
        // file" must auto-allow that file but still ASK for a sibling.
        let rule = format!("engineer:{}", rule_for_persist("Read(/proj/a.md)"));
        let rules = Rules {
            allow: vec![rule],
            ..Rules::default()
        };
        assert_eq!(
            decide(&rules, "engineer", "Read(/proj/a.md)"),
            Decision::Allow
        );
        assert_eq!(
            decide(&rules, "engineer", "Read(/proj/b.md)"),
            Decision::Ask
        );
    }

    #[test]
    fn mcp_server_matches_every_tool() {
        let rules = Rules {
            allow: vec!["mcp__cua_driver".to_string()],
            ..Rules::default()
        };
        assert_eq!(
            decide(&rules, "any", "mcp__cua_driver__click"),
            Decision::Allow
        );
        assert_eq!(
            decide(&rules, "any", "mcp__cua_driver__type_text"),
            Decision::Allow
        );
        assert_eq!(decide(&rules, "any", "mcp__other__tool"), Decision::Ask);
    }
}
