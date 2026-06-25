import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Crest } from "../shared/Crest";
import { vars } from "../shared/ui";
import { isActiveExpert } from "../shared/experts";
import type { useExperts } from "../shared/util";
import type { Session } from "../shared/models";
import type { ArchivedSessionMeta } from "../shared/events";

// The atelier's left column — a three-tab command surface:
//   · Agents   — the launchable roster grouped by category (super / genius /
//     coach) in collapsible sections. Where you START work.
//   · Sessions — the live team: every running session (status dot + "needs you"
//     badge, click focuses one). Where you SWITCH between what's running.
//   · History  — resumable archives (var/sessions/). Each row: a hue node per
//     expert (mirrors the History timeline), the brief, expert · time-ago, and
//     resume-on-click. "Tout l'historique →" opens the full timeline overlay —
//     the rail is the only entry to history now (no chrome button).
// Tabs (not stacked sections) so each gets the rail's full height — start / run
// / past are three distinct jobs that no longer crowd each other.
const CATS: { key: "super" | "genius" | "coach"; label: string; open: boolean }[] = [
  { key: "super", label: "Super", open: true },
  { key: "genius", label: "Genius", open: false },
  { key: "coach", label: "Coach", open: false },
];

// Stable hue per expert slug → the timeline node colour (same rolling hash as
// the History overlay, so an expert lights the same way in both surfaces).
const hueOf = (slug: string): number => {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return h;
};

const DAY = 86_400_000;
const startOfDay = (ts: number): number => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
// Compact "2h ago / Yesterday / Mar 4" for the dense rail row.
const timeAgo = (iso: string, now: number): string => {
  const ts = iso ? new Date(iso).getTime() : now;
  if (!ts) return "";
  if (startOfDay(ts) === startOfDay(now)) {
    const min = Math.round((now - ts) / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    return `${Math.round(min / 60)}h ago`;
  }
  if (startOfDay(ts) === startOfDay(now) - DAY) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function AtelierLeft({ experts, sessions, focusedId, armedSlug, onArm, onFocus, onResume, onOpenHistory, collapsed, onToggleCollapsed }: {
  experts: ReturnType<typeof useExperts>;
  sessions: Session[];
  focusedId: string | null;
  armedSlug: string;
  onArm: (slug: string) => void;
  onFocus: (id: string) => void;
  onResume: (meta: ArchivedSessionMeta) => void;
  onOpenHistory: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const roster = Object.keys(experts).filter((slug) => isActiveExpert(experts, slug));
  // Open on the live team when something's running, else on the roster to launch.
  const [tab, setTab] = useState<"agents" | "sessions" | "history">(() => (sessions.length > 0 ? "sessions" : "agents"));

  // Archives load lazily — fetched each time the History tab is opened, so a
  // session you just ended shows up without an app restart. null = loading.
  const [recents, setRecents] = useState<ArchivedSessionMeta[] | null>(null);
  useEffect(() => {
    if (tab !== "history") return;
    let alive = true;
    invoke<string>("list_archived_sessions")
      .then((raw) => {
        if (!alive) return;
        try { const a = JSON.parse(raw) as ArchivedSessionMeta[]; setRecents(Array.isArray(a) ? a : []); }
        catch { setRecents([]); }
      })
      .catch(() => { if (alive) setRecents([]); });
    return () => { alive = false; };
  }, [tab]);

  // Collapsed → a thin strip with a chevron, a vertical label, and a glance of
  // live sessions (so you still see who's running even folded).
  if (collapsed) {
    return (
      <button className="rail-stub left" onClick={onToggleCollapsed} title="Expand the rail">
        <span className="rail-stub-x">›</span>
        <span className="rail-stub-label">Sessions</span>
        <span className="rail-stub-dots">
          {sessions.slice(0, 4).map((s) => (
            <span key={s.id} className={"rail-stub-dot" + (s.status === "running" ? " run" : "")} />
          ))}
        </span>
      </button>
    );
  }

  const now = Date.now();
  const activeIds = new Set(sessions.map((s) => s.id));
  const recentRows = (recents ?? []).filter((m) => !activeIds.has(m.id));

  return (
    <div className="atelier-left">
      <div className="atelier-left-top">
        <div className="atelier-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "agents"} className={"atelier-tab" + (tab === "agents" ? " on" : "")} onClick={() => setTab("agents")}>Agents</button>
          <button role="tab" aria-selected={tab === "sessions"} className={"atelier-tab" + (tab === "sessions" ? " on" : "")} onClick={() => setTab("sessions")}>
            Sessions{sessions.length > 0 && <span className="atelier-tab-ct">{sessions.length}</span>}
          </button>
          <button role="tab" aria-selected={tab === "history"} className={"atelier-tab" + (tab === "history" ? " on" : "")} onClick={() => setTab("history")}>History</button>
        </div>
        {onToggleCollapsed && (
          <button className="rail-collapse left" onClick={onToggleCollapsed} title="Collapse the rail">‹</button>
        )}
      </div>

      <div className="atelier-left-scroll">
        {tab === "agents" ? (
          CATS.map((c) => {
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
                      <span className="atelier-agent-crest"><Crest kind={e?.kind} seed={slug} size={40} /></span>
                      <span className="atelier-agent-id">
                        <span className="atelier-agent-nm">{e?.label}</span>
                        <span className="atelier-agent-kind">{e?.kind}</span>
                      </span>
                    </button>
                  );
                })}
              </details>
            );
          })
        ) : tab === "sessions" ? (
          sessions.length === 0 ? (
            <div className="atelier-recs-empty">No live session yet — pick an agent to start one.</div>
          ) : (
            sessions.map((s) => {
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
                    <Crest kind={experts[s.expertSlug]?.kind} seed={s.expertSlug} size={40} />
                    <span className={"att-live " + live} />
                    {needs && <span className="att-badge">!</span>}
                  </span>
                  <span className="atelier-agent-id">
                    <span className="atelier-agent-nm">{s.expertLabel}</span>
                    <span className="atelier-agent-kind">{experts[s.expertSlug]?.kind}</span>
                  </span>
                </button>
              );
            })
          )
        ) : (
          <div className="atelier-recs">
            {recents === null ? (
              <div className="atelier-recs-empty">Loading…</div>
            ) : recentRows.length === 0 ? (
              <div className="atelier-recs-empty">No past sessions yet — each one you run shows up here to resume.</div>
            ) : (
              recentRows.map((m) => {
                const label = experts[m.expert]?.label ?? m.expert;
                return (
                  <button
                    key={m.id}
                    className="atelier-rec"
                    style={vars({ "--h": `hsl(${hueOf(m.expert)} 68% 58%)` })}
                    onClick={() => onResume(m)}
                    title={`Resume @${label} — replay the thread and reconnect to the agent`}
                  >
                    <span className="atelier-rec-node" />
                    <span className="atelier-rec-id">
                      <span className="atelier-rec-title">{m.title || "(untitled)"}</span>
                      <span className="atelier-rec-meta">{label} · {timeAgo(m.started_at, now)}</span>
                    </span>
                    <span className="atelier-rec-resume" aria-hidden="true">↻</span>
                  </button>
                );
              })
            )}
            <button className="atelier-recs-all" onClick={onOpenHistory}>Tout l'historique →</button>
          </div>
        )}
      </div>
    </div>
  );
}
