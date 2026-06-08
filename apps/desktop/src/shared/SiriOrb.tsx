import { useEffect, useRef, useMemo } from "react";
import * as THREE from "three";

// Fibonacci-sphere "Siri orb" — adapted from the user-provided OmniOrb.
// Generalized: takes hex colors instead of a binary theme switch, supports
// any size, voice reactivity is optional. Mounts a Three.js scene that
// stays alive for the component's lifetime; colors / speaking state are
// updated via refs so we don't tear down the scene when those change.
export interface SiriOrbProps {
  /** Render size (square, in CSS pixels). */
  size?: number;
  /** Hex "#rrggbb" — inner dots base color. */
  coreColor?: string;
  /** Hex "#rrggbb" — outer halo base color. Defaults to coreColor. */
  haloColor?: string;
  /** Voice-react: brightens, swells, swirls faster while speaking. */
  isSpeaking?: boolean;
  /** Web Audio analyser node feeding 128-bin frequency data. */
  analyser?: AnalyserNode | null;
  /** Optional silhouette image painted onto the Fibonacci sphere via
   *  front-projection. Each point samples the image once at mount, then
   *  carries that color through the orb's rotation — non-white pixels
   *  become "ink" points (full coreColor), white/transparent pixels
   *  fade to near-invisible. The outer halo is suppressed when set. */
  imageUrl?: string;
  className?: string;
  style?: React.CSSProperties;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const e = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(e.slice(0, 2), 16) / 255,
    parseInt(e.slice(2, 4), 16) / 255,
    parseInt(e.slice(4, 6), 16) / 255,
  ];
}

function rgbaStr([r, g, b]: Rgb, a: number): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

export default function SiriOrb({
  size = 180,
  coreColor = "#fa500f",
  haloColor,
  isSpeaking = false,
  analyser = null,
  imageUrl,
  className,
  style,
}: SiriOrbProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Refs are read by the animation loop every frame, so updates don't
  // re-trigger the (expensive) Three.js setup effect.
  const stateRef = useRef({ isSpeaking, analyser });
  const colorRef = useRef<{ core: Rgb; halo: Rgb }>({
    core: hexToRgb(coreColor),
    halo: hexToRgb(haloColor ?? coreColor),
  });

  useEffect(() => {
    stateRef.current = { isSpeaking, analyser };
  }, [isSpeaking, analyser]);

  useEffect(() => {
    colorRef.current = {
      core: hexToRgb(coreColor),
      halo: hexToRgb(haloColor ?? coreColor),
    };
  }, [coreColor, haloColor]);

  // Pre-computed drop-shadow strings for the wrapper. Re-computed only when
  // colors change; the speaking variant is swapped via inline style below.
  const { idleFilter, speakingFilter } = useMemo(() => {
    const core = hexToRgb(coreColor);
    const halo = hexToRgb(haloColor ?? coreColor);
    return {
      idleFilter: `drop-shadow(0 0 6px ${rgbaStr(core, 0.32)}) drop-shadow(0 0 22px ${rgbaStr(halo, 0.16)})`,
      speakingFilter: `drop-shadow(0 0 26px ${rgbaStr(core, 0.85)}) drop-shadow(0 0 56px ${rgbaStr(halo, 0.4)})`,
    };
  }, [coreColor, haloColor]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.z = 3.8;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    // Soft circular dot sprite — antialiased point primitive.
    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = dotCanvas.height = 32;
    const dotCtx = dotCanvas.getContext("2d")!;
    const grad = dotCtx.createRadialGradient(16, 16, 0, 16, 16, 14);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.6)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    dotCtx.fillStyle = grad;
    dotCtx.beginPath();
    dotCtx.arc(16, 16, 14, 0, Math.PI * 2);
    dotCtx.fill();
    const dotTexture = new THREE.CanvasTexture(dotCanvas);

    // Inner Fibonacci sphere — 2800 points distributed via golden angle.
    const N = 2800;
    const rawPos = new Float32Array(N * 3);
    const PHI = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = PHI * i;
      rawPos[i * 3] = Math.cos(theta) * r;
      rawPos[i * 3 + 1] = y;
      rawPos[i * 3 + 2] = Math.sin(theta) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(rawPos.slice(), 3));
    const originalPos = rawPos;

    // Per-vertex mask (1.0 = ink / part of silhouette, 0.05 = background).
    // Stays at 1.0 everywhere when no image — multiplied by mat.color in the
    // shader, so the brand color (and brightness pulse) keeps working
    // unchanged. Patched in-place when the image finishes loading.
    const colors = new Float32Array(N * 3).fill(1);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(0xffffff),
      size: 0.075,
      sizeAttenuation: true,
      map: dotTexture,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      vertexColors: true,
    });
    const dots = new THREE.Points(geo, mat);
    scene.add(dots);

    // Front-project the silhouette: for each Fibonacci point, look up the
    // pixel at (x, y) — z is ignored, so both hemispheres carry the figure.
    // The bbox of non-white pixels is auto-detected so any silhouette PNG
    // fills the sphere regardless of its canvas padding. Async — the orb
    // renders with the uniform color until the image arrives.
    let cancelled = false;
    if (imageUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        const cnv = document.createElement("canvas");
        cnv.width = img.naturalWidth;
        cnv.height = img.naturalHeight;
        const ictx = cnv.getContext("2d");
        if (!ictx) return;
        ictx.drawImage(img, 0, 0);
        const W = cnv.width, H = cnv.height;
        let pixels: Uint8ClampedArray;
        try {
          pixels = ictx.getImageData(0, 0, W, H).data;
        } catch {
          return; // cross-origin tainted canvas
        }
        // bbox of non-white, non-transparent pixels
        let minX = W, minY = H, maxX = 0, maxY = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const k = (y * W + x) * 4;
            const a = pixels[k + 3];
            if (a < 30) continue;
            const lum = (pixels[k] + pixels[k + 1] + pixels[k + 2]) / 3;
            if (lum < 240) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX <= minX || maxY <= minY) return;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const bbox = Math.max(maxX - minX, maxY - minY);
        const margin = 0.92;          // figure fits inside sphere with a small gap
        const scale = bbox / (2 * margin);
        const dim = 0.04;             // background points: ~5% brightness (still alive but recessive)
        for (let i = 0; i < N; i++) {
          const x3 = rawPos[i * 3];
          const y3 = rawPos[i * 3 + 1];
          const px = Math.round(cx + x3 * scale);
          const py = Math.round(cy - y3 * scale); // flip — canvas y is top-down
          let ink = false;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            const k = (py * W + px) * 4;
            if (pixels[k + 3] > 30) {
              const lum = (pixels[k] + pixels[k + 1] + pixels[k + 2]) / 3;
              ink = lum < 240;
            }
          }
          const v = ink ? 1 : dim;
          colors[i * 3] = v;
          colors[i * 3 + 1] = v;
          colors[i * 3 + 2] = v;
        }
        (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      };
      img.src = imageUrl;
    }

    // Outer halo — sparser ring at radius ~1.22, different spiral.
    // Suppressed when an imageUrl is set: the silhouette needs to read,
    // and a competing dust ring would mush it.
    const HATM = imageUrl ? 0 : 700;
    const atmRaw = new Float32Array(HATM * 3);
    for (let i = 0; i < HATM; i++) {
      const y = 1 - (i / (HATM - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = PHI * i * 1.618;
      const scale = 1.22 + (i % 7) * 0.012;
      atmRaw[i * 3] = Math.cos(theta) * r * scale;
      atmRaw[i * 3 + 1] = y * scale;
      atmRaw[i * 3 + 2] = Math.sin(theta) * r * scale;
    }
    const atmGeo = new THREE.BufferGeometry();
    atmGeo.setAttribute("position", new THREE.BufferAttribute(atmRaw.slice(), 3));
    const atmOrigPos = atmRaw;
    const atmMat = new THREE.PointsMaterial({
      color: new THREE.Color(0xffffff),
      size: 0.038,
      sizeAttenuation: true,
      map: dotTexture,
      transparent: true,
      alphaTest: 0.01,
      opacity: 0.2,
      depthWrite: false,
    });
    const halo = new THREE.Points(atmGeo, atmMat);
    scene.add(halo);

    const freqData = new Uint8Array(128);
    const clock = new THREE.Clock();
    let animId = 0;

    function animate() {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const { isSpeaking, analyser } = stateRef.current;
      const { core, halo: haloRgb } = colorRef.current;

      let avgFreq = 0;
      if (analyser && isSpeaking) {
        analyser.getByteFrequencyData(freqData);
        for (let i = 0; i < freqData.length; i++) avgFreq += freqData[i];
        avgFreq = avgFreq / freqData.length / 255;
      }

      const amplitude = isSpeaking ? 0.07 + avgFreq * 0.32 : 0.028;
      const speed = isSpeaking ? 2.6 : 0.42;

      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        const ox = originalPos[i * 3];
        const oy = originalPos[i * 3 + 1];
        const oz = originalPos[i * 3 + 2];
        const n =
          Math.sin(t * speed + ox * 4.5 + oy * 2.8) * 0.5 +
          Math.sin(t * speed * 1.4 + oy * 5.2 - oz * 3.1) * 0.3 +
          Math.sin(t * speed * 0.65 + oz * 4.1 + ox * 2.3) * 0.2;
        const r = 1 + n * amplitude;
        posAttr.setXYZ(i, ox * r, oy * r, oz * r);
      }
      posAttr.needsUpdate = true;

      const atmAttr = atmGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < HATM; i++) {
        const ox = atmOrigPos[i * 3];
        const oy = atmOrigPos[i * 3 + 1];
        const oz = atmOrigPos[i * 3 + 2];
        const drift = Math.sin(t * 0.4 + i * 0.15) * (isSpeaking ? 0.06 : 0.015);
        atmAttr.setXYZ(i, ox + drift, oy + drift * 0.5, oz + drift * 0.8);
      }
      atmAttr.needsUpdate = true;

      dots.rotation.y += isSpeaking ? 0.013 : 0.003;
      dots.rotation.x = Math.sin(t * 0.28) * 0.07;
      halo.rotation.y -= 0.0025;
      halo.rotation.x = Math.cos(t * 0.2) * 0.05;

      const bright = isSpeaking ? 1 + avgFreq * 0.6 : 0.85;
      mat.color.setRGB(
        Math.min(1, core[0] * bright),
        Math.min(1, core[1] * bright),
        Math.min(1, core[2] * bright),
      );
      atmMat.color.setRGB(haloRgb[0], haloRgb[1], haloRgb[2]);
      mat.size = isSpeaking ? 0.075 + avgFreq * 0.035 : 0.068;
      atmMat.opacity = isSpeaking ? 0.38 + avgFreq * 0.35 : 0.12;

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      atmGeo.dispose();
      atmMat.dispose();
      dotTexture.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [size, imageUrl]);

  return (
    <div
      className={className}
      style={{
        transition: "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.5s ease",
        transform: isSpeaking ? "scale(1.14)" : "scale(1)",
        filter: isSpeaking ? speakingFilter : idleFilter,
        ...style,
      }}
    >
      <div ref={mountRef} style={{ width: size, height: size }} />
    </div>
  );
}
