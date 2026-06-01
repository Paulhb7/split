import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { H, brandOf } from "../shared/harnesses";
import { useExperts } from "../shared/util";
import { Tile, vars } from "../shared/ui";
import type { ArchivedSessionMeta } from "../shared/events";

// Past-conversations picker. Loads on mount, then refreshes when the user
// deletes a row. Reads `list_archived_sessions` (sorted desc by started_at)
// and `delete_archived_session`; the open action is delegated up so the parent
// can materialize the archive into a focused session.
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

  return (
    <div className="overlay" onClick={onClose}>
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
          <div className="sessions" style={{ maxHeight: 420, overflowY: "auto" }}>
            {items.map((m) => {
              const h = H[m.harness];
              const expertLabel = experts[m.expert]?.label ?? m.expert;
              const when = m.started_at ? new Date(m.started_at).toLocaleString() : "";
              return (
                <div key={m.id} className="srow" style={vars({ "--brand": brandOf(m.harness) })} onClick={() => onOpen(m)}>
                  <Tile id={m.harness} size={40} />
                  <div className="meta">
                    <div className="ln1">
                      <span className="who">@{expertLabel}</span>
                      <span className="on">on <b>{h?.label || m.harness}</b></span>
                    </div>
                    <div className="sum">{m.title || "(untitled)"}</div>
                  </div>
                  <span className="badge">{when}</span>
                  <button
                    className="iconbtn"
                    style={{ width: "auto", padding: "2px 8px", fontSize: 11 }}
                    title="Resume — replay thread and reconnect to the agent's prior session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResume(m);
                    }}
                  >resume</button>
                  <button
                    className="xbtn"
                    title="Delete this archive"
                    onClick={(e) => {
                      e.stopPropagation();
                      invoke("delete_archived_session", { id: m.id }).then(refresh);
                    }}
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
