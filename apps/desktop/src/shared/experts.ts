// The expert (persona) registry — shape of acp-client/experts.json, an object
// keyed by slug. Loaded from Rust `list_experts` at runtime.

export type ExpertKind =
  | "researcher"
  | "advisor"
  | "analyst"
  | "builder"
  | "finder"
  | "operator"
  | "creator";

export interface Expert {
  label: string;
  kind: ExpertKind;
  blurb: string;
}

export type ExpertMap = Record<string, Expert>;

// Fallback roster if `list_experts` fails (matches experts.json order/defaults).
export const DEFAULT_EXPERTS: ExpertMap = {
  consultant: { label: "Consultant", kind: "researcher", blurb: "Web research into ready slides" },
  scientist: { label: "Scientist", kind: "researcher", blurb: "Deep research, papers & peer review" },
  lawyer: { label: "Lawyer", kind: "advisor", blurb: "Legal guidance, risk & clauses" },
  analyst: { label: "Data Analyst", kind: "analyst", blurb: "CSV analysis, charts & dashboards" },
  engineer: { label: "Software Engineer", kind: "builder", blurb: "Builds single-file HTML apps" },
  finder: { label: "File Finder", kind: "finder", blurb: "Finds files on your Mac" },
  vision: { label: "Vision", kind: "operator", blurb: "Drives your apps in the background" },
};
