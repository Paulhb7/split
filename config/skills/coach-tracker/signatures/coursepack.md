---
slug: coursepack
name: Syllabus / Coursepack
tagline: University handout — serif body, §-section numbering, ✓/◯ margin marks, paper background.
mood: scholarly, calm, patient, intellectually-serious
references: Princeton coursepacks, MIT OCW handouts, Penguin Classics intros, Logseq notebooks
default_for: learning (any multi-week syllabus or study program)
also_consider_for: a cooking technique-ladder if it leans pedagogical (vs editorial)
palette: warm paper + deep ink + scholarly accent (oxblood, deep teal, or burnt umber)
---

# Syllabus / Coursepack

The scholarly dashboard. Reads as a university handout from a course
you're glad to be enrolled in. Section numbering is rendered like a
printed course outline, not like Notion blocks.

## Preview

```
┌── 03  DASHBOARD ────────────────────────────┐
│                                              │
│   MARTIN GMAT — QUANT TRACK                  │
│   Week 06 of 12  ·  Tue 09 Jun 2026          │
│   ═══════════════════════════════════════    │
│                                              │
│   §1. TODAY'S REVIEW QUEUE        4 due       │
│       ─────────────────────────────────────  │
│       ✓  Permutations w/ restrictions         │
│       ✓  Inequality flips                     │
│       ◯  Geometry: similar triangles          │
│       ◯  DS: sufficient vs necessary          │
│                                              │
│   §2. WEEK CHECKPOINT             ⓘ Fri      │
│       ─────────────────────────────────────  │
│       30-question mock · ~45 min              │
│       Last: 23/30  ·  72nd %tile              │
│                                              │
│   §3. STUDY STREAK                            │
│       ───────────  18 days  ───────────       │
│       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ → today              │
│                                              │
│   §4. CONCEPT GRAPH               14 / 28     │
│       ─────────────────────────────────────  │
│       ARITHMETIC    ●●●●●●●● mastered         │
│       ALGEBRA       ●●●●●●○○ in progress      │
│       GEOMETRY      ●●○○○○○○ early            │
│       DATA SUFF     ○○○○○○○○ not started      │
└──────────────────────────────────────────────┘
```

## Type

- **Body** (the bulk of content): a literary serif — `Source Serif
  Pro`, `Newsreader`, `Crimson Pro`, `EB Garamond`. Reads like a
  printed handout, not a screen.
- **Headers** (course title, week marker): the same serif at larger
  size, with bold or italic for emphasis.
- **Labels / metadata** (`due`, `Fri`, `days`): a precise neutral sans
  — `Inter Tight`, `Geist`. Small.
- **Section numbering**: rendered as `§1 §2 §3 §4` in italic small-caps,
  serif. Like a printed course outline.

## Today (the hero)

- **Course header**: serif title (`MARTIN GMAT — QUANT TRACK`), then a
  metadata line below (`Week 06 of 12 · Tue 09 Jun 2026`), then a
  double-rule (`════════`) divider — that's the page header.
- **Section §1 (Review queue)**: numbered topics rendered as a reading-
  list. Each row prefixed with a margin-mark — `✓` (done) / `◯`
  (pending). Never square checkboxes. Topic name in body serif.

## Color

- **Background**: warm paper (`#f6f1e7`, `#efe8d8`). Slightly textured
  if you can manage it without an image (CSS noise filter at 2-3% is
  fine).
- **Ink**: deep ink (`#1a1612`, `#2a1f15`). Never pure black.
- **Accent**: ONE scholarly color — oxblood (`#8a2a1a`), deep teal
  (`#0f5e5e`), burnt umber (`#7a4a1a`), or aged-gold (`#a07820`).
  Never neon, never gradient.
- **Muted**: warm gray (`#8a8480`) for secondary text.

## Widgets

- **Review queue**: numbered/dashed list. `✓ / ◯` in the margin (use
  an `::before` pseudo-element). Topic name in body serif, no checkbox
  rectangle.
- **Checkpoint**: a quiet card-less row — title, due date with `ⓘ`,
  last score as `23/30 · 72nd %tile` in italic. No card, just a
  hairline rule above.
- **Streak**: a horizontal academic-calendar strip — small filled
  blocks per day (8-12px squares). Full weeks separated by 1px
  hairlines. Render the day count (`18 days`) in italic small-caps,
  centered above the strip.
- **Concept graph**: NOT a network diagram — a mastery matrix. Each
  row: `TOPIC-NAME (small-caps)   ●●●●○○○○   label (mastered / in
  progress / early / not started)`. Filled dots in accent, empty in
  muted.

## Layout

- **Section dividers**: double rule (`════════`) under the page
  header, single hairline (`────────`) under each `§n` heading. No
  drop shadows, no border boxes.
- **Margin**: generous left/right whitespace. The page should feel
  like a book, not a dashboard. Indent §-section content by ~24px
  from the §-number.

## Motion

- Margin-marks: `◯` → `✓` transitions in 200ms with a small fill
  animation.
- Streak block: a brief 160ms fill animation when a new day lands.
- No ambient motion.

## Things to avoid

- Sans-serif body. The scholarly register dies.
- Square checkboxes. Use `✓ / ◯` margin marks instead.
- A concept-network with arrows. Use a mastery matrix.
- Neon accents. The whole point is calm.
- Pure white background. Use warm paper.
