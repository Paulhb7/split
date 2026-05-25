// The VEVT vocabulary emitted by split.runner (one `VEVT <json>` line per
// event), forwarded by Rust inside `session-event`.

export interface AuthMethod {
  id: string;
  name: string;
  description: string;
}

export interface PlanEntry {
  content: string;
  status: string;
}

export type VEvt =
  | { type: "ready"; harness: string; expert: string }
  | { type: "say"; text: string }
  | { type: "thought"; text: string }
  | { type: "step"; title: string; status: string }
  | { type: "plan"; entries: PlanEntry[] }
  | { type: "usage"; used: number; size: number; cost: number | null }
  | { type: "status"; status: "running" | "idle" | "error" | "ended"; stop?: string; error?: string }
  | { type: "auth_required"; harness: string; methods: AuthMethod[]; hasLogin: boolean; note: string }
  | { type: "auth_result"; harness: string; ok: boolean; error?: string };

// One stdout/stderr line from a session, tagged by Rust with its id. Exactly one
// of vevt / log / exit is meaningful per event.
export interface SessionEvent {
  id: string;
  vevt: string | null;
  log: string | null;
  exit: boolean;
}
