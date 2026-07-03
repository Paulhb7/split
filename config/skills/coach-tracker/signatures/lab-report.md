---
slug: lab-report
name: Lab Report / clinical panel
tagline: Vitals printout — clinical serif headers, mono numbers, hairline rules, in-zone / out-of-zone marks.
mood: clinical, calm, disciplined, data-respectful
references: Apple Health summary, blood-panel report, a Theranos-aesthetic done honestly, Cronometer
default_for: nutrition (cuts, recomps, accountability blocks)
also_consider_for: any tracker where the daily signal is a measured intake (water, supplements, sleep duration)
palette: near-white paper + deep teal accent (red only for out-of-zone)
---

# Lab Report / clinical panel

The clinical dashboard. Reads as a medical vitals printout, not as a
SaaS fitness app. Numbers in mono, headers in serif, decisions framed
as "in zone / under / over".

## Preview

```
┌── 03  DASHBOARD ────────────────────────────┐
│                                              │
│   TODAY · LUN 09 JUN · DAY 042/090           │
│   ──────────────────────────────────────     │
│                                              │
│    2,180  kcal  ━━━━━━━━━━━━━━━━━━░░  IN     │
│    2,400  target                      · −220 │
│                                              │
│   ┌─ MACROS ──────────────────────────────┐  │
│   │  PROTEIN   142g  ░░░░░░░░░░░  175g  ▼ │  │
│   │  CARBS     220g  ▓▓▓▓▓▓▓▓░░░  240g  · │  │
│   │  FAT        65g  ▓▓▓▓▓▓▓▓▓▓░   72g  · │  │
│   └───────────────────────────────────────┘  │
│                                              │
│   WEIGHT · 90-day curve                      │
│       ╮                                      │
│        ╰─╮  ╮                                │
│           ╰╮ ╰─╮  ╮      ╮                   │
│            ╰────╰──╰────╰──   ← today        │
│   78.4 → 76.2 kg   ▼ 74.0 target             │
│                                              │
│   ─── LOG ─────────────────────────────────  │
│   B  oats + skyr           420 kcal          │
│   L  salade poulet         680 kcal          │
│   S  pomme + amandes       180 kcal          │
│   D  ───── pending ─────                     │
│                                              │
│   H₂O  ●●●●●●○○   1.5L / 2.0L                │
│   STREAK  12  days in zone                   │
└──────────────────────────────────────────────┘
```

## Type

- **Headers** (report title, section labels like `MACROS`, `LOG`): a
  clinical serif — `Newsreader`, `Tiempos Headline`, `Source Serif`.
  Small caps for the section labels.
- **Numbers** (kcal, grams, weight, all values): a precise mono —
  `JetBrains Mono`, `Geist Mono`, `Berkeley Mono`. Tabular figures.
- **Body** (food names, notes): a precise neutral sans — `Inter Tight`,
  `Geist`. Smaller than the mono numbers.

## Today (the hero)

- **Report header**: serif title — `TODAY · LUN 09 JUN · DAY 042/090`
  — with a hairline rule underneath. No card.
- **Kcal total**: rendered as a horizontal progress bar with a target
  tick mark, current vs target on either side, delta on the right
  (`· −220`).
- **Macros panel**: three parallel rows — `LABEL  current  bar  target
  status-mark`. Status marks: `▼` under / `▲` over / `·` in zone. Mark
  in the accent when in zone, red when out.

## Color

- **Background**: near-white paper (`#fafaf7`, `#f7f6f1`). Never pure
  white — too clinical-cold.
- **Ink**: near-black (`#1a1a1a`).
- **Accent**: ONE calm color — deep teal (`#0f5e5e`), chartreuse-
  clinical (`#a6c628`), or muted forest (`#2a5a3a`).
- **Red**: ONLY for out-of-zone or alerts (`#c62828`). Never decorative,
  never for highlighting "today" or "current".
- **Muted**: warm gray (`#8a8580`) for labels and secondary text.

## Widgets

- **Macros bars**: ASCII-feel — `░░░░░░░░░░░` empty, `▓▓▓▓▓▓▓▓░░` filled.
  Use Unicode block characters or a CSS `::after` solid bar; rounded
  corners 0px or 1px max.
- **Weight curve**: clean line chart, no fill gradient under the line.
  X-axis dated. Target rendered as a dashed horizontal threshold across
  the chart, labeled `▼ 74.0 target` at the right.
- **Log**: dated rows, B/L/S/D meal-code prefix in serif small-caps,
  food name in body sans, kcal right-aligned in mono. No zebra stripes
  — hairline rules between days.
- **Water / streak**: small inline counters at the bottom of the panel
  (`H₂O ●●●●●●○○ 1.5L / 2.0L`). Not their own cards.

## Layout

- **No cards.** Full-bleed panels separated by hairline rules (`1px
  solid #e8e6e0`). Rounded corners ≤ 4px on any container.
- **Single column** on desktop, optionally a 2-col split between the
  macros panel and the weight curve. Never a 3-col grid.

## Motion

- Bar fills: animate from 0 → current on first paint (320ms).
- Zone-mark transition: instant (`▼` → `·` when entering zone).
- No ambient pulse on the kcal counter.

## Things to avoid

- Rounded card-grid with shadows. The medical-printout reading dies.
- Bright greens or oranges as "good/warning". Use the single accent +
  red only.
- Pie charts for macros. Use parallel horizontal bars.
- Decorative gradient under the weight curve. Single line, no fill.
