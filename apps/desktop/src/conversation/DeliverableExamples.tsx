import { useState, useEffect } from "react";
import type { DeliverableExample } from "../shared/experts";

// The atelier welcome's projection surface: a row of "here's what I make" cards
// that REPLACE the starter chips. Each card carries a typed preview thumbnail
// (drawn below, keyed by `example.type`) + the deliverable's name + a one-liner;
// clicking it fills the composer with `example.prompt` (same launch path the
// starters used). Previews are pure SVG tinted by the skin vars via the `.pv-*`
// classes in app.css, so they re-colour azure under Atelier, copper under
// Classic, … exactly like the rest of the welcome.

// One faux-render per deliverable type. Authored on a 320×200 canvas; the card
// crops to 16:10. Unknown types fall back to FALLBACK (a generic artifact coin).
const PREVIEWS: Record<string, React.ReactNode> = {
  // — interactive app mockup (phone) —
  app: (
    <>
      <rect x="128" y="16" width="64" height="168" rx="14" className="pv-frame" />
      <rect x="135" y="25" width="50" height="13" rx="4" className="pv-brand" />
      <rect x="135" y="46" width="50" height="20" rx="5" className="pv-panel" />
      <rect x="135" y="70" width="50" height="20" rx="5" className="pv-panel" />
      <rect x="135" y="94" width="50" height="20" rx="5" className="pv-panel" />
      <circle cx="144" cy="56" r="4" className="pv-brand" />
      <circle cx="144" cy="80" r="4" className="pv-cyan" />
      <circle cx="144" cy="104" r="4" className="pv-violet" />
      <rect x="155" y="53" width="22" height="5" rx="2.5" className="pv-soft" />
      <rect x="155" y="77" width="22" height="5" rx="2.5" className="pv-soft" />
      <rect x="155" y="101" width="22" height="5" rx="2.5" className="pv-soft" />
      <rect x="135" y="158" width="50" height="18" rx="6" className="pv-panel" />
      <circle cx="148" cy="167" r="2.6" className="pv-brand" />
      <circle cx="160" cy="167" r="2.6" className="pv-soft" />
      <circle cx="172" cy="167" r="2.6" className="pv-soft" />
    </>
  ),
  // — landing page / site (browser) —
  site: (
    <>
      <rect x="40" y="30" width="240" height="140" rx="11" className="pv-frame" />
      <rect x="40" y="30" width="240" height="20" rx="11" className="pv-panel" />
      <circle cx="54" cy="40" r="3" className="pv-soft" />
      <circle cx="64" cy="40" r="3" className="pv-soft" />
      <circle cx="74" cy="40" r="3" className="pv-soft" />
      <rect x="56" y="66" width="104" height="11" rx="4" className="pv-ink" />
      <rect x="56" y="84" width="128" height="11" rx="4" className="pv-brand" />
      <rect x="56" y="107" width="150" height="6" rx="3" className="pv-soft" />
      <rect x="56" y="119" width="116" height="6" rx="3" className="pv-soft" />
      <rect x="56" y="137" width="62" height="20" rx="7" className="pv-brand" />
      <rect x="200" y="64" width="60" height="94" rx="9" className="pv-panel" />
      <circle cx="230" cy="96" r="12" className="pv-cyan" />
    </>
  ),
  // — 3 visual directions (palette / type tiles) —
  board: (
    <>
      <g>
        <rect x="24" y="30" width="84" height="140" rx="10" className="pv-frame" />
        <rect x="36" y="42" width="60" height="34" rx="6" className="pv-brand" />
        <text x="41" y="108" className="pv-aa pv-serif" fontSize={26}>Aa</text>
        <rect x="36" y="122" width="60" height="5" rx="2.5" className="pv-soft" />
        <rect x="36" y="132" width="42" height="5" rx="2.5" className="pv-soft" />
      </g>
      <g>
        <rect x="118" y="30" width="84" height="140" rx="10" className="pv-frame" />
        <rect x="130" y="42" width="60" height="34" rx="6" className="pv-cyan" />
        <text x="135" y="106" className="pv-aa pv-mono" fontSize={22}>Aa</text>
        <rect x="130" y="122" width="60" height="5" rx="2.5" className="pv-soft" />
        <rect x="130" y="132" width="42" height="5" rx="2.5" className="pv-soft" />
      </g>
      <g>
        <rect x="212" y="30" width="84" height="140" rx="10" className="pv-frame" />
        <rect x="224" y="42" width="60" height="34" rx="6" className="pv-violet" />
        <text x="229" y="108" className="pv-aa pv-sans" fontSize={24}>Aa</text>
        <rect x="224" y="122" width="60" height="5" rx="2.5" className="pv-soft" />
        <rect x="224" y="132" width="42" height="5" rx="2.5" className="pv-soft" />
      </g>
    </>
  ),
  // — slide deck —
  deck: (
    <>
      <rect x="48" y="32" width="224" height="136" rx="10" className="pv-frame" />
      <rect x="66" y="52" width="92" height="13" rx="4" className="pv-brand" />
      <rect x="66" y="74" width="150" height="6" rx="3" className="pv-soft" />
      <rect x="66" y="86" width="120" height="6" rx="3" className="pv-soft" />
      <rect x="66" y="124" width="22" height="26" rx="2" className="pv-panel" />
      <rect x="96" y="112" width="22" height="38" rx="2" className="pv-cyan" />
      <rect x="126" y="100" width="22" height="50" rx="2" className="pv-brand" />
      <rect x="156" y="118" width="22" height="32" rx="2" className="pv-panel" />
    </>
  ),
  // — live dashboard (KPIs + line) —
  dashboard: (
    <>
      <rect x="36" y="30" width="248" height="140" rx="10" className="pv-frame" />
      <rect x="48" y="44" width="68" height="34" rx="6" className="pv-panel" />
      <rect x="126" y="44" width="68" height="34" rx="6" className="pv-panel" />
      <rect x="204" y="44" width="68" height="34" rx="6" className="pv-panel" />
      <rect x="56" y="52" width="30" height="8" rx="3" className="pv-brand" />
      <rect x="134" y="52" width="30" height="8" rx="3" className="pv-cyan" />
      <rect x="212" y="52" width="30" height="8" rx="3" className="pv-violet" />
      <rect x="56" y="65" width="44" height="5" rx="2.5" className="pv-soft" />
      <rect x="134" y="65" width="44" height="5" rx="2.5" className="pv-soft" />
      <rect x="212" y="65" width="44" height="5" rx="2.5" className="pv-soft" />
      <line x1="48" y1="156" x2="272" y2="156" className="pv-line" opacity="0.35" />
      <polyline points="50,150 92,128 132,138 172,110 212,120 270,92" className="pv-brand-s" />
    </>
  ),
  // — data analysis (scatter + trend) —
  chart: (
    <>
      <rect x="36" y="30" width="248" height="140" rx="10" className="pv-frame" />
      <line x1="62" y1="48" x2="62" y2="150" className="pv-line" />
      <line x1="62" y1="150" x2="264" y2="150" className="pv-line" />
      <line x1="70" y1="142" x2="256" y2="72" className="pv-brand-s" opacity="0.85" />
      <circle cx="92" cy="138" r="3.4" className="pv-cyan" />
      <circle cx="120" cy="120" r="3.4" className="pv-brand" />
      <circle cx="138" cy="128" r="3.4" className="pv-cyan" />
      <circle cx="168" cy="104" r="3.4" className="pv-brand" />
      <circle cx="196" cy="112" r="3.4" className="pv-cyan" />
      <circle cx="224" cy="84" r="3.4" className="pv-brand" />
      <circle cx="244" cy="92" r="3.4" className="pv-violet" />
    </>
  ),
  // — document / memo / report —
  doc: (
    <>
      <rect x="96" y="20" width="128" height="160" rx="9" className="pv-frame" />
      <rect x="112" y="38" width="62" height="11" rx="4" className="pv-brand" />
      <rect x="112" y="60" width="96" height="6" rx="3" className="pv-soft" />
      <rect x="112" y="72" width="96" height="6" rx="3" className="pv-soft" />
      <rect x="112" y="84" width="74" height="6" rx="3" className="pv-soft" />
      <rect x="112" y="108" width="96" height="6" rx="3" className="pv-soft" />
      <rect x="112" y="120" width="96" height="6" rx="3" className="pv-soft" />
      <rect x="112" y="132" width="62" height="6" rx="3" className="pv-soft" />
      <rect x="112" y="154" width="40" height="6" rx="3" className="pv-cyan" />
    </>
  ),
  // — original music / score (waveform) —
  track: (
    <>
      {[12, 24, 36, 18, 48, 28, 56, 40, 62, 38, 54, 26, 44, 20, 34, 14].map((h, i) => (
        <rect
          key={i}
          x={58 + i * 13}
          y={100 - h / 2}
          width="6"
          height={h}
          rx="3"
          className={i % 4 === 0 ? "pv-brand" : "pv-soft"}
        />
      ))}
      <line x1="50" y1="100" x2="270" y2="100" className="pv-line" opacity="0.25" />
    </>
  ),
  // — image → 3D scene / visual universe —
  scene: (
    <>
      <rect x="40" y="30" width="240" height="140" rx="10" className="pv-frame" />
      <circle cx="212" cy="76" r="19" className="pv-brand" opacity="0.85" />
      <path d="M40 158 L98 100 L150 158 Z" className="pv-panel" />
      <path d="M118 158 L192 84 L262 158 Z" className="pv-soft" opacity="0.7" />
      <line x1="40" y1="158" x2="280" y2="158" className="pv-brand-s" opacity="0.4" />
      <line x1="100" y1="170" x2="150" y2="158" className="pv-brand-s" opacity="0.3" />
      <line x1="220" y1="170" x2="172" y2="158" className="pv-brand-s" opacity="0.3" />
    </>
  ),
  // — parametric CAD part —
  part: (
    <>
      <rect x="92" y="54" width="136" height="92" rx="12" className="pv-brand-s" />
      <circle cx="116" cy="78" r="7" className="pv-line" />
      <circle cx="204" cy="78" r="7" className="pv-line" />
      <circle cx="116" cy="122" r="7" className="pv-line" />
      <circle cx="204" cy="122" r="7" className="pv-line" />
      <circle cx="160" cy="100" r="17" className="pv-brand-s" />
      <circle cx="160" cy="100" r="6" className="pv-line" />
      <line x1="92" y1="40" x2="228" y2="40" className="pv-brand-s" opacity="0.45" />
      <line x1="92" y1="36" x2="92" y2="44" className="pv-brand-s" opacity="0.45" />
      <line x1="228" y1="36" x2="228" y2="44" className="pv-brand-s" opacity="0.45" />
    </>
  ),
  // — live sky / orbit —
  sky: (
    <>
      <rect x="40" y="30" width="240" height="140" rx="10" className="pv-frame" />
      <ellipse cx="160" cy="100" rx="92" ry="40" className="pv-brand-s" opacity="0.55" />
      <circle cx="160" cy="100" r="11" className="pv-violet" />
      <circle cx="252" cy="100" r="4" className="pv-cyan" />
      <circle cx="84" cy="58" r="2" className="pv-ink" />
      <circle cx="116" cy="70" r="2.4" className="pv-ink" />
      <circle cx="98" cy="92" r="1.8" className="pv-ink" />
      <line x1="84" y1="58" x2="116" y2="70" className="pv-line" opacity="0.4" />
      <line x1="116" y1="70" x2="98" y2="92" className="pv-line" opacity="0.4" />
      <circle cx="226" cy="142" r="2.2" className="pv-ink" />
      <circle cx="248" cy="150" r="1.8" className="pv-ink" />
    </>
  ),
  // — molecular structure —
  molecule: (
    <>
      <polygon points="160,50 197,71 197,113 160,134 123,113 123,71" className="pv-brand-s" />
      <polygon points="160,64 185,78 185,106 160,120 135,106 135,78" className="pv-line" opacity="0.4" />
      <circle cx="160" cy="50" r="6" className="pv-brand" />
      <circle cx="197" cy="71" r="6" className="pv-cyan" />
      <circle cx="197" cy="113" r="6" className="pv-brand" />
      <circle cx="160" cy="134" r="6" className="pv-cyan" />
      <circle cx="123" cy="113" r="6" className="pv-brand" />
      <circle cx="123" cy="71" r="6" className="pv-cyan" />
      <line x1="197" y1="71" x2="232" y2="58" className="pv-line" />
      <circle cx="238" cy="56" r="5" className="pv-violet" />
      <line x1="123" y1="113" x2="90" y2="128" className="pv-line" />
      <circle cx="84" cy="131" r="5" className="pv-violet" />
    </>
  ),
  // — match dossier (football pitch) —
  pitch: (
    <>
      <rect x="48" y="28" width="224" height="144" rx="10" className="pv-frame" />
      <line x1="160" y1="28" x2="160" y2="172" className="pv-line" opacity="0.5" />
      <circle cx="160" cy="100" r="26" className="pv-line" opacity="0.5" />
      <rect x="48" y="70" width="26" height="60" rx="2" className="pv-line" opacity="0.5" />
      <rect x="246" y="70" width="26" height="60" rx="2" className="pv-line" opacity="0.5" />
      <circle cx="96" cy="70" r="4" className="pv-brand" />
      <circle cx="110" cy="118" r="4" className="pv-brand" />
      <circle cx="132" cy="92" r="4" className="pv-brand" />
      <circle cx="210" cy="80" r="4" className="pv-cyan" />
      <circle cx="224" cy="124" r="4" className="pv-cyan" />
      <circle cx="190" cy="104" r="4" className="pv-cyan" />
      <circle cx="160" cy="100" r="3" className="pv-ink" />
    </>
  ),
  // — trip itinerary (route + pins) —
  map: (
    <>
      <rect x="40" y="30" width="240" height="140" rx="10" className="pv-frame" />
      <path d="M70 150 C 112 112 146 150 178 98 S 240 70 252 58" className="pv-brand-s" strokeDasharray="6 7" fill="none" />
      <circle cx="70" cy="150" r="7" className="pv-brand" />
      <circle cx="70" cy="150" r="2.6" className="pv-frame" />
      <circle cx="178" cy="98" r="7" className="pv-cyan" />
      <circle cx="178" cy="98" r="2.6" className="pv-frame" />
      <circle cx="252" cy="58" r="7" className="pv-violet" />
      <circle cx="252" cy="58" r="2.6" className="pv-frame" />
    </>
  ),
  // — event staging (table top-down) —
  table: (
    <>
      <rect x="40" y="30" width="240" height="140" rx="10" className="pv-frame" />
      <ellipse cx="160" cy="100" rx="80" ry="44" className="pv-panel" />
      <ellipse cx="160" cy="100" rx="80" ry="44" className="pv-line" />
      <circle cx="100" cy="100" r="9" className="pv-line" />
      <circle cx="160" cy="68" r="9" className="pv-line" />
      <circle cx="220" cy="100" r="9" className="pv-line" />
      <circle cx="160" cy="132" r="9" className="pv-line" />
      <rect x="150" y="90" width="20" height="20" rx="4" className="pv-brand" opacity="0.85" />
    </>
  ),
  // — plan / schedule (gantt) —
  plan: (
    <>
      <rect x="40" y="30" width="240" height="140" rx="10" className="pv-frame" />
      <rect x="64" y="50" width="90" height="14" rx="4" className="pv-brand" />
      <rect x="100" y="74" width="120" height="14" rx="4" className="pv-cyan" opacity="0.85" />
      <rect x="72" y="98" width="78" height="14" rx="4" className="pv-panel" />
      <rect x="124" y="122" width="100" height="14" rx="4" className="pv-violet" opacity="0.85" />
      <rect x="48" y="50" width="10" height="14" rx="3" className="pv-soft" />
      <rect x="48" y="74" width="10" height="14" rx="3" className="pv-soft" />
      <rect x="48" y="98" width="10" height="14" rx="3" className="pv-soft" />
      <rect x="48" y="122" width="10" height="14" rx="3" className="pv-soft" />
      <line x1="150" y1="44" x2="150" y2="150" className="pv-brand-s" opacity="0.5" strokeDasharray="4 4" />
    </>
  ),
  // — short film (storyboard strip) —
  film: (
    <>
      <rect x="44" y="54" width="232" height="92" rx="8" className="pv-frame" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={"t" + i} x={52 + i * 28} y="58" width="10" height="7" rx="1.5" className="pv-soft" />
      ))}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={"b" + i} x={52 + i * 28} y="135" width="10" height="7" rx="1.5" className="pv-soft" />
      ))}
      <rect x="58" y="72" width="64" height="56" rx="3" className="pv-panel" />
      <rect x="128" y="72" width="64" height="56" rx="3" className="pv-panel" />
      <rect x="198" y="72" width="64" height="56" rx="3" className="pv-panel" />
      <circle cx="78" cy="92" r="8" className="pv-brand" opacity="0.85" />
      <path d="M58 128 L86 108 L122 128 Z" className="pv-soft" opacity="0.6" />
      <circle cx="230" cy="92" r="8" className="pv-cyan" opacity="0.8" />
    </>
  ),
  // — manuscript (open book) —
  book: (
    <>
      <path d="M160 46 C 122 38 84 42 58 52 V 156 C 84 146 122 142 160 150 Z" className="pv-panel" />
      <path d="M160 46 C 198 38 236 42 262 52 V 156 C 236 146 198 142 160 150 Z" className="pv-panel" />
      <path d="M160 46 V 150" className="pv-line" />
      <path d="M160 46 C 122 38 84 42 58 52 V 156 C 84 146 122 142 160 150 Z" className="pv-line" fill="none" />
      <path d="M160 46 C 198 38 236 42 262 52 V 156 C 236 146 198 142 160 150 Z" className="pv-line" fill="none" />
      <rect x="74" y="70" width="66" height="5" rx="2.5" className="pv-soft" />
      <rect x="74" y="82" width="66" height="5" rx="2.5" className="pv-soft" />
      <rect x="74" y="94" width="50" height="5" rx="2.5" className="pv-soft" />
      <rect x="180" y="70" width="66" height="5" rx="2.5" className="pv-soft" />
      <rect x="180" y="82" width="50" height="5" rx="2.5" className="pv-soft" />
      <rect x="150" y="40" width="10" height="30" rx="2" className="pv-brand" />
    </>
  ),
  // — fashion (garment croquis) —
  garment: (
    <>
      <circle cx="160" cy="44" r="9" className="pv-line" />
      <path d="M124 76 L160 60 L196 76" className="pv-line" fill="none" />
      <path d="M134 76 L118 150 L202 150 L186 76 Z" className="pv-brand" opacity="0.85" />
      <path d="M134 76 L118 150 L202 150 L186 76 Z" className="pv-line" fill="none" />
      <path d="M148 78 L160 96 L172 78" className="pv-frame" />
      <line x1="160" y1="96" x2="160" y2="150" className="pv-cyan" opacity="0.6" />
      <line x1="128" y1="118" x2="192" y2="118" className="pv-line" opacity="0.4" />
    </>
  ),
  // — space (floor plan) —
  space: (
    <>
      <rect x="48" y="36" width="224" height="128" rx="6" className="pv-brand-s" />
      <line x1="160" y1="36" x2="160" y2="108" className="pv-brand-s" />
      <line x1="160" y1="108" x2="272" y2="108" className="pv-brand-s" />
      <path d="M160 88 A20 20 0 0 1 140 108" className="pv-line" fill="none" />
      <rect x="66" y="54" width="70" height="40" rx="4" className="pv-panel" />
      <rect x="66" y="120" width="40" height="30" rx="4" className="pv-soft" />
      <rect x="186" y="54" width="64" height="36" rx="4" className="pv-soft" />
      <rect x="196" y="124" width="60" height="26" rx="4" className="pv-panel" />
    </>
  ),
  // — viral reel (vertical video) —
  reel: (
    <>
      <rect x="128" y="20" width="64" height="160" rx="11" className="pv-frame" />
      <rect x="133" y="25" width="54" height="150" rx="8" className="pv-panel" />
      <circle cx="160" cy="92" r="18" className="pv-brand" opacity="0.85" />
      <path d="M154 84 L172 92 L154 100 Z" className="pv-frame" />
      <rect x="140" y="150" width="40" height="5" rx="2.5" className="pv-ink" />
      <rect x="140" y="160" width="28" height="5" rx="2.5" className="pv-soft" />
      <circle cx="184" cy="128" r="3" className="pv-cyan" />
      <circle cx="184" cy="140" r="3" className="pv-cyan" />
    </>
  ),
};

// A few types share a drawing.
PREVIEWS.podcast = PREVIEWS.track;
PREVIEWS.graph = PREVIEWS.molecule;

// Generic artifact coin for any unmapped type.
const FALLBACK = (
  <>
    <rect x="108" y="44" width="104" height="120" rx="12" className="pv-frame" />
    <rect x="124" y="64" width="56" height="9" rx="4" className="pv-brand" />
    <rect x="124" y="84" width="72" height="6" rx="3" className="pv-soft" />
    <rect x="124" y="96" width="72" height="6" rx="3" className="pv-soft" />
    <rect x="124" y="108" width="48" height="6" rx="3" className="pv-soft" />
  </>
);

// Short uppercase tag shown on the card (the deliverable's "kind"). Exported so
// the Gallery (work-wall cabinet) labels its filter chips from the same source.
export const TYPE_LABEL: Record<string, string> = {
  app: "App · HTML", site: "Site · HTML", board: "Board", deck: "Deck",
  dashboard: "Dashboard", chart: "Analysis", doc: "Doc", track: "Audio",
  podcast: "Podcast", scene: "3D scene", part: "CAD", sky: "Live page",
  molecule: "Structure", graph: "Map", pitch: "Dossier", map: "Itinerary",
  table: "Event", plan: "Plan", film: "Film", book: "Manuscript",
  garment: "Fashion", space: "Space", reel: "Reel",
};

// The typed faux-render. Exported so the Gallery wall draws work tiles from the
// same 24 SVGs as the welcome cards — one source of truth for "what the
// deliverable looks like". `slice` (default) crops to fill; `meet` letterboxes
// to show the whole render (used by the larger Gallery tiles).
export function Preview({ type, fit = "slice" }: { type: string; fit?: "slice" | "meet" }) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio={`xMidYMid ${fit}`} aria-hidden="true">
      {PREVIEWS[type] ?? FALLBACK}
    </svg>
  );
}

// A single large example card that auto-advances through the expert's catalogue
// (one every `intervalMs`), with clickable dots to jump. The whole point of the
// atelier empty canvas: project ONE polished "here's what I'll build" at a time
// rather than a grid that reads like a menu. Clicking it launches the prompt.
export function DeliverableSpotlight({ examples, onPick, heading, intervalMs = 7000 }: {
  examples: DeliverableExample[];
  onPick: (prompt: string) => void;
  heading?: string;
  intervalMs?: number;
}) {
  const [idx, setIdx] = useState(0);
  // new expert → new catalogue → restart from the first.
  useEffect(() => { setIdx(0); }, [examples]);
  useEffect(() => {
    if (examples.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % examples.length), intervalMs);
    return () => clearInterval(t);
  }, [examples.length, intervalMs]);

  const ex = examples[idx] ?? examples[0];
  if (!ex) return null;
  return (
    <div className="dspot">
      {heading && <div className="dwrap-h">{heading}</div>}
      {/* key={idx} remounts the card so the fade-in animation replays each turn */}
      <button key={idx} className="dspot-card" onClick={() => onPick(ex.prompt)} title={ex.prompt}>
        <div className="dspot-prev"><Preview type={ex.type} /></div>
        <div className="dspot-body">
          <div className="dcard-top">
            <span className="dcard-type"><i />{TYPE_LABEL[ex.type] ?? "Deliverable"}</span>
            <span className="dcard-open">Start →</span>
          </div>
          <span className="dspot-title">{ex.title}</span>
          <span className="dspot-desc">{ex.desc}</span>
        </div>
      </button>
      {examples.length > 1 && (
        <div className="dspot-dots">
          {examples.map((_, i) => (
            <button
              key={i}
              className={"dspot-dot" + (i === idx ? " on" : "")}
              onClick={() => setIdx(i)}
              aria-label={`Exemple ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DeliverableExamples({ examples, onPick, heading = "What I make", limit = 3 }: {
  examples: DeliverableExample[];
  onPick: (prompt: string) => void;
  heading?: string;
  limit?: number;
}) {
  return (
    <div className="dwrap">
      <div className="dwrap-h">{heading}</div>
      <div className="dgrid">
        {examples.slice(0, limit).map((ex, i) => (
          <button key={i} className="dcard" onClick={() => onPick(ex.prompt)} title={ex.prompt}>
            <div className="dcard-prev"><Preview type={ex.type} /></div>
            <div className="dcard-body">
              <div className="dcard-top">
                <span className="dcard-type"><i />{TYPE_LABEL[ex.type] ?? "Deliverable"}</span>
                <span className="dcard-open">Start →</span>
              </div>
              <span className="dcard-title">{ex.title}</span>
              <span className="dcard-desc">{ex.desc}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
