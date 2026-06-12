import { useId, useState, type CSSProperties } from "react";
import majordomeUrl from "./majordome.svg";

// Split's house mark — the majordome silhouette painted in `color`, no disc.
// Scales from 16px (chrome) to 320px (onboarding) without anti-aliasing drama.
// Default tint is the current skin's `--brand` (via CSS `currentColor`), so
// switching skin retints the mark automatically — Bright orange, Tokyo violet,
// Ghibli sky, etc. Callers can still override by passing an explicit `color`
// prop (e.g. an engine brand). Speaking state (isSpeaking) sweeps a glass
// reflection slowly across the silhouette — the app-icon gloss in motion (the
// `.sm-sheen` rect rides the same luminance mask, so the highlight only shows
// over the figure). Replaces the old brand glow. See design/majordome-planche.html.
//
// The silhouette source is `majordome.svg` (1024×544 canvas, figure occupies
// approximately x:388-637, y:110-458 — that bbox is what the nested <svg>
// crops to). The figure's <path> in the source SVG is filled `#ffffff`
// directly, so we use it as an SVG luminance mask: a solid-coloured <rect>
// painted through the mask renders the silhouette in `currentColor`. Tried
// earlier: a CSS `filter: brightness(0) invert(1) ...` recoloring trick on
// the raw <image>, but it's unreliable in WebKit (image href ignored the
// filter). Mask-based recoloring is the bullet-proof path.
export interface SplitMarkProps {
  size?: number;
  /** Silhouette colour. Defaults to the active skin's `--brand` via currentColor. */
  color?: string;
  /** Active state: a glass reflection sweeps across the mark (it "goes alive"). */
  isSpeaking?: boolean;
  /**
   * Make the silhouette clickable: a click plays a one-shot bow ("la
   * révérence" — the majordome's "à votre service" in motion). Off by
   * default so chrome/decorative marks stay inert.
   */
  bowOnClick?: boolean;
  className?: string;
  style?: CSSProperties;
}

// Bbox of the majordome figure within the source SVG's 1024×544 canvas.
// Used by the nested <svg> below to crop the surrounding whitespace.
const FIG_X = 388;
const FIG_Y = 110;
const FIG_W = 249;
const FIG_H = 348;

// Inset of the figure inside the 200×200 badge. Tighter than the disc-era
// 32px — without a coloured circle behind, the silhouette can breathe up to
// the edges without crowding.
const INSET = 12;

export default function SplitMark({
  size = 96,
  color,
  isSpeaking = false,
  bowOnClick = false,
  className,
  style,
}: SplitMarkProps) {
  // One mask per instance — `useId` keeps refs stable across SSR/CSR and
  // prevents collisions when several SplitMarks live on the same page.
  const maskId = useId();
  // One-shot bow on click. While bowing the CSS animation owns `transform`
  // (overriding the inline scale below); `onAnimationEnd` clears the flag so
  // the mark settles back to its idle/speaking transform. Re-clicks during
  // the ~1.1s bow are ignored so it never stutters mid-incline.
  const [bowing, setBowing] = useState(false);

  const inner = 200 - INSET * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={[className, bowing ? "split-mark-bow" : ""].filter(Boolean).join(" ") || undefined}
      onClick={bowOnClick ? () => setBowing(true) : undefined}
      onAnimationEnd={bowing ? () => setBowing(false) : undefined}
      role={bowOnClick ? "button" : undefined}
      aria-label={bowOnClick ? "À votre service" : undefined}
      style={{
        display: "block",
        // Bow pivots at the feet (bottom-centre), like the planche-2 bowman.
        transformOrigin: "50% 100%",
        cursor: bowOnClick ? "pointer" : undefined,
        transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        transform: isSpeaking ? "scale(1.06)" : "scale(1)",
        // `color` flows down to the <rect>'s `currentColor` fill. Default
        // (no prop) → the skin's `--mark` if it sets one (Ember paints the
        // silhouette plain white on dark / black on light), else `--brand`.
        color: color ?? "var(--mark, var(--brand))",
        ...style,
      }}
    >
      <defs>
        <mask id={maskId}>
          <svg
            x={INSET}
            y={INSET}
            width={inner}
            height={inner}
            viewBox={`${FIG_X} ${FIG_Y} ${FIG_W} ${FIG_H}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <image href={majordomeUrl} x="0" y="0" width="1024" height="544" />
          </svg>
        </mask>
      </defs>
      {/* Silhouette + the sweeping sheen ride the same mask, so the white
          highlight only ever shows over the figure (see app.css .sm-sheen). */}
      <g mask={`url(#${maskId})`}>
        <rect width="200" height="200" fill="currentColor" />
        {isSpeaking && <rect className="sm-sheen" x="84" y="-34" width="34" height="268" fill="#ffffff" />}
      </g>
    </svg>
  );
}
