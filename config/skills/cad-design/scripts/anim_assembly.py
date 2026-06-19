#!/usr/bin/env python3
"""cad-design — animate a mechanism to MP4.

Original implementation written for Split. Built only on permissively
licensed libraries: CadQuery (Apache-2.0), trimesh (MIT), numpy (BSD),
matplotlib (PSF-style); ffmpeg for encoding. No third-party skill code.

The model script defines named moving parts and their kinematics, all tied
to ONE crank angle that sweeps 0..2π over the clip:

    parts  : dict[str, cadquery solid]
    motion : dict[str, spec]          # parts absent here are static
             spin  → {"type":"spin",  "axis":"x|y|z", "ratio":1.0}
             recip → {"type":"recip", "axis":"x|y|z", "amp":<mm>, "phase":0.0}
    colors : optional dict[str, (r,g,b)] in 0..1

spin rotates about the world axis through the origin; recip translates by
-amp·(1-cos(θ+phase)). Each part is tessellated once, transformed per frame,
shaded headlessly (matplotlib — no OpenGL context), and stitched with ffmpeg.

Usage:
    python3 scripts/anim_assembly.py model.py --out anim/ --frames 48 --fps 24
"""
import argparse
import os
import subprocess
import tempfile

import numpy as np
import runpy


def tessellate(solid):
    import cadquery as cq
    import trimesh

    fd, path = tempfile.mkstemp(suffix=".stl")
    os.close(fd)
    cq.exporters.export(solid, path)
    mesh = trimesh.load(path, force="mesh")
    os.unlink(path)
    return mesh


def move(verts, spec, theta):
    if spec is None:
        return verts
    if spec["type"] == "spin":
        a = theta * spec.get("ratio", 1.0)
        c, s = np.cos(a), np.sin(a)
        axis = spec.get("axis", "z")
        if axis == "x":
            rot = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
        elif axis == "y":
            rot = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        else:
            rot = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        return verts @ rot.T
    if spec["type"] == "recip":
        idx = {"x": 0, "y": 1, "z": 2}[spec.get("axis", "z")]
        out = verts.copy()
        out[:, idx] += -spec["amp"] * (1.0 - np.cos(theta + spec.get("phase", 0.0)))
        return out
    return verts


def shade(verts, faces, base):
    tris = verts[faces]
    normals = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    normals = np.divide(normals, length, out=np.zeros_like(normals), where=length > 0)
    light = np.array([0.3, 0.45, 0.85])
    light /= np.linalg.norm(light)
    lit = np.clip(normals @ light, 0.22, 1.0)
    return lit[:, None] * np.array(base)[None, :], tris


def main():
    ap = argparse.ArgumentParser(description="Animate a named-part mechanism to MP4.")
    ap.add_argument("model")
    ap.add_argument("--out", default="anim")
    ap.add_argument("--name", default="anim")
    ap.add_argument("--frames", type=int, default=48)
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--elev", type=float, default=16)
    ap.add_argument("--azim", type=float, default=-68)
    args = ap.parse_args()

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    ns = runpy.run_path(args.model)
    parts = ns["parts"]
    motion = ns.get("motion", {})
    colors = ns.get("colors", {})
    fallback = [(0.56, 0.63, 0.74), (0.42, 0.46, 0.54), (0.85, 0.56, 0.30)]
    meshes = {name: tessellate(solid) for name, solid in parts.items()}

    # fixed frame: bounds over the whole motion envelope
    sampled = [
        move(m.vertices, motion.get(name), th)
        for th in np.linspace(0, 2 * np.pi, 8, endpoint=False)
        for name, m in meshes.items()
    ]
    allp = np.vstack(sampled)
    lo, hi = allp.min(0), allp.max(0)
    center = (lo + hi) / 2.0
    reach = float((hi - lo).max()) / 2.0 * 1.05

    os.makedirs(args.out, exist_ok=True)
    for i in range(args.frames):
        theta = 2 * np.pi * i / args.frames
        fig = plt.figure(figsize=(5, 5), dpi=120)
        ax = fig.add_subplot(111, projection="3d")
        for j, (name, mesh) in enumerate(meshes.items()):
            verts = move(mesh.vertices, motion.get(name), theta)
            base = colors.get(name, fallback[j % len(fallback)])
            facecolors, tris = shade(verts, mesh.faces, base)
            ax.add_collection3d(Poly3DCollection(tris, facecolors=facecolors, edgecolors="none"))
        ax.set_xlim(center[0] - reach, center[0] + reach)
        ax.set_ylim(center[1] - reach, center[1] + reach)
        ax.set_zlim(center[2] - reach, center[2] + reach)
        ax.set_box_aspect((1, 1, 1))
        ax.view_init(elev=args.elev, azim=args.azim)
        ax.set_axis_off()
        fig.savefig(os.path.join(args.out, f"frame_{i:03d}.png"), facecolor="#0b0e14")
        plt.close(fig)

    mp4 = os.path.join(args.out, f"{args.name}.mp4")
    subprocess.run(
        [
            "ffmpeg", "-y", "-framerate", str(args.fps),
            "-i", os.path.join(args.out, "frame_%03d.png"),
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-pix_fmt", "yuv420p",
            "-r", str(args.fps), mp4,
        ],
        check=True,
        capture_output=True,
    )
    print(f"{args.frames} frames @ {args.fps}fps  ->  {mp4}")


if __name__ == "__main__":
    main()
