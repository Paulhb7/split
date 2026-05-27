---
name: web-audit
description: Audit a live website by URL — capture screenshots at desktop and mobile widths, fetch the rendered HTML, extract the dominant color palette, identify the typography stack, and surface the site's design system. Use when the user asks to "redesign X", "look at this site", "audit competitor Y", "rebuild this page", or any task that needs the current state of a live URL as a starting point. Pairs naturally with the Designer (redesign), the Engineer Q (rebuild), and the Consultant (competitor briefings).
---

# Web Audit

Read a live URL the way a designer reads a page: take screenshots,
extract the palette, identify the type stack, sketch the structure.
Output is a small folder the next stage (Designer, Engineer Q,
Consultant) can act on.

## When to use

| Trigger phrase                                   | Why it's this skill                      |
| ------------------------------------------------ | ---------------------------------------- |
| "Redesign <URL>" / "refais le site de X"         | Need the current state before proposing  |
| "Audit X's site" / "compare these competitors"   | Side-by-side current-state capture       |
| "Rebuild this page" / "clone this layout"        | Engineer Q needs the HTML + visuals       |
| "What palette does X use?"                       | Quick palette extraction                  |

## Output — `~/Documents/split-audits/<slug>/`

For each URL audited, produce:

- `screenshot-desktop.png` — 1440 × full-page (or capped at 4320 px tall)
- `screenshot-mobile.png` — 390 × full-page
- `screenshot-above-fold.png` — 1440 × 900 (the hero only)
- `page.html` — the rendered HTML after JS execution (not the raw source)
- `page.txt` — text-only extract (for grepping copy / tone)
- `palette.json` — `{ hex: '#…', frequency: 0.42, role: 'background' | 'text' | 'accent' | 'border' }`
- `fonts.json` — `[{ family, source: 'google' | 'self-hosted' | 'system', weights, where }]`
- `audit.md` — one-page summary: structure, palette swatches, type specimens, what works, what doesn't.

## Step 1 — Screenshot + render HTML via Playwright

```bash
python -m pip install --quiet playwright pillow
python -m playwright install chromium    # first run only
```

```js
// audit-capture.mjs <url> <out-dir>
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const [,, url, out] = process.argv;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

for (const [name, w, h, full] of [
  ['desktop',     1440,  900, true],
  ['mobile',      390,   844, true],
  ['above-fold',  1440,  900, false],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `screenshot-${name}.png`), fullPage: full });
  if (name === 'desktop') {
    const html = await page.content();
    writeFileSync(join(out, 'page.html'), html);
    const text = await page.evaluate(() => document.body.innerText);
    writeFileSync(join(out, 'page.txt'), text);
  }
  await page.close();
}
await browser.close();
```

Notes:
- `waitUntil: 'networkidle'` waits for the page to settle — needed for
  SPAs that load content after the initial HTML.
- `document.fonts.ready` ensures fonts are loaded before the screenshot
  (otherwise the palette extraction can pick the wrong text color).
- Some sites block headless browsers (Cloudflare, datadome). If a
  screenshot returns a "verify you're human" page, surface that fact —
  do **not** try to bypass it.

## Step 2 — Palette extraction (Python + Pillow)

```python
from collections import Counter
from PIL import Image
import json, pathlib

img = Image.open('screenshot-above-fold.png').convert('RGB')
img.thumbnail((400, 400))                    # downsample for speed
pixels = list(img.getdata())

# Quantize to 16 colors with PIL's median-cut
q = Image.open('screenshot-above-fold.png').convert('RGB').quantize(colors=16, method=Image.MEDIANCUT)
palette = q.getpalette()[:16*3]
counts = Counter(q.getdata())

def hexof(rgb): return '#{:02X}{:02X}{:02X}'.format(*rgb)
total = sum(counts.values())
swatches = []
for idx, n in counts.most_common(12):
    rgb = tuple(palette[idx*3:idx*3+3])
    swatches.append({'hex': hexof(rgb), 'rgb': list(rgb), 'frequency': round(n/total, 4)})

pathlib.Path('palette.json').write_text(json.dumps(swatches, indent=2))
```

Then **infer roles** for each swatch:

| Heuristic                                    | Role               |
| -------------------------------------------- | ------------------ |
| Frequency > 30%, lightness > 0.85            | `background-light` |
| Frequency > 30%, lightness < 0.15            | `background-dark`  |
| Frequency 1-10%, saturation > 0.4            | `accent` (the brand) |
| Frequency 5-25%, lightness 0.05-0.30         | `text`             |
| Frequency < 5%, near-grey                    | `border`           |

The **accent** swatch is usually what the user means by "the brand color".

## Step 3 — Typography detection

Parse the HTML for fonts in three places:

```python
import re, pathlib, json
html = pathlib.Path('page.html').read_text()

# 1. Google Fonts <link href="…fonts.googleapis.com…family=…">
google = re.findall(r'fonts\.googleapis\.com/css2?\?family=([^"&]+)', html)

# 2. CSS @font-face self-hosted
self_hosted = re.findall(r'@font-face\s*\{[^}]*font-family\s*:\s*[\'"]?([^;\'"]+)', html)

# 3. font-family declarations in inline / linked CSS (best-effort)
families = re.findall(r'font-family\s*:\s*([^;}]+)', html)

# Pick the first non-system family in each declaration
def first_real(stack):
    for f in re.split(r',', stack):
        f = f.strip(' \'"')
        if f.lower() in ('system-ui', 'sans-serif', 'serif', 'monospace', 'arial', 'helvetica'):
            continue
        return f
    return None

fonts = set()
for stack in families:
    if (real := first_real(stack)):
        fonts.add(real.split(':')[0])  # strip Google weights

pathlib.Path('fonts.json').write_text(json.dumps({
    'google': list(set(google)),
    'self_hosted': list(set(self_hosted)),
    'detected_in_use': sorted(fonts),
}, indent=2))
```

Most modern sites use Google Fonts or self-hosted variable fonts —
either way, the family name is identifiable. If the only thing detected
is `system-ui` / `sans-serif`, the site uses the OS default
(Apple SF Pro on macOS, Segoe UI on Windows) — note that explicitly.

## Step 4 — Write the `audit.md` summary

A one-page markdown summary with:

```markdown
# Audit · <site name>

**URL** · <url>
**Captured** · YYYY-MM-DD HH:MM UTC
**Viewport** · desktop 1440 × N · mobile 390 × N

## Visual snapshot

![Above the fold](screenshot-above-fold.png)

## Palette

| Swatch | Hex | Role | Frequency |
|--------|-----|------|-----------|
| ████ | #08080B | background-dark | 38.2% |
| ████ | #FF6B35 | accent (brand) | 4.1% |
| ████ | #F4F4F8 | text | 18.7% |
| ████ | … | … | … |

## Typography

- **Display** · Inter Tight, weights 500-700 (Google Fonts)
- **Body** · Inter, weights 400 (Google Fonts)
- **Mono** · — (none detected)

## Structure

(Sketch the high-level layout: hero / features / pricing / footer.
3-5 bullets max.)

## What works

- (One sentence per finding.)

## What doesn't

- (One sentence per finding. Be specific. "Hero CTA is invisible because
  it sits on the same color as the background section below it.")

## Constraints to keep in a redesign

- (Trademark elements, fixed integrations, regulatory copy, anything
  the user cannot change.)
```

## Rate limit & ethics

- **One request per second per host** by default. Don't hammer.
- **Respect `robots.txt`** — read it before crawling beyond the
  homepage. For a single-page audit, that's usually a non-issue.
- **Don't bypass anti-bot** measures. If Cloudflare / datadome / Imperva
  blocks the headless browser, surface the block and ask the user how to
  proceed (manual capture, authenticated session, etc.).
- **Don't republish** captured screenshots or HTML as the user's own
  work — these are competitor / reference assets, not licensed content.

## Output discipline

- Save everything to `~/Documents/split-audits/<slug>/` with the slug as
  the kebab-case domain (e.g. `linear-app` for `linear.app`).
- Report the absolute path and the captured timestamp at the end.
- Don't auto-open anything — audits are reading material, not visuals
  to present. Offer to `open audit.md` and let the user say yes.
