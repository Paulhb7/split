import { H, brandOf } from "../shared/harnesses";
import { Logo, vars } from "../shared/ui";
import { Crest } from "../shared/Crest";
import { TurnSpinner } from "../shared/TurnSpinner";
import type { ExpertKind } from "../shared/experts";
import type { Session } from "../shared/models";

// One row in the home sessions list: engine tile + who/where + live activity +
// status badge + stop/close action. Clicking the row opens the conversation.
// `--brand` is set to the session's engine colour so the whole row (tile, dot,
// engine name, badge, spinner glimmer) reads in that engine's identity instead
// of the grey default baked into `.srow`.
export function SessionRow({ s, kind, onOpen, onStop, onClose }: { s: Session; kind?: ExpertKind; onOpen: () => void; onStop: () => void; onClose: () => void }) {
  const h = H[s.harness];
  const running = s.status === "running" && !s.archived;
  const badge = s.archived
    ? "past"
    : ({ running: "running", idle: "ready", ended: "ended", error: "error", auth: "sign-in" } as Record<string, string>)[s.status] || s.status;
  return (
    <div className="srow" style={vars({ "--brand": brandOf(s.harness) })} onClick={onOpen}>
      <Crest kind={kind} seed={s.expertSlug} size={40} />
      <div className="meta">
        <div className="ln1">
          <span className={"dot " + s.status} />
          <span className="who">@{s.expertLabel}</span>
          <span className="on">on <Logo id={s.harness} size={12} /><b>{h?.label || s.harness}</b></span>
        </div>
        {running ? (
          <TurnSpinner
            kind={kind}
            summary={s.summary}
            streamedChars={s.answer.length + s.thoughts.length}
            thoughtChars={s.thoughts.length}
            startedAt={s.turnStartedAt}
          />
        ) : (
          <div className="sum">{s.summary}</div>
        )}
      </div>
      {s.cost != null && <span className="cost">${s.cost.toFixed(3)}</span>}
      <span className={"badge " + s.status}>{badge}</span>
      {s.status === "running" ? (
        <button className="xbtn" title="Stop" onClick={(e) => { e.stopPropagation(); onStop(); }}>■</button>
      ) : (
        <button className="xbtn" title="Close" onClick={(e) => { e.stopPropagation(); onClose(); }}>✕</button>
      )}
    </div>
  );
}
