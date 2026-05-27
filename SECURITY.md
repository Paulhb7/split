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
  filesystem on the host, unattended. Vision drives your real macOS apps. Treat
  every prompt with that in mind.
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

1. **Tool calls are auto-approved.** `ConsoleClient.request_permission`
   ([`split/acp_client.py`](split/acp_client.py)) allows *every* tool call with no
   prompt and no log. The agent can read/write files and run commands without
   asking.
2. **Unattended host access.** The `analyst` / `engineer` / `scientist` experts
   get `Read`/`Write`/`Bash` on the host; `vision` drives apps via cua. Nothing
   is sandboxed.
3. **Skills run bundled code.** Vendored skills under
   [`config/skills/`](config/skills/) ship `scripts/*.py` that execute and reach
   the network (e.g. `music-gen`/`video-gen` → fal.ai, `voice-gen` → ElevenLabs).
4. **MCP servers are mounted as declared.** Everything in
   [`config/tools.json`](config/tools.json) is launched and exposed to the agent,
   with `${VAR}` secrets expanded into its environment. Only add servers you
   trust.
5. **Provider keys live in plaintext `.env`** at the repo root (gitignored, never
   committed — see below). Anyone with read access to the checkout can read them.

## What is in place

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
4. **Scoping/encrypting** provider keys instead of a plaintext `.env`.

## Reporting a vulnerability

This is a small, private project. If you find a security issue, report it
**privately** — open a [GitHub Security Advisory](https://github.com/Paulhb7/split/security/advisories/new)
on the repo, or email **paulbarbaste@gmail.com**. Please don't open a public issue
for an unpatched problem.

Out of scope under the trust model above: prompt-injection-only chains, anything
that requires an untrusted user already sharing the operator's machine/session,
and raw scanner output without a demonstrated, reproducible impact.
