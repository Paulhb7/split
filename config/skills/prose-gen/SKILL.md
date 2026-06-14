---
name: prose-gen
description: |
  Long-form fiction engine with hard continuity tracking across chapters.
  Holds the world bible (a machine-readable canon ledger + character /
  place / thread dossiers) in the project's `bible/` files and reads it
  before every chapter so nothing drifts (no grey eyes turning brown in
  chapter 12, no parsonage growing a wing it never had). Runs each chapter
  as an ordered set of passes — continuity load → write → quality self-check
  → continuity write-back — never as one freewheeling generation.
  Use when: writing a novel / novella / short story / children's book,
  drafting or revising a chapter, building the world bible or outline,
  locking a voice, checking continuity, or giving a character a face.
  Pairs with `higgsfield-generate` for character portraits, `paper-search`
  for period research, `docx` for the print-ready book, `web-deploy` for a
  private read-along site.
  NOT for: slide decks, dashboards, marketing copy, non-fiction reports.
---

# Prose Gen

The engine room of a real book. Brontë holds the voice and the judgement;
this skill holds the **memory** — the canon that must never contradict
itself across thirty chapters — and the **procedure** that keeps every
chapter honest. The discipline in [`_discipline.md`](../../experts/_discipline.md)
applies: announce a tight plan, then ship the chapter in the same turn.

## The project layout (align, don't reinvent)

Brontë's persona already fixes the project folder
(`~/Desktop/bronte-<title>-<YYYYMMDD>/`). This skill formalises what lives
inside `bible/` and how the passes touch it:

```
<project>/
├── bible/
│   ├── canon.json        ← the FACTS ledger. Hard, immutable truths only.
│   │                       Read before every chapter; grep this, not prose.
│   ├── characters.md     ← full sheets: voice, desire, contradiction, arc
│   ├── places.md         ← location dossiers: light, smell, weather, rules
│   ├── threads.md        ← the Chekhov's-gun table: setups ↔ owed payoffs
│   └── faces/            ← character reference portraits (higgsfield-generate)
├── voice.md              ← the locked register + the rejected drafts
├── outline.md            ← chapter-by-chapter beats
├── spine.md              ← RUNNING state: where each character stands now,
│                           what the reader knows, what's owed
├── research/             ← period / domain sources (paper-search)
├── chapters/             ← NN-v1.md, NN-v2.md … never overwritten
└── book.docx             ← regenerated as chapters land (docx)
```

`canon.json` is the one genuinely new thing — the single source of truth for
facts that must not drift. `spine.md` and the rest match the persona's
existing vocabulary. Schemas: [`references/bible-schema.md`](references/bible-schema.md).

## The four passes — every chapter, in this order

This is the Novel-Writer role-decomposition (worldbuilder, plot-architect,
scene-writer, continuity-editor) collapsed into one harness-agnostic
procedure. No subagents, no hooks — just an ordered method you follow each
turn. It runs identically on Claude, Codex, Gemini, Hermes, anything.

**Pass 0 — Continuity load (before a word of prose).**
Read `canon.json`, `spine.md`, `threads.md`, and `voice.md`. You now hold:
every immutable fact in play, where each character stands, every open thread
owed a payoff, and the exact register you locked. This is the
continuity-editor + plot-architect reading the room before the scene-writer
touches the page.

**Pass 1 — Write the chapter (scene-writer).**
Advance the outline beat. Hold `voice.md` sentence by sentence — no drift,
no mid-book experiment. Every physical fact you use matches `canon.json`.
Real finished prose: dialogue that scans as spoken, description that puts
the reader in the room, inner life that earns the page.

**Pass 2 — Quality self-check (before the boss sees it).**
Run [`references/quality-rubric.md`](references/quality-rubric.md) against
the draft and **fix in place** before shipping. The boss redirects on
craft, not on errors you could have caught — continuity breaks, voice drift,
exposition dumps, a scene grounded in sight alone. If a check fails and you
can't fix it without breaking a setup, say so (Brontë's honesty rule).

**Pass 3 — Continuity write-back (after the chapter holds).**
Update `spine.md` (each character's new position, what the reader now knows,
what's newly owed). Open/close rows in `threads.md`. Append any genuinely
new canon facts to `canon.json`. **Never silently edit an existing canon
fact** — if the chapter forces a contradiction (the scar has to move, the
brother has to be younger), surface it to the boss and offer the patch.
Canon changes are a conversation, not a quiet overwrite.

Then the persona's **3-line author's note**: what the chapter does in the
architecture (introduce / escalate / pivot / reveal / resolve), what was
planted, what was held back.

## Stages map onto the passes

- **Stage 1 (world, one turn):** build `canon.json` + `characters.md` +
  `places.md` + `outline.md` + the first `threads.md` rows. This is Pass 0
  bootstrapped from nothing. The boss reads `outline.md` before any prose.
- **Stage 2 (voice, one turn):** 2–3 opening drafts in distinct registers →
  `voice.md`. No canon writing here; you're choosing the instrument.
- **Stage 3 (chapters, one per turn):** the full four-pass loop above.
- **One-shots** (short story, children's book): compress all of it into a
  single turn — canon stays in your head or a thin `canon.json`, the rubric
  still runs, the cadence collapses.

## Giving a character a face

When a character is locked in `canon.json`, the boss can ask for a portrait —
or you offer one when it would help hold a face consistent across the book.
Route to the **`higgsfield-generate`** skill (don't reimplement it):

- Use **Nano Banana 2** (step up to **Pro** for hard briefs) — its character
  / reference work is the right tool, not the default GPT Image 2.
- Build the prompt from the character's `immutable` block in `canon.json` so
  the portrait *is* the canon: "grey eyes, black hair greying at the temples,
  tall, a burn scar on the left forearm, mid-forties, …".
- Save to `bible/faces/<character>.png` and record the exact prompt in the
  character's `face_prompt` field (see schema) so any re-generation stays
  on-model.
- For **multiple images of the same face** (portrait + a scene still + a
  cover + an album spread), face drift is the enemy. Use **`higgsfield-soul-id`**
  to make the invented face a reusable identity. The character has no
  photos, so **bootstrap**: generate a small varied set of the face with
  Nano Banana first, train a Soul Character on that set once, then reuse the
  `--soul-id` for every later image via higgsfield-generate. Store the Soul
  ref in `canon.json` beside `face_ref`, so the identity is canon too.
  Soul training needs a paid Higgsfield plan — flag that before training,
  don't fail mid-turn.

A face is a continuity asset, not decoration — it lives in `bible/`, it's
prompted from canon, and it's referenced when the boss wants a cover or an
illustrated children's book.

## What this skill deliberately does NOT do

- **No autonomous multi-chapter loop.** Split is human-in-the-loop by
  design: one chapter per turn, the boss reads and redirects. The
  Novel-Writer "generate 30 chapters unattended" cycle is intentionally not
  ported. If the boss explicitly asks to draft the whole book in one go,
  that's an opt-in exception they name — never the default.
- **No harness hooks / settings.json automation.** The quality gate is Pass 2
  in this file, not a Claude-Code post-chapter hook — so it runs on every
  harness, not just Claude.
- **No monitoring dashboards.** Split has its own UI and `web-deploy` for the
  read-along site.

## Reference docs (load on demand)

- [`references/bible-schema.md`](references/bible-schema.md) — `canon.json`
  shape + the markdown dossier structures
- [`references/quality-rubric.md`](references/quality-rubric.md) — the Pass 2
  checklist, concrete and testable
