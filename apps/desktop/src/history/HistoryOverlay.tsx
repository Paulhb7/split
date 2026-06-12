import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { H } from "../shared/harnesses";
import { useExperts } from "../shared/util";
import { Logo, vars } from "../shared/ui";
import { Crest } from "../shared/Crest";
import type { ArchivedSessionMeta } from "../shared/events";

// Stable, distinct hue per expert slug → the timeline node colour. A tiny
// rolling hash so the same expert always lights the spine the same way and
// different experts separate visually, without a hand-maintained colour map.
const hueOf = (slug: string) => {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return h;
};

// A "trivial" title (a bare greeting / one short word) gets dimmed so a real
// brief doesn't read with the same weight as an idle "hey".
const isTrivial = (t: string): boolean => {
  const s = (t || "").trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "");
  if (!s || s === "untitled") return true;
  const words = s.split(/\s+/);
  return words.length === 1 && s.length <= 5;
};

const DAY = 86_400_000;
const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const dayLabel = (ts: number, now: number): string => {
  const s = startOfDay(ts);
  const t = startOfDay(now);
  if (s === t) return "Today";
  if (s === t - DAY) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
};
// Inside today the spine header already names the day, so rows read a friendly
// relative age; on older days a bare clock time avoids "Yesterday · Yesterday".
const rowTime = (ts: number, now: number): string => {
  if (startOfDay(ts) === startOfDay(now)) {
    const min = Math.round((now - ts) / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    return `${Math.round(min / 60)}h ago`;
  }
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

// Past-conversations picker — a day-grouped journal. Loads on mount, then
// refreshes when the user deletes a row. Reads `list_archived_sessions` (sorted
// desc by started_at) and `delete_archived_session`; the open action is
// delegated up so the parent can materialize the archive into a focused session.
export function HistoryOverlay({
  experts,
  onClose,
  onOpen,
  onResume,
}: {
  experts: ReturnType<typeof useExperts>;
  onClose: () => void;
  onOpen: (meta: ArchivedSessionMeta) => void;
  onResume: (meta: ArchivedSessionMeta) => void;
}) {
  const [items, setItems] = useState<ArchivedSessionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    invoke<string>("list_archived_sessions")
      .then((raw) => {
        try {
          const arr = JSON.parse(raw) as ArchivedSessionMeta[];
          setItems(Array.isArray(arr) ? arr : []);
        } catch {
          setItems([]);
        }
      })
      .catch((e) => setError(String(e)));
  };
  useEffect(refresh, []);

  // Fold the desc-sorted archives into contiguous day groups, preserving order.
  const now = Date.now();
  const groups: { label: string; rows: ArchivedSessionMeta[] }[] = [];
  for (const m of items ?? []) {
    const ts = m.started_at ? new Date(m.started_at).getTime() : now;
    const label = dayLabel(ts, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(m);
    else groups.push({ label, rows: [m] });
  }

  return (
    <div className="histpage" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <div className="league-head" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 30 }}>Past <em>conversations</em></h2>
          <button className="btn ghost" onClick={onClose}>done</button>
        </div>
        <div className="ob2-pickhint">Read-only replays from <code>var/sessions/</code>. Click one to open it; the composer stays disabled (the agent process is long gone).</div>
        {error && <div className="empty">Couldn't load history: {error}</div>}
        {!items ? (
          <div className="empty">Loading…</div>
        ) : items.length === 0 ? (
          <div className="empty">No past conversations yet. Each session you run from now on shows up here.</div>
        ) : (
          <div className="histscroll">
            {groups.map((g) => (
              <div className="histday" key={g.label}>
                <div className="histday-label">
                  {g.label}
                  <span className="histday-count">{g.rows.length}</span>
                </div>
                <div className="histspine">
                  {g.rows.map((m) => {
                    const h = H[m.harness];
                    const expertLabel = experts[m.expert]?.label ?? m.expert;
                    const kind = experts[m.expert]?.kind;
                    const ts = m.started_at ? new Date(m.started_at).getTime() : now;
                    const triv = isTrivial(m.title);
                    return (
                      <div
                        key={m.id}
                        className={"jrow" + (triv ? " trivial" : "")}
                        style={vars({ "--node": `hsl(${hueOf(m.expert)} 68% 60%)` })}
                        onClick={() => onOpen(m)}
                      >
                        <Crest kind={kind} seed={m.expert} size={34} title={expertLabel} />
                        <div className="jmeta">
                          <div className="jln1">
                            <span className="who">@{expertLabel}</span>
                            <span className="jon">
                              on <Logo id={m.harness} size={13} themed /> <b>{h?.label || m.harness}</b>
                            </span>
                          </div>
                          <div className="jttl">{m.title || "(untitled)"}</div>
                        </div>
                        <span className="jspacer" />
                        <span className="jwhen">{rowTime(ts, now)}</span>
                        <div className="jtools">
                          <button
                            className="jact"
                            title="Resume — replay thread and reconnect to the agent's prior session"
                            onClick={(e) => {
                              e.stopPropagation();
                              onResume(m);
                            }}
                          >resume</button>
                          <button
                            className="jx"
                            title="Delete this archive"
                            onClick={(e) => {
                              e.stopPropagation();
                              invoke("delete_archived_session", { id: m.id }).then(refresh);
                            }}
                          >✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
