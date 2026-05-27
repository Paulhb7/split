# Split Default Preview Card

Use this small file for title-slide previews only. For final deck generation, read the full design doc listed below.

## Files

- Full design doc: `bold-template-pack/templates/split-default/design.md`
- Preview card: `bold-template-pack/templates/split-default/preview.md`

## Selection Metadata

- Slug: `split-default`
- Tagline: Dark glass with a single coral accent — Geist sans, Geist Mono chrome, Instrument Serif italics for emphasis. The Split house style.
- Mood: terminal-premium, considered, restrained, dark-glass, modernist
- Tone: confident, precise, quietly bold, tech-editorial
- Formality: medium-high
- Density: medium-high
- Scheme: dark
- Best for: Anything shipped from a Split expert by default — Consultant briefings, Financier pitches, Scientist talks, internal product decks, investor or board updates that want to read as terminal-premium / Linear-adjacent rather than corporate or playful. Equally good for product-launch decks, design reviews, engineering postmortems, and any deck wanting one strict coral accent on a dark surface.
- Avoid for: Decks that need warmth, multi-color storytelling, or a cultural / editorial / playful voice — the void + single-coral palette is intentionally austere and slightly machine-like.

## Visual Snapshot

A dark-glass system anchored to a very dark blue-black surface (#08080B, never pure black) with a single coral accent (#E0566B) used at exactly five touchpoints: the pulsing brand-mark dot, the em-dash bullet, the pull-quote curly quotes, the live status pips, and the page-counter / source ordinals. Every slide carries the same ambient cue — a soft radial coral hotspot in the upper-right corner — that signals "this is from Split" without ever interrupting the type. Geist sans (weights 400–600) carries every display, headline, and body; Geist Mono uppercase at 0.16em tracking carries every label, page number, and chrome line; Instrument Serif italic appears in two specific moments only — inline `<em>` emphasis and pull-quote bodies. The cultural reference is Vercel docs, Linear changelogs, and the terminal-editorial intersection where a research note and a product announcement read with the same restraint.

Split Default is **the house style of Split**: the template a Split expert reaches for when the user has not specified a style. It is restrained where modern tech aesthetics tend to be loud (no neon gradients, no card stacks, no decorative icons), and confident in exactly one place — the coral accent — where most dark themes are monochrome and inert.

## Preview Ingredients

- Palette: void #08080B; panel #131318; ink #F4F4F8; ink-2 rgba(244,244,248,0.62); ink-3 rgba(244,244,248,0.38); coral #E0566B; coral-deep #B43A4D
- Typography: Geist; Geist Mono; Instrument Serif (italic only)
- Signature move: Coral accent confined to five exact touchpoints — brand dot, em-dash bullet, pull-quote glyphs, live status pip, page/source ordinals. Never used for body text or headlines.
- Signature move: Ambient radial coral hotspot in the upper-right corner of every slide (900×600 at 86% −8%, 18% coral), the system's identity-carrying cue.
- Signature move: 8×8px coral brand-mark dot in the chrome-top row, softly pulsing (2.4s loop) while the slide is active.
- Signature move: Instrument Serif italic reserved for inline `<em>` emphasis and pull-quote bodies — the only stylistic flourish in the system, restricted to ≤2 emphases per slide.
- Signature move: Geist Mono uppercase at 0.16em tracking for every label, page counter, table header, and chrome line.
- Signature move: All numerals set with `font-variant-numeric: tabular-nums`.
- Signature move: 120px slide gutter — sacrosanct, never shrunk to fit content.

## International / CJK Preview Note

- If the preview uses Chinese or other CJK text, keep CJK letter-spacing at 0, loosen line-height, and avoid uppercase transforms on CJK runs. Geist has limited CJK coverage; fall through to Noto Sans SC for CJK glyphs. Instrument Serif has no CJK — for Chinese emphasis, drop the italic and use Noto Serif SC roman at the surrounding size.
