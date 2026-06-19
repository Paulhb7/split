# Anti-generic enforcement checklist

The mechanical tells of generated UI, grouped by what the auditor checks
and what only a human/agent eye can. Use this to write a project's
`DESIGN.md` § 6 and to read a rendered artifact before handoff.

## Color

- [ ] No pure `#000000` anywhere — use a near-black (`#0a0a0b`, `#111014`).
- [ ] No AI-purple / blue-neon gradient (the `#7c3aed`/`#8b5cf6`/`#6366f1`
      on white look). It is the single clearest "this was generated" tell.
- [ ] One accent color at most; saturation under ~80%.
- [ ] Neutral base is a real neutral (zinc / slate / stone), not muddy grey.
- [ ] No neon glows / `box-shadow` halos as decoration.

## Typography

- [ ] No Inter, Roboto, Arial, or bare `system-ui` for premium contexts.
- [ ] No generic serif (Times New Roman, Georgia) on a dashboard — only a
      distinctive modern serif (Fraunces, GT Sectra…) if a serif is used.
- [ ] Body copy ≤ ~65 characters per line; leading is relaxed (≥ 1.5).
- [ ] Numerals are monospace/tabular when density > 7 (tables, dashboards).
- [ ] Not defaulting to Space Grotesk just because it's the safe pick.

## Layout & responsive

- [ ] No overlapping elements — every element has its own spatial zone.
- [ ] No three-equal-card row as the default section pattern.
- [ ] No centered hero when variance > 4 — earn the composition.
- [ ] Full-height uses `100dvh`, never `h-screen` (iOS Safari fails it).
- [ ] Collapses cleanly below 768px; no horizontal scroll on mobile.
- [ ] Touch targets ≥ 44px.
- [ ] No content overflow / cramped shrink-to-fit — split into more views.

## Motion

- [ ] Animates `transform` / `opacity` only — never `top/left/width/height`.
- [ ] Spring physics, not linear ease everywhere (≈ stiffness 100 / damp 20).
- [ ] One staged page-load moment beats scattered micro-fidgets.
- [ ] `prefers-reduced-motion` is honored.

## Content & copy

- [ ] No fabricated metrics ("99.98% UPTIME SLA", invented testimonials).
- [ ] No AI copy clichés: Elevate, Seamless, Unleash, Supercharge,
      Revolutionize, Empower, "Scroll to explore", "Get started in seconds".
- [ ] No filler UI (bouncing chevrons, "as featured in" with no logos).
- [ ] No broken image links — generated imagery, `picsum.photos`, or SVG.
- [ ] No emoji outside a surface where they're genuinely the brand voice.

## Judgment-only (the auditor can't see these)

- [ ] Does it feel *designed for this context*, or interchangeable?
- [ ] Is there a clear visual hierarchy, or is everything the same weight?
- [ ] Are the empty / loading / error states designed, not just the happy path?
- [ ] Could you remove something and make it better? (Constraint = quality.)
