// The expert (persona) registry — shape of acp-client/experts.json, an object
// keyed by slug. Loaded from Rust `list_experts` at runtime.

export type ExpertKind =
  | "researcher"
  | "advisor"
  | "analyst"
  | "builder"
  | "finder"
  | "operator"
  | "creator"
  | "recruiter";

export interface Expert {
  /** Persona name shown in the UI (e.g. "Wolfgang", "Curie"). */
  label: string;
  /** Human role / job title (e.g. "Consultant", "Data Analyst"). Shown next
   * to the genius name in the @-picker so users learn who's who. Optional
   * for backwards compatibility — falls back to the prettified slug. */
  role?: string;
  kind: ExpertKind;
  blurb: string;
}

export type ExpertMap = Record<string, Expert>;

// Fallback roster if `list_experts` fails (matches experts.json order/defaults).
export const DEFAULT_EXPERTS: ExpertMap = {
  consultant: { label: "Wolfgang", role: "Consultant", kind: "researcher", blurb: "Web research into ready slides" },
  scientist: { label: "Curie", role: "Scientist", kind: "researcher", blurb: "Bridges fields to find new ideas, maps the state of the art" },
  lawyer: { label: "Cicero", role: "Lawyer", kind: "advisor", blurb: "Legal guidance, risk & clauses" },
  data_analyst: { label: "Turing", role: "Data Analyst", kind: "analyst", blurb: "CSV analysis, charts & dashboards" },
  engineer: { label: "Tesla", role: "Engineer", kind: "builder", blurb: "Builds micro-apps & landing pages, ships them to a public URL" },
  operator: { label: "Alfred", role: "Operator", kind: "operator", blurb: "Drives your apps with your logins — books, fills forms, runs admin" },
};
