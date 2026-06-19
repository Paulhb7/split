#!/usr/bin/env python3
"""cad-design — build a CadQuery model and emit print/CAD/web artifacts.

Original implementation written for Split. Built only on permissively
licensed libraries: CadQuery (Apache-2.0), trimesh (MIT), numpy (BSD),
matplotlib (PSF-style). No third-party *skill* code is used or adapted.

Pipeline: exec a model script that assigns the final solid to `result`
→ export STL (slicing) + STEP (CAD interop) + GLB (web viewer) + SVG
(quick line preview) → render shaded turntable PNGs (headless, via
matplotlib — no OpenGL context needed) → print a JSON summary with the
bounding box, volume, and watertightness so the caller can verify the
part before slicing.

Usage:
    python3 scripts/cad_build.py model.py --out build/ [--views 4] [--no-glb]

The model script must bind the final shape to a variable named `result`
(a cadquery Workplane / Shape / Assembly). Example model.py:

    import cadquery as cq
    WALL, W, H, D = 2.0, 40, 25, 15
    result = (cq.Workplane("XY").box(W, H, D)
                .faces(">Z").shell(-WALL)
                .edges("|Z").fillet(2))
"""
import argparse
import json
import os
import runpy
import sys

import numpy as np


def load_result(model_path):
    """Run the model script and return the solid it bound to `result`."""
    namespace = runpy.run_path(model_path)
    for key in ("result", "model", "part", "assembly"):
        obj = namespace.get(key)
        if obj is not None:
            return obj
    raise SystemExit(
        "model script must bind the final solid to `result` "
        "(also accepted: model / part / assembly)"
    )


def export_solids(result, out, name, want_glb):
    from cadquery import exporters

    paths = {}
    stl = os.path.join(out, f"{name}.stl")
    exporters.export(result, stl)  # tessellated mesh for slicers
    paths["stl"] = stl

    for ext in ("step", "svg"):  # B-rep for CAD; built-in isometric line art
        target = os.path.join(out, f"{name}.{ext}")
        try:
            exporters.export(result, target)
            paths[ext] = target
        except Exception as exc:  # noqa: BLE001 — non-fatal, keep going
            print(f"[warn] {ext.upper()} export skipped: {exc}", file=sys.stderr)

    if want_glb:
        glb = os.path.join(out, f"{name}.glb")
        _mesh_to_glb(stl, glb)
        paths["glb"] = glb
    return paths


def _mesh_to_glb(stl, glb, base=(0.60, 0.65, 0.73), metallic=0.65, roughness=0.42):
    """STL → GLB with a real PBR material, so <model-viewer> shades it like
    metal instead of rendering a flat white blob (trimesh meshes carry no
    material by default)."""
    import numpy as np
    import trimesh

    mesh = trimesh.load(stl, force="mesh")
    rgba = np.array([*[int(c * 255) for c in base], 255], dtype=np.uint8)
    mesh.visual = trimesh.visual.TextureVisuals(
        material=trimesh.visual.material.PBRMaterial(
            baseColorFactor=rgba,
            metallicFactor=float(metallic),
            roughnessFactor=float(roughness),
        )
    )
    mesh.export(glb)


# WebGL preview: PBR + contact shadow are done by <model-viewer> (real-time GL
# in the browser), the floor grid is a CSS perspective plane behind the
# transparent canvas, and the PNG snapshot is grabbed client-side via
# model-viewer's toBlob() — so there's no server-side OpenGL context to set up
# (the macOS offscreen-GL trap) and nothing to install. Placeholders are filled
# with str.replace to avoid escaping the CSS braces.
_VIEWER_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__NAME__ — 3D preview</title>
<script type="module" src="https://unpkg.com/@google/model-viewer@3/dist/model-viewer.min.js"></script>
<style>
  :root { --bg:#0b0e14; --grid:rgba(120,140,170,.16); --ink:#aeb7c6; --accent:#5ad1e6; }
  * { box-sizing:border-box; }
  html,body { margin:0; height:100%; background:var(--bg); color:var(--ink);
    font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace; }
  .stage { position:relative; height:100vh; display:flex; flex-direction:column; }
  .floor { position:absolute; inset:0; z-index:0; overflow:hidden; perspective:600px; }
  .floor::after { content:''; position:absolute; left:-60%; right:-60%; bottom:-10%; height:80%;
    background-image:linear-gradient(var(--grid) 1px,transparent 1px),
                     linear-gradient(90deg,var(--grid) 1px,transparent 1px);
    background-size:44px 44px; transform:rotateX(74deg); transform-origin:bottom center;
    -webkit-mask-image:linear-gradient(to top,#000 0%,transparent 78%);
            mask-image:linear-gradient(to top,#000 0%,transparent 78%); }
  model-viewer { position:relative; z-index:1; flex:1; width:100%;
    --poster-color:transparent; background:transparent; }
  .hud { position:absolute; z-index:2; left:18px; bottom:16px; font-size:12px; line-height:1.5;
    letter-spacing:.02em; text-shadow:0 1px 3px #000; }
  .hud b { color:#fff; font-weight:600; } .hud .d { color:var(--accent); }
  .snap { position:absolute; z-index:2; right:16px; bottom:16px; cursor:pointer; font:inherit;
    font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--ink);
    background:transparent; border:1px solid rgba(174,183,198,.3); border-radius:8px; padding:6px 12px; }
  .snap:hover { color:#fff; border-color:#fff; }
</style>
</head>
<body>
  <div class="stage">
    <div class="floor"></div>
    <model-viewer id="mv" src="__GLB__" alt="__NAME__"
      camera-controls auto-rotate auto-rotate-delay="0" rotation-per-second="18deg"
      interaction-prompt="none" shadow-intensity="1" shadow-softness="0.85"
      exposure="1.05" environment-image="neutral" tone-mapping="aces"
      camera-orbit="35deg 72deg auto" touch-action="pan-y"></model-viewer>
    <div class="hud"><b>__NAME__</b><br><span class="d">__DIMS__</span></div>
    <button class="snap" onclick="grab()">Download PNG</button>
  </div>
  <script>
    async function grab(){
      const mv = document.getElementById('mv');
      const blob = await mv.toBlob({idealAspect:true});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '__NAME__.png'; a.click();
    }
  </script>
</body>
</html>
"""


def write_viewer(out, name, glb_path, bbox):
    """Emit a deployable index.html that shows the GLB with PBR + grid floor."""
    dims = f"{bbox['x']} x {bbox['y']} x {bbox['z']} mm"
    html = (
        _VIEWER_HTML.replace("__GLB__", os.path.basename(glb_path))
        .replace("__NAME__", name)
        .replace("__DIMS__", dims)
    )
    path = os.path.join(out, "index.html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)
    return path


def _lambert_facecolors(mesh):
    """Cheap directional shading from face normals — readable, no renderer."""
    light = np.array([0.3, 0.45, 0.85])
    light /= np.linalg.norm(light)
    shade = np.clip(mesh.face_normals @ light, 0.18, 1.0)
    base = np.array([0.56, 0.63, 0.74])  # cool pewter
    return shade[:, None] * base[None, :]


def render_turntable(stl, out, name, n_views):
    """Headless shaded previews from several angles via matplotlib."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    import trimesh

    mesh = trimesh.load(stl, force="mesh")
    tris = mesh.vertices[mesh.faces]
    colors = _lambert_facecolors(mesh)
    lo, hi = mesh.bounds
    center = (lo + hi) / 2.0
    reach = float((hi - lo).max()) / 2.0 or 1.0

    previews = []
    azimuths = np.linspace(0, 300, n_views, endpoint=False)
    for i, azim in enumerate(azimuths, 1):
        fig = plt.figure(figsize=(4, 4), dpi=140)
        ax = fig.add_subplot(111, projection="3d")
        ax.add_collection3d(Poly3DCollection(tris, facecolors=colors, edgecolors="none"))
        ax.set_xlim(center[0] - reach, center[0] + reach)
        ax.set_ylim(center[1] - reach, center[1] + reach)
        ax.set_zlim(center[2] - reach, center[2] + reach)
        ax.view_init(elev=24, azim=float(azim))
        ax.set_axis_off()
        path = os.path.join(out, f"{name}_view{i}.png")
        fig.savefig(path, bbox_inches="tight", facecolor="#0b0e14")
        plt.close(fig)
        previews.append(path)
    return previews, mesh


def main():
    ap = argparse.ArgumentParser(description="Build a CadQuery model into print/CAD/web artifacts.")
    ap.add_argument("model", help="path to a model script that binds `result`")
    ap.add_argument("--out", default="build", help="output directory")
    ap.add_argument("--name", default=None, help="artifact base name (default: model filename)")
    ap.add_argument("--views", type=int, default=3, help="matplotlib fallback preview angles")
    ap.add_argument("--no-glb", action="store_true", help="skip the GLB web export")
    ap.add_argument("--no-viewer", action="store_true", help="skip the WebGL index.html")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    name = args.name or os.path.splitext(os.path.basename(args.model))[0]

    result = load_result(args.model)
    paths = export_solids(result, args.out, name, not args.no_glb)
    previews, mesh = render_turntable(paths["stl"], args.out, name, args.views)

    lo, hi = mesh.bounds
    bbox = {
        "x": round(float(hi[0] - lo[0]), 2),
        "y": round(float(hi[1] - lo[1]), 2),
        "z": round(float(hi[2] - lo[2]), 2),
    }

    viewer = None
    if "glb" in paths and not args.no_viewer:
        viewer = write_viewer(args.out, name, paths["glb"], bbox)

    summary = {
        "name": name,
        "files": paths,
        "viewer": viewer,  # deploy this index.html with web-deploy for the interactive PBR view
        "previews": previews,
        "bbox_mm": bbox,
        "volume_mm3": round(float(mesh.volume), 1),
        "watertight": bool(mesh.is_watertight),
        "triangles": int(len(mesh.faces)),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
