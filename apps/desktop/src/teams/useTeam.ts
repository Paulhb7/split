// useTeam — the Chief-of-Staff orchestrator (TS port of mockups/team_chief.py).
//
// Drives real sessions through useSessions (so each agent is a first-class session,
// visible in both Simple & Teams). The CoS↔expert handoff is a typed JSON decision
// — the seam we can later swap for a Python/A2A backend without touching the view.
//
// Control loop lives here; render state (sessions[]) lives in useSessions. Both
// consume the same `session-event` broadcast: useTeam adds its own listener purely
// to implement awaitIdle(id) → committed text (mirrors team_chief.py's Agent.ask).
import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { SessionEvent, VEvt } from "../shared/events";
import type { ExpertMap } from "../shared/experts";
import type { StartArgs } from "../shared/useSessions";
import type { QueuedTurn } from "../shared/models";

const CHIEF = "chief_of_staff";
const WORKERS = ["engineer", "scientist"] as const;
const ROLE: Record<string, string> = {
  engineer: "build / implementation",
  scientist: "research / security",
};
const MAX_DELEG = 5; // cost guard — agents talking = tokens burning
const ASK_TIMEOUT = 200_000; // ms per turn before we bail

export interface TeamMember {
  key: string; // expert slug
  name: string;
  role: string;
  harness: string;
  sessionId?: string;
}
export interface TeamTurn {
  tid: string;
  key: string; // speaker slug
  name: string;
  harness: string;
  text: string;
  mentions: string[]; // [target] for a chief delegation; [chief] for a worker reply
  synthesis?: boolean;
}
export interface TeamState {
  goal: string;
  channel: string;
  status: "idle" | "running" | "done";
  roster: TeamMember[];
  transcript: TeamTurn[];
  activeKey: string | null; // who's speaking right now (for the live indicator)
  activeSessionId: string | null;
  delegations: number;
  stopped: "done" | "cap" | null;
}

const EMPTY: TeamState = {
  goal: "", channel: "team", status: "idle", roster: [], transcript: [],
  activeKey: null, activeSessionId: null, delegations: 0, stopped: null,
};

// --- the chief's tiny JSON protocol + prompt scaffolding (ported) ---------
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
  const m = text.match(/\{[\s\S]*\}/); // first {...} (the chief may wrap it in prose)
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

interface TeamApi {
  start: (a: StartArgs) => Promise<string>;
  send: (id: string, t: QueuedTurn) => void;
  stop: (id: string) => void;
}

export function useTeam(api: TeamApi, experts: ExpertMap) {
  const [team, setTeam] = useState<TeamState>(EMPTY);

  // await-idle plumbing: per-id say buffer + a pending resolver, fed by our own
  // session-event listener. resolve on status:idle (or error/exit/timeout).
  const bufRef = useRef<Map<string, string>>(new Map());
  const pendingRef = useRef<Map<string, (text: string) => void>>(new Map());
  const idsRef = useRef<string[]>([]); // every session this run started (for stopTeam)
  const runningRef = useRef(false);

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

  // wait for `id` to finish its current turn, returning the committed say text.
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

  const stopTeam = useCallback(() => {
    idsRef.current.forEach((id) => api.stop(id));
    pendingRef.current.clear();
    runningRef.current = false;
    setTeam((t) => ({ ...t, status: t.transcript.length ? "done" : "idle", activeKey: null, activeSessionId: null }));
  }, [api]);

  const runTeam = useCallback(
    async (goal: string, harness: string) => {
      if (runningRef.current) return;
      runningRef.current = true;
      idsRef.current = [];
      bufRef.current.clear();
      pendingRef.current.clear();

      const roster: TeamMember[] = [
        { key: CHIEF, name: nameOf(CHIEF), role: "orchestrator", harness },
        ...WORKERS.map((k) => ({ key: k, name: nameOf(k), role: ROLE[k], harness })),
      ];
      setTeam({ ...EMPTY, goal, channel: "team", status: "running", roster });

      const ids: Record<string, string> = {};
      let tcount = 0;
      const tid = () => `tt-${tcount++}-${Math.random().toString(36).slice(2, 6)}`;
      const setMemberSession = (key: string, sessionId: string) =>
        setTeam((t) => ({ ...t, roster: t.roster.map((m) => (m.key === key ? { ...m, sessionId } : m)) }));
      const setActive = (key: string | null) =>
        setTeam((t) => ({ ...t, activeKey: key, activeSessionId: key ? ids[key] ?? null : null }));
      const pushTurn = (turn: Omit<TeamTurn, "tid">) =>
        setTeam((t) => ({ ...t, transcript: [...t.transcript, { ...turn, tid: tid() }] }));

      const harnessOf = (key: string) => roster.find((m) => m.key === key)!.harness;
      const workerKeys = roster.filter((m) => m.key !== CHIEF).map((m) => m.key);
      const normTo = (s: string) => {
        const t = (s || "").toLowerCase();
        return workerKeys.find((k) => t.includes(k) || nameOf(k).toLowerCase().includes(t) || t.includes(nameOf(k).toLowerCase())) || workerKeys[0];
      };

      // ask a member (start it lazily on first call, else send a follow-up turn)
      const askMember = async (key: string, wire: string, display: string) => {
        setActive(key);
        if (!ids[key]) {
          const id = await api.start({ harness: harnessOf(key), expertSlug: key, display, wire });
          ids[key] = id;
          idsRef.current.push(id);
          setMemberSession(key, id);
        } else {
          api.send(ids[key], { display, wire, files: [] });
        }
        const out = await awaitIdle(ids[key]);
        setActive(null);
        return out;
      };

      // 1) brief the chief → first decision
      let reply = await askMember(CHIEF, SEED(goal, roster), goal);

      let summary: string | null = null;
      let delegations = 0;
      while (delegations < MAX_DELEG) {
        const dec = parseDecision(reply);
        if (!dec || dec.action === "finish") { summary = dec?.summary ?? reply; break; }
        // delegate
        const to = normTo(dec.to ?? "");
        const task = (dec.task ?? "").trim();
        pushTurn({ key: CHIEF, name: nameOf(CHIEF), harness: harnessOf(CHIEF), text: task, mentions: [to] });
        delegations++;
        setTeam((t) => ({ ...t, delegations }));

        const wreply = await askMember(to, workerWrap(nameOf(to), ROLE[to] || "", task), task);
        pushTurn({ key: to, name: nameOf(to), harness: harnessOf(to), text: wreply, mentions: [CHIEF] });

        reply = await askMember(CHIEF, feedback(nameOf(to), wreply), `(feedback from ${nameOf(to)})`);
      }

      let stopped: "done" | "cap" = "done";
      if (summary == null) {
        // hit the delegation budget → force a synthesis
        const forced = await askMember(CHIEF, FORCE_FINISH, "(wrap up)");
        summary = parseDecision(forced)?.summary ?? forced;
        stopped = "cap";
      }
      pushTurn({ key: CHIEF, name: nameOf(CHIEF), harness: harnessOf(CHIEF), text: summary, mentions: [], synthesis: true });
      setTeam((t) => ({ ...t, status: "done", stopped, activeKey: null, activeSessionId: null }));
      runningRef.current = false;
    },
    [api, awaitIdle, nameOf]
  );

  return { team, runTeam, stopTeam };
}
