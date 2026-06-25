import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ArchivedSessionMeta, SessionEvent, VEvt } from "./events";
import type { ExpertMap } from "./experts";
import { applyEvent } from "./reducer";
import { newSession, type QueuedTurn, type Session } from "./models";

const uid = () =>
  crypto.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Sessions are driven by the native Rust runner (`core-rs/` +
// `src-tauri/src/runner.rs`) via the `start_session` Tauri command — it speaks
// ACP in-process so the `.dmg` ships without a Python runtime.

const labelFor = (experts: ExpertMap, slug: string) =>
  experts[slug]?.label ?? slug.charAt(0).toUpperCase() + slug.slice(1);

// Replay one archived session: fold each line of `events.ndjson` through the
// SAME reducer that draws live sessions, so the read-only view is identical
// to what the user originally saw. User prompts live in the archive as
// synthetic `{type:"turn", text:...}` records (not part of the VEVT vocab) —
// they're pushed straight into the thread. With `live=false` (default) the
// result is marked archived+ended so the composer stays hidden; with
// `live=true` the thread is restored but the session is left in `idle`
// status (no archived flag) so a resumed runner can drive it forward.
function replayArchive(
  meta: ArchivedSessionMeta,
  ndjson: string,
  experts: ExpertMap,
  live: boolean = false,
): Session {
  let s = newSession(meta.id, meta.harness, meta.expert, labelFor(experts, meta.expert), "");
  for (const line of ndjson.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let rec: { type: string; text?: string } & Record<string, unknown>;
    try {
      rec = JSON.parse(t);
    } catch {
      continue;
    }
    if (rec.type === "turn") {
      // Defensive flush of any uncommitted stream before a new user turn
      // (a session killed mid-answer wouldn't have a closing `status:idle`).
      if (s.answer || s.thoughts) {
        s = applyEvent(s, { type: "status", status: "idle" });
      }
      s = { ...s, thread: [...s.thread, { role: "user", text: rec.text || "" }] };
      continue;
    }
    s = applyEvent(s, rec as VEvt);
  }
  // Final flush: if the archive ended mid-stream, commit whatever was streaming.
  if (s.answer || s.thoughts) {
    s = applyEvent(s, { type: "status", status: "idle" });
  }
  if (live) {
    return { ...s, status: "idle", summary: "resumed · " + (meta.title || "") };
  }
  return { ...s, status: "ended", archived: true, summary: meta.title || "past conversation" };
}

export interface StartArgs {
  harness: string;
  expertSlug: string;
  display: string;
  wire: string;
  files?: string[];
  // Vault project pinned on this session (composer `#project` chip) — the
  // persona's write target becomes projects/<slug>/ instead of notes/.
  project?: string;
}

// Owns the session list for one window. Subscribes to the broadcast
// `session-event` stream, so sessions started in EITHER window materialize
// here (the Tauri shell's `SESSIONS` map is the source of truth across
// windows; we mirror it via app-wide events). Exposes start/send/stop/auth.
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
      turnStartedAt: Date.now(),
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
    await invoke("start_session", { id, harness: a.harness, expert: a.expertSlug, workspace, project: a.project ?? null });
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
            turnStartedAt: Date.now(),
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

  // Sign out of the agent for this session. The runner calls ACP `logout`
  // (gated by agentCapabilities.auth.logout) then re-emits auth_required so
  // the existing AuthModal flow picks up and re-prompts.
  const sendLogout = useCallback((id: string) => {
    invoke("send_logout", { id });
  }, []);

  // Answer a pending permission_request. `optionId = null` denies. `scope`:
  //   "once"          — this call only
  //   "session"       — runner adds tool_id to the in-memory session allowlist
  //   "always-allow"  — runner persists "<expert>:<tool_id>" to var/permissions.json (allow)
  //   "always-deny"   — same, deny
  // We optimistically clear pendingPermission here — the runner has no echo event.
  const sendPermission = useCallback(
    (id: string, requestId: string, optionId: string | null,
     scope: "once" | "session" | "always-allow" | "always-deny") => {
      invoke("send_permission", { id, requestId, optionId, scope });
      update(id, (s) => ({ ...s, pendingPermission: null }));
    },
    [update]
  );

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

  const pickArtifact = useCallback(
    (id: string, rel: string) => update(id, (s) => ({ ...s, activeArtifact: rel })),
    [update]
  );

  // Open a past conversation from `var/sessions/<id>/`. If a live session with
  // the same id is already in the list, focus it (don't materialize a stale
  // archived copy on top). Returns the id to focus, or null on failure.
  const openArchive = useCallback(
    async (meta: ArchivedSessionMeta): Promise<string | null> => {
      const existing = sessions.find((s) => s.id === meta.id);
      if (existing) return existing.id;
      try {
        const ndjson = await invoke<string>("read_session_events", { id: meta.id });
        const s = replayArchive(meta, ndjson, expertsRef.current);
        setSessions((prev) => [...prev, s]);
        return s.id;
      } catch {
        return null;
      }
    },
    [sessions]
  );

  // Resume an archived session: replay its thread into a LIVE session (same
  // id), then spawn a runner with --resume so the agent reconnects to its
  // prior ACP session (persisted in `var/sessions/<id>/meta.json::acp_sid`).
  // If the agent doesn't support sessionCapabilities.resume the runner falls
  // back to new_session — the user sees their thread restored locally either
  // way, only the agent's memory of the conversation is lost on fallback.
  const resumeArchive = useCallback(
    async (meta: ArchivedSessionMeta): Promise<string | null> => {
      const existing = sessions.find((s) => s.id === meta.id);
      if (existing && !existing.archived) return existing.id;
      try {
        const ndjson = await invoke<string>("read_session_events", { id: meta.id });
        const s = replayArchive(meta, ndjson, expertsRef.current, true);
        setSessions((prev) => {
          const had = prev.some((x) => x.id === s.id);
          return had ? prev.map((x) => (x.id === s.id ? s : x)) : [...prev, s];
        });
        const workspace = localStorage.getItem("split.workspace") || "";
        await invoke("start_session", {
          id: meta.id,
          harness: meta.harness,
          expert: meta.expert,
          workspace,
          resume: true,
        });
        return s.id;
      } catch {
        return null;
      }
    },
    [sessions]
  );

  return { sessions, start, send, sendAuth, sendLogout, sendPermission, stop, remove, cancelQueued, pickArtifact, openArchive, resumeArchive };
}
