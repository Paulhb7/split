# Split Default Preview Card

Use this small file for title-slide previews only. For final deck generation,
read the full design doc at `design.md` and treat `reference.html` as the
ground-truth implementation.

## Files

- Full design doc: `bold-template-pack/templates/split-default/design.md`
- Canonical implementation: `bold-template-pack/templates/split-default/reference.html`
- Preview card: `bold-template-pack/templates/split-default/preview.md`

## Selection Metadata

- Slug: `split-default`
- Tagline: Dark cosmic atmosphere with two signature orbs on the cover, four-color accent palette anchored by coral, Clash Display × Satoshi × JetBrains Mono. The Split house style.
- Mood: dark-cosmic, atmospheric, tech-editorial, considered, confident
- Tone: sharp, plain, data-dense, quietly authoritative
- Formality: medium-high
- Density: medium-high (carries 4-6 KPIs, 5-7 bar rows, or 4 vendor cards per slide)
- Scheme: dark
- Best for: The default for anything shipped from a Split expert — Consultant briefings, Financier pitches, Scientist talks, internal product decks, investor or board updates that want to read as Linear-changelog / Vercel-docs / Stripe-Press adjacent. Also: product-launch decks, design reviews, engineering postmortems, retros, year-in-review decks. The palette variants section in `design.md` covers builder/launch (lime-magenta), editorial (amber-violet), and ops/infra (sea-coral) re-skins.
- Avoid for: Light decks (the system is dark-only), playful/illustrated decks (no images, no icons, no cartoons), high-formality corporate decks that need to read as conservative-bank (the orbs and gradients are deliberately atmospheric, not boardroom-neutral).

## Visual Snapshot

A dark cosmic stage anchored on `#0a0c12` over a deeper `#06070b` viewport.
**Two soft-blurred orbs sit on the cover** — one coral top-right (720×720,
offset −160/−160, accent at 55% alpha), one sea-green bottom-left (620×620,
offset −220/−220, accent at 35% alpha) — both blurred 8px. They are the
strongest brand cue and never appear on content slides; instead, every
content slide carries the same mood through a `::before` atmospheric layer
that bleeds two faint radial gradients (coral 10% top-right, sea 8%
bottom-left) plus a hairline white wash at the top. Optional `.grid-bg::after`
draws a 64px CSS grid masked by a radial ellipse so it fades at the edges —
used only on slides that warrant a "data terrain" feel (KPI grids,
benchmarks, contrarian-stat slides).

Typography is a three-font triad served from Fontshare: **Clash Display 600**
for every display, headline, and big number (cover title at 200px, section
titles at 80px, KPI numbers at 82px, contrarian stat at 340px);
**Satoshi 500** for body, lede, and card copy at 22-34px;
**JetBrains Mono 400** for every kicker, chrome line, source attribution,
tag, and footnote at 13-18px in `--ink-2` (low-emphasis warm gray).
The `<em>` tag is the single through-line accent across content slides:
written into every section title to highlight one phrase, it renders
without italic in coral.

Every non-cover slide carries the same rhythm at the top: a mono-uppercase
kicker in coral (18px, 0.18em tracking), then an 80px Clash section title
with one phrase in `<em>`, then a 30px Satoshi lede. The `.footnote` chrome
at the bottom always carries the source attribution on the left and
"Made with Split · split.app" on the right.

Split Default is **the house style of Split**: the template a Split expert
reaches for when the user has not specified a style. It reads as cosmic
where modern tech aesthetics tend to be flat (real atmosphere, real
gradients, real depth), confident in four places at once (the four-color
side bars cycling on KPI cards), and source-honest by construction
(citations live on the slide, not in an appendix).

## Preview Ingredients

- **Palette (coral-sea, default)**: stage `#06070b`; slide `#0a0c12`; panel-1 `#11141d`; panel-2 `#181c28`; ink-0 `#f4f1ea`; ink-1 `#c4c0b6`; ink-2 `#7f7a70`; coral `#ff6a5b`; coral-soft `rgba(255,106,91,.16)`; sea `#6ad5c4`; amber `#f4c66b`; violet `#a48bff`; line `rgba(244,241,234,.10)`.
- **Palette variants**: `lime-magenta` (builder energy), `amber-violet` (editorial warmth), `sea-coral` (ops/infra calm) — see `design.md` for hex values. Orbs and atmosphere keep the same grammar; only the four accent hues swap.
- **Typography**: `Clash Display` 600 + `Satoshi` 500/400 + `JetBrains Mono` 400, all from Fontshare in one `<link>` tag.
- **Signature move (CANON)**: Two soft-blurred orbs on the cover — accent-primary top-right and accent-2 bottom-left, radial-gradient + `filter: blur(8px)`. Never on content slides.
- **Signature move (CANON)**: `.slide::before` atmospheric radial layer on every slide, same two accent RGB at low alpha + faint top white wash. Bleeds the cover's mood through the whole deck.
- **Signature move**: Mono-uppercase kicker in coral → 80px Clash section title with `<em>` phrase in coral → 30px Satoshi lede. Same rhythm on every content slide.
- **Signature move**: Cover title at 200px Clash with one phrase italicized — italic killed by CSS, color becomes coral.
- **Signature move**: 4px colored side bars on KPI cards cycling through accent-primary / accent-2 / accent-3 / accent-4. Reads as "measurable, distinct, categorized" without being clownish.
- **Signature move**: Optional `.grid-bg::after` 64px grid masked by radial ellipse — only on slides that need data-terrain feel.
- **Signature move**: Always-on footnote chrome — `Sources: …` on the left, `Made with Split · split.app` on the right. Citations live on the slide.
- **Signature move**: `.reveal` class with `translateY(28px)` + opacity transition, staggered via `:nth-child` delays (0.05s → 0.54s in ~0.07s steps).

## International / CJK Preview Note

- Clash Display has no CJK coverage; fall through to Noto Sans SC at the
  display size for Chinese / Japanese / Korean glyphs. Satoshi has limited
  CJK coverage; for body in CJK, route to Noto Sans SC or a regional default.
- For CJK runs, drop letter-spacing to 0, loosen line-height to ~1.4, and
  avoid `text-transform: uppercase` on the kicker (mono uppercase reads
  poorly with CJK).
- The four-color palette tokens stay the same — color carries the meaning
  regardless of glyph system.
