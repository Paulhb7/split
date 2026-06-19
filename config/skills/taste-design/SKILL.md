---
name: taste-design
description: Author a project's DESIGN.md — a semantic, agent-readable design-system spec that enforces premium, anti-generic UI standards (calibrated color, distinctive typography, asymmetric layout, restrained motion, hard anti-patterns). Use at the START of any design project to set the taste contract before generating screens, decks, mockups, or brand kits, and to AUDIT a finished artifact against it. Pairs with `ui-ux-pro-max` (the reference library you query to fill the spec) and `frontend-slides` (the renderer that obeys it). Self-contained — no cloud, no account. Audit via `python3 scripts/audit.py <file.html|css|md>`.
---

<!--
Re-authored for Split, inspired by the `taste-design` skill in
github.com/google-labs-code/stitch-skills (Google Labs Code). That repo
ships NO license and binds its skills to the Stitch MCP cloud, so nothing
is copied: the *principles* (which aren't protectable) are rewritten here
in our own words and re-pointed at Split's own pipeline — no Stitch, no
network. The original's value was "produce a DESIGN.md as the single
source of truth for generation"; that idea is what we keep.
-->

# Taste Design — the project's design contract

A design project drifts toward generic "AI slop" when nothing pins the
taste down. This skill fixes that by authoring one artifact — a
**`DESIGN.md`** — that states, in plain language an agent can re-read,
exactly what this project's design system *is*: its color roles, its
type voice, its layout posture, its motion budget, and the things it
**never** does. Every later screen, slide, mockup, or component is
generated *against* that file, and audited against it before delivery.

`DESIGN.md` is the **prose, semantic** half of a design system. Its
machine-readable half is `tokens.css` (the `:root { --c-… }` file
DaVinci already ships). Author both: the CSS is what code consumes, the
markdown is what *humans and agents* consume — and per Split's
artifacts-as-memory rule, the markdown carries the *why* across sessions.

## Where this skill sits — don't duplicate the others

| Skill | Role | Verb |
| --- | --- | --- |
| **`ui-ux-pro-max`** | The reference library — 161 palettes, 67 styles, font pairs, UX rules. | *query* |
| **taste-design** *(this)* | The contract — one `DESIGN.md` that decides the system for THIS project, then audits against it. | *author / enforce* |
| **`frontend-slides`** | The rendering engine for HTML decks / mockups / fixed-frame graphics. | *render* |

The pipeline:

```
query ui-ux-pro-max  →  author DESIGN.md (this skill)  →  render with frontend-slides  →  audit against DESIGN.md (this skill)
```

When a `split-default` preset or a `frontend-slides`/`dashboard` house
preset already governs the surface (Consultant/Financier decks,
dashboards), **the house preset wins** — same anchor rule as
`ui-ux-pro-max`. Use this skill to author a *new* system (a brand kit, a
fresh product, a client) or to harden one that's drifting.

## When to use

- **Start of a project** — before generating anything. Author the
  `DESIGN.md` so all output shares one spine.
- **A brief with no brand** — turn vague adjectives ("modern, premium,
  clean") into committed, falsifiable rules.
- **A redesign** — capture the baseline as a `DESIGN.md`, then write the
  target one next to it; the diff is the redesign brief.
- **Before handoff / delivery** — run the audit on the rendered artifact;
  fix violations before it leaves your hands.
- **Reviewing someone else's UI** — author the `DESIGN.md` it *should*
  have had, audit against it, report the gap.

Don't use it for a one-off tweak, or when the boss gave a real reference
(a URL, a Figma, a brand kit) — read that and encode *it* into the
`DESIGN.md`, don't override it with defaults.

## How to author a DESIGN.md

1. **Set the three dials** at the top — they cascade into every other
   choice:
   - **Density** 1–10. 1–3 = gallery-airy (one idea per view, large
     type, generous void). 4–7 = balanced daily app. 8–10 = cockpit
     dense (data tools, dashboards — monospace numerals become mandatory
     above 7).
   - **Variance** 1–10. Low = symmetric, predictable, calm. High =
     asymmetric, editorial, surprising. Above 4, **centered hero
     sections are banned** — earn the composition.
   - **Motion** 1–10. Low = restrained, near-static. High = cinematic
     choreography. Whatever you pick, motion is a *budget*, not a
     default sprinkle.
2. **Fill each section** of the template (`assets/DESIGN.template.md`),
   pulling concrete options from `ui-ux-pro-max` where useful (cite the
   entry). Every color gets a **role + hex**; every font gets a named
   face and a reason; every rule is **falsifiable** (a reviewer can hold
   the screen up and say yes/no).
3. **Write the anti-patterns section last** — the specific things THIS
   project must never do. Start from `references/checklist.md` and add
   project-specific bans (e.g. "no stock-photo people", "no parent-brand
   blue").
4. **Save it** next to the work: `<project>/DESIGN.md` (e.g.
   `~/Documents/split-brands/<brand>/DESIGN.md`). It opens with the
   standard exec-summary header (`_discipline.md`) — why this system
   exists, who it's for, how to use it, what was assumed.

## The taste floor — what "anti-generic" means here

These are the load-bearing rules. The full enforcement list is
`references/checklist.md`; this is the spine.

- **Color is calibrated, not loud.** One accent at most, under ~80%
  saturation. Neutral bases (zinc/slate/stone), not muddy grey. **No
  pure `#000000`** — use a near-black (`#0a0a0b`, `#111014`). The "AI
  purple / blue neon gradient on white" look is **banned outright** —
  it's the single clearest tell of generated UI.
- **Typography is chosen, not defaulted.** **Inter / Roboto / Arial /
  system fonts are off the table** for anything premium — reach for
  Geist, Outfit, Cabinet Grotesk, Söhne alternatives, Fraunces (for a
  distinctive serif). One display voice + one body voice, or a single
  family carried by weight contrast. Body text ≤ ~65 characters per
  line, relaxed leading. Above density 7, numerals go monospace.
- **Layout gives every element its own zone.** No overlapping panels, no
  cramped overflow. Above variance 4, break the symmetric grid — no
  three-equal-card row, no centered hero. Mobile-first below 768px, no
  horizontal scroll, hit targets ≥ 44px, full-height uses `100dvh`
  (never `h-screen` — it fails on iOS Safari).
- **Motion is physical and cheap.** Animate `transform` and `opacity`
  only (GPU) — never `top/left/width/height`. Spring defaults around
  stiffness 100 / damping 20. One well-staged page-load cascade beats
  scattered micro-fidgets. Always honor `prefers-reduced-motion`.
- **Content is real or honestly placeholder.** No fabricated metrics
  ("99.98% UPTIME SLA"), no AI copy clichés ("Elevate", "Seamless",
  "Unleash", "Supercharge", "Scroll to explore"), no filler chevrons. No
  broken image links — use `picsum.photos`, generated imagery, or SVG.
- **Constraint is the quality.** A two-color brand beats a six-color one.
  Strip until only what's needed remains.

## How to audit

Once an artifact is rendered, check it against the spec:

```bash
python3 scripts/audit.py ~/Documents/split-apps/<slug>/index.html
python3 scripts/audit.py <project>/tokens.css
python3 scripts/audit.py <project>/DESIGN.md      # lint the spec itself
```

The auditor is **pure Python 3 stdlib, zero dependencies, keyless**. It
greps the file for the mechanical tells — banned fonts, pure black,
AI-purple gradient hexes, `h-screen`, copy clichés, obvious fake metrics
— and prints each violation with its line. Exit code is non-zero if any
fire, so it slots into a pre-handoff check.

It catches the *mechanical* slop only. Taste — variance, hierarchy, "does
this feel designed" — is still the agent's judgment. A clean audit is
necessary, not sufficient. Treat a hit as "look here", not "auto-fail":
a deliberate `#000000` on a true-black OLED splash is a real choice —
note it in the `DESIGN.md` and move on.

## Output discipline

- The `DESIGN.md` is a deliverable: it opens with the exec-summary
  header, and you **report its path** in plain text (don't `open` it —
  Split's artifact rail previews it).
- **Cite sources.** When a palette/font/rule came from `ui-ux-pro-max`
  or a named brand, say so in the `DESIGN.md` (a `Sources` line) — same
  lineage rule as the rest of Split.
- Treat the spec as **living**: on iteration, edit the `DESIGN.md` in
  place so it stays the true record of the system, then re-audit.
