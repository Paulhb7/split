#!/usr/bin/env python3
"""cad-design — export an animated mechanism as an interactive WebGL page.

Original implementation for Split. CadQuery (Apache-2.0), trimesh (MIT),
numpy; three.js (MIT) loaded from CDN in the page. No third-party skill code.

Reads the same contract as anim_assembly.py from the model script:
    parts  : dict[str, cadquery solid]
    motion : dict[str, spec]   # spin / recip, tied to one crank angle
    colors : optional dict[str, (r,g,b)]

Each part is exported to its OWN GLB with a PBR material (one clean group per
part — `cq.Assembly` fragments parts into dozens of nodes, so we avoid it). The
emitted viewer.html loads the GLBs, fits the camera, gives orbit control, and
runs the kinematics live in the browser (three.js). glTF is Y-up, so CadQuery
axes are remapped: spin x→x, y→z, z→y; recip z→y (+), y→z (−), x→x (+).

Usage:
    python3 scripts/make_anim_viewer.py model.py --out build/ [--rpm 90]
Serve the folder over HTTP (browsers block file:// GLB fetches) or web-deploy it.
"""
import argparse
import json
import os

import numpy as np
import runpy

_SPIN_AXIS = {"x": "x", "y": "z", "z": "y"}
_RECIP_AXIS = {"x": ("x", 1.0), "y": ("z", -1.0), "z": ("y", 1.0)}


def export_part_glb(solid, glb, base):
    import cadquery as cq
    import tempfile
    import trimesh

    fd, stl = tempfile.mkstemp(suffix=".stl")
    os.close(fd)
    cq.exporters.export(solid, stl)
    mesh = trimesh.load(stl, force="mesh")
    os.unlink(stl)
    rgba = np.array([*[int(c * 255) for c in base], 255], dtype=np.uint8)
    mesh.visual = trimesh.visual.TextureVisuals(
        material=trimesh.visual.material.PBRMaterial(
            baseColorFactor=rgba, metallicFactor=0.6, roughnessFactor=0.45
        )
    )
    mesh.export(glb)


def build_motion_config(motion):
    """Translate the CadQuery-frame motion specs into Y-up GLB JS directives."""
    cfg = {}
    for name, spec in motion.items():
        if spec["type"] == "spin":
            cfg[name] = {
                "kind": "spin",
                "axis": _SPIN_AXIS[spec.get("axis", "z")],
                "ratio": spec.get("ratio", 1.0),
            }
        elif spec["type"] == "recip":
            axis, sign = _RECIP_AXIS[spec.get("axis", "z")]
            cfg[name] = {
                "kind": "recip",
                "axis": axis,
                "amp": sign * spec["amp"],
                "phase": spec.get("phase", 0.0),
            }
    return cfg


_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
  html,body{margin:0;height:100%;background:#0a0d13;overflow:hidden;
    font-family:ui-monospace,'JetBrains Mono',Menlo,monospace;color:#aeb7c6}
  #hud{position:fixed;left:16px;bottom:14px;font-size:12px;letter-spacing:.03em;
    text-shadow:0 1px 3px #000;z-index:5}
  #hud b{color:#fff} .accent{color:#5ad1e6}
  canvas{display:block}
</style>
<script type="importmap">{"imports":{
  "three":"https://unpkg.com/three@0.169.0/build/three.module.js",
  "three/addons/":"https://unpkg.com/three@0.169.0/examples/jsm/"
}}</script>
</head>
<body>
<div id="hud"><b>__TITLE__</b> · <span class="accent">live</span> — drag to orbit, scroll to zoom</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PARTS = __PARTS__;          // [{name, file}]
const MOTION = __MOTION__;        // {name:{kind,axis,...}}
const RPM = __RPM__;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d13);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 5000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 0.6;

const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1,1.6,1.2);
key.castShadow = true; scene.add(key);
scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x10131a, 0.8));

const groups = {};
const loader = new GLTFLoader();
const box = new THREE.Box3();
let loaded = 0;

PARTS.forEach(p => loader.load(p.file, gltf => {
  const g = gltf.scene; groups[p.name] = g;
  g.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g); box.expandByObject(g);
  if (++loaded === PARTS.length) fit();
}));

function fit(){
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x,size.y,size.z);
  controls.target.copy(c);
  camera.position.set(c.x + r*1.1, c.y + r*0.55, c.z + r*1.5);
  camera.near = r/100; camera.far = r*100; camera.updateProjectionMatrix();
  // ground + grid just under the model
  const gy = box.min.y;
  const grid = new THREE.GridHelper(r*3, 30, 0x33405a, 0x1b2433);
  grid.position.set(c.x, gy, c.z); scene.add(grid);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(r*6, r*6),
    new THREE.ShadowMaterial({opacity:0.35}));
  floor.rotation.x = -Math.PI/2; floor.position.set(c.x, gy, c.z);
  floor.receiveShadow = true; scene.add(floor);
  const d = r*2; key.shadow.camera.left=-d; key.shadow.camera.right=d;
  key.shadow.camera.top=d; key.shadow.camera.bottom=-d; key.shadow.mapSize.set(2048,2048);
}

const clock = new THREE.Clock();
function tick(){
  requestAnimationFrame(tick);
  const theta = clock.getElapsedTime() * RPM/60 * Math.PI*2;
  for (const [name, m] of Object.entries(MOTION)){
    const g = groups[name]; if (!g) continue;
    if (m.kind === 'spin') g.rotation[m.axis] = theta * m.ratio;
    else if (m.kind === 'recip') g.position[m.axis] = -m.amp * (1 - Math.cos(theta + m.phase));
  }
  controls.update();
  renderer.render(scene, camera);
}
tick();
addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
</script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--out", default="build")
    ap.add_argument("--name", default="mechanism")
    ap.add_argument("--rpm", type=float, default=90.0)
    args = ap.parse_args()

    ns = runpy.run_path(args.model)
    parts = ns["parts"]
    motion = ns.get("motion", {})
    colors = ns.get("colors", {})
    fallback = [(0.56, 0.63, 0.74), (0.42, 0.46, 0.54), (0.85, 0.56, 0.30)]

    os.makedirs(args.out, exist_ok=True)
    part_list = []
    for i, (name, solid) in enumerate(parts.items()):
        glb = f"{name}.glb"
        export_part_glb(solid, os.path.join(args.out, glb), colors.get(name, fallback[i % len(fallback)]))
        part_list.append({"name": name, "file": glb})

    html = (
        _HTML.replace("__TITLE__", args.name)
        .replace("__PARTS__", json.dumps(part_list))
        .replace("__MOTION__", json.dumps(build_motion_config(motion)))
        .replace("__RPM__", str(args.rpm))
    )
    viewer = os.path.join(args.out, "viewer.html")
    with open(viewer, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(json.dumps({"viewer": viewer, "parts": part_list}, indent=2))


if __name__ == "__main__":
    main()
