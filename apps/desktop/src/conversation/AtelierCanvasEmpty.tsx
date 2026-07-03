import { Avatar } from "../shared/Avatar";
import { DeliverableSpotlight } from "./DeliverableExamples";
import type { useExperts } from "../shared/util";
import type { Session } from "../shared/models";

// The atelier's centre canvas BEFORE anything is produced. The right pane of a
// focused atelier stage is normally the ArtifactViewer; until a deliverable
// lands there's nothing to mirror, so instead of a dead void we project what
// THIS expert makes — the same example-deliverable cards the welcome surface
// shows — turning the empty canvas into a launcher ("here's what I'll build for
// you"). When the agent is mid-turn a thin "creating" banner rides above them.
// Once the first artifact arrives, App swaps this out for the viewer (auto-open
// on delivery), so this is strictly the empty/working state.
//
// Dark geniuses INVERT this: talk-first. No "what I make" spotlight — the
// deliverable stays SEALED until the conversation earns it (see the sealed
// branch below; the atelier is `noir`-skinned around it).

export function AtelierCanvasEmpty({ session, experts, onPick }: {
  session: Session;
  experts: ReturnType<typeof useExperts>;
  onPick: (prompt: string) => void;
}) {
  const expert = experts[session.expertSlug];
  const examples = expert?.examples ?? [];
  const starters = expert?.starters ?? [];
  const working = session.status === "running";

  if (expert?.dark) {
    return (
      <div className="canvas-empty canvas-sealed">
        <div className="canvas-empty-bar">
          <span className="canvas-empty-title">sealed</span>
          {working && (
            <span className="canvas-empty-live"><i className="canvas-empty-pulse" />reading you…</span>
          )}
        </div>
        <div className="canvas-empty-body">
          <div className="canvas-sealed-mark" aria-hidden="true">⚜</div>
          <p className="canvas-sealed-h">Nothing yet.</p>
          <p className="canvas-sealed-sub">
            {session.expertLabel} delivers only once the conversation has earned it. Talk first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-empty">
      <div className="canvas-empty-bar">
        <span className="canvas-empty-title">project</span>
        {working && (
          <span className="canvas-empty-live">
            <i className="canvas-empty-pulse" />Creating…
          </span>
        )}
      </div>

      <div className="canvas-empty-body">
        {examples.length > 0 ? (
          <DeliverableSpotlight
            examples={examples}
            heading={`What ${session.expertLabel} makes`}
            onPick={onPick}
          />
        ) : starters.length > 0 ? (
          <div className="canvas-empty-starters">
            <div className="dwrap-h">To start</div>
            {starters.map((s, i) => (
              <button key={i} className="canvas-empty-starter" onClick={() => onPick(s)}>
                <span className="ce-idx">{String(i + 1).padStart(2, "0")}<span className="ce-arrow">→</span></span>
                <span className="ce-label">{s}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="canvas-empty-hero">
            <Avatar slug={session.expertSlug} size={96} />
            {expert?.blurb && <p className="canvas-empty-blurb">{expert.blurb}</p>}
          </div>
        )}

        <p className="canvas-empty-foot">Creations will appear here.</p>
      </div>
    </div>
  );
}
