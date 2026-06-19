import type { VEvt } from "./events";
import { isDeliverableArtifact } from "./events";
import type { Session } from "./models";

const clip = (s: string, n = 90) => (s.length > n ? s.slice(s.length - n) : s);
const head = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + "…" : s);

// The turn clock: keep the existing anchor while the turn runs, stamp a fresh
// one on the transition into "running" (say/thought/step can be the first
// event of a turn — agents don't all open with `status:running`).
const turnStart = (s: Session) =>
  s.status === "running" && s.turnStartedAt != null ? s.turnStartedAt : Date.now();

// Fold one VEVT event into a session. Pure — the caller does the setState.
// `status:idle` is the turn-finished signal (no separate `done` event): the
// streamed answer is committed into the thread there.
export function applyEvent(s: Session, ev: VEvt): Session {
  switch (ev.type) {
    case "ready":
      return { ...s, summary: s.summary === "briefing…" ? "starting engine…" : s.summary };

    case "say":
      return {
        ...s,
        status: "running",
        turnStartedAt: turnStart(s),
        answer: s.answer + ev.text,
        summary: "writing · " + clip(s.answer + ev.text),
      };

    case "thought":
      return {
        ...s,
        status: "running",
        turnStartedAt: turnStart(s),
        thoughts: s.thoughts + ev.text,
        summary: "thinking…",
      };

    case "step": {
      const step = { title: ev.title || "tool", status: ev.status || "" };
      // Keep the last 40 steps of the turn — enough for the activity fold,
      // bounded so a chatty agent can't grow the array without limit.
      const steps = [...s.steps, step].slice(-40);
      return { ...s, status: "running", turnStartedAt: turnStart(s), steps, summary: `→ ${step.title} · ${step.status}` };
    }

    case "plan":
      return { ...s, plan: ev.entries };

    case "commands":
      return { ...s, commands: ev.commands };

    case "usage":
      return ev.cost != null ? { ...s, cost: ev.cost } : s;

    case "status":
      if (ev.status === "running")
        return { ...s, status: "running", turnStartedAt: turnStart(s), summary: "thinking…" };
      if (ev.status === "idle") {
        const tookMs = s.turnStartedAt != null ? Date.now() - s.turnStartedAt : undefined;
        const steps = s.steps.length ? s.steps : undefined;
        const withThoughts = s.thoughts
          ? [...s.thread, { role: "thought" as const, text: s.thoughts }]
          : s.thread;
        // The turn's activity (steps + duration) rides the answer turn so the
        // collapsed "what it did" fold sits with the reply it produced.
        const committed = s.answer
          ? [...withThoughts, { role: "agent" as const, text: s.answer, steps, tookMs }]
          : withThoughts;
        return {
          ...s,
          status: "idle",
          turnStartedAt: null,
          thread: committed,
          answer: "",
          thoughts: "",
          steps: [],
          summary: "done · " + (head(s.answer) || "ready"),
        };
      }
      if (ev.status === "error")
        return { ...s, status: "error", turnStartedAt: null, steps: [], summary: "error · " + (ev.error || "") };
      // "ended" is not a VEVT status — end-of-session arrives as the wire
      // envelope's `exit` flag and is applied in useSessions directly.
      return s;

    case "auth_required":
      return {
        ...s,
        status: "auth",
        summary: "needs sign-in",
        auth: {
          harness: ev.harness,
          methods: ev.methods || [],
          hasLogin: !!ev.hasLogin,
          note: ev.note || "",
        },
      };

    case "auth_result":
      // success → clear the prompt; the runner re-runs the pending turn and a
      // fresh `status:running` will follow. failure → surface the error.
      return ev.ok
        ? { ...s, auth: null, summary: "signed in…" }
        : { ...s, status: "error", auth: null, summary: "sign-in failed · " + (ev.error || "") };

    case "artifact": {
      // Only deliverables reach the panels — working files (logs, scripts,
      // manifests: .log/.sh/.py/.json/.txt…) are ignored entirely, so they
      // neither clutter the strip nor steal the active selection.
      if (!isDeliverableArtifact(ev.rel)) return s;
      const others = s.artifacts.filter((a) => a.rel !== ev.rel);
      if (ev.op === "deleted") {
        // Drop the entry and clear the viewer if it was the active one.
        const active = s.activeArtifact === ev.rel ? (others[others.length - 1]?.rel ?? null) : s.activeArtifact;
        return { ...s, artifacts: others, activeArtifact: active };
      }
      const entry = { rel: ev.rel, path: ev.path, op: ev.op, size: ev.size, mtime: ev.mtime };
      // Newest at the end so the viewer's default selection ("last touched")
      // matches what just came in.
      return { ...s, artifacts: [...others, entry], activeArtifact: ev.rel };
    }

    case "permission_request":
      // The runner is blocked awaiting a decision — surface it on the session
      // so the focused-session UI shows the PermissionPrompt. Latest ask wins
      // if two arrive in flight (rare with one agent per session).
      return {
        ...s,
        pendingPermission: {
          id: ev.id,
          toolId: ev.toolId,
          expert: ev.expert,
          options: ev.options,
          toolCall: ev.toolCall,
        },
        summary: "needs approval · " + ev.toolId,
      };

    default:
      return s;
  }
}
