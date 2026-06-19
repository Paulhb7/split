import { Crest } from "../shared/Crest";
import { H } from "../shared/harnesses";
import type { useExperts } from "../shared/util";
import type { Session } from "../shared/models";

// The reflet — the atelier's right column. A READ-ONLY mirror of the focused
// session: what it was asked (Tâche), its plan, its context (cost / turns),
// the skills it carries, and the deliverables it has produced. It reflects the
// expert; it does not pilot it (the conversation in the center does that). All
// data is read straight off the Session the reducer already maintains — no new
// events. Colours come from the skin vars, so it tints azure under the Atelier
// skin and copper under Classic.

function artGlyph(rel: string): string {
  const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "html" || ext === "htm") return "🖥️";
  if (ext === "md" || ext === "markdown" || ext === "txt") return "📝";
  if (ext === "csv" || ext === "tsv" || ext === "json") return "📊";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  if (ext === "pdf") return "📄";
  return "📦";
}

export function Reflet({ session, experts, onPickArtifact, onCollapse }: {
  session: Session;
  experts: ReturnType<typeof useExperts>;
  onPickArtifact: (id: string, rel: string) => void;
  onCollapse?: () => void;
}) {
  const expert = experts[session.expertSlug];
  const lastUserTurn = [...session.thread].reverse().find((t) => t.role === "user");
  const skills = expert?.skills ?? [];
  const plan = session.plan;
  const done = plan.filter((p) => p.status === "completed").length;
  const turns = session.thread.filter((t) => t.role === "user").length;

  return (
    <aside className="reflet" aria-label="Session mirror">
      {onCollapse && <button className="reflet-collapse" onClick={onCollapse} title="Collapse the reflet">›</button>}
      <div className="reflet-card">
        <Crest kind={expert?.kind} seed={session.expertSlug} size={34} />
        <div className="reflet-id">
          <div className="reflet-name">{session.expertLabel}</div>
          <div className="reflet-on">on <b>{H[session.harness]?.label || session.harness}</b> · {session.status}</div>
        </div>
        <span className="reflet-ro" title="The mirror shows the session — it doesn't drive it">🔒 read-only</span>
      </div>

      <details className="reflet-sec" open>
        <summary>Task</summary>
        <div className="reflet-body">
          {lastUserTurn
            ? <p className="reflet-task">{lastUserTurn.text}</p>
            : <p className="reflet-muted">No request yet — brief {session.expertLabel} to start.</p>}
        </div>
      </details>

      {plan.length > 0 && (
        <details className="reflet-sec" open>
          <summary>Plan <span className="reflet-count">{done}/{plan.length}</span></summary>
          <div className="reflet-body">
            {plan.map((p, i) => (
              <div key={i} className={"reflet-step " + p.status}>
                <span className="reflet-dot" />{p.content}
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="reflet-sec">
        <summary>Context</summary>
        <div className="reflet-body">
          <div className="reflet-kv"><span>Turns</span><b>{turns}</b></div>
          <div className="reflet-kv"><span>Cost</span><b>{session.cost != null ? `$${session.cost.toFixed(2)}` : "—"}</b></div>
          <div className="reflet-kv"><span>Status</span><b>{session.status}</b></div>
        </div>
      </details>

      {skills.length > 0 && (
        <details className="reflet-sec">
          <summary>Skills <span className="reflet-count">{skills.length}</span></summary>
          <div className="reflet-body reflet-pills">
            {skills.map((s) => <span key={s} className="reflet-pill">{s}</span>)}
          </div>
        </details>
      )}

      <details className="reflet-sec" open>
        <summary>Deliverables {session.artifacts.length > 0 && <span className="reflet-count">{session.artifacts.length}</span>}</summary>
        <div className="reflet-body">
          {session.artifacts.length === 0 ? (
            <p className="reflet-muted">No deliverable yet — it'll show up here once {session.expertLabel} produces one.</p>
          ) : (
            session.artifacts.map((a) => (
              <button
                key={a.rel}
                type="button"
                className={"reflet-art" + (a.rel === session.activeArtifact ? " on" : "")}
                onClick={() => onPickArtifact(session.id, a.rel)}
                title={a.rel}
              >
                <span className="reflet-art-ic">{artGlyph(a.rel)}</span>
                <span className="reflet-art-name">{a.rel.split("/").pop()}</span>
              </button>
            ))
          )}
        </div>
      </details>
    </aside>
  );
}
