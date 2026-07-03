// The boss's HIRED TEAM — the favourited experts pinned to the atelier rail.
// A localStorage-backed set of expert slugs, so the rail shows the handful you
// actually use instead of the whole roster. Hired in onboarding ("Hire your
// team") and edited anytime from the rail's "+ Add experts…" browse view.
import type { ExpertMap } from "./experts";
import { isActiveExpert } from "./experts";

const LS_TEAM = "split.team";

// Pre-hired on first run — a sensible cross-section (a researcher, a builder, a
// designer, a genius, a coach) so the rail is neither empty nor the full roster.
// Filtered to whatever actually exists + is active at load time.
export const DEFAULT_TEAM = [
  "consultant",
  "engineer",
  "designer",
  "genius_davinci",
  "coach",
];

/** Whether the user has ever hired a team (an explicit choice exists in LS). */
export function hasSavedTeam(): boolean {
  return localStorage.getItem(LS_TEAM) !== null;
}

/** The hired team, filtered to currently-active experts. Falls back to
 * DEFAULT_TEAM when nothing has been saved yet (first run). */
export function loadTeam(experts: ExpertMap): string[] {
  try {
    const raw = localStorage.getItem(LS_TEAM);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) {
        return a.filter((s: unknown) => typeof s === "string" && isActiveExpert(experts, s as string));
      }
    }
  } catch {
    /* ignore — fall through to the default */
  }
  return DEFAULT_TEAM.filter((s) => isActiveExpert(experts, s));
}

export function saveTeam(slugs: string[]): void {
  localStorage.setItem(LS_TEAM, JSON.stringify(slugs));
}
