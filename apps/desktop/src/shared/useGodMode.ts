import { useEffect, useState } from "react";
import type { Session } from "./models";

const LS_GOD = "split.godMode"; // "1" = auto-approve every tool permission request

// God Mode — when on, every pending permission_request is auto-resolved
// with the agent's "allow" option (scope="once" so nothing gets persisted
// to var/permissions.json). Toggle persisted in localStorage; the toggle
// button lives in the conv-head.
export function useGodMode(
  sessions: Session[],
  sendPermission: (id: string, requestId: string, optionId: string | null, scope: "once") => void,
) {
  const [godMode, setGodModeState] = useState<boolean>(() => localStorage.getItem(LS_GOD) === "1");
  const toggleGodMode = () => {
    setGodModeState((on) => {
      const next = !on;
      localStorage.setItem(LS_GOD, next ? "1" : "0");
      return next;
    });
  };
  useEffect(() => {
    if (!godMode) return;
    for (const s of sessions) {
      const pp = s.pendingPermission;
      if (!pp) continue;
      // Match the Conversation.tsx selection: prefer a non-`always` allow
      // (we own persistence on our side) and fall back to any allow option.
      const allowOpt =
        pp.options.find((o) => /allow/i.test(o.kind) && !/always/i.test(o.kind)) ??
        pp.options.find((o) => /allow/i.test(o.kind));
      if (allowOpt) sendPermission(s.id, pp.id, allowOpt.id, "once");
    }
  }, [godMode, sessions, sendPermission]);
  return { godMode, toggleGodMode };
}
