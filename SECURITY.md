# Security & trust model

Split is **local-first agent tooling for a single trusted operator running it on
their own machine, with their own accounts**. The whole design assumes the person
driving Split is the same person who owns the machine and the API keys. It is
**not** a sandbox, and **not** a security boundary between adversarial users,
agents, or untrusted input.

Read this before exposing Split to anything you don't fully trust.

## What this means in practice

- **A task you give an expert ≈ a command you'd run yourself in a shell.** Several
  experts (Data Analyst, Software Engineer, Scientist) run the shell and the
  filesystem on the host, unattended. The Operator (Alfred) drives your real
  macOS apps. Treat every prompt with that in mind.
- **Don't feed Split untrusted content expecting isolation.** A dropped file, a
  web page it researches, or a third-party MCP tool result can carry instructions
  (prompt injection). Split does not defend against that — it trusts the operator
  and the surface they point it at.
- **Don't run Split as a shared/hosted service.** There is no per-user boundary,
  no approval gate, and no audit trail today (see below). One operator, one
  machine.

## Known, accepted risks (current posture)

These are deliberate trade-offs for the single-operator model — documented, not
hidden. Each is the first thing to revisit if the trust model ever widens.

1. **Tool calls are approved by the UI (desktop) or auto-allowed (CLI/headless).**
   The runner ([`apps/desktop/src-tauri/src/runner.rs`](apps/desktop/src-tauri/src/runner.rs))
   consults the permission engine
   ([`core-rs/src/permissions.rs`](core-rs/src/permissions.rs)) —
   `deny > ask > allow`, pattern-based rules like `Bash(npm *)` /
   `mcp__cua_driver` / `engineer:Bash(*)`, with **universal guard-rails always
   active** (`Bash(rm -rf *)`, `Bash(sudo *)`, `Write(~/.ssh/**)`,
   `Write(~/.aws/**)`, `Write(/etc/**)`, …) — hardened to match per
   command-segment with a path-stripped binary, flag-order-insensitive
   `rm -rf`/`sudo` detection, and `~` expansion, so chaining
   (`cd /tmp && rm -rf /`), an absolute `/bin/rm`, a flag reorder, or a
   home-relative path no longer slip past. The mode is `SPLIT_PERMISSION_MODE`:
   the desktop app sets it to `prompt` (4 options: *Allow once / Allow session /
   Always (this expert) / Deny*); headless / CI runs default to `auto-allow`.
   **Caveat:** each ACP harness decides whether it actually calls
   `request_permission` for a given tool — most do (Claude, Codex, Gemini,
   Copilot, Cursor); a few may auto-execute (Mistral Vibe, some setups). Tool
   calls always show up in the live event stream, even when the harness bypasses
   approval — so they're at least visible. **Also:** MCP tool ids must reach the
   engine as `mcp__server__tool` for `mcp__*` rules to match; the runner
   normalizes them (see `extract_tool_id`), but a harness that surfaces an MCP
   call under an unrecognized name falls through to `ask`, not `allow`.
2. **Unattended host access.** The `analyst` / `engineer` / `scientist` experts
   get `Read`/`Write`/`Bash` on the host; `operator` drives apps via cua-driver.
   Nothing is sandboxed.
3. **Skills run bundled code.** Vendored skills under
   [`config/skills/`](config/skills/) ship `scripts/*.py` that execute and reach
   the network (e.g. the `higgsfield-*` skills → the `higgsfield` CLI/API).
4. **MCP servers are mounted as declared.** Everything in
   [`config/tools.json`](config/tools.json) is launched and exposed to the agent,
   with `${VAR}` secrets expanded into its environment. Only add servers you
   trust.
5. **Provider keys reach everything the agent runs.** Keys are stored in the OS
   keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service,
   via the `keyring` crate) and **never written to disk in plaintext** by the app;
   at session spawn the runner injects them into the agent child's environment
   (`McpServerStdio.env`). So any tool, skill script, or MCP server the agent
   executes can read them — there is no per-key scoping. A legacy `.env` at the
   repo root is still honored as a fallback (gitignored, never committed — see
   below). Treat the keys as reachable by anything the agent runs.
6. **Agent-generated HTML can still reach the network.** The cross-origin
   isolation above (see *What is in place*) stops an opened HTML deliverable from
   reading your files or driving the app, but its JavaScript can still make
   outbound requests (`fetch` / `XHR` / WebSocket / `sendBeacon`). So a
   prompt-injected deliverable that already *contains* sensitive data — e.g. a
   dashboard the agent built over your numbers — could POST that data to a
   third-party server. We deliberately **don't** block this with a `connect-src`
   CSP today, because:
   - **the residual exposure is narrow** — isolation already cut the deliverable
     off from your files and the app, so only data already *inside* the
     deliverable is reachable;
   - **it isn't a free win like the isolation was** — "let a deliverable call a
     live API" and "stop a deliverable exfiltrating over the network" are the
     *same* capability, so a strict `connect-src` would also break legitimate
     deliverables that fetch live data or load a chart library / font from a CDN;
   - **enforcing it cleanly needs a dedicated `artifact://` URI scheme** that
     sets the CSP response header — the asset protocol can't set per-response
     headers, and a global app CSP would constrain Split's own UI.
   This is a **pre-distribution** hardening, not a single-operator one: revisit
   it (with the CSP calibrated against real deliverables — `connect-src 'self'`
   plus a CDN-friendly `script-src`) before shipping Split to people running
   less-trusted agents. Tracked under *If the trust model ever widens*.

## What is in place

- **Agent file IO is confined to the workspace + vault.** The agent's own ACP
  file methods (`fs/read_text_file` / `fs/write_text_file`) run through
  `confine_path` ([`runner.rs`](apps/desktop/src-tauri/src/runner.rs)): it
  canonicalizes the path to defeat `..` traversal **and** symlink escape, then
  refuses anything outside the session workspace and the vault. So a
  prompt-injected agent can't read `~/.ssh/id_rsa` or overwrite `~/.zshrc`
  through that path. (Shell- and tool-driven file access on the host-tool
  experts is a separate, still-unsandboxed surface — see accepted risk #2.)
- **Agent-generated HTML renders cross-origin.** Deliverable previews load off
  disk via the asset protocol (`asset://…`, a real but *foreign* origin) instead
  of an inline same-origin `srcdoc`
  ([`ArtifactViewer.tsx`](apps/desktop/src/conversation/ArtifactViewer.tsx)). The
  page's JS still gets its own `localStorage` (so generated games/apps keep
  working), but the same-origin policy stops it reaching `window.parent`, the
  app's storage, or the Tauri `invoke` bridge — so opening an HTML deliverable
  can't drive the app or read your files. (It can still reach the *network*,
  though — see accepted risk #6 for what that leaves open and why we don't block
  it yet.)
- **Secrets in the OS keychain** — provider keys go through the `keyring` crate
  (macOS Keychain / Windows Credential Manager / Linux Secret Service), written
  via an allowlisted `save_api_key`, never persisted to disk in plaintext by the
  app.
- **`.gitignore`** keeps secrets and session state out of git: `.env`, `var/`
  (workspaces, downloaded binaries), `.venv/`.
- **Pre-commit guards** ([`.pre-commit-config.yaml`](.pre-commit-config.yaml)) —
  `detect-secrets` + `detect-private-key` (secret scanning), a hook that hard-blocks
  staging `.env` or anything under `var/` (even with `git add -f`), and a
  large-file guard. Activate them with `pre-commit install`.
- **CI lint** (ruff / eslint / clippy) catches some unsafe patterns, not a SAST.

## If the trust model ever widens

Before exposing Split to untrusted input, multiple users, or a hosted/headless
deployment, revisit — in this order:

1. **An approval surface** on `request_permission` (prompt, or a per-expert tool
   allowlist) + an audit log of tool calls.
2. **Sandboxing** the host-tool experts (containers / restricted fs + exec).
3. **Vetting MCP servers** and skill scripts before mounting.
4. **Scoping** provider keys per-expert / per-tool — they're in the OS keychain
   now, but every agent child still receives the full set at spawn.
5. **A `connect-src` CSP on agent-generated HTML** (served from a dedicated
   `artifact://` scheme that sets the header) to block network exfiltration from
   deliverables — see accepted risk #6 for the trade-off and why it's deferred.

## Reporting a vulnerability

This is a small, private project. If you find a security issue, report it
**privately** — open a [GitHub Security Advisory](https://github.com/Paulhb7/split/security/advisories/new)
on the repo, or email **paulbarbaste@gmail.com**. Please don't open a public issue
for an unpatched problem.

Out of scope under the trust model above: prompt-injection-only chains, anything
that requires an untrusted user already sharing the operator's machine/session,
and raw scanner output without a demonstrated, reproducible impact.
