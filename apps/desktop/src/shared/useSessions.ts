import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SessionEvent, VEvt } from "./events";
import type { ExpertMap } from "./experts";
import { applyEvent } from "./reducer";
import { newSession, type QueuedTurn, type Session } from "./models";

const uid = () =>
  crypto.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const labelFor = (experts: ExpertMap, slug: string) =>
  experts[slug]?.label ?? slug.charAt(0).toUpperCase() + slug.slice(1);

export interface StartArgs {
  harness: string;
  expertSlug: string;
  display: string;
  wire: string;
  files?: string[];
}

// Owns the session list for one window. Subscribes to the broadcast
// `session-event` stream, so sessions started in EITHER window materialize here
// (Rust is the source of truth). Exposes start/send/stop/auth.
export function useSessions(experts: ExpertMap) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const expertsRef = useRef(experts);
  expertsRef.current = experts;

  const update = useCallback(
    (id: string, fn: (s: Session) => Session) =>
      setSessions((prev) => prev.map((s) => (s.id === id ? fn(s) : s))),
    []
  );

  // consume the tagged event stream, routed by id
  useEffect(() => {
    const un = listen<SessionEvent>("session-event", (e) => {
      const { id, vevt, log, exit } = e.payload;
      if (exit) {
        update(id, (s) => ({ ...s, status: "ended", summary: "ended", queued: null }));
        return;
      }
      if (log != null) {
        update(id, (s) => ({ ...s, logs: [...s.logs.slice(-400), log] }));
        return;
      }
      if (vevt == null) return;
      let ev: VEvt;
      try {
        ev = JSON.parse(vevt);
      } catch {
        return;
      }
      setSessions((prev) => {
        const found = prev.find((s) => s.id === id);
        if (found) return prev.map((s) => (s.id === id ? applyEvent(s, ev) : s));
        // unknown id: a session started in another window. `ready` carries the
        // harness/expert so we can materialize it here.
        if (ev.type === "ready") {
          const s = newSession(id, ev.harness, ev.expert, labelFor(expertsRef.current, ev.expert), "");
          return [...prev, { ...s, status: "idle", summary: "" }];
        }
        return prev;
      });
    });
    return () => {
      un.then((f) => f());
    };
  }, [update]);

  // hydrate sessions started before this window opened (missed their `ready`)
  useEffect(() => {
    invoke<string>("list_sessions")
      .then((raw) => {
        const known = JSON.parse(raw) as { id: string; harness: string; expert: string }[];
        if (!Array.isArray(known) || !known.length) return;
        setSessions((prev) => {
          const have = new Set(prev.map((s) => s.id));
          const adds = known
            .filter((k) => !have.has(k.id))
            .map((k) => {
              const s = newSession(k.id, k.harness, k.expert, labelFor(expertsRef.current, k.expert), "");
              return { ...s, status: "idle" as const, summary: "" };
            });
          return adds.length ? [...prev, ...adds] : prev;
        });
      })
      .catch(() => {});
  }, []);

  // flush a queued turn once its session goes idle
  useEffect(() => {
    const s = sessions.find((x) => x.status === "idle" && x.queued);
    if (!s || !s.queued) return;
    const q = s.queued;
    update(s.id, (x) => ({
      ...x,
      status: "running",
      queued: null,
      thread: [...x.thread, { role: "user", text: q.display, files: q.files.length ? q.files : undefined }],
    }));
    invoke("send_turn", { id: s.id, text: q.wire });
  }, [sessions, update]);

  const start = useCallback(async (a: StartArgs) => {
    const id = uid();
    const files = a.files ?? [];
    const s = newSession(id, a.harness, a.expertSlug, labelFor(expertsRef.current, a.expertSlug), a.display, files);
    setSessions((prev) => [...prev, s]);
    const workspace = localStorage.getItem("split.workspace") || ""; // empty → default root
    await invoke("start_session", { id, harness: a.harness, expert: a.expertSlug, workspace });
    await invoke("send_turn", { id, text: a.wire });
    return id;
  }, []);

  // send a follow-up turn; queues it if the session is still working
  const send = useCallback(
    (id: string, t: QueuedTurn) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          if (s.status === "running" || s.status === "auth") return { ...s, queued: t };
          invoke("send_turn", { id, text: t.wire });
          return {
            ...s,
            status: "running",
            thread: [...s.thread, { role: "user", text: t.display, files: t.files.length ? t.files : undefined }],
          };
        })
      );
    },
    []
  );

  const sendAuth = useCallback((id: string, methodId: string) => {
    invoke("send_auth", { id, methodId });
  }, []);

  const stop = useCallback((id: string) => {
    invoke("stop_session", { id });
  }, []);

  const remove = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const cancelQueued = useCallback(
    (id: string) => update(id, (s) => ({ ...s, queued: null })),
    [update]
  );

  return { sessions, start, send, sendAuth, stop, remove, cancelQueued };
}
