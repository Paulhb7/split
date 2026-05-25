import { H, brandOf } from "../shared/harnesses";
import { Tile, vars } from "../shared/ui";
import { activityOf, type Session } from "../shared/models";
import "./stage.css";

// Passive "live room": each session is a brand-tinted character whose animation
// is derived purely from its status + summary (no backend, no new events).
export default function Stage({
  sessions,
  onOpen,
  onStop,
  onClose,
}: {
  sessions: Session[];
  onOpen: (id: string) => void;
  onStop: (id: string) => void;
  onClose: (id: string) => void;
}) {
  if (!sessions.length) {
    return <div className="stage-empty">No one at work yet — brief an expert above.</div>;
  }
  return (
    <div className="stage">
      <div className="stage-floor" aria-hidden="true" />
      <div className="stage-room">
        {sessions.map((s, i) => {
          const act = activityOf(s);
          const h = H[s.harness];
          const running = s.status === "running" || s.status === "auth";
          const live = act === "thinking" || act === "writing" || act === "tool";
          return (
            <div
              key={s.id}
              className={"node " + act}
              style={vars({ "--brand": brandOf(s.harness), "--d": `${(i % 6) * 0.12}s` })}
              onClick={() => onOpen(s.id)}
              title={`@${s.expertLabel} on ${h?.label || s.harness}`}
            >
              <button
                className="node-x"
                title={running ? "Stop" : "Close"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (running) onStop(s.id);
                  else onClose(s.id);
                }}
              >
                {running ? "■" : "✕"}
              </button>

              <div className="avatar">
                <span className="halo" />
                <Tile id={s.harness} size={46} />
                <span className="act-dot" />
              </div>

              <div className="node-who">@{s.expertLabel}</div>
              <div className="node-on">on <b>{h?.label || s.harness}</b></div>

              <div className="bubble">
                {live && <span className="bubble-live"><i /><i /><i /></span>}
                <span className="bubble-txt">{s.summary}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
