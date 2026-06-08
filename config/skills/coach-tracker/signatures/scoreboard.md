---
slug: scoreboard
name: Scoreboard / Race bib
tagline: Brand-athletic look — condensed display, race-bib day-number, full-bleed color blocks, stadium accent.
mood: athletic, bold, kinetic, populist
references: Nike Run Club, New Balance, NYRR race posters, Strava segments
default_for: coach_sport (race builds, event countdowns, 1RM pushes)
also_consider_for: any tracker with a hard deadline and a daily number that grows
palette: near-black + one stadium accent (lime-fluo, coral, neon-yellow)
---

# Scoreboard / Race bib

The brand-athletic dashboard. Reads as race-day equipment, not a habit
app. Day-number is the dominant typographic element; everything else
is supporting metadata.

## Preview

```
┌── 03  DASHBOARD ────────────────────────────┐
│                                              │
│   DAY 014                                    │
│   ─────── / 126                              │
│                                              │
│   ┌─────┐                                    │
│   │  6  │  FOOTING AISÉ                      │
│   │ KM  │  RPE 4  ·  30'                     │
│   └─────┘  ZONE 2  ·  130-150 BPM            │
│                                              │
│         [  MARK  DONE  ]                     │
│                                              │
│   ──────────────────────────────────────     │
│                                              │
│   WEEKLY VOLUME           KM                 │
│                                              │
│         ▁▂▃▂▁▃▄▅▆▇█▆█▇▄▃▅                    │
│   S1                  S18 · MARATHON         │
│                                              │
│   ──────────────────────────────────────     │
│                                              │
│   PR                  NOW    →  GOAL         │
│   5K               19:42    →  18:30         │
│   10K              41:15    →  39:00         │
│   SEMI           1:30:12    → 1:25:00        │
│                                              │
│   ──────────────────────────────────────     │
│                                              │
│   STREAK 07   ●●●●●●●○○ momentum             │
└──────────────────────────────────────────────┘
```

## Type

- **Display** (big numbers, day-number, section labels): a condensed
  display sans — `Druk Wide`, `Migra`, `Editor's Note`, `Object Sans
  Heavy` (Fontshare). Heavy letter-spacing on labels.
- **Body** (session description, metadata): a precise neutral sans —
  `Inter Tight`, `Geist`. Tight tracking.
- **No serif anywhere.** Editorial fonts break the athletic register.

## Today (the hero)

- **Day-number**: massive — 120-200px on desktop, e.g. `014 / 126`.
  The bib IS the section.
- **Session name**: stencil-caps, smaller, beside or below the bib.
- **Metadata** (RPE, distance, zone, HR): bib-style sub-fields — small
  labels stacked above mono values.
- **One CTA button**: full-width or wide, accent fill, all-caps —
  `[ MARK DONE ]`.

## Color

- **Background**: near-black (`#0a0a0a` to `#15161a`); never pure black.
- **Accent**: ONE stadium accent — lime-fluo (`#c8ff00`), coral
  (`#ff5a3c`), or neon-yellow (`#ffd400`). Used for the bib day-number,
  the CTA, the active streak dots, the current-week bar glow.
- **Metric blocks**: solid full-bleed swatches, not bordered cards. If
  you need separation between blocks, use whitespace + hairline rules
  (`1px solid rgba(255,255,255,0.08)`), never card borders.
- **Text**: high-contrast white (`#f5f6f7`) for primary, muted
  (`#8a95a6`) for labels.

## Widgets

- **Volume chart**: condensed bars edge-to-edge, no rounded card, no
  card border. Bars are 6-10px wide, gap 2-3px. Current week glows in
  the accent (filter: drop-shadow(0 0 6px accent) or solid accent fill).
- **PR table**: scoreboard rows — `distance · now · → · goal` in mono
  display. No zebra stripes. The `→ goal` column right-aligned with
  the accent color marking gap-to-target.
- **Streak**: a digit counter (`07`) at 36-48px, followed by
  `●●●●●●●○○` momentum dots. Filled dots in accent, empty in muted.
  Render like a stadium clock.

## Motion

- Tick: a snappy 120ms scale-down → scale-up on the day-number when
  marked done. No bounce.
- Streak increment: a one-time pulse (160ms) on the digit. No ambient.
- Bar glow: static — never animated ambient.

## Things to avoid

- Inter / Roboto / Arial for the day-number — reads as SaaS, not bib.
- Rounded cards with shadows. The card-grid is what this signature
  rejects.
- Gradients on text. Solid color blocks only.
- More than one accent color.
