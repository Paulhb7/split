---
name: astro-data
description: Query astronomy archives and track satellites from the shell, using astroquery and skyfield. Pull images/observations from MAST (JWST, Hubble, TESS), look up objects in SIMBAD / VizieR / Gaia, get precise solar-system ephemerides from JPL Horizons, browse ESA's ESASky, and compute ISS / satellite pass predictions from a lat/lon using live TLEs. Use for "find JWST images of the Pillars of Creation", "what's the parallax of Proxima", "Gaia stars near this coordinate", "exact position of comet X", or "when does the ISS pass over me tonight".
---

# Astro-Data — archives & satellites

The data-gateway layer of Ride: **astroquery** for archives/catalogs, **skyfield**
for satellite passes. (Sky math from a location → `astropy`; live NASA media →
`nasa-api`; rendering → `sky-viz`.)

## Bootstrap

```bash
python3 -c "import astroquery, skyfield" 2>/dev/null \
  || python3 -m pip install --quiet astroquery skyfield
```
Most queries hit external archives (network required). Cache results under
`~/.cache/split-astro/` — catalogs and past observations don't change.

## astroquery — archives & catalogs

**MAST — JWST / Hubble / TESS imagery & observations:**
```python
from astroquery.mast import Observations
obs = Observations.query_criteria(
    objectname="M16", obs_collection="JWST", dataproduct_type="image")
print(obs["instrument_name", "filters", "t_obs_release", "dataURL"][:10])
# product list for one observation → downloadable FITS/JPG
```

**SIMBAD — one object, all the basics (coords, type, magnitudes, distance):**
```python
from astroquery.simbad import Simbad
s = Simbad()
s.add_votable_fields("distance", "flux(V)", "otype")
print(s.query_object("Proxima Centauri"))
```

**VizieR — published catalogs / tables:**
```python
from astroquery.vizier import Vizier
cat = Vizier.query_object("Pleiades", catalog="I/239/hip_main")
```

**Gaia — stars by cone search (ADQL):**
```python
from astroquery.gaia import Gaia
job = Gaia.launch_job(
    "SELECT TOP 50 source_id, ra, dec, phot_g_mean_mag, parallax "
    "FROM gaiadr3.gaia_source "
    "WHERE 1=CONTAINS(POINT(ra,dec), CIRCLE(56.75,24.12,0.2)) "
    "ORDER BY phot_g_mean_mag")
print(job.get_results())
```

**JPL Horizons — precise solar-system ephemerides** (planets, asteroids, comets,
spacecraft), arc-second / sub-arc-second from an observer:
```python
from astroquery.jplhorizons import Horizons
# id_type 'smallbody' for comets/asteroids; location '500' = geocentre, or a site code / lat,lon
obj = Horizons(id="499", location="500", epochs={"start":"2026-06-15","stop":"2026-06-16","step":"1h"})
eph = obj.ephemerides()              # RA/DEC, alt/az, magnitude, range, …
print(eph["datetime_str", "RA", "DEC", "V", "delta"])
```

**ESASky (ESA) — pan-archive image cutouts & catalogs.** This is how Ride covers
ESA — there is no clean ESA REST API; ESASky *is* the access point, via astroquery:
```python
from astroquery.esasky import ESASky
maps = ESASky.get_images(position="M51", radius="10 arcmin", missions=["HST", "Herschel"])
```

## skyfield — ISS / satellite passes

The robust way to answer "when does the ISS pass over me" — no flaky third-party
endpoint. Pull live TLEs from Celestrak, propagate, find passes above the horizon.

```python
from skyfield.api import load, wgs84, EarthSatellite
import datetime as dt

ts = load.timescale()
sats = load.tle_file("https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle")  # 25544 = ISS
iss = sats[0]
here = wgs84.latlon(48.8566, 2.3522)                       # observer lat/lon

t0 = ts.now()
t1 = ts.utc((dt.datetime.utcnow() + dt.timedelta(days=2)))
times, events = iss.find_events(here, t0, t1, altitude_degrees=10.0)
# events: 0=rise, 1=culminate, 2=set — group into passes; report start/peak-alt/end + visible flag
for t, e in zip(times, events):
    print(t.utc_strftime("%Y-%m-%d %H:%M:%S"), ["rise","peak","set"][e])
```
A pass is **visible** only when the satellite is sunlit and the observer is in
darkness (sun below ~−6°). Compute the Sun's altitude (via `astropy` or skyfield)
to flag visible vs daylight passes — say which.

Other catalog numbers: Hubble = 20580, Tiangong = 48274. For a Starlink train,
load the `starlink` group TLE set and filter by name.

## Honesty
- **Detection ≠ confirmation.** A catalog hit or a single observation is not a
  confirmed, peer-reviewed result — keep that line (see Ride's doctrine).
- **TLEs decay.** Pass predictions degrade after a few days; always fetch fresh
  TLEs, and note that times are ±~minutes, not exact.
- **Network dependence.** These all reach external archives; if a service is
  down, say so rather than inventing data.

## Output discipline
Cite the archive + identifier + epoch (`MAST/JWST obs 2026-…`, `Gaia DR3
source_id …`, `Horizons 499 @ 2026-06-15`). Hand structured results to `sky-viz`
to render (sky maps, pass timelines, catalog scatter) — never raw tables in chat.
