import type { ReactNode } from "react";
import type { ExpertKind } from "./experts";
import { vars } from "./ui";

// Expert crest — a generative sigil per expert `kind`, etched silver inside a
// glass coin whose glow tracks the active accent (`--brand` — the skin, or the
// engine colour in session contexts). One archetype per kind; the mark stays
// monochrome so the skin/engine carries the colour, like the house chess object.
// See design/expert-crests-proposal.html for the system this implements.
const ARCHETYPES: Record<ExpertKind, ReactNode> = {
  advisor: (
    <>
      <ellipse cx="24" cy="24" rx="18" ry="11" />
      <circle cx="24" cy="24" r="5.5" />
      <circle className="dot" cx="24" cy="24" r="1.8" />
    </>
  ),
  analyst: (
    <>
      <path d="M11 33 H37" />
      <path d="M16 33 V25" />
      <path d="M24 33 V13" />
      <path d="M32 33 V20" />
      <path d="M14 21 L23 12 L29 17 L36 9" />
    </>
  ),
  builder: (
    <>
      <path d="M24 8 L39 34 H9 Z" />
      <path d="M24 19 L32 33 H16 Z" />
      <circle className="dot" cx="24" cy="28" r="1.8" />
    </>
  ),
  operator: (
    <>
      <polygon points="24,15 31,19 31,29 24,33 17,29 17,19" />
      <circle cx="24" cy="9" r="2.4" />
      <circle cx="38" cy="31" r="2.4" />
      <circle cx="10" cy="31" r="2.4" />
      <path d="M24 15 V11M31 24 L36 30M17 24 L12 30" strokeOpacity=".6" />
    </>
  ),
  creator: (
    <>
      <path d="M24 9 V19M24 29 V39M9 24 H19M29 24 H39M14 14 L20 20M28 28 L34 34M34 14 L28 20M20 28 L14 34" strokeOpacity=".85" />
      <circle cx="24" cy="24" r="4.5" />
    </>
  ),
  finder: (
    <>
      <circle cx="21" cy="21" r="11" />
      <path d="M29 29 L38 38" />
      <path d="M21 15 V27M15 21 H27" strokeOpacity=".55" />
    </>
  ),
  researcher: (
    <>
      <ellipse cx="24" cy="24" rx="17" ry="7" transform="rotate(45 24 24)" />
      <ellipse cx="24" cy="24" rx="17" ry="7" transform="rotate(-45 24 24)" />
      <circle className="dot" cx="24" cy="24" r="2.4" />
    </>
  ),
  coach: (
    <>
      <path d="M11 34 H18 V28" />
      <path d="M21 34 H28 V21" />
      <path d="M31 34 H38 V14" />
      <path d="M30 12 H38 V20" strokeOpacity=".7" />
    </>
  ),
  organizer: (
    <>
      <rect x="11" y="12" width="26" height="26" rx="4" />
      <path d="M17 21 H31" />
      <path d="M17 27 H31" />
      <path d="M17 33 H25" strokeOpacity=".6" />
    </>
  ),
  recruiter: (
    <>
      <circle cx="24" cy="24" r="15" />
      <circle cx="24" cy="20" r="4.5" />
      <path d="M16 32 a8 8 0 0 1 16 0" />
    </>
  ),
};

// Fallback when kind is missing/unknown — a calm concentric ring.
const FALLBACK: ReactNode = (
  <>
    <circle cx="24" cy="24" r="14" />
    <circle cx="24" cy="24" r="6" />
  </>
);

// Stable string hash → seed. Same expert always yields the same crest, so the
// mark reads as that expert's identity wherever it appears.
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Generative rim: a milled coin edge whose dot-count and rotation come from the
// seed. This is what makes two same-`kind` experts (e.g. four "creator"
// geniuses) distinct without changing the central archetype. Fades to nothing
// at small sizes (dots become sub-pixel) — distinctness matters at gallery size.
function rimDots(seed: string): ReactNode {
  const h = hashSeed(seed);
  const count = 9 + (h % 5); // 9..13
  const phase = (h >> 3) % 360;
  const dots: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((phase + (i * 360) / count) * Math.PI) / 180;
    dots.push(
      <circle key={i} className="dot" cx={24 + 22 * Math.cos(a)} cy={24 + 22 * Math.sin(a)} r="0.9" />,
    );
  }
  return <g opacity="0.5">{dots}</g>;
}

export function Crest({
  kind,
  seed,
  size = 40,
  className,
  title,
  mint,
}: {
  kind?: ExpertKind;
  /** Per-expert seed (the slug) → unique milled rim, so same-kind experts differ. */
  seed?: string;
  size?: number;
  className?: string;
  title?: string;
  /** Optional struck initial — a coin "mint-mark". Restores per-expert identity
   * where the kind archetype alone collapses same-kind figures (the five
   * `creator` geniuses share one sigil). One serif glyph; off by default so
   * every other crest surface is untouched. */
  mint?: string;
}) {
  const arch = kind ? (ARCHETYPES[kind] ?? FALLBACK) : FALLBACK;
  return (
    <span
      className={"crest" + (className ? " " + className : "")}
      style={vars({ "--cs": `${size}px` })}
      title={title}
    >
      <svg className="crest-mark" viewBox="0 0 48 48" aria-hidden="true">
        {seed ? rimDots(seed) : null}
        <g transform="translate(24 24) scale(0.84) translate(-24 -24)">{arch}</g>
      </svg>
      {mint ? <span className="crest-mint" aria-hidden="true">{mint}</span> : null}
    </span>
  );
}

export default Crest;
