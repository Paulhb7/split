// Machine scan for harnesses: did the vendor CLI resolve on THIS machine, what
// version, is it signed in? The Rust `scan_harnesses` command probes each
// harness on its own thread and streams a `scan-event` per result (in
// completion order), ending with a
// `{ done: true }` event. This hook accumulates those into a map keyed by id so
// the onboarding can paint each card the moment its probe settles.
//
// This is the richer sibling of `useHarnessStates` (which derives install +
// configure pastilles synchronously from harnesses.json + filesystem). The scan
// adds the honest "is the CLI actually here?" signal `harness_states` can't give
// for npx harnesses, plus typed diagnostics carrying their own fix action.
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { HARNESSES } from "./harnesses";

export type AuthState = "ok" | "missing" | "unknown";
export type FixAction = "install" | "login" | "set-key" | "open-docs" | "rescan";
export type DiagnosticKind =
  | "not-on-path"
  | "not-executable"
  | "shim-broken"
  | "auth-missing";

export interface Diagnostic {
  kind: DiagnosticKind;
  message: string;
  fix: FixAction;
}

export interface DetectedHarness {
  id: string;
  available: boolean;
  version?: string;
  path?: string;
  auth: AuthState;
  /** install.kind from harnesses.json — "npx" launches lazily (auth gates use),
   *  external/binary genuinely need `available`. */
  install_kind?: string;
  diagnostics?: Diagnostic[];
}

// The scan-event payload is either one harness result or the terminal marker.
type ScanEvent = DetectedHarness | { done: true };
const isDone = (e: ScanEvent): e is { done: true } => "done" in e;

export type DetectedMap = Record<string, DetectedHarness>;

export interface ScanAPI {
  byId: DetectedMap;
  scanning: boolean;
  rescan: () => void;
}

export function useHarnessScan(): ScanAPI {
  const [byId, setById] = useState<DetectedMap>({});
  const [scanning, setScanning] = useState(true);
  // Refs so the focus/install listeners (bound once) read live values without
  // re-binding: `scanningRef` avoids re-scanning while a scan is in flight;
  // `lastScanRef` throttles bursty triggers (focus fires on every app re-focus).
  const scanningRef = useRef(true);
  scanningRef.current = scanning;
  const lastScanRef = useRef(0);

  const rescan = useCallback(async () => {
    lastScanRef.current = Date.now();
    setById({});
    setScanning(true);
    try {
      await invoke("scan_harnesses");
    } catch (e) {
      console.error("scan_harnesses failed", e);
      setScanning(false);
    }
  }, []);

  // Re-scan opportunistically, but not while one is running and not more than
  // once every few seconds. This is what makes sign-in "just update": OAuth
  // happens in an external browser/terminal, so the creds only land once the
  // user returns — caught by the window `focus` below.
  const maybeRescan = useCallback(() => {
    if (scanningRef.current) return;
    if (Date.now() - lastScanRef.current < 3000) return;
    rescan();
  }, [rescan]);

  useEffect(() => {
    let unlistenScan: UnlistenFn | null = null;
    let unlistenInstall: UnlistenFn | null = null;
    listen<ScanEvent>("scan-event", (e) => {
      const p = e.payload;
      if (isDone(p)) {
        setScanning(false);
        return;
      }
      setById((m) => ({ ...m, [p.id]: p }));
    }).then((fn) => {
      unlistenScan = fn;
    });
    // An install / configure finished (npm warm, script install, oauth launch) —
    // the machine may have changed, so re-probe (throttled).
    listen<{ done?: boolean }>("install-event", (e) => {
      if (e.payload?.done) maybeRescan();
    }).then((fn) => {
      unlistenInstall = fn;
    });
    // Returning to the window after an external sign-in/install → re-probe.
    const onFocus = () => maybeRescan();
    window.addEventListener("focus", onFocus);
    rescan();
    return () => {
      unlistenScan?.();
      unlistenInstall?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [rescan, maybeRescan]);

  return { byId, scanning, rescan };
}

// The single "three answers in one shape" health a card renders. `scanning`
// distinguishes "not yet probed" (shimmer) from "probed, not found".
export type Health = "ready" | "needs-auth" | "needs-install" | "scanning";

// Usability gate, kind-aware:
//  - auth ok (creds dotfile OR API key) → ready, regardless of CLI presence.
//  - npx harnesses launch lazily via npx, so a missing vendor CLI is only a
//    needs-auth nudge (sign in / set a key), never a hard "needs-install".
//  - external/binary/script harnesses genuinely need the binary present.
export function healthOf(d: DetectedHarness | undefined, scanning: boolean): Health {
  if (!d) return scanning ? "scanning" : "needs-install";
  if (d.auth === "ok") return "ready";
  const lazy = d.install_kind === "npx";
  if (!d.available && !lazy) return "needs-install";
  return "needs-auth";
}

const HEALTH_RANK: Record<Health, number> = {
  ready: 0,
  "needs-auth": 1,
  "needs-install": 2,
  scanning: 3,
};

// Preference order = registry order in HARNESSES (Claude first, …). Used as the
// tie-break so a fully-ready Codex still beats a fully-ready Gemini only by
// listing, never by chance.
const PREF = new Map(HARNESSES.map((h, i) => [h.id, i] as const));

// Rank harness ids best-first: installed-and-signed-in wins, then
// installed-but-needs-auth, then needs-install; ties broken by registry order.
// This drives the wizard's "Recommended" featured pick and the auto-seed.
export function rankHarnesses(byId: DetectedMap, scanning: boolean): string[] {
  return HARNESSES.map((h) => h.id).sort((a, b) => {
    const ra = HEALTH_RANK[healthOf(byId[a], scanning)];
    const rb = HEALTH_RANK[healthOf(byId[b], scanning)];
    if (ra !== rb) return ra - rb;
    return (PREF.get(a) ?? 99) - (PREF.get(b) ?? 99);
  });
}

// The single best detected harness (the "Recommended" featured card), or the
// registry default while the scan is still warming up.
export function bestHarness(byId: DetectedMap, scanning: boolean): string {
  return rankHarnesses(byId, scanning)[0] ?? "claude";
}
