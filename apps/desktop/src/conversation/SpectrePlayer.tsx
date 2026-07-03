import { useEffect, useRef, useState } from "react";

// "Spectre" — a real audio-reactive player for audio artifacts. Replaces the
// raw native <audio controls>. A mirrored, log-spaced bar spectrum (Web Audio
// AnalyserNode → canvas) that visibly reacts to the file: bass bars slam on the
// kick, highs shimmer, a low-band RMS glow lets you *feel* the loudness.
//
// Tauri gotcha: `convertFileSrc` serves the file over the cross-origin
// `asset://` protocol, so a classic `createMediaElementSource` taints the graph
// and the analyser reads silence (all zeros). To guarantee real reactivity we
// fetch the bytes and `decodeAudioData` into an AudioBuffer, then play it
// through an AudioBufferSourceNode in the same graph — analysis is in-process,
// never tainted. If the fetch/decode fails we fall back to a native <audio>.
//
// Visual layer ported from apps/desktop/design/audio-player/waves/wave-2-spectre.html.

const FFT = 2048;
const NBARS = 60; // bars per half (mirrored left/right)

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

// Pre-compute log-ish bin ranges across the useful (lower 62%) spectrum.
function makeBinMap(binCount: number): Array<[number, number]> {
  const map: Array<[number, number]> = [];
  const minBin = 2;
  const maxBin = Math.floor(binCount * 0.62);
  for (let i = 0; i < NBARS; i++) {
    const f0 = i / NBARS;
    const f1 = (i + 1) / NBARS;
    const lo = Math.floor(minBin * Math.pow(maxBin / minBin, f0));
    const hi = Math.max(lo + 1, Math.floor(minBin * Math.pow(maxBin / minBin, f1)));
    map.push([lo, hi]);
  }
  return map;
}

function bandValue(freq: Uint8Array, lo: number, hi: number): number {
  let m = 0;
  for (let b = lo; b < hi; b++) if (freq[b] > m) m = freq[b];
  return m / 255;
}

// Low-band RMS-ish energy (the bass = the body you feel).
function lowEnergy(freq: Uint8Array): number {
  let sum = 0;
  let n = 0;
  for (let b = 2; b < 60; b++) {
    sum += freq[b] * freq[b];
    n++;
  }
  return n ? Math.sqrt(sum / n) / 255 : 0;
}

// The canvas can't read CSS variables — resolve the skin's --brand once per
// mount (parsed to rgb for alpha compositing) so the spectrum tracks the
// active skin instead of hardcoding Classic copper. Falls back to copper.
type Rgb = [number, number, number];
function cssRgb(el: HTMLElement, name: string, fallback: Rgb): Rgb {
  const v = getComputedStyle(el).getPropertyValue(name).trim().replace("#", "");
  const m = /^([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Bar colour by normalized position (0 inner/bass .. 1 outer/high) — the
// brand accent, drifting cooler toward the highs.
function barColor(pos: number, v: number, [br, bg, bb]: Rgb): string {
  const a = 0.35 + v * 0.65;
  if (pos < 0.55) return `rgba(${br},${bg},${bb},${a})`;
  const k = (pos - 0.55) / 0.45;
  const r = Math.round(br - 70 * k);
  const g = Math.round(bg - 30 * k);
  const b = Math.round(bb + 30 * k);
  return `rgba(${r},${g},${b},${a})`;
}

// A representative spectrum shape for the static / paused frame.
function synthFrame(): Float32Array {
  const arr = new Float32Array(NBARS);
  for (let i = 0; i < NBARS; i++) {
    const x = i / NBARS;
    const bassHump = Math.exp(-Math.pow((x - 0.05) / 0.1, 2)) * 235;
    const mid = Math.exp(-Math.pow((x - 0.35) / 0.22, 2)) * 120;
    const high = (0.5 + 0.5 * Math.sin(x * 38)) * (1 - x) * 70;
    arr[i] = Math.min(255, bassHump + mid + high + 24) / 255;
  }
  return arr;
}

function renderSpectrum(
  g: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  getBar: (i: number) => number,
  energy: number,
  peaks: Float32Array,
  glow: HTMLDivElement | null,
  brand: Rgb,
): void {
  g.clearRect(0, 0, cssW, cssH);
  const cx = cssW / 2;
  const halfW = cssW / 2;
  const midY = cssH / 2;
  const gap = 1.5;
  const barW = halfW / NBARS - gap;
  const maxH = cssH / 2 - 10;

  for (let i = 0; i < NBARS; i++) {
    const pos = i / (NBARS - 1);
    let v = getBar(i);
    v = Math.pow(v, 0.82); // gentle compression for visual punch
    const h = Math.max(2, v * maxH);

    if (v > peaks[i]) peaks[i] = v;
    else peaks[i] = Math.max(v, peaks[i] - 0.012); // slow falloff

    const col = barColor(pos, v, brand);

    for (const dir of [1, -1]) {
      const x = cx + dir * (i * (barW + gap)) + (dir === -1 ? -barW : 0);
      g.fillStyle = col;
      if (pos < 0.5 && v > 0.45) {
        g.shadowColor = `rgba(${brand[0]},${brand[1]},${brand[2]},${v * 0.6})`;
        g.shadowBlur = 10 * v;
      } else {
        g.shadowBlur = 0;
      }
      g.fillRect(x, midY - h, barW, h);
      g.fillRect(x, midY, barW, h);
      g.shadowBlur = 0;

      const ph = peaks[i] * maxH;
      g.fillStyle = `rgba(217,176,106,${0.35 + peaks[i] * 0.55})`;
      g.fillRect(x, midY - ph - 2, barW, 1.6);
      g.fillRect(x, midY + ph + 0.4, barW, 1.6);
    }
  }

  if (glow) glow.style.opacity = Math.min(0.9, energy * 1.25).toFixed(3);
}

type Props = {
  src: string;
  name: string;
  metaText: string;
  onReveal: () => void;
};

export function SpectrePlayer({ src, name, metaText, onReveal }: Props) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // DOM refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizRef = useRef<HTMLDivElement | null>(null);
  const seekRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const curRef = useRef<HTMLSpanElement | null>(null);

  // Web Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array | null>(null);
  const binMapRef = useRef<Array<[number, number]> | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const srcNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // transport bookkeeping
  const startedAtRef = useRef(0); // ctx time when current source started
  const offsetRef = useRef(0); // playback offset (s) at that moment
  const durationRef = useRef(0);
  const playingRef = useRef(false);
  const mutedRef = useRef(false);

  // canvas bookkeeping
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const cssWRef = useRef(0);
  const cssHRef = useRef(0);
  const peaksRef = useRef(new Float32Array(NBARS));
  const smoothERef = useRef(0);
  const rafRef = useRef(0);
  const draggingRef = useRef(false);
  // Skin accent for the canvas bars — resolved from --brand on mount.
  const brandRef = useRef<Rgb>([217, 119, 87]);

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- canvas sizing (retina-crisp) --------------------------------------
  function sizeCanvas() {
    const cv = canvasRef.current;
    const viz = vizRef.current;
    if (!cv || !viz) return;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5));
    const r = viz.getBoundingClientRect();
    cssWRef.current = r.width;
    cssHRef.current = r.height;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    const g = cv.getContext("2d");
    if (g) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2dRef.current = g;
    }
  }

  function drawStatic() {
    const g = ctx2dRef.current;
    if (!g) return;
    const fr = synthFrame();
    renderSpectrum(g, cssWRef.current, cssHRef.current, (i) => fr[i], 0.18, peaksRef.current, glowRef.current, brandRef.current);
  }

  function position(): number {
    const dur = durationRef.current;
    if (!playingRef.current || !ctxRef.current) return Math.min(offsetRef.current, dur || offsetRef.current);
    const p = offsetRef.current + (ctxRef.current.currentTime - startedAtRef.current);
    return Math.min(Math.max(0, p), dur);
  }

  function paintTime(pos: number, dur: number) {
    const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
    if (fillRef.current) fillRef.current.style.width = `${pct}%`;
    if (knobRef.current) knobRef.current.style.left = `${pct}%`;
    if (playheadRef.current) playheadRef.current.style.left = `${pct}%`;
    if (curRef.current) curRef.current.textContent = fmt(pos);
    const round = String(Math.round(pct));
    vizRef.current?.setAttribute("aria-valuenow", round);
    seekRef.current?.setAttribute("aria-valuenow", round);
  }

  // ---- render loop -------------------------------------------------------
  function startRaf() {
    if (rafRef.current) return;
    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const dur = durationRef.current;
      const pos = position();
      if (!reduceMotion && analyserRef.current && freqRef.current && binMapRef.current) {
        analyserRef.current.getByteFrequencyData(freqRef.current);
        const e = lowEnergy(freqRef.current);
        smoothERef.current += (e - smoothERef.current) * 0.35;
        const map = binMapRef.current;
        const freq = freqRef.current;
        const g = ctx2dRef.current;
        if (g)
          renderSpectrum(
            g,
            cssWRef.current,
            cssHRef.current,
            (i) => bandValue(freq, map[i][0], map[i][1]),
            smoothERef.current,
            peaksRef.current,
            glowRef.current,
            brandRef.current,
          );
      }
      paintTime(pos, dur);
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  function stopRaf() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }

  // ---- audio graph + buffer (lazy, once) ---------------------------------
  async function ensureGraphAndBuffer() {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      const Ctx: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = mutedRef.current ? 0 : 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT;
      analyser.smoothingTimeConstant = 0.8;
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      gainRef.current = gain;
      analyserRef.current = analyser;
      freqRef.current = new Uint8Array(analyser.frequencyBinCount);
      binMapRef.current = makeBinMap(analyser.frequencyBinCount);
    }
    if (!bufRef.current) {
      const resp = await fetch(src);
      const arr = await resp.arrayBuffer();
      const buf = await ctxRef.current.decodeAudioData(arr);
      bufRef.current = buf;
      durationRef.current = buf.duration;
      setDuration(buf.duration);
    }
  }

  function startSource(offset: number) {
    const ctx = ctxRef.current;
    const buf = bufRef.current;
    const gain = gainRef.current;
    if (!ctx || !buf || !gain) return;
    const dur = buf.duration;
    const off = Math.max(0, Math.min(offset, dur - 0.001));
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.connect(gain);
    node.onended = () => {
      // Only fires for a natural end — manual stops null this first.
      stopRaf();
      playingRef.current = false;
      setPlaying(false);
      offsetRef.current = durationRef.current;
      paintTime(durationRef.current, durationRef.current);
      drawStatic();
    };
    node.start(0, off);
    srcNodeRef.current = node;
    startedAtRef.current = ctx.currentTime;
    offsetRef.current = off;
  }

  function stopSource() {
    const node = srcNodeRef.current;
    if (!node) return;
    node.onended = null;
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
    node.disconnect();
    srcNodeRef.current = null;
  }

  async function play() {
    try {
      setLoading(true);
      await ensureGraphAndBuffer();
      setLoading(false);
    } catch {
      setLoading(false);
      setFailed(true);
      return;
    }
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
    let offset = position();
    if (offset >= durationRef.current - 0.02) offset = 0;
    startSource(offset);
    playingRef.current = true;
    setPlaying(true);
    startRaf();
  }

  function pause() {
    offsetRef.current = position();
    stopSource();
    playingRef.current = false;
    setPlaying(false);
    stopRaf();
    drawStatic();
  }

  function toggle() {
    if (playingRef.current) pause();
    else void play();
  }

  function toggleMute() {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    if (gainRef.current && ctxRef.current)
      gainRef.current.gain.setTargetAtTime(m ? 0 : 1, ctxRef.current.currentTime, 0.01);
  }

  // ---- seeking -----------------------------------------------------------
  function seekToClientX(clientX: number, el: HTMLElement) {
    const dur = durationRef.current;
    if (dur <= 0) return;
    const r = el.getBoundingClientRect();
    let pct = (clientX - r.left) / r.width;
    pct = Math.min(1, Math.max(0, pct));
    const pos = pct * dur;
    if (playingRef.current) {
      stopSource();
      startSource(pos);
    } else {
      offsetRef.current = pos;
      drawStatic();
    }
    paintTime(pos, dur);
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    seekToClientX(e.clientX, e.currentTarget);
  }
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (draggingRef.current) seekToClientX(e.clientX, e.currentTarget);
  }
  function onPointerUp() {
    draggingRef.current = false;
  }

  function arrowSeek(e: React.KeyboardEvent<HTMLElement>) {
    const dur = durationRef.current;
    if (dur <= 0) return;
    let pos = position();
    if (e.key === "ArrowLeft") pos -= dur * 0.02;
    else if (e.key === "ArrowRight") pos += dur * 0.02;
    else return;
    e.preventDefault();
    pos = Math.min(dur, Math.max(0, pos));
    if (playingRef.current) {
      stopSource();
      startSource(pos);
    } else {
      offsetRef.current = pos;
      drawStatic();
    }
    paintTime(pos, dur);
  }

  // Shared keyboard model for the two role="slider" surfaces (viz + seek bar):
  // Space/Enter toggle play/pause, arrows seek. stopPropagation keeps player
  // keys from leaking to document-level app shortcuts.
  function onSliderKey(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.stopPropagation();
      arrowSeek(e);
    }
  }

  // ---- mount / unmount ---------------------------------------------------
  useEffect(() => {
    if (vizRef.current) brandRef.current = cssRgb(vizRef.current, "--brand", brandRef.current);
    sizeCanvas();
    drawStatic();
    paintTime(0, 0);
    const obs = new ResizeObserver(() => {
      sizeCanvas();
      if (!playingRef.current) drawStatic();
    });
    if (vizRef.current) obs.observe(vizRef.current);
    return () => {
      obs.disconnect();
      stopRaf();
      stopSource();
      if (ctxRef.current) {
        try {
          void ctxRef.current.close();
        } catch {
          /* noop */
        }
      }
      // Null the graph refs so a StrictMode (dev) remount rebuilds from
      // scratch instead of reusing a now-closed AudioContext.
      ctxRef.current = null;
      gainRef.current = null;
      analyserRef.current = null;
      bufRef.current = null;
      freqRef.current = null;
      binMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    // Decode/fetch unavailable — degrade to the native player so the file
    // still plays, plus the open-externally fallback.
    return (
      <div className="art-media">
        <audio className="art-audio" src={src} controls preload="metadata" />
        <div className="art-media-meta">
          {metaText}
          {" · "}
          <button className="art-media-link" onClick={onReveal}>
            open in default app
          </button>
          {" · visualizer unavailable"}
        </div>
      </div>
    );
  }

  return (
    <div className="art-media art-media-spx">
      <div className={`spx${playing ? " playing" : ""}${loading ? " loading" : ""}`} aria-label="Spectre audio player">
        <div className="spx-head">
          <div className="spx-sigil" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 4 L20 9 L12 12 L4 9 Z" fill="#d9b06a" opacity=".9" />
              <path d="M12 12 L20 15 L12 20 L4 15 Z" fill="var(--brand)" />
            </svg>
          </div>
          <div className="spx-titles">
            <div className="spx-t" title={name}>
              {name}
            </div>
            <div className="spx-s">{metaText}</div>
          </div>
          <div className="spx-status">
            <span className="spx-dot" />
            <span>{loading ? "decoding…" : playing ? "playing" : "spectre"}</span>
          </div>
        </div>

        <div
          className="spx-viz"
          ref={vizRef}
          role="slider"
          tabIndex={0}
          aria-label="Audio spectrum — seek playback"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onSliderKey}
        >
          <canvas ref={canvasRef} />
          <div className="spx-axis" />
          <div className="spx-glow" ref={glowRef} />
          <div className="spx-playhead" ref={playheadRef} />
          <div className="spx-freqlabels">
            <span>BASS</span>
            <span>MID</span>
            <span>HIGH ▸ ◂ HIGH</span>
            <span>MID</span>
            <span>BASS</span>
          </div>
        </div>

        <div className="spx-transport">
          <button
            className="spx-play"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            aria-pressed={playing}
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.5 L18 12 L8 18.5 Z" fill="currentColor" />
              </svg>
            )}
          </button>

          <div className="spx-seekwrap">
            <div className="spx-times">
              <span className="spx-cur" ref={curRef}>
                0:00
              </span>
              <span>{fmt(duration)}</span>
            </div>
            <div
              className="spx-seek"
              ref={seekRef}
              role="slider"
              tabIndex={0}
              aria-label="Playback position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onKeyDown={onSliderKey}
            >
              <div className="spx-track">
                <div className="spx-fill" ref={fillRef} />
                <div className="spx-knob" ref={knobRef} />
              </div>
            </div>
          </div>

          <button
            className={`spx-mute${muted ? " muted" : ""}`}
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
          >
            {muted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor" />
                <path d="M16 9 L21 14 M21 9 L16 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor" />
                <path d="M16 9 C17.6 10.2 17.6 13.8 16 15" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                <path d="M18.4 7 C21 9 21 15 18.4 17" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="art-media-meta">
        <button className="art-media-link" onClick={onReveal}>
          open in default app
        </button>
      </div>
    </div>
  );
}
