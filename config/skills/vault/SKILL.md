---
name: vault
description: How and when to write things into the boss's vault — the doctrine for every Split agent. The vault is a plain-markdown folder at $SPLIT_VAULT (no app, no API — plain filesystem writes). Defines the bucket model (_meta / notes / projects), the index discipline (INDEX.md scope list + per-project MEMORY.md), the universal frontmatter vocabulary, the convention "notes by default, propose to promote when a project pattern emerges", and the boss-profile append discipline. Mounted on every expert.
---

# Vault — where to put what

You are an agent inside Split. The boss has a **vault** — a plain-markdown
folder at `$SPLIT_VAULT` (typically `~/Documents/SplitVault`). It always
exists; Split creates it before your session starts. You read and write it
with ordinary filesystem operations — no API, no token, no app.

The boss sees the vault inside Split (a tree + editor view) and can edit
any file by hand. Whatever you write there, the boss will read — and
whatever the boss edits, you'll read at your next session. The filesystem
is the single source of truth on both sides.

## The bucket model

| Bucket | What lives there | When you write here |
| ------ | ---------------- | ------------------- |
| `INDEX.md` | The scope list — one line per project + the fixed entries | When you create or retire a project |
| `_meta/boss-profile.md` | Durable facts about the boss — role, preferences, constraints | Whenever you learn something durable about the boss that every agent should know |
| `notes/` | One-off outputs and facts not tied to a project | DEFAULT — when no project is set on the session |
| `projects/<slug>/` | Curated work tied to a real project: deliverables AND facts, plus a `MEMORY.md` index | When `$SPLIT_PROJECT` is set, OR when the boss accepts your project-promotion proposal |

The persona block injected at session start ("Your vault") gives you the
exact write target for THIS session and inlines the current `INDEX.md`.

A project folder holds **three kinds of files**:

- **Deliverables** — the rendered work (briefs, memos, decks, exports).
- **Facts** — what no deliverable carries: decisions and their reasons
  ("evaluated X, dropped because Y"), dead ends ("tried Z, fails on W" —
  so no agent re-proposes it), boss preferences specific to this project,
  current state ("blocked waiting on …").
- **`MEMORY.md`** — the project's index. One line per file: link + one-line
  hook. This is what the next session reads FIRST.

## The index discipline (recall depends on it)

An agent only remembers what something in its context points to. The
indexes are that pointer surface — treat them as part of the write, not
as optional bookkeeping.

1. **After every vault write**, add (or refresh) the file's line in the
   nearest index: `projects/<slug>/MEMORY.md` for project files. `notes/`
   needs no per-file index — keep it flat and let filenames carry the date
   + topic.
2. **Index line format**: `- [title](filename.md) — <one-line hook>` —
   the hook is what makes future recall work; write it for an agent who
   hasn't read the file.
3. **When you create a project**, add its line to the vault-root
   `INDEX.md`: `- \`projects/<slug>/\` — <one-line description>`. When a
   project is clearly dead, say so in its INDEX line rather than deleting it.
4. **Keep indexes SHORT** — one line per entry. `INDEX.md` is injected
   into every session of every agent; its size is everyone's overhead.

**Reading side**: before working inside a project, read its `MEMORY.md`;
open individual files only when their index line is relevant to the task.
Don't bulk-read a whole project folder.

## Rule 0 — memories are point-in-time

A fact file records what was true when it was written. When an old fact
drives a decision, verify it still holds before asserting it. If you find
a fact that's wrong or superseded, update the file (and its index line) —
don't pile a contradicting file next to it.

## Rule 1 — default to `notes/`, never silently

If `$SPLIT_PROJECT` is unset, write to `notes/` with filename
`<today>-<your-slug>-<short>.md`. The frontmatter carries `project: null`.

ANNOUNCE the write in your reply. One line, prefixed with `📝`:

> `📝 Filed under notes/2026-06-10-sales-cold-outreach-template.md`

Never write durably without telling the boss the path. That's the
unbreakable contract — they need to know where things land.

## Rule 2 — propose a project when the signal is clear

After writing to `notes/`, check the conversation for **project signals**:

1. **Named entity** the boss treats as a thing — a client, product,
   campaign, event, book, deal, launch. ("Aurora Game", "Q3 launch",
   "the book", "Acme").
2. **Horizon** — "this quarter", "by July", "before the demo". Indicates
   the boss will come back to this.
3. **Cumulative output expected** — multiple deliverables, multiple
   agents likely to contribute.

If you see **two or more**, propose a project at the end of your reply:

> _This feels like it could be its own project — `aurora-game`? If you
> agree, I'll move this note and tag future work under it._

Then STOP. Don't auto-create the folder. Wait for the boss's reply.

If the boss says yes:
- Create `projects/<slug>/`, move the note you just wrote into it
  (update its `project:` frontmatter).
- Seed `projects/<slug>/MEMORY.md` with the moved file's line.
- Add the project's line to the vault-root `INDEX.md`.
- Tell the boss: "Set up `projects/<slug>/`. Future work under this
  project lands there directly."
- Hint that they can pin the project on the session via the composer's
  `#project` chip so subsequent turns skip the notes step entirely.

If the boss says no (or stays silent), leave the note where it is.
Don't ask again in the same session.

## Rule 3 — DON'T propose a project for one-off chats

Skip the proposal when:

- The output is generic and reusable across many contexts (a cold email
  template, a CV outline, a tax calendar). It stays in `notes/`.
- The reply is conversational (the boss asked a question, you answered,
  no artifact). Don't even write to notes — reply and move on.
- The output is throwaway scaffolding (a quick mockup as a thought
  experiment).

Asking "want to make this a project?" on every ephemeral chat is the most
annoying possible behaviour. At most one proposal per session, and only
when the signal is real.

## Rule 4 — read `boss-profile.md` first, append carefully

Every session, BEFORE writing your first answer, read
`$SPLIT_VAULT/_meta/boss-profile.md`. It tells you the boss's role,
preferences, constraints, things to never forget.

When you learn something durable about the boss ("Paul prefers terse
emails", "Paul's team uses GMT+1"), **append one line to the right
section** of the profile. Discipline:

- 1–3 lines per entry. No chronology. No paragraphs.
- Group under existing headings — don't invent new ones unless the
  existing ones really don't fit.
- If your new entry contradicts an older one, delete the older.
- Don't dump transcripts — only durable, cross-session facts.

Boss-profile updates DON'T require the propose-a-project flow. Just do it
and mention "(updated boss-profile.md with: …)" in your reply if relevant.

## The universal frontmatter vocabulary

Every file you write carries these fields. The vault view and the indexes
lean on them; missing fields = invisible work.

```yaml
description: <one line — what this file is, for someone who won't open it>
project: <slug>          # or null in notes/
agent: <your-slug>       # injected by the persona; don't change
type: <enum>             # one of the values below
status: <enum>           # one of the values below
created: YYYY-MM-DD
tags: [free, form, themes]
```

`description` is REQUIRED — it's what the vault view shows as the file's
subtitle and what index hooks are made of. Convert relative dates to
absolute everywhere ("yesterday" rots; "2026-06-09" doesn't).

### `type` enum (12 + 1)

| Type        | Meaning                                          |
| ----------- | ------------------------------------------------ |
| `deal`      | one row in the sales pipeline                    |
| `account`   | a company / contact tracked over time            |
| `brief`     | a one-pager describing scope / direction         |
| `meeting`   | notes from a conversation                        |
| `research`  | findings, citations, sources                     |
| `plan`      | a project plan                                   |
| `cycle`     | a sprint / weekly cycle inside a plan            |
| `mockup`    | a visual artifact (link to a binary)             |
| `memo`      | a written analysis / recommendation              |
| `task`      | a discrete action item                           |
| `decision`  | "we decided X because Y" — keep these short      |
| `draft`     | a generic deliverable that doesn't fit elsewhere |
| `profile`   | reserved for `boss-profile.md` only              |

### `status` enum

Generic: `backlog`, `active`, `blocked`, `done`, `cancelled`.

Type-specific:
- **deal**: `discovery`, `proposal`, `negotiation`, `won`, `lost`
- **task**: `todo`, `doing`, `done`
- **plan**: `planning`, `executing`, `wrapping`, `shipped`

### Type-specific optional fields

```yaml
# deal
amount: 45000
close_date: 2026-07-15
account: "[[acme-account]]"   # wiki-link

# plan / cycle
start_date: 2026-06-08
end_date: 2026-07-07
owner: paul

# meeting
with: "[[caroline-contact]]"
meeting_date: 2026-06-08

# research
source: https://example.com/article
confidence: high
```

## Filename conventions

`<YYYY-MM-DD>-<your-slug>-<short>.md` in `notes/`; inside a project folder
the date prefix is optional (the folder is the context) but keep slugs
short and stable. Examples: `2026-06-10-sales-h-followup.md`,
`decision-rebrand-name.md`.

## Cross-references

Use `[[note-slug]]` wiki-links inside markdown bodies whenever a file
touches another (a deal mentions an account, a plan references a brief).
A link to a slug that doesn't exist yet is fine — it marks something worth
writing, not an error.

## What this skill is NOT

- Not a place for agent self-notes ("how I do my job"). The vault holds the
  boss's work and durable facts — not your private scratch. Keep working
  notes in your session; don't file them here.
- Not a substitute for the boss telling you where to write. If the boss
  says "save this to project X", just do it and skip the proposal flow.
