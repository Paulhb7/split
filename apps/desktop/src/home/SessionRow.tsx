import { H } from "../shared/harnesses";
import { Tile } from "../shared/ui";
import type { Session } from "../shared/models";

// One row in the home sessions list: engine tile + who/where + status badge +
// stop/close action. Clicking the row opens the conversation.
export function SessionRow({ s, onOpen, onStop, onClose }: { s: Session; onOpen: () => void; onStop: () => void; onClose: () => void }) {
  const h = H[s.harness];
  const badge = s.archived
    ? "past"
    : ({ running: "running", idle: "ready", ended: "ended", error: "error", auth: "sign-in" } as Record<string, string>)[s.status] || s.status;
  return (
    <div className="srow" onClick={onOpen}>
      <Tile id={s.harness} size={40} themed />
      <div className="meta">
        <div className="ln1">
          <span className={"dot " + s.status} />
          <span className="who">@{s.expertLabel}</span>
          <span className="on">on <b>{h?.label || s.harness}</b></span>
        </div>
        <div className="sum">{s.summary}</div>
      </div>
      {s.cost != null && <span className="badge">${s.cost.toFixed(3)}</span>}
      <span className={"badge " + s.status}>{badge}</span>
      {s.status === "running" ? (
        <button className="xbtn" title="Stop" onClick={(e) => { e.stopPropagation(); onStop(); }}>■</button>
      ) : (
        <button className="xbtn" title="Close" onClick={(e) => { e.stopPropagation(); onClose(); }}>✕</button>
      )}
    </div>
  );
}
