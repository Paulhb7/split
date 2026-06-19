---
name: nasa-eyes
description: Embed NASA's own live 3D experiences — Eyes on the Solar System, Exoplanets, the Earth and Asteroids — deep-linked to the exact body, spacecraft, event or dataset, then wrap the embed with real data and the key papers. Use when Ride's answer should be *flown through*, not just charted — "show me the Pluto flyby", "fly me to TRAPPIST-1", "what's passing Earth this week", "the state of the planet". The cosmos as a window you can pilot.
---

# NASA Eyes — fly NASA's universe, in the page

Ride's **embed** layer. Where `sky-viz` *builds* a bespoke visualization, this skill
**mounts NASA's own real-time 3D apps** in an iframe — the same engines mission
control uses — deep-linked to the right place and time, then frames them with the
data and the literature. Ride doesn't render the cosmos here; Ride **pilots NASA's**
and narrates it.

> Division of labour: `sky-viz` = *you* draw it (Aladin / Three.js / D3).
> `nasa-eyes` = you embed *NASA's* and point it. Reach for Eyes when the real thing
> — a spacecraft trajectory, a planet's moons, a close approach — beats anything
> you'd rebuild.

## The catalogue (all embeddable — framing headers verified clear, 2026-06)

| App | URL base | Shows |
|---|---|---|
| **Solar System** | `eyes.nasa.gov/apps/solar-system/` | Planets, moons, comets + **150+ missions, 1950→2050**, real ephemerides |
| **Exoplanets** | `eyes.nasa.gov/apps/exo/` | 5,500+ confirmed systems in 3D |
| **The Earth** | `eyes.nasa.gov/apps/earth/` | Vital signs (CO₂, ozone, sea level), satellites, weather events |
| **Asteroids** | `eyes.nasa.gov/apps/asteroids/` | 30,000+ near-Earth objects, close approaches |
| *bonus* | `…/dsn/dsn.html` · `…/apps/mrn/` · `…/apps/mars2020/` | DSN Now (live comms), Mars Relay, Perseverance EDL |

## Deep-linking — point it precisely (the whole magic)

The route lives in the URL **hash**; append it to the app base.

Params go *inside* the hash, after the route (`#/<route>?<params>`). Verified
against production use (Paul's `omnicat`).

**Solar System** — `#/<id>`. The `id` vocabulary:
- *planets*: `mercury venus earth mars jupiter saturn uranus neptune pluto sun`
- *moons*: `earths_moon titan europa ganymede callisto io enceladus triton phobos deimos charon`
- *spacecraft* (`sc_` prefix): `sc_jwst sc_juno sc_voyager_1 sc_voyager_2 sc_new_horizons sc_parker_solar_probe sc_europa_clipper sc_cassini sc_lucy sc_osiris_rex sc_iss sc_hubble`
- *scripted scene* — spacecraft + event + time + rate (drops you at the instant):
  `#/sc_cassini/events/grand_finale?rate=60&time=2017-04-26T08:15:00.000+00:00`

**Asteroids** — `#/home` (the watch view), or a named object.
**The Earth** — `#/events/<year>/<category>/<slug>`; the root opens the vital-signs globe.
**Exoplanets** — **there is no per-system deep-link.** Confirmed against NASA's docs
*and* Paul's omnicat, which routes *every* exoplanet query (TRAPPIST, Kepler, Proxima…)
to the one default view `#/?embed=true`. So embed the default, **pin the system's
specifics in the dossier** (Exoplanet Archive), and let the boss fly in / click the
star. Don't fake a hash that doesn't exist.

> Routes are NASA's and can change. Verify before shipping; never ship a dead hash.

## Routing — the question IS the navigation
The boss never picks a view; their question routes it. On any *"show me / fly me /
what's … / tell me about …"*:
1. **Domain → app.** planet/star/system → `exo` · spacecraft/planet/moon/comet/
   mission → `solar-system` · near-Earth object/close approach → `asteroids` ·
   climate/CO₂/sea level/storm → `earth`.
2. **Resolve the target** from the phrase (TRAPPIST-1, Cassini, Saturn, Apophis…).
   Build the deep-link if its grammar is verified; else embed the app root +
   `?embed=true` and **pin the specifics in the dossier**.
3. **Fetch the dossier** — the domain's data source (Exoplanet Archive / Horizons /
   SSD CAD / nasa-api) + the papers (`paper-search`). This is what makes the view
   *about* the question, even when the embed can't auto-zoom yet.
4. **Fill the template** — copy `references/eyes-viewer.html`, rewrite `EYES_DATA`,
   save `index.html`, deploy/render.

> "Parle-moi de TRAPPIST-1" → app `exo`, target TRAPPIST-1, the TAP query for its 7
> planets + the Gillon papers, template filled. The embed is a **live NASA app** —
> even at galaxy scale the boss can fly in and click any of the 6,298 systems by hand.

## The embed (one at a time — it's WebGL)
```html
<iframe src="https://eyes.nasa.gov/apps/solar-system/#/sc_cassini/events/grand_finale?time=2017-04-26T08:15:00Z"
        title="NASA Eyes — Cassini Grand Finale"
        style="width:100%;height:72vh;border:0;border-radius:14px"
        loading="lazy" allow="fullscreen" allowfullscreen
        referrerpolicy="no-referrer-when-downgrade"></iframe>
<!-- always ship the escape hatch in case framing is blocked downstream: -->
<a href="…same url…" target="_blank" rel="noopener">Ouvrir dans NASA Eyes ↗</a>
```
**Clean embed — verified params (from omnicat).** Hide every NASA Eyes chrome
element by appending this query *inside the hash*, after the route:
```
&featured=false&detailPanel=false&logo=false&search=false&shareButton=false&menu=false&collapseSettingsOptions=true&hideFullScreenToggle=true
```
e.g. `…/apps/solar-system/#/sc_cassini?featured=false&menu=false&…`. For exoplanets,
the bare `#/?embed=true` already opens panel-free.

Eyes is heavy 3D. **One live embed per page**, lazy-loaded. Never stack four globes.

## Wrap it with data + papers — this is "Ride n'affiche que les données"
The embed is the *window*; Ride is the *brain beside it*. Pair every Eyes view with
a dossier rail — real figures + the key literature:

| Eyes app | Facts panel — data source | via |
|---|---|---|
| Exoplanets | **Exoplanet Archive (TAP/ADQL)** — radius, period, host, disc. year/method | `nasa-api` |
| Solar System | **JPL Horizons** ephemerides (`ssd.jpl.nasa.gov/api/horizons.api`); mission facts | `astro-data` / curl |
| Asteroids | **JPL SSD CAD** close approaches (`ssd-api.jpl.nasa.gov/cad.api`, no key) + SBDB physical params | `astro-data` / curl |
| The Earth | vital-signs values, EPIC full-disc, DONKI space weather | `nasa-api` |
| *all* | **the papers** — arXiv / ADS: discovery + key results | `paper-search` |

Exoplanet Archive example (no key):
```bash
curl -s --data-urlencode "query=select pl_name,hostname,disc_year,disc_facility,pl_rade,pl_bmasse,pl_orbper,st_spectype from ps where hostname='TRAPPIST-1' and default_flag=1" \
  --data-urlencode "format=json" \
  "https://exoplanetarchive.ipac.caltech.edu/TAP/sync" | jq '.'
```

## Compose the page
**A ready reference template lives in [`references/eyes-viewer.html`](references/eyes-viewer.html)** —
copy it and rewrite *only* the `EYES_DATA` block (app + deep-link, facts, papers).
The UI is fixed (hero iframe + dossier rail + starfield); you inject data. Don't
re-author the layout each time — that's how it stays consistent.

Aesthetic: **defer to `sky-viz`'s doctrine** (true black-to-indigo void, one
scientific accent, mono for figures, glow-not-borders). The Eyes-viewer layout:
- **Hero** — the deep-linked iframe, full-bleed.
- **Exec** — open the dossier with a 2–3 sentence synthesis: *what you're looking at*
  + the *single key takeaway* (per `_discipline`'s artifact exec-summary rule).
- **Dossier rail** — 4–8 key facts (mono, tabular, each cited) + the papers, each with
  a **one-line "what it found / why it matters"** (Indie's doctrine). Those summaries
  come from *actually reading* the source (`paper-search` / `literature-review`) — a
  title without a takeaway is half a citation; never invent the finding.
- **Caption** — what you're looking at, and the instant/time if the scene is scripted.
- **Attribution** — `Visualisation : NASA Eyes (eyes.nasa.gov)`. It's NASA's — name it.

## Build / output discipline
1. **Single self-contained file** (`index.html`) — iframe + inlined dossier; bake the
   fetched data + papers in as JSON so it renders instantly and offline.
2. **Verify the embed renders** (drop it in, watch it load) **and** the deep-link
   resolves, before shipping. Ship the escape-hatch link regardless.
3. **Cite every figure** (source + epoch) in mono; never strip provenance.
4. **`web-deploy`** it → public URL in `viewer-url.txt`. Hand back the URL first, then
   one line: what's live in the embed + what the dossier proves.

## Signature moves
- *"Show me the Pluto flyby"* → Solar System, New Horizons scripted to 2015-07-14 +
  the encounter facts + the discovery papers.
- *"Fly me to TRAPPIST-1"* → Exoplanets (verified hash or root) + the Archive's seven
  planets in a table + the Nature 2017 papers.
- *"What's passing Earth this week?"* → Asteroids `#/watch` + the JPL CAD close-approach
  table (miss distance in lunar distances, size, velocity), hazard framed honestly.
- *"The state of the planet"* → The Earth vital signs + the CO₂ / sea-level numbers +
  recent climate literature.
