// The expert (persona) registry — shape of acp-client/experts.json, an object
// keyed by slug. Loaded from Rust `list_experts` at runtime.

export type ExpertKind =
  | "researcher"
  | "advisor"
  | "analyst"
  | "builder"
  | "finder"
  | "operator"
  | "organizer"
  | "creator"
  | "recruiter"
  | "coach";

export interface Expert {
  /** Primary user-facing name. For 'super' agents = the job title
   * ("Consultant", "Lawyer"); for 'genius' agents = the historical figure
   * ("DaVinci", "Bach", "Socrates"). */
  label: string;
  /** Human role / job title for super agents. Optional (only set when label
   * itself is not already a role). Legacy: still present on a few super
   * agents that lost their genius name; kept for tooltips. */
  role?: string;
  /** Historical persona behind a super agent ("Wolfgang" for Consultant,
   * "Tesla" for Engineer…). Preserved so personas can still claim a genius
   * lineage even when the label is the role. Unused for genius agents (their
   * label IS the figure). */
  figure?: string;
  /** Three-bucket split that drives roster UX:
   * - 'super'  = jobs (productivity over existing tasks, sober aesthetic)
   * - 'genius' = creators / unique figures (frontier outputs, flamboyant)
   * - 'coach'  = personal mentors (diet, learning, sport, cooking, …)
   * Defaults to 'super' on legacy data. */
  category?: "super" | "genius" | "coach";
  kind: ExpertKind;
  blurb: string;
}

export type ExpertMap = Record<string, Expert>;

// Slugs hidden from the classic single-expert UI surfaces (@-picker, onboarding
// cabinet). They still exist in the registry — Teams mode picks them up
// directly. Chief of Staff (Toscanini) is the team conductor; it has no role
// when there's only one expert in the room.
export const TEAMS_ONLY = new Set<string>(["chief_of_staff"]);
export const isClassicExpert = (slug: string) => !TEAMS_ONLY.has(slug);

// Fallback roster if `list_experts` fails (matches experts.json order/defaults).
export const DEFAULT_EXPERTS: ExpertMap = {
  consultant: { label: "Consultant", category: "super", kind: "researcher", blurb: "Web research into ready slides" },
  scientist: { label: "Scientist", category: "super", kind: "researcher", blurb: "Bridges fields to find new ideas, maps the state of the art" },
  lawyer: { label: "Lawyer", category: "super", kind: "advisor", blurb: "Legal guidance, risk & clauses" },
  data_analyst: { label: "Data Analyst", category: "super", kind: "analyst", blurb: "CSV analysis, charts & dashboards" },
  engineer: { label: "Engineer", category: "super", kind: "builder", blurb: "Builds micro-apps & landing pages, ships them to a public URL" },
  designer: { label: "DaVinci", category: "genius", kind: "creator", blurb: "Builds entire visual universes — worlds, brand identities, scene direction" },
  musician: { label: "Wolfgang", category: "genius", kind: "creator", blurb: "Composes original music — songs, scores, soundtracks" },
  director: { label: "Kubrick", category: "genius", kind: "creator", blurb: "Directs short films — visual + score + voice, in one piece" },
  operator: { label: "Alfred", role: "Majordome", category: "genius", kind: "operator", blurb: "Your majordome — drives your apps with your logins, books, runs admin" },
};
