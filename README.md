# Split — many experts, in parallel, on any agent

Split is a desktop assistant that runs **a roster of experts**, each in its own
session. You pick an expert (a Consultant, a Lawyer, a Data Analyst, a computer
**Operator**, …), give it a task in plain language, and it streams back what it
does — research and citations, a slide deck, an interactive chart, a built app,
a driven macOS window. Several can run at once, side by side.

The bet underneath: **the "brain" is swappable plumbing.** An expert is a
*persona + skills + tools*, and that bundle should run unchanged on Claude,
Codex, Gemini, Mistral, or a local model. Split talks to all of them through one
wire — the **Agent Client Protocol (ACP)** — so the same Consultant can run on
your Claude Pro plan today and a local Ollama brain tomorrow, no rewrite.

> **Lineage.** This started as `acp-client` — a throwaway bench to prove *"can
> one Python client drive several agents over ACP, and does a portable
> `SKILL.md` actually activate inside them?"* It does. The bench grew the answer:
> a real expert roster, a multi-session UI, and an auth flow. The proof-of-concept
> code (the zero-dep `split/acp_client_raw.py`, the `split.terminal` CLI) is still here.

---

## The model: EXPERT = persona + skills + tools, run on a HARNESS

One idea, kept deliberately separate from the runtime:

```
EXPERT  =  persona (who it is)  +  skills (what it can do)  +  tools (what it can reach)
            experts/<name>.md       skills/<skill>/SKILL.md      tools.json (MCP)
                         │
                         └── all of it runs on a  HARNESS  (the brain/runtime)
                                                  harnesses.json — claude | codex | gemini | …
```

- The **persona** is projected into the agent's own instruction file
  (`AGENTS.md` — the cross-vendor standard — plus `CLAUDE.md` / `GEMINI.md` /
  `QWEN.md` shims). This is the agent's identity, *not* a skill.
- The **skills** an expert declares (`experts.json`) are mounted into the agent's
  skill location — `.claude/skills/` for Claude, `.agents/skills/` for most
  harnesses, `.vibe/skills/` for Mistral Vibe. The `SKILL.md` is identical; only
  the *mount path* differs (the one per-harness bit that isn't invariant).
- The **tools** are MCP servers from `tools.json`, handed to the agent via ACP's
  `session/new` (not its native config). ACP is what unifies them — Claude reads
  `.mcp.json`, Codex reads `~/.codex/config.toml`; we don't care, we pass them
  over the wire.

Config (`experts.json` / `harnesses.json` / `skills/` / `tools.json`) is kept
**separate from the generated `workspace/`** — the same split OpenClaw uses
(`~/.openclaw` config vs. the agent's working home).

---

## Experts (12 so far)

Pick one with `@` (terminal: `@consultant`; desktop: the picker). The
**kind** is informational — it tells the UI how to render (chat panel vs. a step
feed vs. an app preview).

| Expert | Kind | What it does | Leans on |
|---|---|---|---|
| **Toscanini** / Chief of Staff | operator | Conducts a team: delegates, tracks work, synthesizes | built-in team orchestration |
| **Wolfgang** / Consultant | researcher | Web research → a sharp, **cited** briefing, then slides or Word memos | `web-search`, `frontend-slides`, `docx`, `image-search`, `web-deploy` |
| **Curie** / Scientist | researcher | Literature review, paper search, replication planning, cross-field synthesis | `web-search`, `paper-search`, `docx`, `frontend-slides`, `web-deploy` |
| **Buffett** / Financier | analyst | Markets, FP&A, personal finance, investor reporting | `market-data`, `dashboard`, `frontend-slides`, `docx`, `web-deploy` |
| **Cicero** / Lawyer | advisor | Legal guidance, risk reads, contract drafts and clauses | `web-search`, `docx`, `legal-templates` |
| **Turing** / Data Analyst | analyst | CSV/Excel exploration, models, dashboards, interactive reports | `dashboard`, `ui-ux-pro-max`, `frontend-slides`, `docx`, `web-deploy` |
| **Tesla** / Engineer | builder | Builds micro-apps and landing pages, then ships them to a public URL | `web-deploy`, `image-search`, `ui-ux-pro-max` |
| **DaVinci** / Designer | creator | Brand identities, UI mockups, static graphics, redesigns | `web-audit`, `image-search`, `graphics`, `ui-ux-pro-max`, `frontend-slides` |
| **Babbage** / Vision | operator | Drives real macOS apps in the background | app-control tools when configured |
| **Bach** / Musician | creator | Generates original tracks from a prompt | `music-gen` |
| **Homer** / Podcaster | creator | Scripts, voices, scores, and edits podcast episodes | `voice-gen`, `music-gen` |
| **Kubrick** / Director | creator | Produces short videos from an idea, shot list, score, and narration | `video-gen`, `music-gen`, `voice-gen` |

Personas live in [`config/experts/`](config/experts/); the registry + render-kinds
are in [`config/experts.json`](config/experts.json).

---

## Skills

We follow the open **[Agent Skills](https://agentskills.io) standard**
(Anthropic-originated, now cross-vendor): a skill is a **folder** — a required
`SKILL.md` (`name` + `description` frontmatter + instructions) plus optional
`scripts/`, `references/`, `assets/`. Agents load it by *progressive disclosure*
(name/description at startup → full `SKILL.md` on a match → bundled scripts on
demand). The same folder runs unchanged across Claude, Codex, Gemini, OpenCode,
Cursor, Vibe… — i.e. almost every harness here. **This is the whole portability
thesis, and it's a standard, not a bet.**

**Skills are declared per-expert** in [`config/experts.json`](config/experts.json)
(`"skills": ["frontend-slides", …]`) and mounted at session start by
`install_skills`, which symlinks the **whole skill folder** into that harness's
skill dir (`.claude/skills/` for Claude, `.agents/skills/` for most harnesses,
`.vibe/skills/` for Mistral Vibe — the only per-harness glue). A declared skill
not yet vendored under `skills/<name>/` is silently skipped, so a persona may
name a skill before it exists.

Vendored in [`config/skills/`](config/skills/):

- **Research / retrieval:** `web-search`, `paper-search`, `image-search`.
- **Documents / presentations:** `docx`, `frontend-slides`.
- **Design / frontend / dashboards:** `ui-ux-pro-max`, `web-audit`, `graphics`,
  `dashboard`, `web-deploy`.
- **Finance / legal:** `market-data`, `legal-templates`.
- **Generation:** `music-gen`, `voice-gen`, `video-gen`; these call fal.ai /
  ElevenLabs and need `FAL_KEY` / `ELEVENLABS_API_KEY` where applicable.

---

## Harnesses (the agents — 10 wired)

Each harness is a runtime/brain. ACP calls each one an "agent"; we launch any
`command + args`, so even agents the public ACP registry can't express still
work. Logos for all configured harnesses ship in
[`apps/desktop/public/logos/`](apps/desktop/public/logos/).

| Harness | What it is | Launch | Auth | Status |
|---|---|---|---|---|
| `claude` | Claude Agent (claude-acp) | `npx @agentclientprotocol/claude-agent-acp` | `claude login` (Pro/Max) or `ANTHROPIC_API_KEY` | ✅ ready |
| `codex` | Codex CLI (codex-acp) | `npx @zed-industries/codex-acp` | `codex login` or `OPENAI_API_KEY` | ✅ ready |
| `gemini` | Gemini CLI | `npx @google/gemini-cli --acp` | Google login (free tier) or `GEMINI_API_KEY` | ✅ ready |
| `qwen` | Qwen Code (Gemini-CLI fork) | `npx @qwen-code/qwen-code --acp --experimental-skills` | `DASHSCOPE_API_KEY` | ✅ ready |
| `copilot` | GitHub Copilot CLI | `npx @github/copilot --acp` | Copilot sub (`gh auth login`) or `GH_TOKEN` | ✅ ready |
| `deepagents` | DeepAgents (LangChain, model-agnostic) | `npx deepagents-acp` | any provider key (or local) | ✅ ready |
| `opencode` | OpenCode (75+ providers) | `./var/bin/opencode acp` | model-agnostic; Ollama for zero-key local | ⚙️ external binary |
| `cursor` | Cursor Agent | `./var/bin/dist-package/cursor-agent acp` | `cursor-agent login` or `CURSOR_API_KEY` | ⚙️ external binary |
| `mistral-vibe` | Mistral Vibe | `./var/bin/vibe-acp` | `MISTRAL_API_KEY` (download binary, below) | ⚙️ external binary |
| `openclaw` | OpenClaw Gateway (a **bridge**) | `openclaw acp` | running Gateway + token | 🅿️ reserve² |

Configs live in [`config/harnesses.json`](config/harnesses.json) (versions pinned from the ACP
registry where one exists).

> ² **Reserve.** *OpenClaw* is a reserve entry: it won't launch until a Gateway
> is running and authed, and it nests its *whole* runtime — channels, memory,
> sub-agents — as one agent behind us.

---

## What the app actually does (two fronts, one engine)

Both fronts reuse the same engine in [`split/core.py`](split/core.py)
(`install_persona` / `install_skills` / `load_mcp` / `resolve_command` + the
registries) and the same ACP client. A session = spawn the harness → project the
expert's persona + skills into a **per-session workspace** → mount MCP tools via
`session/new` → stream the agent's `session/update` events back.

1. **Terminal** — [`split/terminal.py`](split/terminal.py), run as
   `python -m split.terminal`. Switch agents live with `@mentions`
   (`@claude research EVs`), watch text, tool calls, plans, and usage stream in
   color. The fastest way to test a persona/skill on a new harness.
2. **Desktop** — [`apps/desktop/`](apps/desktop/), a **Tauri 2 + React 19**
   single-window app: a floating, always-on-top **bar**. It spawns one
   [`split/runner.py`](split/runner.py) **per session** (`python -m split.runner`,
   process-per-session) and parses its `VEVT <json>` stdout line protocol; Rust
   tracks the live sessions so several stream in parallel without crossing wires.
   **Drop a file on the bar** to attach it to the next turn (📎 chip in the
   thread, full content folded into what the agent receives). An onboarding step
   picks the harness; the auth flow surfaces inline.

> A third **web front** (a zero-install browser UI over a WebSocket) used to live
> here; it was retired into `var/_retired/` in favour of the desktop app.

**Auth = the agent's job (ACP "Agent Auth").** When a harness needs sign-in, the
front gets `auth_required` and can either run ACP `authenticate` (OAuth), launch
that harness's browser-based login command (`claude login`, `codex login`, …),
or ask for the configured API key. Detection + the per-harness commands live in
[`split/auth.py`](split/auth.py); the desktop drives the same flow from Rust.

---

## The wire, in events

The agent's `session/update` stream is normalized to a handful of event types
the UI renders the same way (terminal colors / `VEVT` lines):

`say` (assistant text) · `thought` · `step` (tool call start/progress) ·
`plan` · `usage` (tokens + cost) · `status` (running/idle/error) ·
`auth_required` / `auth_result`.

The desktop's Rust↔Python contract is one `VEVT <json>` line per event on the
runner's stdout; everything else on stderr becomes a `.log`. `status: idle`
means a **turn** finished (the session stays open for the next turn).

---

## Setup

**Quickstart — the Makefile (macOS / Linux):**

```bash
make doctor     # check the toolchain (uv / node / cargo)
make install    # uv sync (Python) + desktop npm deps, in one shot
make app        # run the desktop app   (or `make cli` for the terminal front)
```

`make build` bundles the native `.app`; `make test` runs pytest + vitest; `make`
(no target) lists everything. Windows isn't covered by the Makefile — the
backend/CLI can run under WSL, but the desktop app is macOS-only today (see
*Platforms — macOS only, today* below).

Or do it manually:

```bash
cd split            # the repo root
uv sync             # creates .venv from pyproject.toml + uv.lock (deps + dev tools)
```

**Prerequisites**

- **[uv](https://docs.astral.sh/uv/)** — the Python toolchain (manages the venv +
  deps from `uv.lock`). `brew install uv`. (Targets Python 3.10+; the
  `split/acp_client_raw.py` fallback runs on 3.9.)
- **Node** (for `npx`) — launches the Claude/Codex/Gemini/Qwen/Copilot/DeepAgents adapters.
- **Auth** for whichever harness you test (table above). Provider keys go in
  `.env` at the repo root (loaded by `split.core`); CLI-login agents use their own login.

**Mistral Vibe binary** (no npx distribution):

```bash
mkdir -p var/bin && cd var/bin
# macOS arm64 example:
curl -L -o vibe-acp.zip https://github.com/mistralai/mistral-vibe/releases/download/v2.10.1/vibe-acp-darwin-aarch64-2.10.1.zip
unzip vibe-acp.zip && chmod +x vibe-acp && cd ../..
```

---

## Run

```bash
# 1) Terminal front (split-cli)
uv run python -m split.terminal             # pick an agent with @
uv run python -m split.terminal claude      # or start on one

# 2) Desktop app (split-app, Tauri)
cd apps/desktop && npm install && npm run tauri dev
```

Try the full loop on either front:

```
Research the EV market in 2026 and give me a short briefing   # persona: search + cite
Now turn that into a slide deck                                 # skill: frontend-slides
@claude use the add tool from the everything MCP to add 17 and 25   # tools (MCP): mcp__everything__get-sum → 42
```

`/quit` exits the terminal front.

---

## Repo layout

Four concerns, kept apart: the **engine + fronts** (`split/`), the **config**
(`config/`, portable & version-controlled), the **UIs** (`apps/`), and
**generated/vendored** state (`var/`, gitignored).

```
split/                # the Python backend (a package, run via `python -m split.<x>`)
  core.py             #   the ENGINE: layout, registries, persona+skill projection, mcp, command
  terminal.py         #   FRONT — the CLI  (python -m split.terminal)        ← "split-cli"
  runner.py           #   the per-session ACP sidecar the desktop spawns     (python -m split.runner)
  acp_client.py       #   the ACP Client protocol on the official SDK (agent-client-protocol)
  acp_client_raw.py   #   zero-dep fallback: the same client hand-rolled over stdlib (3.9)
  auth.py             #   Agent-Auth detection + the per-harness login commands

config/               # the EXPERT SYSTEM (portable, the OpenClaw "config" half)
  harnesses.json      #   the 10 HARNESSES (brains/runtimes)
  experts.json        #   the 12 EXPERTS (render kind + declared skills)
  tools.json          #   the TOOLS (MCP servers, mcpServers shape)
  experts/*.md        #   each expert's persona prompt
  skills/<name>/      #   portable SKILLs, Agent Skills standard (SKILL.md + optional scripts/)

apps/
  desktop/            # FRONT — the Tauri 2 + React 19 bar  (npm run tauri dev) ← "split-app"

var/                  # generated / vendored — gitignored, safe to delete
  workspace/          #   each session's PERSISTENT home (persona+skill projected in;
                      #     the agent's own files kept across runs)
  memory/             #   cross-session expert memory — survives `rm -rf workspace/`
    _user/USER.md     #     about the boss; every expert reads this
    <expert>/MEMORY.md#     this expert's own notes (Wolfgang's, Cicero's, …)
  bin/                #   downloaded harness binaries (opencode, vibe-acp, cursor-agent)
  _retired/           #   parked code (the old web front: server.py + web/)

pyproject.toml · uv.lock · .gitignore · .env (your keys) · .venv/
```

---

## Platforms — **macOS only, today**

The ACP/Python core is portable, but the app as a whole is currently pinned to
macOS. Honest blockers if you try Windows/Linux:

- **Python interpreter path** — the Tauri shell (`apps/desktop/src-tauri/src/lib.rs`)
  resolves the repo root + interpreter at runtime (`SPLIT_REPO_ROOT`/`SPLIT_PYTHON`,
  else exe-ancestor markers, else `CARGO_MANIFEST_DIR`), so it's no longer pinned to
  one machine — but its venv fallback is `.venv/bin/python` (Windows is
  `.venv\Scripts\python.exe`; set `SPLIT_PYTHON` to override).
- **Auth launchers** — `lib.rs` starts browser-based login commands as detached
  subprocesses. That avoids Terminal.app scripting, but the commands and auth
  dotfiles are still tested only on macOS.
- **Session teardown** — Rust kills the process tree with `pkill`/`kill`
  (Windows needs `taskkill`).
- **`PATH`** — built with a `:` separator and `/opt/homebrew` entries (Unix).
- **Binaries** — `var/bin/opencode`, `var/bin/vibe-acp`, the `*.node` addons are
  **darwin-arm64**; you'd need per-platform builds.
- **Window chrome** — `macOSPrivateApi`, vibrancy, `transparent` + borderless
  render differently (or not at all) off macOS.

The Python package itself uses no `fcntl`/`pty`/`os.fork`/`termios`, so
`split/` ports cleanly; cross-platform support is an enclosing-shell job
(relative paths, per-OS auth, `taskkill`, per-platform binaries, CI) — roughly a
few weeks.

---

## Notes / honest caveats

- **Skills:** per-expert (`config/experts.json`), currently 15 vendored in
  `config/skills/` (whole folders, per the Agent Skills standard). The gen-skills
  need `FAL_KEY` / `ELEVENLABS_API_KEY`; the other skills are local or use the
  harness's own search/tools.
- **`terminal/*` is not implemented** (we advertise `terminal: false`). Agents
  that run tools in-process (Claude, Codex) are fine; one needing the client to
  host a terminal will degrade — itself a finding.
- **Permissions:** the desktop runs the runner with `SPLIT_PERMISSION_MODE=prompt`
  and surfaces `permission_request` in the UI. The runner default is still
  `auto-allow` for bench/CLI usage unless overridden.
- **Vibe + MCP:** Vibe advertises `mcpCapabilities.http/sse = false` and keeps
  MCP in its own `~/.vibe/config.toml`; if it rejects servers over ACP the
  backend retries without them and warns.
- **`var/workspace/` persists** (it's the agent's home, like OpenClaw's); only the
  persona/skill projections are overwritten. `rm -rf var/workspace/` for a clean slate.
- **`var/memory/` is cross-session memory** — `_user/USER.md` (facts about the boss,
  shared by every expert) and `<expert>/MEMORY.md` (each expert's own notes), read
  at session start by `core.persona_text` and prepended to the projected persona.
  Frozen-snapshot pattern: writes during a session hit disk immediately but only
  appear in the next session's snapshot. No auto-extraction yet — the agent
  writes when the boss says "remember X" or when it spots something durable.

## License

Split is licensed under the [Apache License 2.0](LICENSE) — see [`LICENSE`](LICENSE)
and [`NOTICE`](NOTICE). Apache-2.0 is permissive and includes an explicit patent grant.

Dependency licenses are compatible: the **Agent Client Protocol** SDK
(`agent-client-protocol`, by Zed Industries) is **Apache-2.0**, and `python-dotenv`
is **BSD-3-Clause**. Split is an ACP *client* — the agent CLIs it drives (Claude,
Codex, Gemini, …) run as **separate external processes over the protocol** and are
**not bundled or redistributed** with Split, so their licenses don't affect Split's.
