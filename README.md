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
> CLI (`split.terminal`) is still here.

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
**separate from the generated `workspace/`** — portable, version-controlled
config on one side; the agent's working home on the other.

---

## Experts (35 in the roster — super · genius · coach)

Pick one with `@` (terminal: `@consultant`; desktop: the picker). The **kind** is
informational — it tells the UI how to render (chat panel vs. a step feed vs. an
app preview). Three tiers: **super** agents are jobs (their label *is* the role);
**genius** agents are historical figures unlocking outputs you couldn't produce
alone; **coach** agents help you grow in a life domain. A few are *deferred* —
visible in the Cabinet but off the active picker until a needed piece ships.

**Super agents — the jobs**

| Expert | Kind | What it does | Leans on |
|---|---|---|---|
| **Consultant** | researcher | Web research into ready slides or markdown memos | `frontend-slides` |
| **Scientist** | researcher | Maps the state of the art, builds idea bridges, drafts lit reviews | `paper-search`, `literature-review`, `scientific-brainstorming`, `hypothesis-generation`, `networkx`, `docx`, `frontend-slides`, `web-deploy` |
| **Financier** | analyst | Markets, FP&A, personal finance & reporting | `market-data`, `model-audit`, `dashboard`, `ui-ux-pro-max`, `frontend-slides`, `docx`, `web-deploy` |
| **Lawyer** | advisor | Legal guidance, risk reads & contract drafts | `docx`, `legal-templates`, `contract-review` |
| **Data Analyst** | analyst | Explores CSV/Excel data, ships interactive dashboards | `dashboard`, `ui-ux-pro-max`, `frontend-slides`, `docx`, `web-deploy` |
| **Engineer** | builder | Builds micro-apps & landing pages, ships them to a public URL | `web-deploy`, `ui-ux-pro-max` |
| **Designer** / UI & prototypes | creator | Gorgeous interactive app & site mockups, ready to hand to Engineer | `ui-ux-pro-max` |
| **Influencer** / viral social & ads | creator | Viral social content & ads — hooks, UGC video, the virality score | `higgsfield-generate` (Marketing Studio + Virality Predictor) / `-soul-id` / `-product-photoshoot`, `frontend-slides`, `web-deploy` |
| **Project Manager** · *deferred* | organizer | Turns "we need X by Y" into a real plan with owners, dates, status | `docx`, `frontend-slides`, `dashboard`, `web-deploy` |
| **Sales** · *deferred* | advisor | Tracks leads, drafts outreach, closes the loop on every deal | `docx`, `frontend-slides` |

**Genius agents — the unlocks**

| Expert | Kind | What it does | Leans on |
|---|---|---|---|
| **DaVinci** / world-builder | creator | Turns an image into an immersive 3D scene; brand identities, mockups, redesigns | `higgsfield-generate` / `-soul-id` / `-product-photoshoot` / `-marketplace-cards`, `ui-ux-pro-max`, `frontend-slides`, `docx`, `web-deploy` |
| **Karl** / couturier | creator | Designs garments & footwear, dresses them on a model, builds the lookbook | `higgsfield-generate` / `-soul-id` / `-product-photoshoot`, `taste-design`, `frontend-slides`, `web-deploy` |
| **Gaudí** / architecte | creator | Designs spaces — floor plan, explorable 3D, material board, buildable spec | `higgsfield-generate`, `cad-design`, `taste-design`, `frontend-slides`, `web-deploy`, `docx` |
| **Wolfgang** / composer | creator | Composes original music — songs, scores, soundtracks | `higgsfield-generate` (Sonilo music, Mirelo SFX) |
| **Homer** / audio producer | creator | Scripts, voices and edits full podcasts | `higgsfield-generate` (Inworld voice, Sonilo, Mirelo) |
| **Hitchcock** / director | creator | Directs short films — storyboard first, then visual + score + voice, in one cut | `higgsfield-generate`, `higgsfield-soul-id` |
| **Brontë** / novelist | creator | Writes novels — characters, arcs, world, voice, by chapter | `prose-gen`, `paper-search`, `higgsfield-generate`, `docx`, `web-deploy` |
| **Ride** / astronomer | researcher | Reads the sky live — NASA/ESA/JWST feeds, sky tonight, ISS passes — as gorgeous live pages | `nasa-api`, `astropy`, `astro-data`, `sky-viz`, `frontend-slides`, `docx`, `web-deploy` |
| **Curie** / scientist | researcher | Frontier scientist for orphan diseases — targets, structures, drug repurposing | `rdkit`, `esm`, `diffdock`, `medchem`, `molecular-dynamics`, `pymatgen`, `scanpy`, `biopython`, `primekg`, `pytdc`, `database-lookup`, `paper-lookup`, `paper-search` |
| **Tesla** / mechanical engineer | builder | Designs 3D-printable parts & mechanisms — parametric CAD, animated, with 2D blueprints, in a shareable report | `cad-design`, `ui-ux-pro-max`, `web-deploy`, `docx` |
| **Maradona** / Le Diez | analyst | Live football dossiers: form, xG, the key duel, his verdict | `football-data`, `metadata`, `sports-news`, `sports-reporter`, `frontend-slides`, `docx`, `web-deploy` |
| **Marco Polo** / le voyageur | organizer | Designs trips — day-by-day itineraries, real places, a carnet you carry | `higgsfield-generate`, `frontend-slides`, `web-deploy`, `docx` |
| **Vatel** / maître d'hôtel | organizer | Stages events — menu, table scenography, run-of-show, an unforgettable evening | `higgsfield-generate`, `taste-design`, `frontend-slides`, `web-deploy`, `docx` |
| **Socrates** / recruiter | recruiter | Interviews you to design your own custom experts | persona-only |
| **Alfred** / Majordome · *deferred* | operator | Drives your Mac apps with your logins, books, runs admin | `cua-driver` (background macOS app control via the AX tree) |
| **Indie** / archive hunter · *deferred* | finder | Hunts rare manuscripts, lost archives, out-of-print texts, primary sources | `paper-search`, `docx`, `web-deploy` |

**Coaches — grow in a life domain** (all on `coach-tracker`, `docx`, `frontend-slides`)

| Expert | Kind | What it does |
|---|---|---|
| **Diet Coach** / nutrition | coach | Builds meal plans, decodes nutrition labels, holds you accountable |
| **Learning Coach** / study | coach | Maps a syllabus for any topic, ships flashcards & weekly checks (+ `paper-search`) |
| **Sport Coach** / training | coach | Designs your training cycle, progressive overload, recovery plan |
| **Cooking Coach** / cuisine | coach | Teaches techniques, scales recipes, suggests substitutions live |

Personas live in [`config/experts/`](config/experts/); the registry + render-kinds
are in [`config/experts.json`](config/experts.json). The `vault` skill (vault
doctrine) is auto-mounted on every expert and isn't listed per-row.

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
(`"skills": ["frontend-slides", …]`) and mounted ONCE in the expert's persistent
workspace by `ensure_expert_workspace`, which symlinks each allowed skill into
every harness skill-dir (`.claude/skills/`, `.agents/skills/`, `.vibe/skills/`)
so any harness running this expert finds its kit. The set is reconciled idempotently
on every call — adding a skill to `experts.json` makes it appear on next launch,
removing one unlinks it. A declared skill not yet vendored under `skills/<name>/`
is silently skipped, so a persona may name a skill before it exists.

Vendored in [`config/skills/`](config/skills/) (47, grouped):

- **Documents / web / design:** `docx`, `frontend-slides`, `web-deploy`,
  `ui-ux-pro-max`, `dashboard`.
- **Research / retrieval / writing:** `paper-search`, `paper-lookup`,
  `literature-review`, `scientific-brainstorming`, `hypothesis-generation`,
  `database-lookup`, `prose-gen`.
- **Finance / legal:** `market-data`, `model-audit`, `legal-templates`,
  `contract-review`.
- **Science (Curie):** `rdkit`, `esm`, `diffdock`, `medchem`,
  `molecular-dynamics`, `pymatgen`, `scanpy`, `biopython`, `primekg`, `pytdc`,
  `networkx` — Python scientific stacks; install on first use.
- **Astronomy (Ride):** `nasa-api` (NASA Open APIs, `DEMO_KEY` works),
  `astropy` (sky math), `astro-data` (astroquery + skyfield), `sky-viz`
  (WebGL star maps / orbits / trackers).
- **Engineering (Tesla & Gaudí):** `cad-design` — parametric CadQuery →
  STL/STEP/GLB + SVG + WebGL viewer, with animated-assembly output for
  mechanisms and 2D blueprint sheets (SVG/PDF). Tesla designs objects;
  Gaudí leans on it for floor plans of spaces.
- **Sport (Maradona):** `football-data`, `sports-news`, `sports-reporter`,
  `metadata`.
- **Coaching:** `coach-tracker`.
- **Generation (DaVinci / Karl / Gaudí / Wolfgang / Homer / Hitchcock / Influencer / Marco Polo / Vatel):** `higgsfield-generate`,
  `higgsfield-soul-id`, `higgsfield-product-photoshoot`,
  `higgsfield-marketplace-cards` — wrap the `higgsfield` CLI (browser sign-in via
  the **Connect Higgsfield** chip, generations cost credits). One account covers
  image, video, 3D, music (Sonilo), SFX (Mirelo) and voice (Inworld TTS) — no
  provider API keys.
- **Cross-cutting:** `vault` (the $SPLIT_VAULT doctrine) — auto-mounted on
  every expert, not declared per-expert.

---

## Harnesses (the agents — 9 configured)

Each harness is a runtime/brain. ACP calls each one an "agent"; we launch any
`command + args`, so even agents the public ACP registry can't express still
work. Logos for all configured harnesses ship in
[`apps/desktop/public/logos/`](apps/desktop/public/logos/).

| Harness | What it is | Launch | Auth | Status |
|---|---|---|---|---|
| `claude` | Claude Agent (claude-acp) | `npx @agentclientprotocol/claude-agent-acp` | `claude login` (Pro/Max) or `ANTHROPIC_API_KEY` | ✅ tested working |
| `codex` | Codex CLI (codex-acp) | `npx @zed-industries/codex-acp` | `codex login` or `OPENAI_API_KEY` | ✅ tested working |
| `gemini` | Gemini CLI | `npx @google/gemini-cli --acp` | Google login (free tier) or `GEMINI_API_KEY` | ✅ tested working |
| `qwen` | Qwen Code (Gemini-CLI fork) | `npx @qwen-code/qwen-code --acp --experimental-skills` | `DASHSCOPE_API_KEY` | ⚠️ configured, not working yet |
| `copilot` | GitHub Copilot CLI | `npx @github/copilot --acp` | Copilot sub (`gh auth login`) or `GH_TOKEN` | ✅ tested working |
| `opencode` | OpenCode (75+ providers) | `./var/bin/opencode acp` | model-agnostic; Ollama for zero-key local | ✅ tested working |
| `cursor` | Cursor Agent | `./var/bin/dist-package/cursor-agent acp` | `cursor-agent login` or `CURSOR_API_KEY` | ⚙️ external binary |
| `mistral-vibe` | Mistral Vibe | `./var/bin/vibe-acp` | `MISTRAL_API_KEY` (download binary, below) | ✅ tested working |

Configs live in [`config/harnesses.json`](config/harnesses.json) (versions pinned from the ACP
registry where one exists).

Not in the live registry yet: **Hermes** and **Kimi Code** need configuration,
**Grok** still needs a test pass.

---

## What the app actually does

The desktop bar starts one session per click. The portable engine in
[`core-rs/`](core-rs/) handles workspace projection, the per-session archive,
the permission rule engine, and the harness model-picker translation; the
**native Rust runner** in
[`apps/desktop/src-tauri/src/runner.rs`](apps/desktop/src-tauri/src/runner.rs)
drives ACP end-to-end on the canonical `agent-client-protocol` crate. A
session = spawn the harness inside the expert's **persistent per-expert
workspace** (projected once, refreshed only when sources change) → mount MCP
tools via `session/new` → stream the agent's `session/update` events back as
VEVT events the React reducer consumes.

[`apps/desktop/`](apps/desktop/) is a **Tauri 2 + React 19** single-window
app: a floating, always-on-top **bar**. **Drop a file on the bar** to attach
it to the next turn (📎 chip in the thread, full content folded into what
the agent receives). An onboarding step picks the harness; the auth flow
surfaces inline.

**Edit the agent's deliverables in-app.** Files the agent produces in its
workspace (`var/workspace/<expert>/…`) surface as 📦 chips under the thread.
Clicking one opens a split view: the conversation stays on the left, the
artifact fills the right. **`.md` and `.html` artifacts (slides, briefs,
docs) open straight into a WYSIWYG editor** — TipTap with a sticky toolbar
(headings, lists, quotes, code, link), a bubble menu on selection, and
markdown round-trip so what's on disk stays a real `.md`. HTML artifacts
become `contentEditable` in a sandboxed iframe so titles / bullets / text
leaves are click-to-edit; Save extracts the mutated DOM and writes it
back. ⌘S saves, the divider between rail and viewer is **draggable** (and
remembered). Other text types (code, JSON, CSV…) keep a preview → ✎ →
textarea toggle. CSV renders as a table, PDFs inline, images inline, the
rest falls back to "open with default app". Anything visually rendered
prints to PDF via the OS print sheet (`⎙`).

> Legacy: a third **web front** (zero-install browser UI over a WebSocket)
> was retired into `var/_retired/`. The Python sidecar (`split.runner`) and
> terminal front (`split.terminal`) live at [`split-python/`](#repo-layout)
> *if you keep it on disk* — it's gitignored, opt-in via DevTools.

**Auth = the agent's job (ACP "Agent Auth").** When a harness needs sign-in,
the runner emits `auth_required` and the UI can either run ACP `authenticate`
(OAuth), launch that harness's browser-based login command (`claude login`,
`codex login`, …), or ask for the configured API key. Detection + the
per-harness commands live in the Rust runner.

---

## The wire, in events

The agent's `session/update` stream is normalized to a handful of event types
the UI renders the same way:

`say` (assistant text) · `thought` · `step` (tool call start/progress) ·
`plan` · `usage` (tokens + cost) · `commands` (slash-command palette) ·
`status` (running/idle/error) · `auth_required` / `auth_result` ·
`permission_request`.

The Rust runner emits these directly via `app.emit("session-event", …)`;
the legacy Python sidecar (when opted in) emits the same vocabulary as
`VEVT <json>` lines on stdout. Either way, `status: idle` means a **turn**
finished (the session stays open for the next turn).

---

## Setup

**Quickstart — the Makefile (macOS / Linux):**

```bash
make doctor     # check the toolchain (cargo / node / npm)
make install    # desktop npm deps (cargo deps come on first build)
make app        # run the desktop app — native Rust runner
```

`make build` bundles the native `.app`; `make test` runs the Rust workspace
tests (`cargo test --workspace`) + vitest; `make` (no target) lists everything.
The retired Python sidecar is no longer in the Makefile — to compare behaviour,
run it standalone from inside the gitignored `split-python/` (see *Legacy
Python* below).

**Windows** (no `make` — it isn't installed by default; the Makefile is just a
Unix-side convenience wrapper around the npm scripts below). From `apps/desktop/`:

```powershell
npm install
npm run tauri dev      # run the app in dev (equivalent of `make app`)
npm run tauri build    # bundle the .exe / .msi (equivalent of `make build`)
npm test               # vitest          # cargo test --workspace   (Rust tests)
```

Prereqs are the same as macOS — Rust (`rustup`) + Node on PATH. macOS is the
tested target; Windows is the cross-platform build (compiled + unit-tested in
CI, see *Platforms* below). If you'd rather use the `make` targets on Windows,
install GNU Make (`winget install ezwinports.make`, scoop, or Git Bash).

Or do it manually:

```bash
cd apps/desktop && npm install      # frontend deps (Vite/React + Tauri build glue)
cargo build --workspace             # warms the Rust deps (core-rs + the desktop crate)
```

**Prerequisites**

- **[Rust](https://rustup.rs/)** — the workspace's primary toolchain. `rustup
  install stable`. Used to build the engine (`core-rs/`) and the desktop bar.
- **Node** (for `npx`) — launches the Claude/Codex/Gemini/Qwen/Copilot adapters,
  and serves Vite during `tauri dev`.
- **Auth** for whichever harness you test (table above). Provider keys saved
  through the desktop UI go in your **OS keychain** (macOS Keychain / Windows
  Credential Manager / Linux Secret Service) under `service="split"`; the Rust
  runner pulls them at session spawn and injects them into the agent's env via
  the `McpServerStdio` config (no `.env` needed). CLI-login agents use their own
  login flow.
- **[uv](https://docs.astral.sh/uv/)** *(optional)* — only needed if you keep
  `split-python/` checked out locally to compare the retired Python backend.
  `cd split-python && uv sync` from inside the gitignored folder.

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
# Desktop app (split-app, Tauri) — Rust runner by default
cd apps/desktop && npm install && npm run tauri dev
```

The legacy terminal front (`python -m split.terminal`) only works if you
keep `split-python/` checked out locally — see [Legacy Python
backend](#default-runtime-rust) below.

Try the full loop:

```
Research the EV market in 2026 and give me a short briefing   # persona: search + cite
Now turn that into a slide deck                                 # skill: frontend-slides
@claude use the add tool from the everything MCP to add 17 and 25   # tools (MCP): mcp__everything__get-sum → 42
```

`/quit` exits the terminal front.

---

## Repo layout

Four tracked concerns + one local-only legacy: the **Rust backend**
(`core-rs/`), the **config** (`config/`, portable & version-controlled), the
**UIs** (`apps/`), and **generated/vendored** state (`var/`, gitignored).
The retired **Python backend** lives at `split-python/` *if* you keep it
locally — it's gitignored, fresh clones don't get it.

```
core-rs/              # the Rust BACKEND — portable engine (cargo workspace member)
  src/persona.rs      #   workspace projection (AGENTS.md + cross-vendor shims + skill symlinks)
  src/archive.rs      #   per-session events.ndjson + meta.json (with acp_sid for resume)
  src/permissions.rs  #   allow/ask/deny rule engine (DEFAULT_DENY guards + glob match)
  src/harness_config.rs#  Hermes/OpenCode model-picker translation (CLI args + managed config dir)

config/               # the EXPERT SYSTEM (portable, version-controlled)
  harnesses.json      #   the 9 HARNESSES (brains/runtimes)
  experts.json        #   the 35 EXPERTS (render kind + declared skills)
  tools.json          #   the TOOLS (MCP servers, mcpServers shape)
  experts/*.md        #   each expert's persona prompt
  skills/<name>/      #   portable SKILLs, Agent Skills standard (SKILL.md + optional scripts/)

apps/
  desktop/            # FRONT — the Tauri 2 + React 19 bar  (npm run tauri dev) ← "split-app"
                      #   src-tauri/ depends on `core-rs/` for the portable engine + houses the
                      #   ACP runner (`runner.rs`) — the default runtime in the shipped .dmg.

var/                  # generated / vendored — gitignored, safe to delete
  workspace/          #   each session's PERSISTENT home (persona+skill projected in;
                      #     the agent's own files kept across runs)
  sessions/           #   per-session archive (events.ndjson + meta.json), same shape both backends
  state/              #   small app state (e.g. the chosen vault location pointer)
  bin/                #   downloaded harness binaries (opencode, vibe-acp, cursor-agent)
  _retired/           #   parked code (the old web front: server.py + web/)

split-python/         # LOCAL-ONLY (gitignored) — the retired Python backend, kept for
                      #   reference + parity sweeps. Not in the repo, and no longer wired
                      #   into the app. To compare behaviour: cd split-python && uv sync,
                      #   then run the sidecar standalone (python -m split.terminal / runner).
                      # The desktop bar runs purely on Rust.

Cargo.toml            # workspace root — pulls in apps/desktop/src-tauri + core-rs
.gitignore · .env (legacy fallback for keys; new keys go to the OS keychain)
```

### Runtime: Rust only

The **native Rust runner** (`apps/desktop/src-tauri/src/runner.rs` on the
canonical `agent-client-protocol` crate) is the sole session backend. It speaks
ACP in-process, lets the `.dmg` ship without a Python runtime, and covers every
capability the Python sidecar did (auth flow, session/resume, logout, permission
engine with `DEFAULT_DENY` guards, MCP servers, fs read/write callbacks,
persona projection, harness model picker, OTLP env, stderr capture).

The retired Python sidecar (`python -m split.runner`) is no longer wired into
the app — its dispatch and the old `localStorage.setItem("split.runner",
"python")` opt-in were removed. It lives, reference-only, in the gitignored
`split-python/` for parity sweeps; run it standalone (`cd split-python && uv
sync`) if you want to compare. Because it wrote byte-identical
`var/sessions/<id>/{events.ndjson, meta.json}` archives, sessions it recorded
still replay correctly through the Rust path.

---

## Platforms — **macOS + Windows (unsigned)**

macOS is the primary, battle-tested target. **Windows** is supported as a
cross-platform build: the Rust + Tauri code is platform-portable and is
compiled + unit-tested on `windows-latest` in CI. The Windows *runtime* is not
yet exercised end-to-end in CI, so treat it as "builds and should run" rather
than "fully QA'd". Neither platform ships **code-signed** today (see below).

What's portable (and how):
- **Repo-root resolution** — resolved at runtime (`SPLIT_REPO_ROOT`, else
  exe-ancestor markers holding `config/harnesses.json` + `Cargo.toml`, else
  `CARGO_MANIFEST_DIR`); not pinned to one machine or OS.
- **`PATH`** — per-OS: `:`-joined Unix dirs (`/opt/homebrew`, …) on macOS/Linux,
  `;`-joined inherited PATH (+ `%USERPROFILE%\.cargo\bin`) on Windows.
- **Command portability** — `which`→`where`, `open`→`start`/`xdg-open`, the
  ⌘J global toggle becomes Ctrl+J off macOS.
- **Workspace projection** — persona/skill projection uses symlinks on Unix and
  falls back to copies on Windows (no Developer-Mode requirement), via the
  `symlink` shim in [core-rs/src/persona.rs](core-rs/src/persona.rs).
- **Secrets** — the `keyring` crate already targets the Windows Credential
  Manager / macOS Keychain / Linux Secret Service.

Remaining Windows rough edges (degrade gracefully, don't block):
- **Vendored binaries** — `var/bin/opencode`, `var/bin/vibe-acp` are
  **darwin-arm64**; the npx-based harnesses work cross-platform, the vendored
  ones need a Windows build.
- **Harness installers** — the `brew`/`curl | bash` install paths are Unix; on
  Windows they fall through to opening the docs URL (install the runtime
  manually).
- **Window chrome** — vibrancy is macOS-only; the Windows window renders without
  the blur backdrop.

### Code signing — not done (free, with friction)

Neither build is signed, so first launch shows a security prompt:
- **macOS** (Gatekeeper): right-click → **Open**, or
  `xattr -dr com.apple.quarantine /Applications/Split.app`.
- **Windows** (SmartScreen): **More info → Run anyway**.

Signing is optional and costs money (Apple Developer ID ≈ $99/yr; a Windows
Authenticode cert ≈ $200–700/yr on a hardware token), so it's deferred until
there's real external distribution.

---

## Notes / honest caveats

- **Persona / roleplay injection:** experts are real prompt personas, not just
  UI labels. `core.persona_text()` composes `_discipline.md` + memory +
  `config/experts/<expert>.md`, writes that into `AGENTS.md`/vendor shims, and
  the runner also prepends it to the first user turn so harnesses that ignore
  workspace instruction files still see it. This is pragmatic, but it is not a
  standardized ACP system prompt; the underlying model's own instruction stack
  can still leak through.
- **Skills:** per-expert (`config/experts.json`), currently 47 vendored in
  `config/skills/` (whole folders, per the Agent Skills standard). The
  `higgsfield-*` skills wrap the `higgsfield` CLI (browser sign-in, credits);
  the other skills are local or use the harness's own search/tools.
- **`terminal/*` is not implemented** (we advertise `terminal: false`). Agents
  that run tools in-process (Claude, Codex) are fine; one needing the client to
  host a terminal will degrade — itself a finding.
- **Permissions:** the desktop runs the runner with `SPLIT_PERMISSION_MODE=prompt`
  and surfaces `permission_request` in the UI. The runner default is still
  `auto-allow` for bench/CLI usage unless overridden.
- **Vibe + MCP:** Vibe advertises `mcpCapabilities.http/sse = false` and keeps
  MCP in its own `~/.vibe/config.toml`; if it rejects servers over ACP the
  backend retries without them and warns.
- **`var/workspace/` persists** (it's the agent's home); only the
  persona/skill projections are overwritten. `rm -rf var/workspace/` for a clean slate.
- **The vault location is configurable** — during onboarding (after agent
  selection) the user picks a parent folder and Split creates `SplitVault` inside
  it. The choice is persisted in `var/state/vault.txt`; the Rust runner reads it at
  startup so `$SPLIT_VAULT` points there for every session. Defaults to
  `~/Documents/SplitVault`. Override for tests/power users with the `SPLIT_VAULT`
  env var, which still wins over the saved choice.

## License

Split is licensed under the [Apache License 2.0](LICENSE) — see [`LICENSE`](LICENSE)
and [`NOTICE`](NOTICE). Apache-2.0 is permissive and includes an explicit patent grant.

Dependency licenses are compatible: the **Agent Client Protocol** SDK
(`agent-client-protocol`, by Zed Industries) is **Apache-2.0**, and `python-dotenv`
is **BSD-3-Clause**. Split is an ACP *client* — the agent CLIs it drives (Claude,
Codex, Gemini, …) run as **separate external processes over the protocol** and are
**not bundled or redistributed** with Split, so their licenses don't affect Split's.
