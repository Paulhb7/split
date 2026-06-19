---
name: cad-design
description: Design real, manufacturable 3D parts as parametric code with CadQuery, then export them for printing, CAD, and the web — STL for the slicer, STEP for CAD interop, GLB for an interactive browser viewer, plus shaded preview images so the part can be inspected before it's made. Use when the user wants a physical object designed to be built: an enclosure, bracket, mount, adapter, jig, gear, knob, stand, fixture, snap-fit case, or any functional mechanical part. NOT for digital-only 3D (renders, game assets, sculpts), nor for editing an STL the user already has.
---

# CAD Design — parametric parts, built to be made

Design solid parts as **CadQuery** code (Python over the OpenCASCADE B-rep
kernel), then ship them in every format the next step needs: `.stl` to slice,
`.step` for CAD, `.glb` for a web viewer, `.svg`/`.png` to look at. The model is
*code*, so it stays parametric — change a dimension, rebuild, done.

## Setup

CadQuery needs Python **3.10–3.12** (its OCC kernel has no 3.13+ wheels yet).
Work in a dedicated venv:

```bash
python3.12 -m venv .venv && . .venv/bin/activate     # or any 3.10–3.12
pip install "cadquery>=2.6,<3" "trimesh>=4,<5" "numpy>=1.24" matplotlib
```

Preview rendering here is **fully headless** — it uses matplotlib, so no display
server or OpenGL context is required (works over SSH / in CI). If the CadQuery
wheel won't build, fall back to conda: `conda install -c cadquery -c conda-forge cadquery`.

## The loop — model → export → see → iterate

1. **Write the model as a script** that binds the final solid to `result`. Put
   every real dimension in a named constant block at the top — that block *is*
   the parametric interface.
   ```python
   import cadquery as cq

   # --- parameters (mm) ---
   W, H, D   = 60, 40, 22      # outer box
   WALL      = 2.4             # ≥ 2 perimeters at 0.4 nozzle
   LID_GAP   = 0.2             # FDM slip-fit clearance
   BORE      = 8.4             # USB-C cutout width

   result = (cq.Workplane("XY").box(W, H, D)
               .faces(">Z").shell(-WALL)            # open-top shell
               .edges("|Z").fillet(3)               # comfortable corners
               .faces(">Y").workplane().rect(BORE, 3.2).cutThruAll())
   ```
2. **Build it** — exports STL + STEP + GLB + SVG, writes the WebGL `index.html`,
   and renders fallback PNGs:
   ```bash
   python3 scripts/cad_build.py model.py --out build/
   ```
   The JSON summary reports the file paths, the `viewer` page, and the
   **bounding box, volume, watertightness, and triangle count**. A non-watertight
   mesh won't print — fix the geometry before going further.
3. **Look at the previews**, judge them like a part (proportions, wall presence,
   cutout placement), and **iterate the parameters**, not the mesh. Re-run.

## Visualizing — WebGL first

The hero preview is **real-time WebGL in the browser**, not a server-side render.
`cad_build.py` writes an `index.html` next to the `.glb` that shows the part with
**PBR shading, a contact shadow, a perspective grid floor, and auto-rotate** via
`<model-viewer>` — and a one-click **PNG snapshot** grabbed in-browser. This is
deliberate: WebGL PBR needs no OpenGL context on the server, so it sidesteps the
macOS offscreen-GL trap entirely and installs nothing beyond a CDN script. Deploy
that `index.html` with **`web-deploy`** → the user orbits the real part from a
public URL, no install. This is the deliverable to send a client or teammate.

Two lighter tiers back it up:
- **`.svg`** — CadQuery's built-in isometric line projection, instant, zero deps.
  Good for a fast "is the shape right".
- **matplotlib PNGs** — `cad_build.py` also renders a few flat shaded angles
  (`--views`, default 3) as an ultra-light static fallback when no browser is in
  play (e.g. piping a thumbnail into a doc). Lower fidelity than the WebGL view by
  design; it's the fallback, not the showcase. Skip the WebGL page with
  `--no-viewer` if you only need the thumbnail.

## Animated assemblies (mechanisms)

For a part that *moves* — an engine, a gearbox, a linkage, a cam — show the
motion, not a still. Model the moving pieces as **separate named solids** and
declare per-part kinematics tied to one crank angle, then render to MP4:

```python
# in the model script — alongside `result`, expose the mechanism:
parts  = {"body": body, "flywheel": flywheel, "piston": piston}
motion = {"flywheel": {"type": "spin",  "axis": "x"},
          "piston":   {"type": "recip", "axis": "z", "amp": 12}}   # half-stroke mm
colors = {"body": (0.56,0.63,0.74), "piston": (0.86,0.56,0.30)}
```
```bash
python3 scripts/anim_assembly.py model.py --out anim/ --frames 48 --fps 24
```
`spin` rotates a part about the world axis through the origin; `recip` drives a
slider-crank translation. The crank angle sweeps one full turn over the clip, so
the loop is seamless. Two outputs from the same model:

- **MP4** — `anim_assembly.py` renders a headless `*.mp4` (matplotlib, no OpenGL
  context) to drop into a deck or a report.
- **Interactive** — `make_anim_viewer.py` exports each part as its own PBR GLB
  (one clean group per part — `cq.Assembly` fragments parts into dozens of nodes,
  so avoid it) and writes a `viewer.html` (three.js) where the mechanism **runs
  live while the boss orbits it**, with a grid floor + contact shadow. glTF is
  Y-up, so the script remaps the CadQuery axes for you. Serve over HTTP or
  `web-deploy` — browsers block `file://` GLB fetches (a blank viewer = that, not
  a broken model).

For a polished hand-off, embed `viewer.html` (iframe) + the MP4 + a cotes/BOM
table in a single `report.html` — that's the shape of an engineering deliverable.

## Design for the real world

- **Research dimensions before you model.** Anything that mates with a real
  object — a phone, a USB-C port, a PCB, an M3 screw, a bearing — needs the
  actual spec, not a guess. Look it up (web search / datasheet); 1 mm off makes a
  part useless. Note the source in a comment next to the constant.
- **Print-aware geometry (FDM defaults):** walls ≥ 2 perimeters (~0.8 mm, use
  ≥ 2 mm to feel solid); avoid unsupported overhangs past ~45°; fillet stressed
  corners rather than leaving sharp internal edges; for slip/press fits leave
  ~0.15–0.25 mm clearance and expose it as a parameter so it can be tuned per
  printer.
- **Keep it one parametric model.** Resist hand-editing exported meshes — change
  the constants and rebuild. The script is the source of truth.

## Output discipline
- Save to a project folder (`~/Desktop/cad-<part>-<YYYYMMDD>/`) with `model.py`,
  the `build/` artifacts, and a one-line note per file (`*.stl` slice, `*.step`
  CAD, `*.glb` web, `index.html` interactive viewer, `*_viewN.png` thumbnail).
- Deploy `index.html` with `web-deploy` and **report the public viewer URL** plus
  the **bounding box in mm** and whether the mesh is watertight — lead with those,
  not the code.
- State the FDM assumptions you baked in (nozzle, clearance) so they can be
  adjusted; never claim a tolerance you didn't parameterize.
