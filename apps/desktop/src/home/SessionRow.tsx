import { H, brandOf } from "../shared/harnesses";
import { Logo, vars } from "../shared/ui";
import { Avatar } from "../shared/Avatar";
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
  // A pending permission ask keeps status "running" while the agent is frozen
  // waiting for the boss — surface it as "needs you" instead of fake activity.
  const needsYou = !!s.pendingPermission && !s.archived;
  const running = s.status === "running" && !s.archived && !needsYou;
  const badge = s.archived
    ? "past"
    : needsYou
      ? "needs you"
      : ({ running: "running", idle: "ready", ended: "ended", error: "error", auth: "sign-in" } as Record<string, string>)[s.status] || s.status;
  return (
    <div
      className="srow"
      role="button"
      tabIndex={0}
      style={vars({ "--brand": brandOf(s.harness) })}
      onClick={onOpen}
      // Only when the row ITSELF is focused — Enter on the inner stop/close
      // buttons bubbles here and must not also open the conversation.
      onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      <Avatar slug={s.expertSlug} size={40} />
      <div className="meta">
        <div className="ln1">
          <span className={"dot " + (needsYou ? "needs" : s.status)} />
          <span className="who">@{s.expertLabel}</span>
          <span className="on">on <Logo id={s.harness} size={12} /><b>{h?.label || s.harness}</b></span>
        </div>
        {needsYou ? (
          <div className="sum wait">waiting for your approval — open to answer</div>
        ) : running ? (
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
      <span className={"badge " + (needsYou ? "needs" : s.status)}>{badge}</span>
      {s.status === "running" ? (
        <button className="xbtn" title="Stop" aria-label={`Stop @${s.expertLabel}`} onClick={(e) => { e.stopPropagation(); onStop(); }}>■</button>
      ) : (
        <button className="xbtn" title="Close" aria-label="Close session" onClick={(e) => { e.stopPropagation(); onClose(); }}>✕</button>
      )}
    </div>
  );
}
