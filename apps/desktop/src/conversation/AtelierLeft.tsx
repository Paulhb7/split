import { Crest } from "../shared/Crest";
import { isActiveExpert } from "../shared/experts";
import type { useExperts } from "../shared/util";
import type { Session } from "../shared/models";

// The atelier's left column.
//   · Active   — live sessions FIRST, to shepherd (status dot + "needs you"
//     badge). Click focuses one; the centre shows its conversation.
//   · Agents   — the launchable roster, grouped by category (super / genius /
//     coach) in collapsible sections so 20 experts stay scannable. Each row
//     carries the expert's kind (its "type": analyst, builder, researcher…).
//     Click arms an expert; the centre shows its welcome + starter prompts.
const CATS: { key: "super" | "genius" | "coach"; label: string; open: boolean }[] = [
  { key: "super", label: "Super", open: true },
  { key: "genius", label: "Genius", open: false },
  { key: "coach", label: "Coach", open: false },
];

export function AtelierLeft({ experts, sessions, focusedId, armedSlug, onArm, onFocus, collapsed, onToggleCollapsed }: {
  experts: ReturnType<typeof useExperts>;
  sessions: Session[];
  focusedId: string | null;
  armedSlug: string;
  onArm: (slug: string) => void;
  onFocus: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const roster = Object.keys(experts).filter((slug) => isActiveExpert(experts, slug));

  // Collapsed → a thin strip with a chevron, a vertical label, and a glance of
  // live sessions (so you still see who's running even folded).
  if (collapsed) {
    return (
      <button className="rail-stub left" onClick={onToggleCollapsed} title="Expand the roster">
        <span className="rail-stub-x">›</span>
        <span className="rail-stub-label">Agents</span>
        <span className="rail-stub-dots">
          {sessions.slice(0, 4).map((s) => (
            <span key={s.id} className={"rail-stub-dot" + (s.status === "running" ? " run" : "")} />
          ))}
        </span>
      </button>
    );
  }

  return (
    <div className="atelier-left">
      {onToggleCollapsed && (
        <button className="rail-collapse left" onClick={onToggleCollapsed} title="Collapse the roster">‹</button>
      )}
      {sessions.length > 0 && (
        <div className="atelier-left-sec">
          <div className="atelier-left-h">Active · {sessions.length}</div>
          {sessions.map((s) => {
            const needs = s.status === "auth" ? "auth" : s.pendingPermission ? "perm" : null;
            const live =
              s.status === "running" ? "run"
              : s.status === "error" ? "err"
              : needs ? "warn"
              : s.status === "ended" ? "end"
              : "idle";
            return (
              <button
                key={s.id}
                className={"atelier-agent" + (focusedId === s.id ? " on" : "")}
                onClick={() => onFocus(s.id)}
                title={`@${s.expertLabel}${needs === "auth" ? " · needs sign-in" : needs === "perm" ? " · needs your approval" : ""}`}
              >
                <span className="atelier-agent-crest">
                  <Crest kind={experts[s.expertSlug]?.kind} seed={s.expertSlug} size={26} />
                  <span className={"att-live " + live} />
                  {needs && <span className="att-badge">!</span>}
                </span>
                <span className="atelier-agent-id">
                  <span className="atelier-agent-nm">{s.expertLabel}</span>
                  <span className="atelier-agent-kind">{experts[s.expertSlug]?.kind}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {CATS.map((c) => {
        const list = roster.filter((slug) => (experts[slug]?.category ?? "super") === c.key);
        if (list.length === 0) return null;
        return (
          <details key={c.key} className="atelier-grp" open={c.open}>
            <summary>
              <span className="atelier-grp-chev">▸</span>
              {c.label}
              <span className="atelier-grp-cnt">{list.length}</span>
            </summary>
            {list.map((slug) => {
              const e = experts[slug];
              const on = !focusedId && armedSlug === slug;
              return (
                <button
                  key={slug}
                  className={"atelier-agent" + (on ? " on" : "")}
                  onClick={() => onArm(slug)}
                  title={e?.blurb}
                >
                  <span className="atelier-agent-crest"><Crest kind={e?.kind} seed={slug} size={26} /></span>
                  <span className="atelier-agent-id">
                    <span className="atelier-agent-nm">{e?.label}</span>
                    <span className="atelier-agent-kind">{e?.kind}</span>
                  </span>
                </button>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}
