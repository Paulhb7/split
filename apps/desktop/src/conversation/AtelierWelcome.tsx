import type { ReactNode } from "react";
import { vars } from "../shared/ui";
import { Crest } from "../shared/Crest";
import type { ExpertMap } from "../shared/experts";
import { DeliverableExamples } from "./DeliverableExamples";

// Drifting starfield behind the atelier welcome crest. Positions are seeded once
// at module load (deterministic — no Math.random in render) so they don't
// re-scatter every time the welcome remounts on focus change.
const AW_STARS = Array.from({ length: 42 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  return {
    left: (r(1) * 100).toFixed(2) + "%",
    top: (r(2) * 100).toFixed(2) + "%",
    big: r(3) > 0.8,
    tw: (3 + r(4) * 5).toFixed(2) + "s",
    td: (r(5) * 6).toFixed(2) + "s",
  };
});

// The Atelier's pre-session launch surface: the armed expert's crest, greeting,
// and example/starter prompts over a drifting starfield. `children` is the
// composer footer — App owns the composer wiring, this owns the presentation.
export function AtelierWelcome({
  experts,
  expertSlug,
  expertLabel,
  onPick,
  children,
}: {
  experts: ExpertMap;
  expertSlug: string;
  expertLabel: string;
  onPick: (prompt: string) => void;
  children: ReactNode;
}) {
  const expert = experts[expertSlug];
  return (
    <div className="atelier-welcome">
      {/* atmosphere — concentrated blooms + drifting starfield behind the hero */}
      <div className="aw-atmos" aria-hidden="true">
        <i className="aw-bloom b2" /><i className="aw-bloom b3" /><i className="aw-bloom b1" />
        <div className="aw-stars">
          {AW_STARS.map((s, i) => (
            <span
              key={i}
              className={"aw-star" + (s.big ? " big" : "")}
              style={vars({ left: s.left, top: s.top, "--tw": s.tw, "--td": s.td })}
            />
          ))}
        </div>
      </div>

      <div className="aw-hero">
        <div className="aw-crest-wrap">
          <span className="aw-crest-halo" aria-hidden="true" />
          <Crest kind={expert?.kind} seed={expertSlug} size={120} />
        </div>

        <h2 className="aw-greet">Hi, I'm your <span className="aw-em">{expertLabel}</span>.</h2>
        {expert?.blurb && <p className="aw-blurb">{expert.blurb}</p>}

        {/* Projection surface: example-deliverable cards ("what I make") REPLACE
            the starter chips when the expert defines them; experts without
            examples fall back to starters. */}
        {(expert?.examples?.length ?? 0) > 0 ? (
          <DeliverableExamples examples={expert!.examples!} onPick={onPick} />
        ) : (expert?.starters?.length ?? 0) > 0 ? (
          <div className="aw-starters">
            {expert!.starters!.map((s, i) => (
              <button key={i} type="button" className="aw-starter" onClick={() => onPick(s)}>
                <span className="aw-idx">{String(i + 1).padStart(2, "0")}<span className="aw-arrow">→</span></span>
                <span className="aw-label">{s}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="aw-footer">{children}</div>
    </div>
  );
}
