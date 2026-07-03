import SplitMark from "../shared/SplitMark";
import { HARNESSES, logoUrl, type Harness } from "../shared/harnesses";
import { vars } from "../shared/ui";

// The home hero: the majordome (the one runtime) at the centre, with the
// swappable agent engines orbiting it — Claude, Codex, Gemini, Mistral… each a
// brand-tinted satellite riding a slow ring. Tells the whole Split story in one
// glance: "one runtime to bind them all". Inspired by the radial-orbital-timeline
// pattern, but with real depth (two counter-spinning rings) and Split's own marks.
//
// Mechanics (CSS): each ring (`.orbit-track`) spins; inside, every satellite is
// statically placed at its angle and kept upright, and a nested `.orbit-counter`
// reverse-spins at the same duration so the logo never tumbles. Two rings turn in
// opposite directions for a parallax read. All of it stops under
// prefers-reduced-motion (see app.css).

// Split the league across two rings — 4 inner, the rest outer. Order is the
// HARNESSES order, so the headline engines (Claude/Codex/Gemini) ride the
// tighter, faster inner ring.
const INNER: Harness[] = HARNESSES.slice(0, 4);
const OUTER: Harness[] = HARNESSES.slice(4);

function Ring({ ring, bodies, active, enabled, onPick }: {
  ring: "inner" | "outer";
  bodies: Harness[];
  active: string;
  enabled?: string[];
  onPick?: (id: string) => void;
}) {
  return (
    <div className={"orbit-track " + ring} aria-hidden={!onPick}>
      {bodies.map((h, i) => {
        // An engine the user hasn't activated reads as "asleep" — dim, no glow.
        const asleep = enabled ? !enabled.includes(h.id) : false;
        return (
          <div
            key={h.id}
            className="orbit-sat"
            // --a = this satellite's angle on the ring (evenly spaced).
            style={vars({ "--a": `${(i / bodies.length) * 360}deg`, "--brand": h.brand })}
          >
            <div className="orbit-counter">
              <button
                type="button"
                className={"orbit-body" + (h.id === active ? " active" : "") + (asleep ? " asleep" : "")}
                title={asleep ? `${h.label} · ${h.vendor} — tap to add` : `${h.label} · ${h.vendor}`}
                aria-label={h.label}
                onClick={onPick ? () => onPick(h.id) : undefined}
                tabIndex={onPick ? 0 : -1}
              >
                <span className="orbit-logo" style={vars({ "--logo": logoUrl(h.id) })} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MajordomeOrbit({
  speaking = false,
  active = "claude",
  enabled,
  onPick,
  mini = false,
  diameter,
  coreSize,
}: {
  speaking?: boolean;
  active?: string;
  enabled?: string[];
  onPick?: (id: string) => void;
  mini?: boolean;
  /** Override the orbit diameter (any CSS length, e.g. a clamp()). Drives the
   *  ring radii. Defaults to the CSS `--d` for the home bar. */
  diameter?: string;
  /** Centre majordome size in px. Defaults to 116 (60 when `mini`). */
  coreSize?: number;
}) {
  return (
    <div className={"orbit" + (mini ? " mini" : "")} style={diameter ? vars({ "--d": diameter }) : undefined}>
      {/* the faint guide rings the satellites ride */}
      <span className="orbit-guide g1" aria-hidden="true" />
      <span className="orbit-guide g2" aria-hidden="true" />

      <Ring ring="outer" bodies={OUTER} active={active} enabled={enabled} onPick={onPick} />
      <Ring ring="inner" bodies={INNER} active={active} enabled={enabled} onPick={onPick} />

      {/* the centre — the one runtime, levitating */}
      <div className="orbit-core">
        <span className="orbit-aura" aria-hidden="true" />
        <div className="split-levitate">
          <SplitMark size={coreSize ?? (mini ? 60 : 116)} isSpeaking={speaking} bowOnClick />
        </div>
      </div>
    </div>
  );
}
