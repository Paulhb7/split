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
//! can't accidentally allow them via an empty allow rule.

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

fn matches(rule: &str, expert: &str, tool_id: &str) -> bool {
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
    if r_spec.is_none() {
        return true;
    }
    t_spec.is_some() && fnmatch(t_spec.as_ref().unwrap(), r_spec.as_ref().unwrap())
}

/// Apply the loaded ruleset + default deny guards. Precedence: deny > ask >
/// allow. Default for unmatched = `Ask`.
pub fn decide(rules: &Rules, expert: &str, tool_id: &str) -> Decision {
    let default_deny = DEFAULT_DENY.iter().copied();
    let user_deny = rules.deny.iter().map(|s| s.as_str());
    for r in default_deny.chain(user_deny) {
        if matches(r, expert, tool_id) {
            return Decision::Deny;
        }
    }
    for r in rules.ask.iter() {
        if matches(r, expert, tool_id) {
            return Decision::Ask;
        }
    }
    for r in rules.allow.iter() {
        if matches(r, expert, tool_id) {
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
    fn mcp_server_matches_every_tool() {
        let rules = Rules {
            allow: vec!["mcp__ddg_search".to_string()],
            ..Rules::default()
        };
        assert_eq!(
            decide(&rules, "any", "mcp__ddg_search__search"),
            Decision::Allow
        );
        assert_eq!(
            decide(&rules, "any", "mcp__ddg_search__fetch_content"),
            Decision::Allow
        );
        assert_eq!(decide(&rules, "any", "mcp__other__tool"), Decision::Ask);
    }
}
