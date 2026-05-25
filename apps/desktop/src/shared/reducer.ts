import type { VEvt } from "./events";
import type { Session } from "./models";

const clip = (s: string, n = 90) => (s.length > n ? s.slice(s.length - n) : s);
const head = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + "…" : s);

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
        answer: s.answer + ev.text,
        summary: "writing · " + clip(s.answer + ev.text),
      };

    case "thought":
      return s.status === "running" ? { ...s, summary: "thinking…" } : s;

    case "step":
      return { ...s, status: "running", summary: `→ ${ev.title || "tool"} · ${ev.status || ""}` };

    case "plan":
      return { ...s, plan: ev.entries };

    case "usage":
      return ev.cost != null ? { ...s, cost: ev.cost } : s;

    case "status":
      if (ev.status === "running") return { ...s, status: "running", summary: "thinking…" };
      if (ev.status === "idle") {
        const committed = s.answer
          ? [...s.thread, { role: "agent" as const, text: s.answer }]
          : s.thread;
        return {
          ...s,
          status: "idle",
          thread: committed,
          answer: "",
          summary: "done · " + (head(s.answer) || "ready"),
        };
      }
      if (ev.status === "error")
        return { ...s, status: "error", summary: "error · " + (ev.error || "") };
      if (ev.status === "ended") return { ...s, status: "ended", summary: "ended" };
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

    default:
      return s;
  }
}
