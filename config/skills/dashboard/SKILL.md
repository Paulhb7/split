---
name: dashboard
description: Build a self-contained interactive HTML dashboard from any dataset or live data — chrome bar with brand mark, KPI tiles + sparklines, filter bar (for EDA) or macro tape (for monitors), chart grid, data preview table, footer with the coral "Made with Split" watermark. The structural skeleton + the coral watermark + the chart vocabulary are **prescriptive** (every Split dashboard has the same shape and signature). The palette / typography / mood comes **dynamically** from `ui-ux-pro-max` based on the brief — so a fintech monitor looks fintech, a healthcare EDA looks healthcare, a "Bloomberg-style" dashboard reads terminal-genre. Use whenever the user wants an interactive one-page view.
---

# Dashboard

One-page interactive HTML dashboards. **Same skeleton + same coral
watermark for every Split dashboard**; the visual layer is dynamic.

Sibling of `frontend-slides`. This skill is for **single-page, glance**
deliverables — not a deck, not a written report.

## When to use

| Deliverable                                              | Skill                  |
| -------------------------------------------------------- | ---------------------- |
| Static report with prose + figures                       | `docx`                 |
| Slide deck (multi-page, presented)                       | `frontend-slides`      |
| **Interactive one-page dashboard**                       | **`dashboard` (this)** |

## The Split signature — non-negotiable

Every Split dashboard, regardless of palette, ships with:

1. **The "Made with SPLIT" watermark** at bottom-right of every page —
   an 8×8 px coral (`#E0566B`) square with a 12-14px coral glow + Geist
   Mono uppercase wordmark. This is the brand anchor; do **not**
   recolor it to match the dashboard's dynamic palette. Coral always.
2. **The structural skeleton** — chrome bar (top), KPI strip, optional
   filter bar (EDA) or macro tape (monitors), chart grid, optional data
   preview table, footer with sources + as-of + watermark.
3. **The chart vocabulary** — the right chart for the column types
   (see Step 4).
4. **The numeric discipline** — `font-variant-numeric: tabular-nums` on
   every number, ISO currency codes (EUR not €), sources cited per
   series, as-of timestamp visible.

The **palette, the type stack, the density philosophy, the mood** —
all dynamic, derived from `ui-ux-pro-max` per request.

## Step 0 — Get the visual tokens from ui-ux-pro-max

Before writing any HTML, query `ui-ux-pro-max` with the brief.

**The brief** comes from:
- The user's explicit stylistic direction ("Bloomberg-style", "fintech
  professional", "healthcare clean", "editorial dark", "minimal SaaS").
- The dataset / use-case if the user didn't specify:
  - Finance / portfolio / market monitor → `"terminal financial monitor"`
  - Generic CSV / Excel EDA → `"data analytics professional"`
  - Otherwise: ask once before defaulting.

Run at minimum:

```bash
python3 ../ui-ux-pro-max/scripts/search.py "<brief>" --domain color -n 3
python3 ../ui-ux-pro-max/scripts/search.py "<brief>" --domain typography -n 2
python3 ../ui-ux-pro-max/scripts/search.py "<brief>" --domain style -n 2
```

Pick the most appropriate color palette (read 2-3 results, not just
the first), the typography pair, and the style mood. Apply them in
Step 5. **Cite the choice in the footer**:

```
Design: UI Pro Max palette "Fintech/Crypto" · Inter + JetBrains Mono · style "minimalism dark"
```

State your picks to the user before building so they can override.

## Step 1 — Read & profile the data

```python
import pandas as pd, pathlib
path = pathlib.Path('/path/to/data')
if path.suffix == '.csv':       df = pd.read_csv(path)
elif path.suffix == '.xlsx':    df = pd.read_excel(path)
elif path.suffix == '.json':    df = pd.read_json(path)
elif path.suffix == '.parquet': df = pd.read_parquet(path)
# profile: shape, dtypes, nulls, uniques, preview
```

Surface data-quality issues (mostly-null columns, mixed types, parsing
mishaps) before building.

For financial monitors the input is usually a live pull via the
`market-data` skill, not a file. Profile the resulting DataFrame the
same way.

## Step 2 — Pre-aggregate if needed

| Rows × cols       | Action                                       |
| ----------------- | -------------------------------------------- |
| < 10k × < 40      | Embed raw — inline JSON is fine              |
| 10k – 200k        | Stratified sample to 10k OR bin/group        |
| > 200k            | Mandatory aggregation — never embed raw      |

Say what you aggregated and why.

## Step 3 — Pick the sections you need

| Section            | Purpose                                                   | Typical for                |
| ------------------ | --------------------------------------------------------- | -------------------------- |
| **Chrome bar**     | Brand mark + module / breadcrumb + clock + status pill    | Always                     |
| **KPI strip**      | 4-5 tiles · big number + delta + sparkline                | Always                     |
| **Filter bar**     | Dropdowns / range sliders / date-range pickers            | EDA dashboards             |
| **Main grid**      | 2-6 Plotly charts in a split 8/4 or 12-col grid           | Always                     |
| **Data table**     | Sortable, paginated row preview                           | EDA + portfolio monitors   |
| **Macro tape**     | Single-row ticker strip at the bottom                     | Financial monitors         |
| **Footer**         | Sources + as-of + **the coral watermark**                 | Always (watermark non-negotiable) |

Don't ship empty sections.

## Step 4 — Chart vocabulary

| Column types                            | Chart                              |
| --------------------------------------- | ---------------------------------- |
| 1 numeric                               | Histogram                          |
| 1 categorical                           | Bar of value counts                |
| 1 datetime + 1 numeric                  | Line / area time series            |
| 2 numeric                               | Scatter (regression line if r>0.3) |
| 1 numeric + 1 categorical (low uniqs)   | Box plot per category              |
| 1 numeric + 1 categorical (high uniqs)  | Strip or violin                    |
| 2 categorical                           | Heatmap of crosstab counts         |
| 2 numeric + 1 categorical               | Faceted or colored scatter         |
| Geographic (lat/lon)                    | `scattermapbox`                    |

**4-6 charts max** on a dashboard. A grid with 10+ fails the glance
test. Curate.

## Step 5 — Apply the tokens

Build the Plotly theme from the ui-ux-pro-max color palette:

```js
// Tokens come from Step 0 — sourced from ui-ux-pro-max
const C = { /* hex tokens from the chosen palette */
  bg:        '<background>',
  panel:     '<card>',           // derived from palette's card token
  ink:       '<foreground>',
  ink2:      '<muted-foreground>',
  line:      '<border>',
  primary:   '<primary>',
  accent2:   '<accent>',
  up:        '<positive>',       // dashboard semantic; use palette green if present
  down:      '<negative>',       // ditto red
};

const theme = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor:  'rgba(0,0,0,0)',
  font:    { family: '<typography body from ui-ux-pro-max>', color: C.ink, size: 12 },
  colorway:[C.primary, C.up, C.down, C.accent2, '#FFB800', '#C77DFF'],
  xaxis:   { gridcolor: C.line, zerolinecolor: C.line, tickcolor: C.ink2 },
  yaxis:   { gridcolor: C.line, zerolinecolor: C.line, tickcolor: C.ink2 },
  margin:  { l: 48, r: 16, t: 24, b: 40 },
  showlegend: true,
  legend:  { font: { size: 10, color: C.ink2 }, bgcolor: 'rgba(0,0,0,0)' },
  hoverlabel: { bgcolor: C.panel, bordercolor: C.primary,
                font: { family: '<typography mono from ui-ux-pro-max>',
                        color: C.ink, size: 11 } },
};

Plotly.newPlot('chart-1', data, { ...theme, title: {…} },
               { displaylogo: false, responsive: true });
```

CSS root tokens follow the same pattern. **Never the Plotly rainbow.**
Primary first, then semantic up/down, then the accents.

## Step 6 — The watermark — non-negotiable

```html
<div class="made-with-split">
  <span class="mark"></span>
  <span class="label">Made with <b>SPLIT</b></span>
</div>
```

```css
.made-with-split{
  position:absolute; bottom:22px; right:24px; z-index:5; pointer-events:none;
  display:flex; align-items:center; gap:10px;
  font-family:'Geist Mono', ui-monospace, monospace;
  font-size:13px; letter-spacing:.20em; text-transform:uppercase;
  color: var(--ink-2);
}
.made-with-split .mark{
  width:8px; height:8px; background:#E0566B; flex:none;
  box-shadow:0 0 14px color-mix(in srgb, #E0566B 55%, transparent);
}
.made-with-split b{ color: var(--ink); font-weight:500; margin-left:6px; letter-spacing:.22em }
```

The coral `#E0566B` is **always** coral, even if the dashboard's
dynamic palette is green or blue. The watermark is the brand anchor;
recoloring it defeats the purpose.

Geist Mono for the label. Always.

## Step 7 — Filter wiring (EDA dashboards only)

```js
const DATA = /* the embedded JSON dataset */;
const filters = { /* { column: { kind, value } } */ };

function applyFilters() {
  const rows = DATA.filter(row => Object.entries(filters).every(([col, f]) => {
    if (f.kind === 'in')    return f.value.includes(row[col]);
    if (f.kind === 'range') return row[col] >= f.value[0] && row[col] <= f.value[1];
    if (f.kind === 'date')  return new Date(row[col]) >= f.value[0]
                                && new Date(row[col]) <= f.value[1];
    return true;
  }));
  Plotly.react('chart-1', computeTrace1(rows), theme);
  updateKPIs(rows); updateTable(rows);
}
```

`Plotly.react()` diffs and animates; filtering 10k rows redraws in
<100ms.

## Step 8 — Sparklines (inline SVG, no library)

```js
function sparkline(values, color){
  const w=120, h=28, n=values.length;
  const min=Math.min(...values), max=Math.max(...values), rng=max-min||1;
  const pts = values.map((v,i) => {
    const x = (i/(n-1))*w;
    const y = h - ((v-min)/rng) * h * 0.85 - h*0.075;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
            <polyline points="${pts}" fill="none" stroke="${color}"
              stroke-width="1.5" stroke-linecap="round"/></svg>`;
}
```

Color from `C.primary` or the relevant semantic token.

## Step 9 — Live clock (financial monitors only)

```js
const p2 = n => String(n).padStart(2,'0');
function tick(){
  const d = new Date();
  document.getElementById('clock').textContent =
    `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
}
setInterval(tick, 1000); tick();
```

## Animation

- **Live clock** (monitors): real, every second.
- **Value-change pulse** (monitors): when a value updates, briefly flash
  its container in semantic color over 280 ms.
- **Entrance** (EDA): subtle fade-up on panels at load with
  `cubic-bezier(.16, 1, .3, 1)`.
- `prefers-reduced-motion: reduce` — kill pulse, keep clock.

Dashboards are always-on reading material; lean toward fewer effects
than slides.

## Save & report

| Use-case                                  | Default path                                                       |
| ----------------------------------------- | ------------------------------------------------------------------ |
| EDA from a dataset                        | `~/Documents/split-analyses/<dataset-slug>/<dataset>-dashboard.html` |
| Financial monitor / portfolio screen      | `~/Documents/split-finance/<topic>/<topic>-dashboard.html`         |

Report: the absolute path, the **brief used for ui-ux-pro-max**, which
palette/typography/style entries were picked, the chart count, any
aggregation applied. Offer to `open` — only run if confirmed. Never
overwrite a previous dashboard — append `-vN` or a date suffix.

## Anti-patterns

- **Skip the watermark.** Never. Even if the user says "remove all
  branding" — keep the watermark; it's the toolmark, not user branding.
- **Recolor the watermark.** Coral always. Even with a dynamic palette.
- **Plotly default colors.** The rainbow is the AI-slop tell. Use the
  derived `theme.colorway` from Step 5.
- **Too many charts.** 10+ = nobody reads any. Curate to 4-6.
- **Generic / lazy ui-ux-pro-max queries.** Querying `"dashboard"` and
  taking result #1 is lazy — the agent must give a topic-specific brief
  ("fintech professional", "healthcare clean", "Bloomberg-style", etc.).
- **Hidden assumptions.** Always show as-of timestamp + current filter
  state in the chrome.
- **Live streaming.** This skill ships one-shot HTML. For real-time
  refresh, escalate to Streamlit or a server-backed dashboard.
