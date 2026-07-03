---
slug: cockpit
name: Cockpit / Tech-watch
tagline: Quantified-self readout — mono numbers, SVG activity ring with effort-zone arcs, anthracite + cyan.
mood: athletic, technical, instrumented, calm-under-pressure
references: Whoop, Apple Fitness, Garmin Connect, Polar Flow, Wahoo
default_for: training (strength blocks, HR/zone training, recovery weeks)
also_consider_for: any tracker where the daily signal is a measured quantity (HRV, sleep score, water)
palette: anthracite + cyan/teal zones + lime accent
---

# Cockpit / Tech-watch

The quantified-self dashboard. Reads as athletic instrument, not as
brand-marketing. A radial activity ring is the dominant element; the
rest is a compact instrument cluster.

## Preview

```
┌── 03 ⟶  DASHBOARD ──────────────────────────┐
│                                              │
│        ╭───────╮      TODAY                  │
│       ╱   6KM   ╲     FOOTING AISÉ           │
│      │   30'     │    ●●●●○○○○○○  Z2         │
│       ╲  RPE 4  ╱     HR 130-150             │
│        ╰───────╯      [ ✓ DONE ]             │
│                                              │
│   ╭───┬───┬───┬───┬───┬───┬───╮              │
│   │ M │ J │ V │ S │ D │ L │ M │ wk           │
│   │ ✓ │ ✓ │ ✓ │ ✓ │ ✓ │ ✓ │ ● │              │
│   ╰───┴───┴───┴───┴───┴───┴───╯              │
│                                              │
│   ┌─ VOLUME ──────────┐ ┌─ STREAK ──────┐    │
│   │  ▁▂▃▂▁▃▄▅          │ │     07        │    │
│   │  ▄▅▆▇█▆█▇          │ │    days       │    │
│   └────────────────────┘ └───────────────┘    │
│                                              │
│   PR  5K 19:42·  10K 41:15·  ½ 1:30:12        │
└──────────────────────────────────────────────┘
```

## Type

- **Numbers** (the readout): a technical mono — `JetBrains Mono`,
  `Berkeley Mono`, `Geist Mono`. Tabular figures, equal-width.
- **Labels** (Z2, HR, VOLUME, STREAK · DAYS): all-caps mono, small,
  loose tracking — like instrument labels.
- **Body** (session name, notes): a precise neutral sans — `Inter
  Tight`, `Geist`. Smaller than the numbers.

## Today (the hero)

- **Activity ring**: a 240-280px SVG. Outer ring = session progress
  (0-100% as the boss ticks). Inner arcs = effort zones Z1-Z5,
  highlighted active zone in the accent. Center text = distance + time
  in mono.
- **Right column**: session name + target HR + zone label + one CTA
  (`[ ✓ DONE ]`). Compact, mono.

## Color

- **Background**: anthracite (`#15191f` to `#1a1d24`); two-tone modules
  by stacking a slightly lighter panel (`#1c2129`) inside.
- **Zones**: cyan / teal scale for Z1-Z5 (`#5ac8fa` cool → `#ff5a3c`
  hot, but used as zone arcs not card backgrounds).
- **Accent**: ONE lime (`#c8ff00`) or chartreuse (`#aaff00`) for the
  active ring stroke, the active checkmark, the streak pulse.
- **Text**: high-contrast (`#ecf1f6`) primary, muted (`#8a95a6`) labels.

## Widgets

- **Weekly cell grid**: 7 small boxes (M-D), 28-36px square, mono
  letter inside. Done = filled with accent, today = outlined in accent,
  future = muted outline.
- **Volume chart**: a compact panel labeled `VOLUME` at top-left. Bars
  inside, current week highlighted. Smaller than the ring.
- **Streak**: a digit in a small panel labeled `STREAK · DAYS`. Mono,
  large but smaller than the ring.
- **PR row**: inline mono — `5K 19:42 ·  10K 41:15 ·  ½ 1:30:12` —
  single row at the bottom. Use mono `·` separators.

## Motion

- Ring fill: animates from 0 → current% on first paint (480ms ease-out).
- Tick: ring snaps to next quarter when a set is logged.
- Zone-arc highlight: instant on hover/active, no transition.
- No ambient pulse on the ring — it's a readout, not a heartbeat.

## Things to avoid

- Serif anywhere. Cockpit is mono + sans only.
- Activity-ring without zone arcs — defeats the "instrumented" point.
- Rainbow zones (Z1 green Z2 blue Z3 yellow Z4 orange Z5 red). Use a
  monochromatic teal→hot-coral scale, calibrated.
- More than one panel hierarchy. Panel + sub-panel, that's it.
