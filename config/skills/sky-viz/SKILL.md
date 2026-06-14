---
name: sky-viz
description: Build gorgeous, interactive space visualizations as single-file HTML — sky-tonight charts, an embedded zoomable sky atlas (Aladin Lite), 3D orbit / solar-system / Earth-globe scenes (Three.js), ISS pass timelines, asteroid (NEO) plots, exoplanet scatter, and FITS-image displays — with real data baked in and live re-fetch where the API allows. Dark, observatory-grade aesthetic, deploy-ready via web-deploy. Use whenever Ride's answer should be *seen*, not just told: "show me", "map", "chart", "tracker", "tonight's sky as a page".
---

# Sky-Viz — make the cosmos legible *and* beautiful

Ride's rendering layer. The data comes from `nasa-api` (live media/events),
`astropy` (sky math from a location), and `astro-data` (archives + passes). This
skill turns those structured results into **one self-contained, deployable
`index.html`** that looks like it came from an observatory, not a slide template.

> Default output is a **live, deployed page**, not a static deck — most of Ride's
> answers (sky tonight, ISS passes, mission feeds) go stale by morning. Bake the
> data in *and* add a refresh path where the API is CORS-friendly (`api.nasa.gov`
> is). Then `web-deploy` it and hand back the URL.

## The aesthetic — non-negotiable

This is the difference between "a chart" and "a thing the boss screenshots". Hold
the line:

- **True black-to-indigo void**, not slate gray. `#05060a` → `#0b1026`. Light
  comes from the data (stars, orbits, glows), never from panels.
- **One scientific accent** per page (cyan `#5ad1e6`, amber `#ffb454`, or magenta
  `#e85ac4`) used for the live/active element. Everything else is starlight white
  at low opacity.
- **Real type.** A grotesk for labels (Inter / Space Grotesk), a mono for data
  (JetBrains Mono / IBM Plex Mono) for coordinates, magnitudes, timestamps.
  Tabular figures for anything that updates.
- **Glow, not borders.** `box-shadow` / radial gradients for depth; avoid boxed
  cards with hard 1px lines. Let elements float on the void.
- **Motion with restraint.** A slow parallax starfield, an orbiting body, a
  ticking clock — one ambient motion, not five. 60fps or don't animate it.
- **No stock filler, no emoji planets, no generic gradients.** If it looks like a
  default Bootstrap/AI dashboard, start over.

See the `frontend-slides` / design doctrine for the taste floor; this skill is its
astronomy dialect.

## The toolkit (all via CDN — single file stays single file)

| Need | Tool | Why |
|---|---|---|
| Zoomable real sky atlas | **Aladin Lite v3** (`aladin.cds.unistra.fr`) | Real DSS/2MASS/all-sky surveys, pan/zoom, overlay your own markers + catalogs. The killer embed. |
| 3D orbits / solar system / Earth globe / starfield | **Three.js** (r1xx, ESM via CDN) | Orbits, a rotating textured Earth with the ISS ground track, a flythrough. |
| Data charts (NEO scatter, exoplanet plots, light curves, pass timelines) | **D3** or **Plotly** | D3 for bespoke/branded, Plotly for fast scientific scatter/3D. |
| FITS in the browser | **JS9** or a pre-rendered PNG from `astropy` | JS9 for interactive (pan/zoom/stretch); else render PNG in `astropy` and place it. |

### Aladin Lite — the signature embed
```html
<div id="aladin" style="width:100%;height:70vh"></div>
<script src="https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js"></script>
<script>
  let A; A = A || window.A; A.init.then(() => {
    const aladin = A.aladin('#aladin', {survey:'P/DSS2/color', fov:60, target:'M31',
      cooFrame:'ICRS', showReticle:true, showZoomControl:true});
    // overlay your own data (planets tonight, a NEO, a target list):
    const cat = A.catalog({name:'Tonight', sourceSize:14, color:'#5ad1e6'});
    aladin.addCatalog(cat);
    cat.addSources([A.source(279.23, 38.78, {name:'Vega'})]);
  });
</script>
```

### Three.js orbit/globe — load as ESM
```html
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169/build/three.module.js"}}</script>
<script type="module">
  import * as THREE from 'three';
  // scene + a slow-rotating sphere (Earth/planet) + an orbiting marker (ISS/moon).
  // Texture from a NASA Blue Marble JPG (download it locally for offline pages).
</script>
```

## Patterns (pick by the ask)

- **Sky Tonight** — Aladin centered on the meridian for the boss's lat/lon, with
  planets/Moon as overlaid markers (alt-az from `astropy`), a twilight band, and a
  live clock. The hero page.
- **ISS / Satellite Tracker** — Three.js globe + ground track, plus a D3 timeline
  of upcoming passes (start / peak altitude / end, visible vs daylight) from
  `astro-data`.
- **NEO Watch** — D3 scatter: miss-distance (× lunar distance) vs size, dot = one
  asteroid, color = hazard class. From `nasa-api` NeoWs.
- **Mission Feed** — APOD / Mars-rover gallery with captions + source + sol/date,
  re-fetching `api.nasa.gov` on reload.
- **Exoplanet Map** — Plotly scatter (radius vs orbital period, color = discovery
  year) from the Exoplanet Archive.
- **FITS Viewer** — JS9 for an interactive JWST/Hubble frame, or an `astropy`
  ZScale/Asinh PNG placed full-bleed.

## Build discipline
1. **Single file.** Inline CSS/JS; CDN libs are fine. Download any texture/image
   the page must show offline into the artifact folder and reference locally.
2. **Bake data in, then re-fetch.** Embed the snapshot JSON so the page renders
   instantly and offline; add a live re-fetch only against CORS-friendly APIs.
3. **Cite on the page.** Every figure carries source + timestamp in the mono font
   (`NASA APOD 2026-06-15`, `TLE epoch …`, `Gaia DR3`).
4. **Mobile-legible.** It'll be opened on a phone under the actual sky. Test one
   narrow breakpoint; keep the atlas/globe usable with touch.
5. **Deploy.** `web-deploy` → put the public URL in `viewer-url.txt` and report it.
   A sky page that isn't on the web can't be reopened on Friday.

## Output discipline
Save to Ride's folder (`~/Desktop/ride-<topic>-<YYYYMMDD>/index.html` + `figures/`
+ `viewer-url.txt`). Hand back: the public URL first, then one line on what's
interactive and what refreshes live.
