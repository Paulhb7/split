---
version: alpha
name: Split Default
description: The house style of Split — a dark glass surface with a single coral accent, Geist sans for display and body, Geist Mono for chrome and numerals, Instrument Serif italics reserved for emphasis. The system reads as terminal-premium / Linear-adjacent without leaning on shadows, gradients of saturation, or icons. Depth comes from 1px lines, generous gutters, and one subtle radial coral hotspot in the upper-right that signals "this is from Split."

colors:
  void: "#08080B"
  panel: "#131318"
  panel-2: "#1A1A22"
  ink: "#F4F4F8"
  ink-2: "rgba(244,244,248,0.62)"
  ink-3: "rgba(244,244,248,0.38)"
  line: "rgba(244,244,248,0.08)"
  line-2: "rgba(244,244,248,0.16)"
  coral: "#E0566B"
  coral-warm: "#F08899"
  coral-deep: "#B43A4D"

color-aliases:
  c-bg: void
  c-bg-elev: panel
  c-bg-elev-2: panel-2
  c-fg: ink
  c-fg-2: ink-2
  c-fg-3: ink-3
  c-border: line
  c-border-strong: line-2
  c-accent: coral
  c-accent-warm: coral-warm
  c-accent-deep: coral-deep

typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 236px
    fontWeight: 600
    lineHeight: 0.92
    letterSpacing: -0.045em
  h1:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 108px
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: -0.025em
  h2:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 74px
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: -0.02em
  h3:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 44px
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: -0.015em
  lead:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 34px
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: 14px
    fontWeight: 400
    letterSpacing: 0.16em
    textTransform: uppercase
  quote-serif:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: 108px
    fontWeight: 400
    fontStyle: italic
    lineHeight: 1.08
    letterSpacing: -0.015em
  stat-value:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: 520px
    fontWeight: 500
    lineHeight: 0.85
    letterSpacing: -0.06em
    fontVariantNumeric: tabular-nums

spacing:
  pad-x: 120px
  pad-y: 120px
  chrome-y: 54px
  gap-lg: 60px
  gap-md: 36px
  gap-sm: 16px

canvas:
  width: 1920px
  height: 1080px
  background: "{colors.void}"

components:
  brand-mark:
    description: "Tiny brand signature in the top-left chrome row. An 8×8px coral square (no border, soft 12px coral glow) followed by the word SPLIT in Geist Mono uppercase 14px, 0.16em tracking, ink color. The square pulses softly (2.4s loop) while the slide is active."
    color-dot: "{colors.coral}"
    color-text: "{colors.ink}"
  chrome-rule:
    width: "calc(100% - 240px)"
    height: 1px
    background: "{colors.line}"
    description: "A 1px hairline that sits under the chrome-top row and above the chrome-bot row. Never a thicker rule, never a colored one."
  kicker:
    fontFamily: "{typography.label.fontFamily}"
    fontSize: "{typography.label.fontSize}"
    letterSpacing: 0.16em
    textTransform: uppercase
    color: "{colors.ink-3}"
    description: "A muted Geist Mono uppercase eyebrow label placed above a headline. Always ink-3, never coral — coral kickers compete with the headline."
  bullet-marker:
    content: "—"
    color: "{colors.coral}"
    fontFamily: "{typography.label.fontFamily}"
    description: "Em-dash in coral, set in Geist Mono. The standard list mark. Never a dot, never a check."
  emphasis-italic:
    fontFamily: "{typography.quote-serif.fontFamily}"
    fontStyle: italic
    color: "{colors.ink}"
    description: "Instrument Serif italic inline span used to mark one or two emphasized words inside a headline. The italic provides the only stylistic punctuation in the system — it must be rare (≤2 emphases per slide). For pull-quotes the same face is used at quote-serif size, with the opening/closing quote glyphs colored coral."
  page-counter:
    fontFamily: "{typography.label.fontFamily}"
    fontSize: "{typography.label.fontSize}"
    color: "{colors.ink-3}"
    fontVariantNumeric: tabular-nums
    description: "Two-digit zero-padded page indicator (e.g. 02 / 07) anchored at the right of the chrome-top row."
  pip:
    width: 10px
    height: 10px
    background: "{colors.coral}"
    description: "Square (NOT round) coral indicator for live/active status in tables and legends. A muted variant uses ink-3 fill for inactive/reserve items."
  table-rule:
    height: 1px
    background: "{colors.line}"
    description: "Per-row 1px ink-low rule under each table row. Header gets the stronger line-2 underline."
  hero-meta:
    description: "Bottom-left strip on the cover slide, three to four chrome cells separated by 48px gaps. Each cell has a Geist Mono uppercase label (ink-3) and a 15px Geist value (ink, weight 500). Used to surface authorship, preset name, format."

background-effects:
  base: "{colors.void}"
  hotspot-tr:
    description: "Radial gradient hotspot in the upper-right corner, 900px × 600px, centered at 86% −8%. Color: color-mix(in srgb, var(--coral) 18%, transparent), fading to transparent at 62%. This is the system's signature ambient cue — present on every slide. Do not move it."
  hotspot-bl:
    description: "Smaller, softer second hotspot in the lower-left, 700px × 480px, centered at −10% 110%, at 8% coral opacity, fading at 60%. Subtle counterweight to the top-right; together they create a diagonal sense of light."
  grain:
    description: "Inline SVG fractal noise at 4.5% opacity, mix-blend-mode overlay, applied via a ::before pseudo on every slide. Removes the 'flat dark UI' look that pure #08080B otherwise reads as."
---

## Frontend Slides Fixed-Stage Policy

When this design system is used by the `frontend-slides` skill, generate the
final deck as a **fixed 1920×1080 stage** that scales uniformly to the browser
viewport. The deck preserves a 16:9 slide canvas on every screen, including
phones; it may letterbox or pillarbox, but never reflows slide content for
mobile. Use `deck-stage.js` or an equivalent inline stage scaler.

## Overview

Split Default is the **house style of Split**. It exists so that any deck
shipped from a Split expert (Consultant, Financier, Scientist when they
present) reads instantly as coming from Split — without forcing the user to
pick a template every time.

The system has one job: be the **dark-glass / terminal-premium / Linear-adjacent**
default. It is restrained where modern tech aesthetics tend to be loud, and
loud in exactly one place — the coral accent — where most dark themes are
monochrome and inert. The result reads closer to a Vercel docs page or a
Linear changelog than a SaaS pitch template.

**Three-voice typography.**
- **Geist** (weights 400, 500, 600) carries every display, headline, lead,
  body, and chip. The font's slightly tightened spacing and confident
  geometric construction is the system's primary voice.
- **Geist Mono** (weight 400) carries every structural label — chrome
  header/footer text, page numbers, axis labels, table headers, source
  notes. Mono is uppercase and tracked at 0.16em.
- **Instrument Serif** (italic 400) appears in **two specific moments**:
  inline `<em>` emphasis inside a headline or paragraph, and the body of a
  pull-quote. The italic serif is the only stylistic flourish in the
  system — when it appears, the eye lands on it. It must be rare.

**Single-accent palette.**
- Surfaces and text run on `{colors.void}` (background) and the three ink
  tones (`{colors.ink}`, `{colors.ink-2}`, `{colors.ink-3}`).
- `{colors.coral}` (#E0566B) — the only chromatic color — appears in five
  places and nowhere else: the brand-mark dot, the em-dash bullet, the
  pull-quote opening/closing glyphs, the table pips for live status, the
  page-counter and source-list ordinals. Coral is signal, not decoration.
- Two coral siblings (`coral-warm`, `coral-deep`) exist for hover/pulse
  states and the subtle hotspot gradients. They are not used for type.

**Depth = lines + gutters + one hotspot.** No drop shadows, no card fills,
no elevation. Region separation is always a 1px line in `{colors.line}`.
The radial coral hotspot in the upper-right is the signature visual cue —
present on every slide, never moved.

## Colors

### Palette

- **Void** (`{colors.void}` — #08080B): The default surface. Very dark
  blue-black, never pure #000 (which reads flat and amateurish on OLED).
- **Panel** (`{colors.panel}` — #131318): Slightly lifted surface for
  inline cards or sidebars when needed. Used sparingly.
- **Panel-2** (`{colors.panel-2}` — #1A1A22): Even slightly more elevated.
  Used only when two panel surfaces sit side-by-side and need to read as
  distinct.
- **Ink** (`{colors.ink}` — #F4F4F8): Primary text. Slightly cool off-white,
  never pure #FFF (which reads harsh on the dark surface).
- **Ink-2** (62% ink): Secondary text. Lead paragraphs, table body cells.
- **Ink-3** (38% ink): Tertiary text. Chrome labels, axis labels, source
  notes, kickers — anything that should read as structural metadata.
- **Line** (8% ink): Standard 1px rule.
- **Line-2** (16% ink): Stronger 1px rule, used only for emphasized
  separators (table header underline, hero meta-strip top border).
- **Coral** (`{colors.coral}` — #E0566B): The single accent. Used at five
  exact points only — see the components list.
- **Coral-warm** / **Coral-deep**: Reserved for the pulse animation on the
  brand-mark dot and the ambient hotspot gradients. Never for type.

### Defaults

- **Surface background**: `{colors.void}` with the radial hotspot overlay.
- **Primary text**: `{colors.ink}`.
- **Body text**: `{colors.ink-2}`.
- **Chrome / kicker / source**: `{colors.ink-3}`.
- **Divider**: 1px `{colors.line}`.
- **Accent**: `{colors.coral}`, used only at the five designated touchpoints.

The system has no warm/cool pairing, no semantic color (no red for warning,
no green for success). Status is communicated through ink intensity or
through the coral pip vs. the muted pip.

## Typography

### Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
```

### Type Scale

| Token | Size | Family | Weight | Use |
|---|---|---|---|---|
| `{typography.display}` | 236px | Geist | 600 | Cover hero title |
| `{typography.h1}` | 108px | Geist | 500 | Section break |
| `{typography.h2}` | 74px | Geist | 500 | Primary content-slide headline |
| `{typography.h3}` | 44px | Geist | 500 | Sub-headline, column heading |
| `{typography.stat-value}` | 520px | Geist | 500 | The single big number on a slide |
| `{typography.quote-serif}` | 108px | Instrument Serif italic | 400 | Pull-quote body |
| `{typography.lead}` | 34px | Geist | 400 | Lead paragraph under a headline |
| `{typography.body}` | 24px | Geist | 400 | Body paragraph, table cell |
| `{typography.caption}` | 18px | Geist | 400 | Caption, source note |
| `{typography.label}` | 14px | Geist Mono | 400 | Kicker, chrome, axis, page-num |

### Signature Treatments — non-optional

- **Every Geist display, h1, h2, h3 is mixed case.** Uppercase is reserved
  exclusively for Geist Mono labels.
- **Every label uses Geist Mono uppercase at 0.16em tracking.** Mono in
  sentence case does not exist here.
- **The pull-quote body is always Instrument Serif italic at 108px.** Its
  opening and closing curly quotes are colored `{colors.coral}`.
- **Inline emphasis** inside a headline or paragraph is an
  `<em>` wrapped in Instrument Serif italic at the surrounding size. The
  span itself stays in ink color — except inside a `quote-serif` block,
  where it may switch to coral for a single high-emphasis word.
- **All numerals use `font-variant-numeric: tabular-nums`** in mono labels,
  stat values, page counters, and any table column declared numeric.

## Layout

### Padding and Gap

| Token | Value | Use |
|---|---|---|
| `{spacing.pad-x}` | 120px | Slide horizontal padding |
| `{spacing.pad-y}` | 120px | Slide vertical padding (body) |
| `{spacing.chrome-y}` | 54px | Top/bottom offset for the chrome rows |
| `{spacing.gap-lg}` | 60px | Between major content sections |
| `{spacing.gap-md}` | 36px | Between related elements |
| `{spacing.gap-sm}` | 16px | Between tightly related elements |

### Chrome Frame

Almost every content slide carries a **chrome-top** and a **chrome-bot**:
each is a `flex space-between` row at the 54px offset, separated from the
slide body by a 1px line. The **chrome-top** holds the brand-mark on the
left and a meta string (or page counter) on the right. The **chrome-bot**
holds a source/context string on the left and a status/date string on the
right. Cover-style slides may suppress the chrome-bot but never the
chrome-top — the brand-mark must be present on every slide.

### Density Philosophy

Medium-high. Unlike the editorial templates (Monochrome, Soft Editorial),
Split Default can carry a dense table or a four-column compare without
breaking, because the rigorous chrome and the 120px gutter create a frame
that absorbs density. That said, no single slide should exceed:
- 1 hero element + 1 supporting paragraph (cover, statement, big-number)
- 2 columns × 4 bullets (compare)
- 1 table with ≤ 9 rows
- 1 quote ≤ 32 words

If the content exceeds these limits, split into more slides — never shrink
the type to fit.

## Depth and Elevation

The system uses **zero `box-shadow` declarations** on structural elements.
Depth comes from three mechanisms only:

1. **1px hairline rules in `{colors.line}`** — under chrome rows, between
   compare columns, across table rows, around the hero meta strip.
2. **Generous whitespace** — the 120px gutter is sacrosanct; never shrink
   it to fit content.
3. **The ambient coral hotspot** — the radial gradient at 86% −8% gives
   every slide a sense of light direction without using shadows.

The brand-mark dot has a soft `box-shadow: 0 0 12px coral` glow — this is
the **only** shadow in the system. It is a glow, not an elevation cue.

## Shapes and Treatment

### Border Radius

- **0px** — every structural element: tables, compare columns, the brand-mark
  square, the pip, the hero number container. The system is dominantly
  square-cornered.
- **999px (pill)** — the deck-controls pill at the bottom, and any inline
  chip if used. The deck-controls is the only pill in the system.
- No 16px-rounded cards. Split Default does not use card surfaces; it uses
  bordered regions.

### Border Weights

- **1px solid `{colors.line}`** — universal divider weight.
- **1px solid `{colors.line-2}`** — emphasized divider (table header
  underline, hero meta-strip top border).
- No thicker borders, no colored borders.

### Decorative Elements

- **Brand-mark** — 8×8px coral square + Geist Mono uppercase wordmark.
  Pulsing 2.4s loop while the slide is active.
- **Em-dash bullet** — Geist Mono em-dash in `{colors.coral}` at the
  surrounding text size. Grid layout `grid-template-columns: 28px 1fr`
  for clean alignment.
- **Hotspot** — the upper-right radial coral gradient. Identity-carrying;
  do not remove or relocate.
- **Page counter** — `01 / 07` in Geist Mono with tabular nums, right-anchored
  in the chrome-top row.

## Images

Images are **optional** in Split Default — most decks ship better without
them, because the type and the coral accent already carry the system. When
images are used, they are sourced through the `image-search` skill
(Openverse: CC-licensed, keyless, real attribution). Three layouts only;
no other use of imagery is allowed.

### 1. Cover full-bleed

The hero slide may carry a single full-bleed photograph behind the title.
The image fills the entire 1920×1080 stage; the upper-right coral hotspot
stays on top of the image. A dark gradient overlay restores text
legibility.

```css
.slide.cover-photo .bg-photo{
  position:absolute; inset:0;
  background-image: url("/path/to/local/image.jpg");
  background-size: cover; background-position: center;
  filter: brightness(0.55) saturate(0.95) contrast(1.05);
  z-index: 0;
}
.slide.cover-photo::after{
  content:""; position:absolute; inset:0; z-index:1;
  background: linear-gradient(180deg,
    rgba(8,8,11,0.20) 0%,
    rgba(8,8,11,0.50) 55%,
    rgba(8,8,11,0.85) 100%);
}
.slide.cover-photo .body{ position:relative; z-index:2 }
```

Rules:
- **Use it once per deck, on the cover.** Never on a content slide.
- **One image, not a collage.**
- The image must be **specific** to the subject — no generic "city
  skyline" or "abstract dots". If a specific image can't be found, skip
  the photo and ship the typographic cover.
- Attribution goes in the chrome-bot row, right-aligned, in Geist Mono
  ink-3 at 12px: `Photo: <creator> via <source> · CC BY-SA 4.0`.

### 2. Section divider full-bleed

When the deck has acts (>15 slides), each act may open with a full-bleed
section-divider slide following the same overlay treatment as the cover.
The slide carries only:
- a kicker in the top-left: `01 — MARKET` (Geist Mono uppercase, ink color)
- a single H1 below it (Geist 500, 108px)
- the chrome-bot attribution line

**Maximum 3 dividers** in a deck of 15-30 slides. Two acts in a row
without contrast (image, then image) reads as a carousel — break them up
with a typographic divider.

### 3. Inline compare column

In a two-column compare layout, one column may host an image at **4:5
ratio** (portrait, 720×900 within the column), with a caption directly
below. The other column stays typographic. The image is bordered with a
1px `{colors.line}` rule on all four sides; no shadow.

```css
.compare .col.image-col img{
  width: 100%; aspect-ratio: 4 / 5;
  object-fit: cover; object-position: center;
  border: 1px solid var(--line);
}
.compare .col.image-col figcaption{
  margin-top: 16px;
  font-family: var(--mono); font-size: 14px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--ink-3);
}
```

Caption format under inline images: `Photo: <creator> via <source> ·
<license>` — same Geist Mono ink-3 styling as a chrome label.

### Forbidden image uses

- No image as a decorative background on a content slide.
- No image as a slide-edge accent or floating thumbnail.
- No icons, no clipart, no SVG illustrations dressed up as photos.
- No stock-filler ("business handshake", "diverse team meeting",
  "abstract data flow"). If the image isn't specific, skip it.
- No multiple images per slide (other than as a 2-column compare).
- No images on the sources slide or the last slide.

## Animation

Inherits the entrance vocabulary from `animation-patterns.md`. Defaults:

- **Ease**: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) — the system's
  single easing function.
- **Entrance**: stagger with `data-delay` 0..7 mapping to 0 / .08 / .18 / .30
  / .44 / .60 / .78 / .96 s.
- **Hero number** (`{typography.stat-value}`): start with `data-anim="fade-in"
  data-delay="1"`. If the number is a count, wrap the digits in a
  `<span class="counter" data-from="0" data-to="N" data-start="280">0</span>`
  and run a `easeOutExpo(t)` JS counter over 900ms.
- **Pull quote**: `data-anim="blur-in"` on the `<q>` element; the attribution
  follows with `data-anim="fade-up" data-delay="5"`.
- **Inter-slide transition**: 280ms CSS opacity crossfade on `.slide.active`.
  No wipes, no slides, no scale transitions between slides. The entrance
  animation on the new slide carries the transition's energy.
- **Brand-mark dot**: continuous `pulse-dot` 2.4s loop while the slide is
  active.

`prefers-reduced-motion: reduce` is respected through the global override in
`viewport-base.css` (animations clamped to 0.01ms).

## Do's and Don'ts

### Do
- Use the void surface (`{colors.void}`) on every slide. The dark surface
  is the system's foundation.
- Keep coral confined to its five designated touchpoints (brand dot,
  em-dash bullet, quote glyphs, live pips, ordinals).
- Use Geist Mono uppercase at ≥0.16em tracking for every label, axis, page
  counter, and chrome line.
- Reach for Instrument Serif italic only on `<em>` inline emphasis or the
  pull-quote body. Two emphases per slide is the ceiling.
- Render every structural divider as a 1px `{colors.line}` rule.
- Apply the em-dash marker in coral for every bullet list.
- Keep the 120px gutter — content sits inside it, never bleeds past it
  unless it is a full-bleed image (rare).
- Use tabular nums for every number in a label, table, stat, or counter.

### Don't
- Don't introduce a second chromatic color. No blue, no green, no purple.
- Don't use coral for body text, headlines, or large blocks. Coral is signal.
- Don't use Geist for labels — labels are always Geist Mono.
- Don't use Instrument Serif outside `<em>` and pull-quote contexts.
- Don't use `box-shadow` on structural elements. The brand-mark glow is the
  only shadow in the system.
- Don't round any element other than the deck-controls pill. Square corners
  are the structural default.
- Don't use dots, checks, or numerals as bullet markers. The em-dash is
  the system's only list mark.
- Don't add a coral wipe, a coral fill, or a coral border to a slide. The
  hotspot gradient is the only ambient coral moment.
- Don't enable card surfaces (`{colors.panel}` / `{colors.panel-2}`) unless
  two regions genuinely need to read as elevated relative to each other.
- Don't shrink type to fit. Split into more slides instead.

## Iteration Guide

1. New slide background is `{colors.void}` with the hotspot overlay.
2. New headline uses Geist in mixed case at weight 500 (h2/h3) or 600
   (display). Never reach for 700.
3. New label, kicker, or metadata text uses Geist Mono uppercase at 0.16em
   tracking, colored `{colors.ink-3}`.
4. New divider is a 1px `{colors.line}` rule.
5. New pull-quote is Instrument Serif italic at 108px, with curly quotes
   colored `{colors.coral}`.
6. New bullet list uses the em-dash in coral.
7. New emphasis inside a headline wraps the word in `<em>` (Instrument Serif
   italic at surrounding size).
8. The brand-mark must appear on every slide, even cover-style.
9. The 120px gutter is sacrosanct — content sits inside it, never bleeds past
   it except for genuine full-bleed media.
10. If you need to emphasize something, prefer Instrument Serif italic, then
    size increase, then a single coral mark. Never introduce a new color.
