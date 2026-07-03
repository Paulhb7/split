import { useId, type ReactNode } from "react";
import type { ExpertKind } from "./experts";
import { vars } from "./ui";
import majordomeUrl from "./majordome.svg";

// Showcase threshold (px). Below it, crests are chrome — just the etched glyph,
// no ornaments. The house signet (majordome in a ~16px sphere) collapses to a
// blob at chrome size, and the milled rim (rimDots) becomes sub-pixel grit
// around the mark, so both are reserved for showcase crests (gallery, hero,
// onboarding). At chrome size (roster rows, picker, chips) only the glyph shows.
const HOUSE_MIN = 44;

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

// Per-EXPERT seals — a glyph tied to what each one actually does, struck in the
// same etched-glass coin as the kind archetypes. Keyed by slug, these win over
// the kind archetype (see `arch` below), so the five "creator" geniuses no
// longer share one sigil: Wolfgang gets notes, Kubrick a clapperboard, Brontë a
// quill, etc. Same stroke language (48×48, fill via `.dot`). See
// design/expert-seals-proposal.html for the full set + alternates.
const SEALS: Record<string, ReactNode> = {
  // — geniuses —
  genius_curie: (
    <>
      <polygon points="37,24 30.5,35.3 17.5,35.3 11,24 17.5,12.7 30.5,12.7" />
      <circle className="dot" cx="37" cy="24" r="1.7" />
      <circle className="dot" cx="30.5" cy="35.3" r="1.7" />
      <circle className="dot" cx="17.5" cy="35.3" r="1.7" />
      <circle className="dot" cx="11" cy="24" r="1.7" />
      <circle className="dot" cx="17.5" cy="12.7" r="1.7" />
      <circle className="dot" cx="30.5" cy="12.7" r="1.7" />
    </>
  ),
  genius_tesla: <path d="M27 9 L16 27 L23 27 L20 39 L33 20 L25 20 Z" />,
  genius_wolfgang: (
    <>
      <path d="M20 34 V14 L34 11 V31" />
      <path d="M20 18 L34 15" />
      <ellipse className="dot" cx="16.5" cy="34.5" rx="4" ry="3" transform="rotate(-20 16.5 34.5)" />
      <ellipse className="dot" cx="30.5" cy="31.5" rx="4" ry="3" transform="rotate(-20 30.5 31.5)" />
    </>
  ),
  genius_homer: (
    <>
      <rect x="19" y="9" width="10" height="17" rx="5" />
      <path d="M15 24 a9 9 0 0 0 18 0" />
      <path d="M24 33 V39 M19 39 H29" />
    </>
  ),
  genius_kubrick: (
    <>
      <rect x="12" y="22" width="24" height="15" rx="2" />
      <path d="M12 22 L35 17 L37 23 L14 28" />
      <path d="M19 18 L21 24 M26 17 L28 23 M33 16 L35 22" strokeWidth="1.5" />
    </>
  ),
  genius_davinci: (
    <>
      <rect x="13" y="19" width="17" height="17" />
      <path d="M13 19 L21 11 L38 11 L30 19 M30 36 L38 28 L38 11 M21 11 L21 28 L13 36" strokeWidth="1.6" />
    </>
  ),
  genius_ride: (
    <>
      <circle cx="23" cy="25" r="9" />
      <ellipse cx="23" cy="25" rx="17" ry="5.5" transform="rotate(-22 23 25)" />
      <path d="M36 11 L36 17 M33 14 L39 14" strokeWidth="1.6" />
    </>
  ),
  genius_alfred: (
    <>
      <path d="M11 17 L23 24 L11 31 Z" />
      <path d="M37 17 L25 24 L37 31 Z" />
      <rect className="dot" x="21.5" y="20.5" width="5" height="7" rx="1.4" />
    </>
  ),
  genius_socrates: (
    <>
      <path d="M13 12 H35 a4 4 0 0 1 4 4 V27 a4 4 0 0 1 -4 4 H22 L15 37 L16 31 H13 a4 4 0 0 1 -4 -4 V16 a4 4 0 0 1 4 -4 Z" />
      <path d="M21 19 a3 3 0 0 1 6 0 c0 3 -3 2.5 -3 5" strokeWidth="1.6" />
      <circle className="dot" cx="24" cy="27" r="1.3" />
    </>
  ),
  genius_indiana: (
    <>
      <circle cx="24" cy="24" r="14" />
      <path className="dot" d="M24 13 L28 24 L24 28 L20 24 Z" />
      <path d="M24 35 L20 24 L24 20 L28 24 Z" />
      <circle className="dot" cx="24" cy="24" r="1.6" />
    </>
  ),
  // — working hands —
  consultant: (
    <>
      <rect x="11" y="12" width="26" height="19" rx="2" />
      <path d="M16 26 L21 21 L25 24 L32 16" />
      <path d="M30 16 H32 V18" strokeWidth="1.5" />
      <path d="M24 31 V36 M18 36 H30" strokeWidth="1.6" />
    </>
  ),
  scientist: (
    <>
      <path d="M13 27 Q24 9 35 27" />
      <circle cx="13" cy="29" r="3.4" />
      <circle cx="35" cy="29" r="3.4" />
      <circle className="dot" cx="24" cy="16" r="2.2" />
    </>
  ),
  financier: (
    <>
      <path d="M16 13 V33" />
      <rect x="13" y="19" width="6" height="9" rx="1" />
      <path d="M24 11 V37" />
      <rect x="21" y="21" width="6" height="7" rx="1" />
      <path d="M32 16 V32" />
      <rect x="29" y="18" width="6" height="10" rx="1" />
    </>
  ),
  lawyer: (
    <>
      <path d="M24 11 V35 M18 37 H30" />
      <path d="M12 16 H36" />
      <circle className="dot" cx="24" cy="14" r="1.6" />
      <path d="M12 16 L8 24 a4.5 2 0 0 0 8 0 Z" strokeWidth="1.5" />
      <path d="M36 16 L32 24 a4.5 2 0 0 0 8 0 Z" strokeWidth="1.5" />
    </>
  ),
  data_analyst: (
    <>
      <path d="M13 12 V35 H37" />
      <path d="M16 31 L34 16" strokeDasharray="2 3" strokeWidth="1.4" />
      <circle className="dot" cx="18" cy="30" r="1.7" />
      <circle className="dot" cx="23" cy="26" r="1.7" />
      <circle className="dot" cx="28" cy="27" r="1.7" />
      <circle className="dot" cx="31" cy="20" r="1.7" />
      <circle className="dot" cx="34" cy="17" r="1.7" />
    </>
  ),
  engineer: (
    <>
      <path d="M19 16 L11 24 L19 32" />
      <path d="M29 16 L37 24 L29 32" />
      <path d="M26 13 L22 35" strokeWidth="1.6" />
    </>
  ),
  designer: (
    <>
      <rect x="9" y="13" width="30" height="22" rx="2.5" />
      <path d="M9 19 H39" />
      <circle className="dot" cx="13" cy="16" r="1.3" />
      <circle className="dot" cx="17.5" cy="16" r="1.3" />
      <circle className="dot" cx="22" cy="16" r="1.3" />
      <rect x="13" y="23" width="13" height="8" rx="1.5" />
      <path className="dot" d="M30 25 L30 39 L33 35.7 L35.4 40 L37 39.1 L34.6 35 L38.6 35 Z" />
    </>
  ),
  project_manager: (
    <>
      <path d="M12 12 V37" strokeDasharray="2 3" strokeWidth="1.4" />
      <rect className="dot" x="14" y="15" width="15" height="4.5" rx="2.2" />
      <rect className="dot" x="20" y="22" width="16" height="4.5" rx="2.2" />
      <rect className="dot" x="16" y="29" width="11" height="4.5" rx="2.2" />
    </>
  ),
  sales: (
    <>
      <circle cx="26" cy="22" r="12" />
      <circle cx="26" cy="22" r="6.5" />
      <circle className="dot" cx="26" cy="22" r="2" />
      <path d="M9 39 L26 22" strokeWidth="1.8" />
      <path d="M9 39 L9 33 M9 39 L15 39" strokeWidth="1.6" />
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

// Per-expert signature hue — curated (not seeded), stable. Drives the crest's
// relief glow + glyph tint (the "Relief coin" direction): the coin stays the
// etched-glass cabinet object, but each expert now reads as its own colour
// instead of the shared skin accent. Resolution: per-slug → per-kind → --brand
// (so any crest without a known seed/kind falls back to the old behaviour).
// See design/crest-relief-proposals.html (direction 1).
const KIND_HUE: Record<ExpertKind, string> = {
  researcher: "#5b8bff",
  advisor: "#b08948",
  analyst: "#4aa3df",
  builder: "#ff8a3c",
  creator: "#e85ad0",
  finder: "#c79a3c",
  operator: "#6b8cae",
  coach: "#5ec27a",
  organizer: "#6c8cff",
  recruiter: "#a3a05a",
};
const EXPERT_HUE: Record<string, string> = {
  // — supers —
  consultant: "#5b8bff", scientist: "#2fae9b", financier: "#3a9d5d", lawyer: "#9a6b3f",
  data_analyst: "#4aa3df", engineer: "#ff8a3c", designer: "#e85ad0", influencer: "#ff5c8a",
  project_manager: "#6c8cff", sales: "#e0a52e",
  // — geniuses —
  genius_davinci: "#e0603c", genius_karl: "#7c8696", genius_gaudi: "#ef7d57",
  genius_wolfgang: "#f2b53a", genius_homer: "#3f6fb0", genius_hitchcock: "#b23a48",
  genius_ride: "#3aa0d9", genius_curie: "#39d98a",
  genius_tesla: "#8b6cff", genius_alfred: "#6b8cae", genius_socrates: "#a3a05a",
  genius_indiana: "#c79a3c", genius_maradona: "#5aa9e6", genius_marcopolo: "#2bbfa0",
  genius_vatel: "#b5543f", genius_machiavelli: "#9e2b3a", genius_moriarty: "#355e7a",
  genius_faust: "#b5462a", genius_hannibal: "#7a2e3a", genius_loki: "#36b37e",
  // — coaches —
};
function hueFor(seed?: string, kind?: ExpertKind): string | undefined {
  if (seed && EXPERT_HUE[seed]) return EXPERT_HUE[seed];
  if (kind && KIND_HUE[kind]) return KIND_HUE[kind];
  return undefined;
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
  // Per-expert seal (keyed by the slug `seed`) wins; else the kind archetype;
  // else the calm ring. So same-kind experts now read as themselves.
  const arch = (seed ? SEALS[seed] : undefined) ?? (kind ? (ARCHETYPES[kind] ?? FALLBACK) : FALLBACK);
  // Per-expert signature hue → `--crest-c`; CSS falls back to --brand when unset.
  const hue = hueFor(seed, kind);
  // One id per instance (several crests share a page) → unique sphere
  // gradient + majordome mask, same pattern as SplitMark.
  const uid = useId();
  return (
    <span
      className={"crest" + (className ? " " + className : "")}
      style={vars({ "--cs": `${size}px`, ...(hue ? { "--crest-c": hue } : {}) })}
      title={title}
    >
      <svg className="crest-mark" viewBox="0 0 48 48" aria-hidden="true">
        <g transform="translate(24 24) scale(0.84) translate(-24 -24)">{arch}</g>
      </svg>
      {/* House signet — Split's majordome in a small glass sphere, struck
          bottom-right like a maker's poinçon. The <image> is solid white, so a
          brand-tinted rect painted through it renders the silhouette. */}
      {size >= HOUSE_MIN ? (
        <span className="crest-house" aria-hidden="true">
          <svg className="house-orb" viewBox="0 0 24 24">
            <defs>
              <radialGradient id={`${uid}g`} cx="36%" cy="28%" r="78%">
                {/* Stops/stroke/specular are CSS-driven (--orb-*) so the orb
                    tracks the skin: dark glass on dark skins (fallbacks), a
                    light "pearl" on light skins (see .crest-house in app.css). */}
                <stop className="orb-s0" offset="0%" />
                <stop className="orb-s1" offset="55%" />
                <stop className="orb-s2" offset="100%" />
              </radialGradient>
              <mask id={`${uid}m`}>
                <svg x="4.2" y="4" width="15.6" height="16" viewBox="388 110 249 348" preserveAspectRatio="xMidYMid meet">
                  <image href={majordomeUrl} x="0" y="0" width="1024" height="544" />
                </svg>
              </mask>
            </defs>
            <circle className="house-rim" cx="12" cy="12" r="11.2" fill={`url(#${uid}g)`} strokeWidth="0.8" />
            <rect className="house-fig" width="24" height="24" mask={`url(#${uid}m)`} />
            <ellipse className="house-spec" cx="8.6" cy="7.6" rx="3.4" ry="2" />
          </svg>
        </span>
      ) : null}
      {mint ? <span className="crest-mint" aria-hidden="true">{mint}</span> : null}
    </span>
  );
}

export default Crest;
