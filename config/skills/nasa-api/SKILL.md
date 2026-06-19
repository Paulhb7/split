---
name: nasa-api
description: Pull live media and events from NASA's open APIs from the shell — Astronomy Picture of the Day (APOD), Mars rover photos (Curiosity/Perseverance), near-Earth asteroids (NeoWs), space weather (DONKI — solar flares, CMEs, geomagnetic storms / aurora), full-disc Earth photos (EPIC), the NASA image & video library, and the Exoplanet Archive. One key covers most endpoints; DEMO_KEY works for trying. Use when the boss wants what's happening in space today — the picture of the day, a fresh Mars shot, what's whizzing past Earth, aurora odds, or a searchable space image.
---

# NASA Open APIs

Live space media + events over plain HTTP. **The live half of Ride** — the
"what's happening today" layer (the "what's up from here, now" math lives in
`astropy`; archive/catalog queries live in `astro-data`).

## Key

Most endpoints on `api.nasa.gov` take one key. Resolve it as:

```bash
KEY="${NASA_API_KEY:-DEMO_KEY}"
```

`DEMO_KEY` works immediately but is throttled (~30 req/hr, 50/day). For real
use, the boss gets a free key at https://api.nasa.gov (instant, 1000 req/hr)
and exports `NASA_API_KEY`. Never print the key in chat.

CORS note: `api.nasa.gov` responses are browser-fetchable, so a deployed
`sky-viz` page can re-query these live on reload. The image/library + exoplanet
endpoints below need no key at all.

## The endpoints (ranked by punch)

### APOD — Astronomy Picture of the Day
The daily opener. Image (or video) + a written explanation.
```bash
curl -s "https://api.nasa.gov/planetary/apod?api_key=$KEY" \
  | jq '{date, title, explanation, url, hdurl, media_type, copyright}'
# a specific day, or a range:
curl -s "https://api.nasa.gov/planetary/apod?api_key=$KEY&date=2026-06-01"
curl -s "https://api.nasa.gov/planetary/apod?api_key=$KEY&start_date=2026-06-01&end_date=2026-06-07"
```
`media_type` is `image` or `video` (embed the `url` for video). Download
`hdurl` for decks. Cite as `NASA APOD <date>` + the `copyright` when present.

### Mars Rover Photos
Raw frames from active + past rovers, by Martian sol or Earth date, by camera.
```bash
curl -s "https://api.nasa.gov/mars-photos/api/v1/rovers/perseverance/latest_photos?api_key=$KEY" \
  | jq '.latest_photos[] | {id, sol, earth_date, camera: .camera.full_name, img_src}'
# by sol + camera (cameras: NAVCAM_LEFT, MAST_Z, FRONT_HAZCAM_LEFT_A, …):
curl -s "https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos?api_key=$KEY&sol=4000&camera=navcam"
```
Rovers: `perseverance`, `curiosity` (active), `opportunity`, `spirit` (archive).
Cite `Mars <rover> Sol <n> <camera>`.

### NeoWs — Near-Earth Objects
Asteroids passing near Earth in a date window: size, miss distance, velocity,
hazard flag.
```bash
curl -s "https://api.nasa.gov/neo/rest/v1/feed?start_date=2026-06-15&end_date=2026-06-22&api_key=$KEY" \
  | jq '.near_earth_objects | to_entries[] | .value[] | {
      name, hazardous: .is_potentially_hazardous_asteroid,
      dia_m: .estimated_diameter.meters.estimated_diameter_max,
      miss_km: .close_approach_data[0].miss_distance.kilometers,
      v_kmh: .close_approach_data[0].relative_velocity.kilometers_per_hour }'
```
Window max 7 days. Don't fear-monger `hazardous` — it's an orbit-class label,
not "impact imminent". Say so.

### DONKI — Space Weather (aurora odds)
Solar flares (FLR), coronal mass ejections (CME), geomagnetic storms (GST).
```bash
curl -s "https://api.nasa.gov/DONKI/GST?startDate=2026-06-01&endDate=2026-06-15&api_key=$KEY" | jq '.'
curl -s "https://api.nasa.gov/DONKI/FLR?startDate=2026-06-01&endDate=2026-06-15&api_key=$KEY" | jq '.[] | {classType, beginTime, sourceLocation}'
```
A recent strong CME (`GST` with high `kpIndex`) is the real aurora signal. Map
Kp to latitude reach; don't promise aurora from a flare alone.

### EPIC — full-disc Earth
Whole-Earth photos from DSCOVR at the L1 point.
```bash
curl -s "https://api.nasa.gov/EPIC/api/natural?api_key=$KEY" | jq '.[0] | {identifier, date, caption, image}'
# image URL pattern (date split from the `date` field YYYY-MM-DD):
# https://api.nasa.gov/EPIC/archive/natural/2026/06/14/png/<image>.png?api_key=$KEY
```

### NASA Image & Video Library — no key
Searchable media archive; the fallback when no live mission has the shot.
```bash
curl -s "https://images-api.nasa.gov/search?q=jupiter+aurora&media_type=image" \
  | jq '.collection.items[0:5][] | {title: .data[0].title, href: .links[0].href}'
```

### Exoplanet Archive (TAP) — no key
Confirmed exoplanets, queryable with ADQL.
```bash
curl -s --data-urlencode "query=select pl_name,hostname,disc_year,pl_rade,pl_orbper from ps where default_flag=1 order by disc_year desc" \
  --data-urlencode "format=json" \
  "https://exoplanetarchive.ipac.caltech.edu/TAP/sync" | jq '.[0:10]'
```

## Deprecated / avoid
- **InSight Mars Weather** (`/insight_weather/`) — the lander ended in 2022; the
  endpoint returns no fresh data. Don't use it.
- **ISS position / passes** — third-party endpoints (open-notify) are flaky.
  Compute passes properly via `astro-data` (skyfield + Celestrak TLEs) instead.

## Output discipline
- **Always cite source + timestamp**: `NASA APOD 2026-06-15`, `Mars Perseverance
  Sol 1180 NAVCAM`. The cosmos doesn't do hearsay.
- **Download media locally** for any deck/page that must survive offline
  (`~/Desktop/ride-<topic>-<YYYYMMDD>/figures/`); hotlink only for live
  re-fetching pages.
- Hand the structured JSON to `sky-viz` to render, not raw dumps in chat.
