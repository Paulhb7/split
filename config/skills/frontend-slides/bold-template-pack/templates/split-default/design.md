---
version: 2.0
name: Split Default
description: The official Split house style — a dark cosmic atmosphere built on layered radial gradients, two signature orbs on the cover, a four-color accent palette anchored by coral, and a Clash Display × Satoshi × JetBrains Mono typographic triad served from Fontshare. Every slide breathes through soft radial bleeds and a 64px grid mask that fades into the void. The cultural reference is mid-2020s tech editorial — Linear changelog meets Stripe Press meets Vercel docs — but warmer, with a deliberate "looking at a starfield through coral haze" mood. Reproducible: the structure, typography, atmosphere, and orbs are fixed; the four accent colors can be re-skinned per deck via the palette variants section.

scheme: dark

palette-variants:
  coral-sea:
    accent-primary: "#ff6a5b"
    accent-2: "#6ad5c4"
    accent-3: "#f4c66b"
    accent-4: "#a48bff"
    use-when: "Default. Pitches, briefings, internal product updates, anything that should feel like the canonical Split deck."
  lime-magenta:
    accent-primary: "#b8ff5c"
    accent-2: "#ff5cc8"
    accent-3: "#5cd4ff"
    accent-4: "#ffd95c"
    use-when: "Builder/launch/maker decks, hackathon write-ups, energetic product reveals. Reads more electric and contemporary."
  amber-violet:
    accent-primary: "#f4a13b"
    accent-2: "#a48bff"
    accent-3: "#6ad5c4"
    accent-4: "#ff6a5b"
    use-when: "Editorial, warmer storytelling, year-in-review, retrospective decks. Reads softer and more reflective."
  sea-coral:
    accent-primary: "#6ad5c4"
    accent-2: "#ff6a5b"
    accent-3: "#a48bff"
    accent-4: "#f4c66b"
    use-when: "Inverted default — when the deck is about ops, infra, calm-state telemetry. Coral demoted to secondary."

surfaces:
  stage-bg: "#06070b"
  slide-bg: "#0a0c12"
  panel-1: "#11141d"
  panel-2: "#181c28"
  ink-0: "#f4f1ea"
  ink-1: "#c4c0b6"
  ink-2: "#7f7a70"
  line: "rgba(244,241,234,0.10)"
  line-strong: "rgba(244,241,234,0.22)"

typography:
  display:
    fontFamily: "'Clash Display', sans-serif"
    weights: [500, 600, 700]
    source: "https://api.fontshare.com/v2/css?f[]=clash-display@700,600,500"
  body:
    fontFamily: "'Satoshi', sans-serif"
    weights: [400, 500, 700, 900]
    source: "https://api.fontshare.com/v2/css?f[]=satoshi@900,700,500,400"
  mono:
    fontFamily: "'JetBrains Mono', monospace"
    weights: [400, 500]
    source: "https://api.fontshare.com/v2/css?f[]=jetbrains-mono@500,400"
  cover-title:
    font: "Clash Display 600"
    size: "200px"
    lineHeight: 0.9
    letterSpacing: "-0.035em"
  cover-sub:
    font: "Satoshi 500"
    size: "34px"
    lineHeight: 1.32
  section-title:
    font: "Clash Display 600"
    size: "80px"
    lineHeight: 1.0
    letterSpacing: "-0.02em"
    note: "Use <em> for the highlighted phrase — italic is removed by CSS, color becomes accent-primary."
  lede:
    font: "Satoshi 500"
    size: "30px"
    lineHeight: 1.35
    color: "ink-1"
  kicker:
    font: "JetBrains Mono 400"
    size: "18px"
    letterSpacing: "0.18em"
    transform: uppercase
    color: "accent-primary"

signature-moves:
  - "Two soft-blurred orbs on the cover: one accent-primary top-right (720×720, offset −160 / −160), one accent-2 bottom-left (620×620, offset −220 / −220). The .orb container uses a radial-gradient with the accent color at low alpha, plus filter: blur(8px). This is the strongest identity cue — NEVER ship a deck without these on the cover."
  - "Every slide has an atmospheric ::before layer: two large radial gradients (one accent-primary top-right 10% alpha, one accent-2 bottom-left 8% alpha) plus a faint top white wash. This bleeds the cover's mood into every slide so they all feel from the same family."
  - "Optional .grid-bg::after: a 64px CSS grid drawn in --line, masked by a radial ellipse so it fades at the edges. Use on slides that need a 'data terrain' feel (KPI, computer-use bench, contrarian stat) — not on every slide, or it loses meaning."
  - "Coral em accent in section titles: write <em>highlighted phrase.</em> in any h2.title — italic is killed by font-style:normal, color becomes accent-primary. This is the single visual through-line across content slides."
  - "Mono kicker → display title → satoshi lede triad at the top of every content slide. Same vertical rhythm always: kicker 18px uppercase coral, title 80px display, lede 30px body. Never break this order."
  - "Color-coded side bars on KPI cards: 4px vertical bar in accent-primary / accent-2 / accent-3 / accent-4 on the left edge. The four-color cycle reads as 'measurable, distinct, categorized' without being clownish."
  - "Reveal animation: .reveal class with translateY(28px) + opacity 0, transitioned over 0.7s with cubic-bezier(.16, 1, .3, 1). Children stagger via :nth-child delays (0.05s → 0.54s in steps of ~0.07s). Triggered by .slide.visible."
  - "Always cite on the slide: a .footnote strip at the bottom holds 'Sources: …' on the left and 'Made with Split · split.app' on the right, JetBrains Mono 16px in --ink-2. Never hide sources in an appendix."

components:
  cover:
    description: "Slide 1 ONLY. Vertically split into eyebrow / mid (title + sub) / meta (preparer + date). Two .orb divs sit behind everything. Title is 200px Clash with one phrase italicized (becomes coral em)."
  content-header:
    description: "MANDATORY at the top of every non-cover slide. Kicker (mono uppercase coral) + h2.title (with <em>) + lede paragraph. Sets the rhythm — never skip the kicker, never reorder."
  assumed-grid:
    description: "2×2 cards used for the 'What I assumed' slide. Each card: small mono label (coral, uppercase) + 26px Satoshi 500 value + 20px small note."
    use-on: "Slide 2 of every Consultant brief. Optional elsewhere as a 4-fact synthesis."
  kpi-grid:
    description: "3-col grid of stat cards. Each card has a 4px colored side bar (cycle accent-primary → accent-2 → accent-3 → accent-4 → repeat), a mono tag (source · date), a huge 82px Clash number with small unit, a 22px Satoshi label, and a mono source line."
    rules: "4-6 KPIs per slide. Every number datestamped. Source ALWAYS visible on the card. Cycle the colored bars in order — no two adjacent cards same color."
  comparison-table:
    description: "Rounded-border table with sticky-feeling header row in rgba white .04. Each row is a 4-col grid (often: subject 1.1fr / dimension 1fr / dimension 1fr / dimension 1fr). Body cells use Satoshi 22px; bold subject is Clash 26px; sub-detail uses mono 14px in --ink-2."
    accent: "Use a <span class='pill'> with --coral-soft background + coral text to mark the standout in each row."
  bench-bars:
    description: "Horizontal bar chart. Each row: 280px label / flex bar / 120px percentage. The .fill uses linear-gradient(90deg, accent, lighter-accent); .fill.dim is rgba white .18 for baselines. Reveal class staggers row by row."
    rules: "Max 5-7 rows. Always include a baseline at the bottom for contrast. Foot line in mono 15px summarizing the delta."
  quad-cards:
    description: "2×2 grid of tall vendor/option cards. Each card has a header (name + tag), one large 64px Clash hero figure in a color cycled across the four cards, a 21px Satoshi sub-line, a 3-bullet list with coral › arrows, and a mono source line at the bottom."
    use-on: "Vendor maps, option comparisons, player landscape."
  three-protos:
    description: "3 tall cards in a single row. Each card: mono pcode label (coral) + 44px Clash pname + 22px Satoshi tag + bulleted list with coral • markers + mono pfoot at the bottom. Minimum height 530px so the row visually anchors the slide."
    use-on: "Protocol comparisons, framework breakdowns, three-pillar slides."
  incident-log:
    description: "Stack of log-row entries. Each row is a 3-col grid: 170px date (mono coral) / flex content (Clash bold lead + Satoshi body) / 240px attribution (mono ink-2 right-aligned). Soft background rgba white .025, rounded 14px."
    use-on: "Timeline of incidents, recent events, case-by-case lists with attribution."
  stat-hero:
    description: "Big-number slide. 2-col grid (1.1fr / 1fr). Left: a 340px Clash number in accent-primary with an inline small unit. Right: a stack of head (42px Clash) → body (22px Satoshi) → mini stat row (3 small panels) → emphatic closing line."
    use-on: "Contrarian slides, one-fact-that-matters slides."
  reg-timeline:
    description: "Horizontal 5-node timeline. A 2px linear-gradient line runs at y=36px (past → coral → fading); each tnode has a 14px dot with coral box-shadow (or ink-2 if .past). Each node stacks date (mono 16px coral) / what (22px Clash) / detail (16px Satoshi)."
    use-on: "Regulation timelines, product roadmaps, milestone slides. 5 nodes is the sweet spot — 4 or 6 works, more starts to feel cramped."
  sources-grid:
    description: "Last slide, ALWAYS. 2-col dashed-divider list of numbered citations (mono coral 14px number) with title (Satoshi 17px) + URL/publisher line (mono 13px ink-2). Up to 20-24 sources comfortably."
    rules: "Mandatory if any non-obvious claim was made. Number them, cite publisher + date in the small line, full URL never wraps awkwardly (use word-break: break-all)."

chrome:
  top:
    selector: ".chrome"
    position: "absolute left:64 right:64 top:48"
    content: "Brand on left (Split bold coral + ' · ' + deck title), page index on right ('NN · NN'). JetBrains Mono 18px in --ink-2."
    note: "Required on every non-cover slide."
  bottom:
    selector: ".footnote"
    position: "absolute left:64 right:64 bottom:40"
    content: "Sources line on left, 'Made with Split · split.app' on right. JetBrains Mono 16px in --ink-2."
    note: "Required on every non-cover slide. The Split watermark is the brand cue we never drop."

layout:
  stage: "1920 × 1080, fixed, scaled via deck-stage.js — see html-template.md"
  pad: "absolute inset 120px 80px 90px 80px on content slides; cover overrides to inset:0 with internal padding"
  cover-padding: "top:84/80, mid:0/80, meta:0/80/90/80"

animation:
  reveal:
    css: ".reveal { opacity: 0; transform: translateY(28px); transition: opacity 0.7s var(--ease), transform 0.7s var(--ease); } .slide.visible .reveal { opacity: 1; transform: translateY(0); }"
    stagger: ":nth-child(N) gets transition-delay starting at 0.05s, incrementing by 0.07s, up to 0.54s for the 8th child"
    ease: "cubic-bezier(.16, 1, .3, 1)"
    reduced-motion: "honor prefers-reduced-motion — animation-duration 0.01ms, transition-duration 0.2s"

ground-truth: "See ./reference.html for the canonical implementation — the actual deck this template was extracted from. When in doubt, copy from there."
---

# Split Default — design recipe

This is **the official Split house style**. When the user picks `split-default`,
or when the Consultant ships a brief without an explicit style direction,
this is what gets generated.

The canon: dark cosmic stage, two orbs on the cover, atmospheric radial bleeds
on every slide, Clash Display × Satoshi × JetBrains Mono, coral as the
through-line accent.

> Ground truth: [`./reference.html`](./reference.html) is the actual deck this
> template was distilled from — an 11-slide brief on agentic AI in 2026. When
> the recipe is ambiguous, copy from there.

## What's fixed, what's variable

| Element | Status |
|---|---|
| Two orbs on the cover (sizes, blur, offsets, gradient stops) | **FIXED** — the signature |
| Atmospheric `::before` radial layer on every slide | **FIXED** |
| Typography triad (Clash Display + Satoshi + JetBrains Mono) | **FIXED** |
| Cover layout: eyebrow / 200px title with `<em>` / sub / meta | **FIXED** |
| Content-slide rhythm: kicker → title with `<em>` → lede | **FIXED** |
| Footnote chrome with "Made with Split · split.app" | **FIXED** |
| 4px colored side bars cycling through the 4 accents | **FIXED** |
| Reveal animation behavior (0.7s, ease, stagger) | **FIXED** |
| **Four accent colors** | **VARIABLE** — pick a palette variant |
| Which component patterns to use per slide | **VARIABLE** — pick from the library below |
| Use of `.grid-bg::after` (the 64px grid) | **VARIABLE** — use only when the slide warrants a "data terrain" feel |

If you find yourself dropping one of the FIXED items, you are no longer in
`split-default`. Pick a different template instead.

## Palette variants

The orb-and-gradient grammar stays constant; only the four accent hues change.
Pick one variant at the start of the deck and stick to it.

### `coral-sea` (default)

The shipped canon. Use it unless the brief specifically asks for a different
mood. Coral leads, sea-green seconds, amber thirds, violet fourths.

```css
--coral:#ff6a5b;  --coral-soft:rgba(255,106,91,.16);
--sea:#6ad5c4;
--amber:#f4c66b;
--violet:#a48bff;
```

### `lime-magenta`

Builder / launch / hackathon energy. Lime leads, electric magenta seconds.
Reads more current, slightly more aggressive.

```css
--coral:#b8ff5c;  --coral-soft:rgba(184,255,92,.16);
--sea:#ff5cc8;
--amber:#5cd4ff;
--violet:#ffd95c;
```

(Note: token name `--coral` is kept for CSS consistency — it means
"primary accent", not literal coral. Same for the others.)

### `amber-violet`

Editorial, warmer, retrospective. Amber leads, violet seconds. Good for
year-in-review decks, retros, soft pivots.

```css
--coral:#f4a13b;  --coral-soft:rgba(244,161,59,.16);
--sea:#a48bff;
--amber:#6ad5c4;
--violet:#ff6a5b;
```

### `sea-coral`

Inverted default. For ops, infra, telemetry, calm-state decks. Sea-green
leads, coral demoted to secondary.

```css
--coral:#6ad5c4;  --coral-soft:rgba(106,213,196,.16);
--sea:#ff6a5b;
--amber:#a48bff;
--violet:#f4c66b;
```

## The orb pattern (CANON — do not drop)

```css
.orb{
  position:absolute;right:-160px;top:-160px;
  width:720px;height:720px;border-radius:50%;
  background:radial-gradient(circle at 35% 35%,
    rgba(255,106,91,.55), rgba(255,106,91,.10) 50%, transparent 70%);
  filter:blur(8px); z-index:1;
}
.orb.b{
  right:auto;left:-220px;top:auto;bottom:-220px;
  width:620px;height:620px;
  background:radial-gradient(circle at 50% 50%,
    rgba(106,213,196,.35), transparent 65%);
}
```

The orbs are **only on the cover slide**. They are the strongest brand cue.
Replace the RGB triplets with the chosen palette variant's accent-primary
(orb #1) and accent-2 (orb #2). Do not move them, do not resize them, do not
add a third one.

## The atmospheric layer (CANON — every slide)

```css
.slide::before{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(1200px 600px at 85% -10%, rgba(255,106,91,.10), transparent 60%),
    radial-gradient(900px 600px at -10% 110%, rgba(106,213,196,.08), transparent 60%),
    linear-gradient(180deg, rgba(255,255,255,.015), transparent 30%);
}
```

Same accent-primary and accent-2 RGB as the orbs, at lower alpha. This bleeds
the cover's mood into every content slide so the deck feels of one piece. Do
not skip on any slide.

## The grid overlay (optional)

```css
.grid-bg::after{
  content:'';position:absolute;inset:0;pointer-events:none;opacity:.4;
  background-image:
    linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size:64px 64px;
  mask-image:radial-gradient(ellipse at center, black 30%, transparent 75%);
}
```

Add the `.grid-bg` class only to slides that need a "data terrain" feel — KPI
grids, benchmarks, contrarian-stat slides. Using it on every slide kills the
distinction; using it never makes the deck feel flat.

## Slide-pattern library

The eleven slide patterns extracted from the reference deck. Pick the
patterns whose structure matches the content. Don't invent new layouts when a
listed one fits — consistency across decks is the point.

1. **Cover** — orbs + 200px title with `<em>` + eyebrow + meta
2. **Assumed grid** — 2×2 cards, mono labels, used for "What I assumed"
3. **KPI grid** — 3-col stat cards with colored side bars
4. **Comparison table** — 4-col rounded-border table with a `<span class="pill">` accent
5. **Bench bars** — horizontal bars with gradient fills + dim baselines
6. **Quad cards** — 2×2 vendor/option cards with big hero figure
7. **Three protos** — 3 tall cards in a row, bulleted with coral markers
8. **Incident log** — stack of 3-col rows: date / content / attribution
9. **Stat hero** — 340px single number + side panel
10. **Reg timeline** — horizontal 5-node timeline with coral line
11. **Sources grid** — 2-col dashed-divider numbered citations

CSS for every pattern is in `reference.html`. Copy verbatim, only swap content
and palette tokens.

## Do not

- Use Inter, Roboto, system fonts, or any font not from Fontshare's Clash /
  Satoshi / JetBrains Mono families.
- Replace orbs with images, logos, illustrations, or stock photography.
- Use white backgrounds. The system is dark-only. If the user wants light,
  pick a different template.
- Add gradients to text. Coral on dark is the accent rule — no rainbow titles.
- Skip the kicker on content slides. The mono-uppercase-coral kicker is the
  rhythm anchor.
- Hide sources in an appendix. The footnote chrome carries them on every slide.
- Drop "Made with Split · split.app" from the right side of the footnote.
  That's the watermark and stays on every non-cover slide.
- Apply `.grid-bg` to every slide — it dilutes the signal.

## Build checklist

Before declaring the deck done, verify:

- [ ] Fontshare CSS link present in `<head>` (Clash + Satoshi + JetBrains Mono).
- [ ] CSS custom properties at the top of the `<style>` block use the chosen
      palette variant's four accent hues.
- [ ] Cover slide has `.orb` and `.orb.b` divs as the first two children of
      `<section class="slide cover active">`.
- [ ] `.slide::before` atmospheric layer is defined and not overridden.
- [ ] Every non-cover slide has a `.chrome` top bar and a `.footnote` bottom bar.
- [ ] Every section title uses `<em>` for the highlighted phrase.
- [ ] Sources slide is the last slide, even if short.
- [ ] Reveal stagger fires correctly: load page, navigate forward, watch the
      kicker/title/lede arrive in order.
- [ ] `prefers-reduced-motion` is honored.
- [ ] Deck stage is 1920×1080 and scales via deck-stage.js.
