import type { AuthMethod, PlanEntry } from "./events";

// "running" = a turn is in flight; "idle" = ready for the next turn;
// "auth" = blocked on sign-in; "error" = last turn failed; "ended" = process gone.
export type SessionStatus = "running" | "idle" | "auth" | "error" | "ended";

export interface ThreadTurn {
  role: "user" | "agent";
  text: string;
  files?: string[]; // attachment names, for the 📎 chip
}

// A pending auth_required surfaced by the agent (drives the AuthModal).
export interface AuthAsk {
  harness: string;
  methods: AuthMethod[];
  hasLogin: boolean;
  note: string;
}

// A turn typed while the session was busy; sent when it goes idle.
export interface QueuedTurn {
  display: string;
  wire: string;
  files: string[];
}

export interface Session {
  id: string;
  harness: string; // engine id (key into HARNESSES)
  expertSlug: string;
  expertLabel: string;
  status: SessionStatus;
  thread: ThreadTurn[]; // committed conversation
  answer: string; // currently-streaming agent answer (uncommitted)
  summary: string; // live one-line status (thinking / writing / → tool / done)
  plan: PlanEntry[];
  cost: number | null;
  logs: string[];
  auth: AuthAsk | null;
  queued: QueuedTurn | null;
}

// What a session is doing *right now* — derived purely from status + summary
// (the same strings reducer.ts already sets). Drives the stage animation.
export type Activity = "idle" | "thinking" | "writing" | "tool" | "auth" | "error" | "ended";

export function activityOf(s: Session): Activity {
  if (s.status === "auth") return "auth";
  if (s.status === "error") return "error";
  if (s.status === "ended") return "ended";
  if (s.status === "idle") return "idle";
  // running: refine from the live summary
  if (s.summary.startsWith("→")) return "tool";
  if (/writing/.test(s.summary)) return "writing";
  return "thinking";
}

export function newSession(
  id: string,
  harness: string,
  expertSlug: string,
  expertLabel: string,
  firstUserText: string,
  files: string[] = []
): Session {
  return {
    id,
    harness,
    expertSlug,
    expertLabel,
    status: "running",
    thread: firstUserText || files.length
      ? [{ role: "user", text: firstUserText, files: files.length ? files : undefined }]
      : [],
    answer: "",
    summary: "briefing…",
    plan: [],
    cost: null,
    logs: [],
    auth: null,
    queued: null,
  };
}
