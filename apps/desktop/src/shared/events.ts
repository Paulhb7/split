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

// One ACP-side option the agent offered us for a permission request.
export interface PermissionOption {
  id: string;     // option_id we send back via send_permission
  name: string;   // human label (may be empty)
  kind: string;   // raw kind hint: "allow_once" / "allow_always" / "reject_*" / ...
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
  | { type: "auth_result"; harness: string; ok: boolean; error?: string }
  | { type: "permission_request"; id: string; toolId: string; expert: string;
      toolCall: Record<string, unknown>; options: PermissionOption[] };

// One stdout/stderr line from a session, tagged by Rust with its id. Exactly one
// of vevt / log / exit is meaningful per event.
export interface SessionEvent {
  id: string;
  vevt: string | null;
  log: string | null;
  exit: boolean;
}

// One row of `list_archived_sessions` — the `meta.json` written by the runner
// at start (+ updated at close). Drives the "past conversations" picker.
export interface ArchivedSessionMeta {
  id: string;
  harness: string;
  expert: string;
  title: string;
  started_at: string;
  ended_at: string;
}
