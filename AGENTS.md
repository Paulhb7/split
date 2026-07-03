# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

> **⚠️ Archived — moved out of the repo.** Old / reference-only material (the previous
> `desktop/` Tauri bar + `sidecar/` Python app locked to the Claude Agent SDK, plus
> `openclaw-main/`, `registry-main/`) was moved OUT of the repo to the sibling folder
> **`~/Desktop/split-archive/`**; planning notes (vision / design / NEXT_STEPS) live in
> **`~/Desktop/split-notes/`**. **Do not read or grep `~/Desktop/split-archive/` unless the
> user explicitly asks for it.** Both are superseded by the active project documented below.

> **📖 Canonical overview: [README.md](README.md).** It is current and thorough (the model,
> the 9 harnesses, the 31 experts, the skills, setup/run, the full repo layout). This file
> is the working guide for *editing the code* — it favours correct paths and gotchas over
> prose. If the two ever drift, README.md wins.

## What this is

Split is a macOS assistant that runs **a roster of experts, each in its own session**, side
by side. An **expert = persona + skills + tools**, and that bundle runs unchanged on the
**coding agent of the user's choice** (Claude, Codex, Gemini, Qwen, Copilot, Mistral Vibe,
OpenCode…) — spoken to over **ACP (Agent Client Protocol)**. The "brain" is swappable: the
same Consultant runs on Claude today and a local Ollama brain tomorrow, no rewrite.

The whole active project lives at the **repo root**, split into four tracked
concerns + one local-only legacy:

- **`core-rs/`** (Rust) — the portable engine. Persona projection, session
  archive, permission rules with `DEFAULT_DENY` guards, harness model config.
  No Tauri, no ACP SDK — pure stdlib + serde + chrono. Tested via
  `cargo test --workspace` (the core-rs unit tests, plus the runner
  integration suite in `apps/desktop/src-tauri/tests/`).
- **`config/`** — the portable expert system (harnesses / experts / tools / personas / skills).
- **`apps/desktop/`** — the Tauri 2 + React 19 desktop bar. `src-tauri/` is a
  workspace member depending on `core-rs/` and housing the **native Rust runner**
  ([apps/desktop/src-tauri/src/runner.rs](apps/desktop/src-tauri/src/runner.rs))
  — the default runtime in the shipped `.dmg`.
- **`var/`** — generated / vendored state, gitignored (agent workspace, archives, memory, etc.).
- **`split-python/`** (LOCAL ONLY, gitignored) — the retired Python backend,
  kept on disk for **reference / parity sweeps only**. Fresh clones don't get
  it, and it is **no longer wired into the app** — the Python `start_session`
  dispatch and its `localStorage` opt-in were removed; the desktop bar runs the
  native Rust runner exclusively. To compare behaviour, run the Python sidecar
  standalone from inside `split-python/` (see its own README/commands).

## Architecture

**Portable engine.** [core-rs/](core-rs/) is the Rust crate the desktop shell
depends on. It resolves the layout (`REPO_ROOT`, `CONFIG_DIR`, `VAR_DIR`,
`WORKSPACE` — overridable per session via the `SPLIT_WORKSPACE` env var) and
exposes the engine surface in five modules: `persona` (`ensure_expert_workspace`
+ cross-vendor shims + skill symlinks), `archive` (per-session `events.ndjson`
+ `meta.json` with `acp_sid` for resume), `permissions` (allow/ask/deny with
`DEFAULT_DENY` guards + glob match), `harness_config` (Hermes/OpenCode
model-picker translation), and `detection` (machine scan for installed harness
CLIs). A session = spawn the harness in the EXPERT's
persistent workspace (projected once, refreshed only when sources change) →
mount MCP tools via `session/new` → stream `session/update` back. The ACP
`Client` callbacks (`session_update`, `request_permission`,
`read/write_text_file`) and agent-auth detection live in the Rust runner
([apps/desktop/src-tauri/src/runner.rs](apps/desktop/src-tauri/src/runner.rs))
on the canonical `agent-client-protocol` crate. The retired Python
implementation of the same surface lives at `split-python/core.py` etc.
*if you keep it on disk* — gitignored.

**One backend: the native Rust runner.** The desktop bar drives sessions via a
single Tauri command, **`start_session`** — it runs the native Rust runner
([apps/desktop/src-tauri/src/runner.rs](apps/desktop/src-tauri/src/runner.rs))
on the canonical `agent-client-protocol` crate, in-process. Speaks ACP
directly, emits VEVT events via `app.emit`, persists per-session archives
under `var/sessions/<id>/`. The retired Python runner produced the **same** VEVT
vocabulary and the same `var/sessions/<id>/{events.ndjson, meta.json}` archive
shape, so archives written by either still replay identically through the React
reducer. The ACP session stays open across turns — **no transcript replay**
(multi-turn). The legacy `python -m split.terminal` front still works standalone
inside `split-python/` for parity testing, if you keep it.

> A legacy web front (aiohttp+WebSocket) was retired to **`var/_retired/`** (`server.py` +
> `web/`) in favour of the desktop app.

**The Rust layer.** [apps/desktop/src-tauri/src/lib.rs](apps/desktop/src-tauri/src/lib.rs)
resolves the repo root **at runtime** (no machine-specific paths baked in):
`REPO_ROOT` = `$SPLIT_REPO_ROOT`, else the nearest ancestor of the exe holding
`config/harnesses.json` + `Cargo.toml` (the workspace root marker — covers
`tauri dev` and `tauri build`), else three levels up from `CARGO_MANIFEST_DIR`.
Sessions live in one `SESSIONS` map (id → control-channel sender):
- `start_session(id, harness, expert, workspace, resume?)` — spawns the native
  Rust runner in a tokio task (no subprocess), projects the expert workspace,
  passes provider keys + OTLP env via `McpServerStdio.env`, captures agent
  stderr via `AcpAgent::with_debug`. Sessions tracked in `SESSIONS` (mpsc
  channel handle).
- `send_turn(id, text)` / `send_auth(id, methodId)` / `send_logout(id)` /
  `stop_session(id)` — send the matching `RunnerInput` on the session's control
  channel (`Turn` / `Auth` / `Logout` / `Stop`); `Stop` triggers graceful
  session/cancel + session/close in the runner.
- `send_permission(id, requestId, optionId, scope)` — resolves the runner's
  pending `request_permission` oneshot (`PENDING_PERMS_RUST`) by request id.
- VEVT events + stderr are **broadcast with `app.emit`** (not `window.emit`), so
  parallel sessions stream without crossing wires.
- Other commands: `list_sessions`, `list_harnesses`/`list_experts` (read the JSON configs),
  `terminal_login` (osascript + Terminal.app), `read_files_for_agent` (file drops, ~200 KB
  cap), `save_api_key` (allowlisted provider keys → OS keychain via the `keyring` crate).

**The VEVT vocabulary** (one `VEVT <json>` per event): `ready`, `say`, `thought`,
`step{title,status}`, `plan{entries}`, `usage{used,size,cost}`,
`status{status: running|idle|error}`, `auth_required{harness,methods,hasLogin,note}`,
`auth_result{harness,ok,error}`. **`status:idle` is the turn-finished signal** (no separate
`done` event) — the React reducer commits the streamed answer there.

**The React app.** One bundle, one window. [apps/desktop/src/main.tsx](apps/desktop/src/main.tsx)
renders [App.tsx](apps/desktop/src/App.tsx) — the orchestration shell that owns
input/menu/skin/toast state and routes between **onboarding** (first launch),
the **home** roster/composer/sessions list, and the conversation **stage**
([src/stage/Stage.tsx](apps/desktop/src/stage/Stage.tsx)). The view-heavy pieces
are their own components: `home/Composer.tsx` + `home/SessionRow.tsx`,
`conversation/Conversation.tsx` (focused-session thread + reply composer),
`history/HistoryOverlay.tsx`, `auth/AuthModal.tsx`. Shared logic in
[apps/desktop/src/shared/](apps/desktop/src/shared/):
- `useSessions.ts` — owns `sessions[]`, subscribes to the broadcast `session-event`, folds
  events through `reducer.ts`, exposes `start/send/sendAuth/sendLogout/sendPermission/stop/remove`
  (+ `openArchive`/`resumeArchive`); hydrates via `list_sessions` and materializes sessions
  started elsewhere from `ready`.
- `useToasts.ts` — transient notifications with self-cleaning timers. `skins.ts` — the visual
  skin registry (`SKINS` + `isSkin`).
- `harnesses.ts` — the engine registry's **display metadata** (brand color, lane, vendor,
  tag, blurb). `config/harnesses.json` is the launch config; this is the UI join-by-id.
- `events.ts` / `models.ts` — the VEVT union + `Session` model. `experts.ts` / `util.ts`
  (`useExperts`, `composeTurn`, drag-drop attachments). `ui.tsx` — shared UI primitives.
- `useWindowChrome.ts` — window geometry: free move, edge/corner resize, **S/M/L presets**,
  pin (always-on-top) toggle, geometry persisted to `localStorage` (`split.geom`).

**Auth flow.** Agent needs sign-in → runner emits `auth_required` (and stashes the pending
prompt) → Rust broadcasts → the UI shows the ACP methods + an "Open Terminal to sign in"
option → user picks → `send_auth` (or `terminal_login`) → on success the runner re-runs the
pending prompt automatically.

**File drops.** Dropping a file on the window → Rust `read_files_for_agent` → a pending
attachment folded into the next turn's `wire` text (content inline + absolute path), shown
in the thread as a 📎 chip. `display` (thread) vs `wire` (sent to the agent) are split by
`composeTurn`.

## Harnesses, Experts, Tools & Skills (`config/`)

- **Harnesses** (the brains) — [config/harnesses.json](config/harnesses.json): each is
  `{name, command, args, skill_dir, auth, …}`. `command` is `npx`/`uvx` or a `./var/bin/…`
  binary, launched over ACP stdio. Display brand/lane/vendor live in
  [apps/desktop/src/shared/harnesses.ts](apps/desktop/src/shared/harnesses.ts).
- **Experts** (the personas) — [config/experts.json](config/experts.json): keyed by slug,
  each `{label, kind, skills, blurb}`. `kind` is informational (render hint:
  researcher/advisor/analyst/builder/finder/operator/creator). The persona prompt is
  [config/experts/](config/experts/)`<slug>.md`, projected at session start into the
  workspace's `AGENTS.md` (+ `AGENTS.md`/`GEMINI.md`/`QWEN.md` shims).
- **Tools** — [config/tools.json](config/tools.json): MCP servers (`mcpServers` shape,
  `${VAR}` env expansion) fed to every agent via ACP `session/new`. Currently: `everything`
  (the MCP demo server, used by the README run-loop example) and `cua-driver` (background
  macOS app control via the AX tree, used by the `operator` expert). Web search is **not**
  a Split tool — experts use their harness's native grounded search (see `_discipline.md`).
- **Skills** — [config/skills/](config/skills/)`<name>/` follow the open **[Agent Skills](https://agentskills.io)
  standard**: a folder with a required `SKILL.md` (`name` + `description` frontmatter +
  instructions) plus optional `scripts/`/`references/`/`assets/`. **Single projection,
  per expert, once**: `ensure_expert_workspace(expert)` in [core-rs/src/persona.rs](core-rs/src/persona.rs)
  (Rust runner) — or the legacy [`split-python/split/core.py`](split-python/split/core.py)
  (if you kept it locally) — reconciles
  `<workspace>/<expert>/.claude/skills/`, `.agents/skills/`, `.vibe/skills/` with
  `experts.json[expert].skills`. Each entry is a direct symlink to `config/skills/<name>`
  — no intermediate mount layer. Re-runs are idempotent: existing symlinks pointing at the
  right target are left alone; obsolete entries are unlinked; new entries are added. So
  `experts.json`'s `"skills": […]` is the **filesystem filter** — the harness's catalogue
  sees exactly the expert's allowed kit, nothing else. The persona's "Skills mounted"
  section enumerates the same list for the agent's prompt-side awareness.

## Commands

The desktop app (run from `apps/desktop/`):
```bash
npm install
npm run tauri dev      # full app: builds Rust + serves Vite on :1420, opens the window
npm run dev            # Vite frontend only
npm run build          # tsc typecheck + vite build
npm run tauri build    # bundle the .app
npx tauri icon path/to/logo.png   # regenerate the app icon set
```

The Rust workspace (run from the **repo root**):
```bash
cargo build --workspace            # core-rs + the desktop crate
cargo test --workspace             # core-rs unit tests + runner integration tests (fake ACP agent, apps/desktop/src-tauri/tests/)
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all
```

The legacy Python sidecar (only if `split-python/` is kept locally — gitignored):
```bash
cd split-python
uv sync
SPLIT_REPO_ROOT=$PWD/.. uv run python -m split.terminal claude   # CLI smoke
```

## Setup requirements

- **Rust** (`rustup`) + **Node** (for `npx` agents) on PATH. Agent CLIs
  download on first use via `npx -y …@version` / `uvx …` — first launch of a harness can lag.
- **uv** is only needed if you keep `split-python/` checked out locally to compare the retired
  Python sidecar; the desktop bar's default runtime is Rust and has no Python dependency.
- **Per-agent auth**: each harness signs in with its own account — `claude login`,
  `codex login`, Google login for Gemini, etc. (see each entry's `auth` note). Provider keys
  go in the **OS keychain** (macOS Keychain / Windows Credential Manager / Linux Secret Service,
  via the `keyring` crate in [apps/desktop/src-tauri/src/lib.rs](apps/desktop/src-tauri/src/lib.rs))
  under `service="split", account=KEY_NAME`. The UI writes them via `save_api_key`; the Rust
  runner pulls them at session spawn and injects them into the agent child's env via the
  `McpServerStdio.env` carried by the ACP SDK. A legacy `.env` at the repo
  root still works as a fallback for keys you provisioned before the keychain switch — the
  Rust runner doesn't read it directly, but anything the user already exported in their
  shell environment is inherited by both backends.
- **Mistral Vibe** has no npx distribution — download the binary into `var/bin/` (see README).
- **Local/on-device** harnesses (OpenCode/Qwen) want a local inference server
  (e.g. Ollama at `http://localhost:11434/v1`).
- macOS permissions for whatever runs the app (terminal/Python in dev, or Split.app).

## Gotchas

- **Path resolution** in `lib.rs` is now runtime (`SPLIT_REPO_ROOT` →
  exe-ancestor markers → `CARGO_MANIFEST_DIR`), so the repo isn't pinned to a fixed
  location or OS. The code is cross-platform (macOS + Windows; PATH/`which`→`where`/
  `open`→`start`/symlink→copy are cfg-gated, secrets via the `keyring` crate). macOS
  is the tested target; Windows is compiled + unit-tested in CI but not runtime-QA'd,
  and neither build is code-signed. See README "Platforms".
- **GUI PATH** — handled by `child_path()` in Rust; if an agent CLI isn't found, check it.
- **Process tree** — `stop_session` does `pkill -P` + `kill -KILL`; deeply nested
  grandchildren (node workers) may leak. Consider a pgid kill if it bites.
- **`var/workspace/` persists** — it's the agent's home (scratch), kept across runs;
  only the persona/skill projections are overwritten. `rm -rf var/workspace/` for a clean slate.
  Deliverables worth keeping move into the vault deliberately via the **"Keep in vault"** action
  (`keep_in_vault` in [lib.rs](apps/desktop/src-tauri/src/lib.rs), 🗃️ button in the
  ArtifactViewer) — `notes/` by default, or a chosen `projects/<slug>/`. The agent's cwd is NOT
  the vault; curation is user-driven (or the agent files durable notes/facts per the `vault` skill).
- **The boss's vault = `$SPLIT_VAULT`** (default `~/Documents/SplitVault`, deliberately
  OUTSIDE `var/`) — plain-markdown folder where experts file durable deliverables + facts:
  `INDEX.md` (scope list, inlined into every persona at boot), `_meta/boss-profile.md`,
  `notes/` (default bucket), `projects/<slug>/` (+ per-project `MEMORY.md` index). Doctrine =
  the auto-mounted `vault` skill ([config/skills/vault/SKILL.md](config/skills/vault/SKILL.md));
  session block = `vault_text` in [core-rs/src/persona.rs](core-rs/src/persona.rs); UI = the
  Vault overlay ([apps/desktop/src/vault/VaultOverlay.tsx](apps/desktop/src/vault/VaultOverlay.tsx),
  🗃️ chrome button) reusing `read_artifact`/`write_artifact` + the `vault_tree` command. The
  retired Obsidian/Notion workspace backends (picker, `workspaces.json`, `obsidian`/`notion`
  skills) were removed in favour of this native vault. A per-expert cross-session
  memory (`var/memory/`) was prototyped and **removed** — too thin to be useful;
  it'll be reimplemented properly later. The vault is the only durable store today.
- **Permissions are auto-approved** (bench posture); `fs/read_text_file`/`fs/write_text_file`
  are served from the real filesystem.
- **Operator UI narration** — the `operator` expert (Alfred) drives real macOS apps via the
  `cua-driver` MCP (wired in [config/tools.json](config/tools.json)), but the dedicated
  screen-driving narration (app rail / live frames) is **not yet wired** into the VEVT
  vocabulary; today it streams as text/steps like the others.
```