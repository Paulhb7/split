---
name: graphics
description: Render static visual graphics at fixed dimensions — posters, social-media posts (IG square / story / portrait, LinkedIn, X/Twitter), banners, business cards, A4/A3 print collateral — by writing HTML at the exact target pixel size and exporting to PNG or PDF via Playwright. Use when the user asks for a poster, an Instagram / LinkedIn / X post, a banner, a flyer, a business card, a one-pager, or any single-frame visual deliverable that is not a slide deck and not a dashboard.
---

# Graphics

Single-frame visual deliverables at **fixed pixel dimensions**, exported
to **PNG** (default) or **PDF** (print). The pipeline is the same as the
`frontend-slides` PDF export, repurposed: write HTML at the exact target
size, Playwright opens it at that viewport, screenshots it, saves the file.

## When to use this vs. other skills

| Deliverable                              | Skill                                |
| ---------------------------------------- | ------------------------------------ |
| Slide deck (1920×1080, multi-slide)      | `frontend-slides`                    |
| Financial / monitor dashboard            | `terminal-dashboard`                 |
| Word document, memo                      | `docx`                               |
| **Poster, IG/LinkedIn/X post, banner, print collateral, business card, one-pager** | **`graphics` (this)** |

If the user says "make me a poster", "design an IG post", "give me a
LinkedIn banner", "I need a flyer", "a business card" → this skill. If
they say "deck" / "presentation" / "slides" → `frontend-slides`.

## Format presets

Common targets, all in px (Playwright viewport). Use one of these
unless the user names a different size.

| Format                                | Dimensions  | Use                                       |
| ------------------------------------- | ----------- | ----------------------------------------- |
| **Instagram square** (`ig-square`)    | 1080 × 1080 | Default IG feed post                      |
| **Instagram story** (`ig-story`)      | 1080 × 1920 | IG / FB story, vertical                   |
| **Instagram portrait** (`ig-portrait`) | 1080 × 1350 | IG feed, portrait, ~4:5                  |
| **LinkedIn post** (`li-post`)         | 1200 × 627  | LinkedIn link/share preview               |
| **LinkedIn banner** (`li-banner`)     | 1584 × 396  | LinkedIn profile cover                    |
| **X / Twitter post** (`x-card`)       | 1200 × 675  | X share card / large image                |
| **YouTube thumbnail** (`yt-thumb`)    | 1280 × 720  | Video thumbnail                           |
| **A4 portrait** (`a4-p`)              | 794 × 1123  | One-page document at 96 dpi               |
| **A4 landscape** (`a4-l`)             | 1123 × 794  | One-page landscape                        |
| **A3 portrait** (`a3-p`)              | 1123 × 1587 | Large print poster at 96 dpi              |
| **Business card** (`card`)            | 1050 × 600  | 85×55 mm at 300 dpi                       |

For print at 300 dpi instead of 96, multiply px by 3.125 (A4 → 2480×3508).
Render at the higher resolution if the output goes to a print shop.

## Workflow

### 1. Write HTML at the exact target size

Lock the document to one viewport. No `vw`/`vh` reflow — pixel-explicit.

```html
<!doctype html>
<html><head><meta charset="utf-8">
<style>
  /* Replace 1080 × 1080 with your target */
  html, body { margin: 0; padding: 0; width: 1080px; height: 1080px;
               overflow: hidden; background: #08080B; }
  .canvas { width: 1080px; height: 1080px; position: relative;
            font-family: 'Geist', system-ui, sans-serif; color: #F4F4F8; }
  /* … your composition … */
</style>
</head>
<body><div class="canvas"><!-- content --></div></body></html>
```

Load Google Fonts via `@import` in `<head>` and **wait for fonts** before
exporting (the script below does this).

### 2. Export with Playwright

```bash
node graphics-export.mjs <path-to-html> <width> <height> <output.png>
```

The export script (drop it in `scripts/` of the deliverable folder):

```js
import { chromium } from 'playwright';
import { resolve } from 'path';

const [,, htmlPath, W, H, outPath] = process.argv;
const width = parseInt(W), height = parseInt(H);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 1,          // 2 for retina/print
});
await page.goto('file://' + resolve(htmlPath), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);  // let any one-time anim settle
await page.screenshot({
  path: outPath, fullPage: false,
  type: outPath.endsWith('.pdf') ? undefined : 'png',
  omitBackground: false,
});
await browser.close();
```

For PDF (e.g. A4 print), use `page.pdf({ path, width: '210mm', height: '297mm', printBackground: true })` instead of `screenshot`.

**First run installs Playwright + Chromium** — slow (~2 min). Cache the
install in `~/.cache/playwright`. Subsequent runs are instant.

### 3. Multi-format chain — render the same design at every size

For a campaign that needs IG square + IG story + LinkedIn post from one
design, use a CSS custom property for the aspect-ratio-dependent layout
and call the export script once per format:

```bash
for f in ig-square:1080:1080 ig-story:1080:1920 li-post:1200:627; do
  IFS=: read name w h <<< "$f"
  node graphics-export.mjs source.html "$w" "$h" "out-${name}.png"
done
```

## Design templates (the layout vocabulary)

A handful of layout archetypes carry 90% of static graphics. Pick one,
don't reinvent. Variety across a campaign = different archetypes, not a
new one per post.

| Template            | Best for                                              |
| ------------------- | ----------------------------------------------------- |
| **Type-led poster** | Manifestos, statements, big claims — type fills 70%+  |
| **Image-bleed**     | Photo + headline overlay, brand at corner             |
| **Quote card**      | A quoted line + attribution + brand mark              |
| **Stat moment**     | One big number, label, small context                  |
| **Listicle**        | Numbered points (1-5), used for tip / step posts      |
| **Announcement**    | Event name + date/place + CTA + logo                  |
| **Cover / link**    | Linked content preview — title + source + visual cue  |

## Design discipline

- **One idea per graphic.** Static graphics get a glance, not a read.
- **Pick a brand.** If the user has a brand kit, use its tokens (logo,
  palette, fonts). If not, default to `split-default` (void #08080B +
  coral #E0566B accent + Geist + Geist Mono).
- **Contrast safety on photos**: any text over a photo needs a dark
  overlay (`linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85))`) or the
  text needs its own shape (a solid block, a card).
- **Ratio-aware composition**: a 1080×1080 square and a 1080×1920 story
  are not the same design with different crops — they need different
  hierarchies. Don't shrink to fit.
- **Use the `image-search` skill** for any photographic background or
  reference, with proper Openverse attribution. Never embed copyrighted
  images.
- **Tabular nums** on every number (stat moments, prices, dates).
- **Brand mark always present**: small, bottom corner, never the largest
  thing on the canvas.

## Output discipline

- Save to `~/Documents/split-graphics/<project>/<name>-<format>.png` (or
  `.pdf` for print).
- Always report the absolute path and the exact dimensions after export.
- Offer to `open` the file — only run `open` if the user agrees.
- For a campaign (multi-format), report all files in one summary table.
- Never overwrite an existing render without a date suffix.

## Anti-patterns to refuse

- **No infographics with 10+ data points crammed in.** That's a slide
  deck, not a static graphic. Send the user to `frontend-slides`.
- **No "wall of text" posters** (more than ~40 words). Cut or split.
- **No carousel-only designs.** This skill ships single frames; for a
  carousel, ship 3-5 separate files explicitly.
- **No generic stock filler.** If you can't find a specific photo via
  `image-search`, drop the image and ship type-led.
