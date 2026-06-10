---
name: coach-tracker
description: Shared 3-section layout + visual language for the coach-tracker HTML page (Goals / Program / Dashboard). Apply whenever a coach (Sport, Diet, Learning, Cooking) ships a multi-week program so trackers look like a coherent family. Single-file HTML + localStorage, daily-use interface, NOT a slide deck.
---

# Coach Tracker

A shared design system for **the artifact every coach ships when the
boss commits to a multi-week program** — a training cycle, a meal
plan, a syllabus, a cooking journey. Same shape, same visual
vocabulary, different content. The boss recognizes a "Split coach
tracker" at a glance, regardless of which coach made it.

## What this is — and isn't

- **Is**: a single-file `index.html` opened by the boss every day,
  state in `localStorage`, three vertical sections, all scrollable.
- **Is not**: a `frontend-slides` deck. Slides are for one-time
  presentations; trackers are for daily interaction. We borrow the
  visual *language* (typography, palette, motion, hierarchy) from
  frontend-slides — never the slide-stage mechanics (no 16:9 fixed
  stage, no flip-through navigation, no `viewport-base.css`).

## The three sections (top to bottom, in this order)

### 1. Goals (collapsible — expanded on first open, collapsed after)

The exec-summary mandated by [`_discipline.md`] applied here:
- **Why** this tracker exists — the goal the boss gave you, restated
  as a headline.
- **Context** — the timeframe, the constraints in scope.
- **What you assumed** — the design defaults you picked, as small
  tag-pills.
- **How to use it** — one sentence on the daily flow.

Visual treatment: tall hero block, oversized headline numeral "01",
goal as a typographic statement, deadline sub-line, small assumption
chips. On the very first open, expanded. Use
`localStorage.<slug>.firstOpen` to detect — after that, collapse to a
thin one-line summary bar (boss expands when they want a refresher).

### 2. Program (collapsible — collapsed by default after first open)

The full plan. Static reference content the boss reviews occasionally,
not daily:
- The complete week-by-week or block-by-block structure.
- Each unit (session / meal / lesson / recipe) as a compact card with
  a one-line title and expandable detail.
- Domain-specific content lives in the coach's persona — this skill
  defines only the *shape*.

Visual treatment: oversized "02" numeral, structured grid, week
numbers as bold dividers, cards with strong but quiet hierarchy.

### 3. Dashboard (always visible — the daily landing zone)

The thing the boss interacts with **every single day**. Three jobs the
dashboard must do — these are universal:

- Surface **today's focus** — the action of the day with one-tap
  log/tick input.
- Surface **momentum** — a visualisation of accumulated state from
  `localStorage` (streak, weekly volume, consistency strip).
- Surface **the goal-bound number(s)** the boss cares about (PR table,
  weight curve, books-read counter, recipes-tried log).

Visual treatment: oversized "03" numeral, **landing zone after first
open** (scroll auto-targets this section on subsequent visits), strong
positive feedback on every interaction (tick animation, streak
increment with a subtle pulse). Never idle motion — the boss is
working here, not watching.

**The signature is picked from [`signatures/`](signatures/README.md).**
Each coach has a default signature slug — Sport: `scoreboard` or
`cockpit`, Diet: `lab-report`, Learning: `coursepack`, Cooking:
`service-ticket`. The persona names the slug; you open
`signatures/<slug>.md` and render the dashboard against its full rules
(typography, color, widgets, motion, things-to-avoid).

**No SaaS-card grid.** The dashboard is where the artifact earns its
identity — Sport reads like a stadium scoreboard or a cockpit, Diet
reads like a clinical readout, Learning reads like a syllabus header,
Cooking reads like a chef's mise-en-place card. Inheriting "today-card +
chart + history-strip" from this skill is a failure mode — those are
the *jobs* above, not the *visual move*. The visual move lives in
[`signatures/`](signatures/README.md).

## Visual language (borrowed from `frontend-slides`)

- **Typography**: distinctive, never generic. Pick from Fontshare or
  Google Fonts; never Inter / Roboto / Arial / system stack. Strong
  contrast between a display/serif headline face and a precise sans
  for body. Section numerals "01 / 02 / 03" as oversized typographic
  anchors (frontend-slides bold-template style).
- **Color**: one committed palette via CSS variables in `:root`
  (`--bg, --fg, --accent, --muted, --tick`). One dominant background,
  one accent that carries every interaction (tick, streak, focus
  ring). Light or dark depending on the coach's mood. No purple-
  gradient-on-white.
- **Motion**: tasteful, not decorative. Reveals on first open
  (stagger), tick animation on checkbox, streak pulse on increment.
  No ambient/idle motion. Respect `prefers-reduced-motion`.
- **Layout**: vertical scroll (NOT 16:9 stage), generous spacing,
  strong section separators, mobile-readable at default zoom.

## Implementation rules

- **Single self-contained `index.html`** — all CSS and JS inline.
  No build step, no `node_modules`, no CDN dependency the page can't
  survive without (Google Fonts via `<link>` is fine; runtime React
  from `esm.sh` is fine if it earns its place; nothing fancier).
- **Save to** `~/Documents/split-apps/<short-name>/index.html`. The
  slug is the user-visible folder — pick something readable
  (`wedding-prep`, `gmat-3mo`, `cut-summer`, `french-baking`).
- **`localStorage` keys namespaced** by slug to avoid collisions:
  `split.<slug>.firstOpen`, `split.<slug>.entries[]`,
  `split.<slug>.streak`, `split.<slug>.lastSection`. Read/write JSON
  via `JSON.stringify` / `JSON.parse`.
- **Stay local by default** — don't deploy publicly. Even with
  `localStorage` keeping data on-device, a public URL leaks the
  *existence* of a private tracker. AirDrop the `.html` to the boss's
  phone for mobile, or hand off to `@Engineer` for a real deploy.
- **No personal identifiers** anywhere in the file — same rule as the
  exec-summary in `_discipline.md`. The tracker holds the public story
  (goal + plan + checkboxes); `me.md` holds the private state.

## How to write the file

1. Read this `SKILL.md` and confirm the 3-section structure.
2. Build the HTML against the layout above, populating each section
   with the coach's domain content (the persona says what goes in).
3. Wire `localStorage` with the namespaced keys.
4. Default the visual palette and font choice based on the coach's
   personality (sport = strong/athletic; diet = clean/clinical;
   learning = scholarly/calm; cooking = warm/editorial). The boss can
   override later.
5. In the same turn as announcing the plan, write the file and
   report its path in plain text. **Do not call `open`** — Split's
   artifact rail previews the HTML in-app automatically; calling
   `open` pops a duplicate window in the browser (see
   `_discipline.md`).

## What this skill is NOT

- Not a CLI to invoke — there is no `script.sh` to run.
- Not a frontend-slides preset — we don't extend `bold-template-pack`.
- Not a generator — the coach writes the HTML by hand against this
  layout. The agent is the renderer.
