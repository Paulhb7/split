import type { Artifact, AuthMethod, PermissionOption, PlanEntry, SlashCommand } from "./events";

// "running" = a turn is in flight; "idle" = ready for the next turn;
// "auth" = blocked on sign-in; "error" = last turn failed; "ended" = process gone.
export type SessionStatus = "running" | "idle" | "auth" | "error" | "ended";

// One activity step the agent reported during a turn (a tool call / phase).
// Retained so a finished turn can show a collapsed "what it did" fold.
export interface Step {
  title: string;
  status: string;
}

export interface ThreadTurn {
  role: "user" | "agent" | "thought";
  text: string;
  files?: string[]; // attachment names, for the 📎 chip
  // Agent turns only: the steps the agent ran this turn + how long it took.
  // Drives the collapsed activity fold above the answer. Absent on old
  // archives (replayed turns simply show no fold).
  steps?: Step[];
  tookMs?: number;
}

// A pending auth_required surfaced by the agent (drives the AuthModal).
export interface AuthAsk {
  harness: string;
  methods: AuthMethod[];
  hasLogin: boolean;
  note: string;
}

// A pending permission_request — the agent wants to run a tool and the engine
// said "ask". Resolved by sending send_permission(id, requestId, optionId, scope).
export interface PermissionAsk {
  id: string;                      // request_id from the runner
  toolId: string;                  // "Bash(npm test)" / "mcp__cua_driver__click" / …
  expert: string;
  options: PermissionOption[];     // what the agent offered
  toolCall: Record<string, unknown>;
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
  thoughts: string; // currently-streaming COT thoughts (uncommitted) — committed before `answer` at idle

  // Steps reported during the CURRENT turn (live). Accumulated by the reducer
  // on each `step` event, attached to the committed agent turn at idle, then
  // cleared for the next turn.
  steps: Step[];
  summary: string; // live one-line status (thinking / writing / → tool / done)
  // Epoch ms of the current turn's start — set by the reducer on the
  // transition into "running", cleared at idle/error. The TurnSpinner anchors
  // its elapsed clock here so navigating away and back (component remount)
  // doesn't reset the counter mid-turn. null = no turn in flight (or a
  // session hydrated mid-turn from another window — spinner falls back to
  // its mount time).
  turnStartedAt: number | null;
  plan: PlanEntry[];
  // Slash commands advertised by the agent via `available_commands_update`.
  // Drives the autocomplete palette in the composer; empty = no agent commands.
  commands: SlashCommand[];
  cost: number | null;
  logs: string[];
  auth: AuthAsk | null;
  pendingPermission: PermissionAsk | null;
  queued: QueuedTurn | null;
  // true = materialised from `var/sessions/<id>/` (a past conversation, read-only).
  // Used by the UI to hide the composer and show a "PAST" badge.
  archived?: boolean;
  // Non-empty = this session was spawned by Teams mode (the value is the
  // Teams channelId). Classic home filters these out; Teams owns them. Tagged
  // in-memory at start time only — sessions hydrated from `var/sessions/` on
  // app boot won't have it (we accept that team sessions are dead after a
  // restart and the user closes them from classic UI).
  teamId?: string;
  // Files the agent produced in its workspace during this session — detected
  // by the Rust runner's snapshot/diff at each `status:idle`. Upserted by
  // `rel`; entries with op:"deleted" are removed (not kept as tombstones).
  // `activeArtifact` is the `rel` of the file the viewer should show; reset
  // by the reducer whenever a new artifact arrives.
  artifacts: Artifact[];
  activeArtifact: string | null;
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
  files: string[] = [],
  teamId?: string,
): Session {
  return {
    id,
    harness,
    expertSlug,
    expertLabel,
    status: "running",
    turnStartedAt: Date.now(),
    thread: firstUserText || files.length
      ? [{ role: "user", text: firstUserText, files: files.length ? files : undefined }]
      : [],
    answer: "",
    thoughts: "",
    steps: [],
    summary: "briefing…",
    plan: [],
    commands: [],
    cost: null,
    logs: [],
    auth: null,
    pendingPermission: null,
    queued: null,
    teamId,
    artifacts: [],
    activeArtifact: null,
  };
}
