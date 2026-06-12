import { Crest } from "../shared/Crest";
import type { useExperts } from "../shared/util";
import type { Session } from "../shared/models";

// The attention rail — the leftmost column of the atelier. One crest per live
// session, the focused one marked, each carrying a live status dot and a "needs
// you" badge when it's blocked on auth / a permission. Clicking switches focus
// without leaving the side-by-side view, so you can shepherd several experts at
// once and always see who's waiting on you.
export function AttentionRail({
  sessions, focusedId, experts, onFocus,
}: {
  sessions: Session[];
  focusedId: string | null;
  experts: ReturnType<typeof useExperts>;
  onFocus: (id: string) => void;
}) {
  return (
    <div className="att-rail" role="tablist" aria-label="Sessions">
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
            role="tab"
            aria-selected={s.id === focusedId}
            className={"att-avatar" + (s.id === focusedId ? " focus" : "") + (needs ? " needs" : "")}
            onClick={() => onFocus(s.id)}
            title={`@${s.expertLabel}${needs === "auth" ? " · attend une connexion" : needs === "perm" ? " · attend ta validation" : ""}`}
          >
            <Crest kind={experts[s.expertSlug]?.kind} seed={s.expertSlug} size={34} />
            <span className={"att-live " + live} />
            {needs && <span className="att-badge">!</span>}
          </button>
        );
      })}
    </div>
  );
}
