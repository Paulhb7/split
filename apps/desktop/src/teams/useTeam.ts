// useTeam — Chief-of-Staff orchestrator at the project level.
//
// Model (matches the product framing: server = project, channel = conversation):
//   Project  = long-lived team (roster + workspace + history of conversations).
//   Channel  = ONE Chief-of-Staff run on a goal (its transcript + its sessions).
//
// Multiple channels can run in parallel within the same project. Each channel
// spawns its own fresh sessions; the project's roster is just the persona list
// (chief + workers) — names/roles derived from the experts registry.
//
// The CoS handoff stays a typed JSON decision (the seam to swap for A2A later).
// No Rust/Python changes — agents are real `useSessions` sessions; we add our own
// `session-event` listener purely to implement awaitIdle(sessionId) → text.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { SessionEvent, VEvt } from "../shared/events";
import type { ExpertMap } from "../shared/experts";
import type { StartArgs } from "../shared/useSessions";
import type { QueuedTurn } from "../shared/models";

const CHIEF = "toscanini";
const ROSTER_KEYS = [CHIEF, "engineer", "scientist"] as const;
const ROLE: Record<string, string> = {
  engineer: "build / implementation",
  scientist: "research / security",
};
const MAX_DELEG = 5;          // cost guard — agents talking = tokens burning
const ASK_TIMEOUT = 200_000;  // ms per turn before we bail
const LS_PROJECT = "split.project";

// --- types -----------------------------------------------------------------
export interface TeamMember { key: string; name: string; role: string; harness: string; }
export interface TeamTurn {
  tid: string;
  key: string;        // speaker slug (chief or worker)
  name: string;
  harness: string;
  text: string;
  mentions: string[]; // [worker] on chief delegation; [chief] on worker reply
  synthesis?: boolean;
}
export interface Channel {
  id: string;
  name: string;       // slug derived from goal
  goal: string;
  harness: string;    // locked at channel creation
  status: "running" | "done";
  stopped: "done" | "cap" | null;
  transcript: TeamTurn[];
  activeKey: string | null;          // who's speaking right now in this channel
  activeSessionId: string | null;
  sessionIds: Record<string, string>; // expertSlug -> session id (this channel's sessions)
  delegations: number;
  createdAt: number;
}
export interface Project {
  id: string;
  name: string;
  rosterKeys: string[]; // ["toscanini", "engineer", "scientist"]
  channels: Channel[];
  activeChannelId: string | null;
}

// --- helpers ---------------------------------------------------------------
const uid = () => crypto.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// "Decide the refresh-token TTL …" → "decide-the-refresh-token"
function channelName(goal: string): string {
  const slug = goal.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().split(/\s+/).slice(0, 4).join("-");
  return slug || "new";
}

// The chief's tiny JSON protocol — port of team_chief.py
const CHIEF_RULES =
  'Respond with ONLY a JSON object, no prose, no code fence. Either:\n' +
  '  {"action":"delegate","to":"engineer"|"scientist","task":"<one concise instruction>"}\n' +
  '  {"action":"finish","summary":"<final recommendation for the boss, 3-5 sentences>"}\n' +
  "Delegate ONE expert at a time. Build on what you already heard. Finish as soon as you can answer the goal.";

const SEED = (goal: string, roster: TeamMember[]) =>
  `You are the Chief of Staff, the lead. Your boss's goal: ${goal}\n` +
  `Your team — ${roster.filter((m) => m.key !== CHIEF).map((m) => `${m.name} = ${m.role}`).join("; ")}.\n\n` +
  CHIEF_RULES;

const workerWrap = (name: string, role: string, task: string) =>
  `You are ${name} (${role}). The Chief of Staff asks:\n"${task}"\n\n` +
  "Answer in 3-4 sentences, concrete and decisive. You report to the Chief of Staff — " +
  "no need to @mention anyone, just give your answer.";

const feedback = (name: string, reply: string) =>
  `${name} replied:\n"${reply}"\n\nDecide the next step. ${CHIEF_RULES}`;

const FORCE_FINISH =
  "You have reached the delegation budget. Now finish: respond with ONLY " +
  '{"action":"finish","summary":"<final recommendation for the boss>"}.';

function parseDecision(text: string): { action?: string; to?: string; task?: string; summary?: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

interface TeamApi {
  start: (a: StartArgs) => Promise<string>;
  send: (id: string, t: QueuedTurn) => void;
  stop: (id: string) => void;
}

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(LS_PROJECT);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p && Array.isArray(p.channels)) {
        // sessions from a previous launch are dead — close out any "running" channel
        const channels = p.channels.map((c) =>
          c.status === "running"
            ? { ...c, status: "done" as const, stopped: c.stopped ?? "cap", sessionIds: {}, activeKey: null, activeSessionId: null }
            : c
        );
        return { id: p.id, name: p.name || "My Team", rosterKeys: p.rosterKeys?.length ? p.rosterKeys : [...ROSTER_KEYS], channels, activeChannelId: p.activeChannelId ?? null };
      }
    }
  } catch { /* ignore */ }
  return { id: uid(), name: "My Team", rosterKeys: [...ROSTER_KEYS], channels: [], activeChannelId: null };
}

// --- the hook --------------------------------------------------------------
export function useTeam(api: TeamApi, experts: ExpertMap) {
  const [project, setProject] = useState<Project>(() => loadProject());

  // persist on every change (small, sync)
  useEffect(() => {
    try { localStorage.setItem(LS_PROJECT, JSON.stringify(project)); } catch { /* quota */ }
  }, [project]);

  // await-idle plumbing — keyed by session id, so multiple channels can run in parallel
  const bufRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef<Map<string, (text: string) => void>>(new Map());
  const channelSessionsRef = useRef<Map<string, Set<string>>>(new Map()); // channelId -> session ids
  const runningRef = useRef<Set<string>>(new Set()); // channel ids currently running their loop

  useEffect(() => {
    const un = listen<SessionEvent>("session-event", (e) => {
      const { id, vevt, exit } = e.payload;
      const resolve = pendingRef.current.get(id);
      if (exit) {
        if (resolve) { pendingRef.current.delete(id); resolve(bufRef.current.get(id) || ""); }
        return;
      }
      if (vevt == null) return;
      let ev: VEvt;
      try { ev = JSON.parse(vevt); } catch { return; }
      if (ev.type === "say") {
        bufRef.current.set(id, (bufRef.current.get(id) || "") + ev.text);
      } else if (ev.type === "status" && (ev.status === "idle" || ev.status === "error")) {
        if (resolve) {
          pendingRef.current.delete(id);
          resolve(ev.status === "error" ? `(error: ${ev.error || "?"})` : bufRef.current.get(id) || "");
        }
      }
    });
    return () => { un.then((f) => f()); };
  }, []);

  const awaitIdle = useCallback((id: string) => {
    bufRef.current.set(id, "");
    return new Promise<string>((resolve) => {
      const done = (t: string) => { clearTimeout(timer); resolve(t); };
      const timer = setTimeout(() => {
        if (pendingRef.current.get(id) === done) pendingRef.current.delete(id);
        resolve("(timeout)");
      }, ASK_TIMEOUT);
      pendingRef.current.set(id, done);
    });
  }, []);

  const nameOf = useCallback(
    (slug: string) => experts[slug]?.label ?? slug.charAt(0).toUpperCase() + slug.slice(1),
    [experts]
  );

  const rosterFor = useCallback(
    (harness: string): TeamMember[] =>
      project.rosterKeys.map((k) => ({
        key: k,
        name: nameOf(k),
        role: k === CHIEF ? "orchestrator" : (ROLE[k] || ""),
        harness,
      })),
    [project.rosterKeys, nameOf]
  );

  const updateChannel = useCallback((channelId: string, fn: (c: Channel) => Channel) => {
    setProject((p) => ({ ...p, channels: p.channels.map((c) => (c.id === channelId ? fn(c) : c)) }));
  }, []);

  const setActiveChannel = useCallback((id: string) => {
    setProject((p) => ({ ...p, activeChannelId: id }));
  }, []);

  const stopChannel = useCallback((channelId: string) => {
    const sids = channelSessionsRef.current.get(channelId);
    if (sids) sids.forEach((id) => api.stop(id));
    runningRef.current.delete(channelId);
    updateChannel(channelId, (c) => ({
      ...c,
      status: "done",
      stopped: c.stopped ?? "cap",
      activeKey: null,
      activeSessionId: null,
    }));
  }, [api, updateChannel]);

  const removeChannel = useCallback((channelId: string) => {
    stopChannel(channelId);
    setProject((p) => {
      const channels = p.channels.filter((c) => c.id !== channelId);
      const activeChannelId = p.activeChannelId === channelId ? (channels[channels.length - 1]?.id ?? null) : p.activeChannelId;
      return { ...p, channels, activeChannelId };
    });
  }, [stopChannel]);

  const newChannel = useCallback(
    async (goal: string, harness: string) => {
      const channelId = uid();
      const created: Channel = {
        id: channelId, name: channelName(goal), goal, harness,
        status: "running", stopped: null, transcript: [],
        activeKey: null, activeSessionId: null, sessionIds: {},
        delegations: 0, createdAt: Date.now(),
      };
      setProject((p) => ({ ...p, channels: [...p.channels, created], activeChannelId: channelId }));
      runningRef.current.add(channelId);
      channelSessionsRef.current.set(channelId, new Set());

      const roster = rosterFor(harness);
      const workerKeys = roster.filter((m) => m.key !== CHIEF).map((m) => m.key);
      const sessionIdsLocal: Record<string, string> = {};

      const tidGen = () => `tt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const pushTurn = (turn: Omit<TeamTurn, "tid">) =>
        updateChannel(channelId, (c) => ({ ...c, transcript: [...c.transcript, { ...turn, tid: tidGen() }] }));
      const setActive = (key: string | null, sessionId: string | null) =>
        updateChannel(channelId, (c) => ({ ...c, activeKey: key, activeSessionId: sessionId }));

      const normTo = (s: string) => {
        const t = (s || "").toLowerCase();
        return workerKeys.find((k) => t.includes(k) || nameOf(k).toLowerCase().includes(t) || t.includes(nameOf(k).toLowerCase())) || workerKeys[0];
      };

      const askMember = async (key: string, wire: string, display: string): Promise<string> => {
        if (!runningRef.current.has(channelId)) return "(stopped)";
        let sid = sessionIdsLocal[key];
        if (!sid) {
          sid = await api.start({ harness, expertSlug: key, display, wire, teamId: channelId });
          sessionIdsLocal[key] = sid;
          channelSessionsRef.current.get(channelId)?.add(sid);
          updateChannel(channelId, (c) => ({ ...c, sessionIds: { ...c.sessionIds, [key]: sid } }));
        } else {
          api.send(sid, { display, wire, files: [] });
        }
        setActive(key, sid);
        const out = await awaitIdle(sid);
        setActive(null, null);
        return out;
      };

      try {
        let reply = await askMember(CHIEF, SEED(goal, roster), goal);
        let summary: string | null = null;
        let delegations = 0;

        while (delegations < MAX_DELEG && runningRef.current.has(channelId)) {
          const dec = parseDecision(reply);
          if (!dec || dec.action === "finish") { summary = dec?.summary ?? reply; break; }
          const to = normTo(dec.to ?? "");
          const task = (dec.task ?? "").trim();
          pushTurn({ key: CHIEF, name: nameOf(CHIEF), harness, text: task, mentions: [to] });
          delegations++;
          updateChannel(channelId, (c) => ({ ...c, delegations }));

          const wreply = await askMember(to, workerWrap(nameOf(to), ROLE[to] || "", task), task);
          pushTurn({ key: to, name: nameOf(to), harness, text: wreply, mentions: [CHIEF] });

          reply = await askMember(CHIEF, feedback(nameOf(to), wreply), `(feedback from ${nameOf(to)})`);
        }

        let stopped: "done" | "cap" = "done";
        if (summary == null) {
          const forced = await askMember(CHIEF, FORCE_FINISH, "(wrap up)");
          summary = parseDecision(forced)?.summary ?? forced;
          stopped = "cap";
        }
        pushTurn({ key: CHIEF, name: nameOf(CHIEF), harness, text: summary, mentions: [], synthesis: true });
        updateChannel(channelId, (c) => ({ ...c, status: "done", stopped, activeKey: null, activeSessionId: null }));
      } finally {
        runningRef.current.delete(channelId);
      }
    },
    [api, awaitIdle, nameOf, rosterFor, updateChannel]
  );

  const activeChannel = useMemo(
    () => project.channels.find((c) => c.id === project.activeChannelId) ?? null,
    [project.channels, project.activeChannelId]
  );

  const activeRoster = useMemo(
    () => rosterFor(activeChannel?.harness ?? "codex"),
    [activeChannel?.harness, rosterFor]
  );

  return {
    project,
    channels: project.channels,
    activeChannel,
    activeRoster,
    setActiveChannel,
    newChannel,
    stopChannel,
    removeChannel,
  };
}
