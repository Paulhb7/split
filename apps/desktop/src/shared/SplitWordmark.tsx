import { useId, type CSSProperties } from "react";
import majordomeUrl from "./majordome.svg";

// Bbox of the majordome figure within majordome.svg's 1024×544 canvas — the
// same crop SplitMark uses. The dot <svg> views exactly this region so the
// silhouette renders tight (no square padding), faithful to the design planche.
const FIG_X = 388;
const FIG_Y = 110;
const FIG_W = 249;
const FIG_H = 348;

export interface SplitWordmarkProps {
  /** Silhouette colour for the dot. Defaults to the skin's `--mark`/`--brand`. */
  color?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  /** Accessible label for the lockup. */
  title?: string;
}

// The "split" lockup — the majordome silhouette stands in for the dot of the
// "i" (a dotless ı carries the stem). The pocket signature: recognisable
// without the word. Typography (size / weight / letter-spacing / style) is
// INHERITED from the parent (.wm), so every per-skin override keeps working —
// only the structural bits and the brand-tinted dot live here. The dot is
// sized in `em`, so it tracks the inherited font-size automatically; nudge its
// height with `--swm-rise` if a skin's metrics want it higher or lower.
//
// The silhouette reuses majordome.svg as an SVG luminance mask — the same
// bullet-proof recolour path as SplitMark, because `currentColor` does not
// survive WebKit's <image>/<symbol> boundary (see SplitMark's note).
export default function SplitWordmark({ color, className, style, onClick, title = "split" }: SplitWordmarkProps) {
  // One mask id per instance (stable across SSR/CSR, collision-free).
  const maskId = useId();
  return (
    <span
      className={"swm" + (className ? " " + className : "")}
      style={style}
      onClick={onClick}
      role="img"
      aria-label={title}
    >
      <span aria-hidden="true">spl</span>
      <span className="swm-i" aria-hidden="true">
        {/* U+0131 LATIN SMALL LETTER DOTLESS I — the stem, sans its dot. */}
        {"ı"}
        <svg
          className="swm-dot"
          viewBox={`${FIG_X} ${FIG_Y} ${FIG_W} ${FIG_H}`}
          style={{ color: color ?? "var(--mark, var(--brand))" }}
        >
          <defs>
            <mask id={maskId}>
              <image href={majordomeUrl} x="0" y="0" width="1024" height="544" />
            </mask>
          </defs>
          <rect x={FIG_X} y={FIG_Y} width={FIG_W} height={FIG_H} fill="currentColor" mask={`url(#${maskId})`} />
        </svg>
      </span>
      <span aria-hidden="true">t</span>
    </span>
  );
}
