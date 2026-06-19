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

// One slash command the agent advertised via `available_commands_update`. The
// client invokes it by sending `/<name> <args>` as a regular prompt text.
export interface SlashCommand {
  name: string;
  description: string;
  hint?: string; // expected-input hint (empty/absent = no args)
}

// One ACP-side option the agent offered us for a permission request.
export interface PermissionOption {
  id: string;     // option_id we send back via send_permission
  name: string;   // human label (may be empty)
  kind: string;   // raw kind hint: "allow_once" / "allow_always" / "reject_*" / ...
}

// One file the expert produced (or modified / deleted) during a turn —
// detected by snapshot-diffing the expert workspace between idle marks.
// `path` is absolute (for `shell.open`-style use); `rel` is relative to the
// expert workspace root (for display). The reducer keys by `rel`.
export interface Artifact {
  rel: string;
  path: string;
  op: "created" | "modified" | "deleted";
  size: number;
  mtime: number; // unix epoch seconds
}

// Artifact panels show DELIVERABLES, not the working files a pipeline leaves
// behind (logs, scripts, manifests, configs). A long video/music run can drop
// 50+ of these — they drown the actual output. These extensions are treated as
// scaffolding and filtered out of every artifact surface (strip, atelier grid,
// Reflet, dots) at the reducer, so a `.log` write also can't steal the active
// selection. Media (mp4/mp3/png…), pages (html), and docs (md/pdf/csv/docx)
// all pass through.
const WORKING_FILE_EXTS = new Set([
  "log", "sh", "bash", "zsh", "fish",
  "py", "pyc", "pyo",
  "json", "jsonl", "ndjson",
  "txt", "yaml", "yml", "toml", "ini", "cfg", "conf", "lock", "env",
]);

export function isDeliverableArtifact(rel: string): boolean {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot < 0) return true; // no extension → not obviously scaffolding, show it
  return !WORKING_FILE_EXTS.has(base.slice(dot + 1).toLowerCase());
}

export type VEvt =
  | { type: "ready"; harness: string; expert: string }
  | { type: "say"; text: string }
  | { type: "thought"; text: string }
  | { type: "step"; title: string; status: string }
  | { type: "plan"; entries: PlanEntry[] }
  | { type: "commands"; commands: SlashCommand[] }
  | { type: "usage"; used: number; size: number; cost: number | null }
  | { type: "status"; status: "running" | "idle" | "error"; stop?: string; error?: string }
  | { type: "auth_required"; harness: string; methods: AuthMethod[]; hasLogin: boolean; note: string }
  | { type: "auth_result"; harness: string; ok: boolean; error?: string; loggedOut?: boolean }
  | { type: "permission_request"; id: string; toolId: string; expert: string;
      toolCall: Record<string, unknown>; options: PermissionOption[] }
  | { type: "artifact"; rel: string; path: string; op: "created" | "modified" | "deleted";
      size: number; mtime: number };

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
