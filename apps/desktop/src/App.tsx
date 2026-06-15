import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { HARNESSES, H, brandOf } from "./shared/harnesses";
import { useExperts, composeTurn, type Attachment } from "./shared/util";
import { isActiveExpert } from "./shared/experts";
import { useSessions } from "./shared/useSessions";
import { useWindowChrome, useAdaptiveHeight, useFullscreen, useNativeFullscreen, useBarWidth } from "./shared/useWindowChrome";
import { useHarnessStates } from "./shared/useHarnessStates";
import { useToasts } from "./shared/useToasts";
import { useNativeNotify } from "./shared/useNativeNotify";
import { SKINS } from "./shared/skins";
import { useSkin } from "./shared/useSkin";
import { useComposer } from "./shared/useComposer";
import { useGodMode } from "./shared/useGodMode";
import { useRailResize } from "./shared/useRailResize";
import { League, vars } from "./shared/ui";
import { Composer } from "./home/Composer";
import { SessionRow } from "./home/SessionRow";
import { Conversation, type PeerAlert } from "./conversation/Conversation";
import { ArtifactViewer, ArtifactStrip } from "./conversation/ArtifactViewer";
import { AttentionRail } from "./conversation/AttentionRail";
import { AtelierLeft } from "./conversation/AtelierLeft";
import { Reflet } from "./conversation/Reflet";
import { Crest } from "./shared/Crest";
import { HistoryOverlay } from "./history/HistoryOverlay";
import { AuthModal } from "./auth/AuthModal";
import Onboarding from "./onboarding/Onboarding";
import Teams from "./teams/Teams";
import { useTeam } from "./teams/useTeam";
import Cabinet from "./cabinet/Cabinet";
import { VaultOverlay } from "./vault/VaultOverlay";
import SplitMark from "./shared/SplitMark";
import "./app.css";

const LS_DONE = "split.onboarded";
const LS_VIEW = "split.sessionView"; // "list" — "atelier" is a transient fullscreen mode, never persisted
const LS_DEF = "split.defaultHarness"; // legacy single-pick (migrated to LS_ENABLED)
const LS_ENABLED = "split.enabledHarnesses"; // the agents the user activated
const LS_ACTIVE = "split.activeHarness"; // the armed engine for the next session
const LS_MODE = "split.mode"; // "simple" (one expert/session) | "teams" (Chief-of-Staff)

// Teams mode (a Chief-of-Staff orchestrating the roster) is a future feature.
// Gated off for now: the chrome toggle is shown greyed/disabled and every
// entry point is guarded. Flip to `true` to re-enable the whole path — the
// view + state machine are kept intact underneath.
const TEAMS_ENABLED = false;

// Drifting starfield behind the atelier welcome crest. Positions are seeded once
// at module load (deterministic — no Math.random in render) so they don't
// re-scatter every time the welcome remounts on focus change.
const AW_STARS = Array.from({ length: 42 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  return {
    left: (r(1) * 100).toFixed(2) + "%",
    top: (r(2) * 100).toFixed(2) + "%",
    big: r(3) > 0.8,
    tw: (3 + r(4) * 5).toFixed(2) + "s",
    td: (r(5) * 6).toFixed(2) + "s",
  };
});

// The user's activated agents — only these show in the roster/menus. Falls back
// to the legacy single default, then to claude.
function loadEnabled(): string[] {
  try {
    const raw = localStorage.getItem(LS_ENABLED);
    if (raw) {
      const a = JSON.parse(raw);
      if (Array.isArray(a)) {
        const list = a.filter((id: string) => !!H[id]);
        if (list.length) return list;
      }
    }
  } catch {
    /* ignore */
  }
  const legacy = localStorage.getItem(LS_DEF);
  return legacy && H[legacy] ? [legacy] : ["claude"];
}

function loadActive(): string {
  const en = loadEnabled();
  const a = localStorage.getItem(LS_ACTIVE);
  return a && en.includes(a) ? a : en[0] || "claude";
}

export default function App() {
  const experts = useExperts();
  const { sessions, start, send, sendAuth, sendPermission, stop, remove, cancelQueued, pickArtifact, openArchive, resumeArchive } = useSessions(experts);
  const teamApi = useMemo(() => ({ start, send, stop }), [start, send, stop]);
  const { project, channels, activeChannel, activeRoster, setActiveChannel, newChannel, stopChannel, removeChannel } = useTeam(teamApi, experts);
  const { startMove, hide } = useWindowChrome();
  const lifecycle = useHarnessStates();

  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem(LS_DONE));
  const [enabled, setEnabled] = useState<string[]>(loadEnabled);
  const [active, setActiveState] = useState(loadActive);
  const [expertSlug, setExpertSlug] = useState("consultant");
  const [overlay, setOverlay] = useState(false);
  // "list" = the home sessions list. "atelier" = the fullscreen control room
  // (AttentionRail · Conversation · Reflet). Atelier is transient by design —
  // entered deliberately from the seg, never persisted, so the app never boots
  // straight into fullscreen. Only "list" is written back.
  const [view, setViewState] = useState<"list" | "atelier">("list");
  const setView = (v: "list" | "atelier") => {
    setViewState(v);
    if (v === "list") localStorage.setItem(LS_VIEW, v);
  };

  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Per-session posture override. Unset = auto (expanded iff the session has a
  // deliverable). "expanded" / "compact" let the user pin the atelier open or
  // collapse it by hand — the hybrid-posture model. Keyed by session id.
  const [posture, setPosture] = useState<Record<string, "expanded" | "compact">>({});
  const togglePosture = (id: string, currentlyExpanded: boolean) =>
    setPosture((p) => ({ ...p, [id]: currentlyExpanded ? "compact" : "expanded" }));
  const [mode, setModeState] = useState<"simple" | "teams">(() => (TEAMS_ENABLED && localStorage.getItem(LS_MODE) === "teams" ? "teams" : "simple"));
  const setMode = (m: "simple" | "teams") => {
    setModeState(m);
    localStorage.setItem(LS_MODE, m);
    if (m === "teams") setFocusedId(null);
  };
  // Chrome overflow menu (⋯) — gathers the rare actions (skin, workspace,
  // replay onboarding) behind one glyph. "skins" is the drill-down page.
  const [moreMenu, setMoreMenu] = useState<false | "root" | "skins">(false);
  const { toasts, push: pushToast } = useToasts();
  // The whole wardrobe — day skin, auto-Minuit, the four easter eggs — lives
  // in shared/useSkin.ts; `shownSkin` is what the window wears right now.
  const { skin, shownSkin, night, smallHours, pickSkin, noirEgg, titanicEgg, cosmosEgg, startRunway, runwayAsk, setRunwayAsk, runwayOffer } =
    useSkin({ onboarded, skinPickerOpen: moreMenu === "skins", pushToast });
  const [historyOpen, setHistoryOpen] = useState(false);
  // The artifact-split divider (drag + persisted width) — shared/useRailResize.ts.
  const { railWidth, onRailHandleDown } = useRailResize();
  // God Mode: auto-approve every pending permission ask — shared/useGodMode.ts.
  const { godMode, toggleGodMode } = useGodMode(sessions, sendPermission);
  // Cabinet overlay state:
  //   - false       = closed
  //   - true        = open on the full grid view (chrome button)
  //   - <slug>      = open directly on that expert's detail page (future:
  //                   from @ chip or focused conversation header)
  // Closes via ✕ / Esc / clicking a use case (which also launches a session).
  const [cabinet, setCabinet] = useState<boolean | string>(false);
  // Vault overlay — the boss's window into $SPLIT_VAULT (tree + editor).
  // Like Cabinet, it forces fullscreen geometry.
  const [vaultOpen, setVaultOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const measureRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef<Record<string, string>>({});

  // Classic UI surfaces (sessions list, stage, chrome counter) hide Teams-owned
  // sessions — Teams mode owns its own rendering. authSession and anyRunning
  // stay on the unfiltered list so auth modals + the global running indicator
  // surface regardless of origin.
  const classicSessions = useMemo(() => sessions.filter((s) => !s.teamId), [sessions]);
  const teamSessionsCount = sessions.length - classicSessions.length;
  const focused = classicSessions.find((s) => s.id === focusedId) ?? null;
  const authSession = sessions.find((s) => s.auth) ?? null;
  const anyRunning = sessions.some((s) => s.status === "running");
  // The composer brain — input value, attachments, `@`/`#`/`/` pickers and
  // chips — lives in shared/useComposer.tsx; one draft shared by the home
  // composer and the focused conversation's reply input, same as before.
  const {
    value, menu, setMenu, slashQuery, inputRef, chips, canSubmit,
    filteredExperts, filteredProjects,
    handleInputChange, pickExpert, pickProject, pickCommand,
    handlePickerEnter, closePickers, addAttachments, takeTurn,
  } = useComposer({ experts, inConversation: !!focused, armExpert: setExpertSlug });
  const accent = focused ? brandOf(focused.harness) : brandOf(active);
  const enabledHarnesses = HARNESSES.filter((h) => enabled.includes(h.id));

  // Two geometries, full stop: a 680px-wide adaptive bar (height fits content)
  // for the home/composer/conversation flow, and native macOS fullscreen for
  // any "serious" surface — Teams orchestration, onboarding, Add Agent,
  // Cabinet, History, and art mode (focused session with deliverables).
  // Fullscreen pauses the adaptive fit so the OS owns the window; on exit
  // the ResizeObserver re-fits whatever the body now shows.
  const expanded = !!focused || classicSessions.length > 0 || !!authSession;
  // Art mode = the focused session has at least one deliverable. We widen the
  // bar (so the conversation rail + viewer don't fight for pixels) and pause
  // the adaptive height fit (the layout owns its own scroll regions, same as
  // Teams). It deliberately does NOT force fullscreen — the side-by-side view
  // stays a normal floating window the user can stretch by hand (adaptive is
  // paused, so a manual drag sticks).
  // Restored to the 680 bar when artifacts vanish or the user backs out.
  // Effective posture: the per-session override wins; absent one, a deliverable
  // auto-opens the atelier (the original behaviour). Either way `artMode` drives
  // the wide canvas + paused adaptive height.
  const focusedPosture = focused ? posture[focused.id] : undefined;
  const artMode = !!focused && (
    focusedPosture === "expanded" ||
    (focusedPosture !== "compact" && focused.artifacts.length > 0)
  );
  // Atelier — the fullscreen control room (roster left · conversation centre ·
  // reflet right). Enterable EMPTY: you launch agents from its left roster, so
  // it never requires a pre-existing session. The centre shows the focused
  // session's conversation, or — when nothing is focused — the armed expert's
  // welcome + starter prompts (the pre-session launch surface).
  const atelierMode = view === "atelier";
  const exitAtelier = () => { setView("list"); setFocusedId(null); };
  // Deliverable opened in the atelier centre (rel) — swaps the conversation for
  // the ArtifactViewer. Cleared whenever the focused session changes so you
  // never land on a stale artifact after switching agents.
  const [atelierArt, setAtelierArt] = useState<string | null>(null);
  useEffect(() => { setAtelierArt(null); }, [focusedId]);
  // Atelier rail collapse. When a deliverable opens, both flanking rails (roster
  // + reflet) fold to thin strips so the conversation|artifact split gets the
  // full centre (the "focus" posture). Each re-expands on demand via its
  // chevron; closing the deliverable restores both.
  const [rosterOpen, setRosterOpen] = useState(true);
  const [refletOpen, setRefletOpen] = useState(true);
  // Fold both rails on the transition INTO an open deliverable, restore on the
  // transition OUT — but not when merely switching between deliverables, so a
  // rail you re-opened by hand stays open while you flip through them.
  const prevArt = useRef<string | null>(null);
  useEffect(() => {
    const had = prevArt.current !== null, has = atelierArt !== null;
    if (has && !had) { setRosterOpen(false); setRefletOpen(false); }
    else if (!has && had) { setRosterOpen(true); setRefletOpen(true); }
    prevArt.current = atelierArt;
  }, [atelierArt]);
  // Peer sessions blocked on the boss (auth / a permission) — surfaced as a
  // banner in the focused conversation so attention isn't trapped in one room.
  const peerAlerts: PeerAlert[] = classicSessions
    .filter((s) => s.id !== focusedId && (s.status === "auth" || !!s.pendingPermission))
    .map((s) => ({ id: s.id, label: s.expertLabel, reason: s.status === "auth" ? "auth" : "permission" }));
  // Fullscreen is app-driven (Teams, cabinet, overlays, the atelier, …) plus the
  // user's own native green traffic light (observed via `useNativeFullscreen`).
  // `artMode` joins the list: opening a deliverable in the simple view now takes
  // over the whole screen (the side-by-side conversation|artifact wants the room),
  // matching the atelier's fullscreen treatment instead of a floating split bar.
  const isFullscreen = mode === "teams" || overlay || !!cabinet || historyOpen || !onboarded || vaultOpen || atelierMode || artMode;
  useFullscreen(isFullscreen);
  // "Roomy" home = the user maximised the window themselves (green traffic
  // light) while on the home view. The adaptive bar never reaches this state
  // on its own (manual drags are re-fit back to content height), so it's safe
  // to fill the extra canvas with the expert gallery without feeding back into
  // the auto-height loop. App-driven fullscreen (cabinet, teams, …) is
  // excluded — those surfaces own the canvas.
  const nativeFs = useNativeFullscreen();
  const roomyHome = nativeFs && !isFullscreen;
  // Pre-compute how much extra height the open dropdown needs. The menu is
  // `position: absolute` so it doesn't contribute to `measureRef`'s natural
  // offsetHeight; we reserve room manually so the window grows tall enough
  // to render it without clipping. Bounded by the CSS `max-height` of `.menu`.
  const menuExtra = !menu
    ? 0
    : menu === "engine"
      ? Math.min(320, enabledHarnesses.length * 56 + 80)
      : Math.min(320, Object.keys(experts).filter((s) => isActiveExpert(experts, s)).length * 56 + 16);
  useAdaptiveHeight({
    measureRef,
    // Pause the auto-fit whenever the OS owns the window — app-driven fullscreen
    // (Teams/overlays/artMode/atelier), ANY focused conversation (it's a fixed
    // panel now: the thread scrolls internally instead of pumping the window),
    // AND native fullscreen the user reached via the green traffic light. Without
    // `nativeFs` here the fit kept firing `set_bar_height` against a fullscreen
    // window, shrinking the bar back to content height mid-transition.
    disabled: isFullscreen || !!focused || nativeFs,
    // Streaming stops pumping the window at 55% of the screen and the thread
    // scrolls from there (was 70% — too tall to feel stable).
    maxFrac: 0.55,
    menuExtra,
    extraDeps: [
      menu,
      expanded,
      focused?.thread.length ?? 0,
      focused?.answer.length ?? 0,
      focused?.logs.length ?? 0,
      focused?.artifacts.length ?? 0,
      view,
    ],
  });
  // Bar width: 680 for the home + compact conversation. In any fullscreen state
  // (app-driven OR the user's green light) we pass `null` so we stop forcing a
  // width — the OS owns the geometry and the responsive columns fill the canvas
  // instead of fighting a 680 set_bar_width macOS would ignore mid-transition.
  useBarWidth(nativeFs || isFullscreen ? null : 680);

  // Entering a focused conversation pauses the adaptive bar (the thread scrolls
  // internally now), so the window has no content-driven height to fall back on.
  // Give it a sensible working height ONCE on the rising edge; after that the
  // window is the user's to resize (adaptive stays paused, nothing snaps it
  // back). Skipped when an app surface owns the window — artMode/atelier go
  // fullscreen, so this only fires for the compact (no-deliverable) view.
  const enteredConvRef = useRef(false);
  useEffect(() => {
    const inConv = !!focusedId && !atelierMode;
    const entering = inConv && !enteredConvRef.current;
    enteredConvRef.current = inConv;
    if (!entering || isFullscreen) return;
    const screenH = window.screen?.height ?? 900;
    invoke("set_bar_height", { height: Math.min(760, Math.round(screenH * 0.72)) })
      .catch(() => { /* ignore */ });
  }, [focusedId, atelierMode, isFullscreen]);

  // arm an engine for the next session (persisted)
  const setActive = (id: string) => {
    setActiveState(id);
    localStorage.setItem(LS_ACTIVE, id);
  };

  useEffect(() => {
    if (!experts[expertSlug] || !isActiveExpert(experts, expertSlug)) {
      const first = Object.keys(experts).find((s) => isActiveExpert(experts, s));
      if (first) setExpertSlug(first);
    }
  }, [experts, expertSlug]);

  // Read a set of file paths through Rust and fold them into pending
  // attachments — shared by the drag-drop handler and the 📎 paperclip picker.
  async function attachPaths(paths: string[]) {
    if (!paths.length) return;
    try {
      const raw = await invoke<string>("read_files_for_agent", { paths });
      addAttachments(JSON.parse(raw) as Attachment[]);
    } catch {
      /* ignore */
    }
  }

  // 📎 paperclip → native file picker → pending attachment(s).
  async function pickAttachments() {
    const picked = await openDialog({ multiple: true, directory: false });
    if (!picked) return;
    await attachPaths(Array.isArray(picked) ? picked : [picked]);
    inputRef.current?.focus();
  }

  // drop a file anywhere → pending attachment
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent(async (e) => {
      if (e.payload.type === "enter" || e.payload.type === "over") setDragging(true);
      else if (e.payload.type === "leave") setDragging(false);
      else if (e.payload.type === "drop") {
        setDragging(false);
        await attachPaths(e.payload.paths ?? []);
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Native macOS notification when an agent finishes while Split is in the
  // background — clicking it raises the window and opens that conversation.
  // Works in `tauri dev` too (the unbundled banner just shows as Terminal).
  const notifyNative = useNativeNotify((sid) => {
    setMode("simple");
    setFocusedId(sid);
  });

  // toast a session that finished while you weren't watching it — only for
  // classic-UI sessions; Teams members complete inside the Teams view and
  // their state changes shouldn't toast the global home.
  useEffect(() => {
    const prev = prevStatus.current;
    for (const s of classicSessions) {
      const was = prev[s.id];
      if (was === "running" && s.status !== "running") {
        const verb = s.status === "ended" ? "ended" : s.status === "error" ? "errored" : "is ready";
        if (s.id !== focusedId) pushToast(`@${s.expertLabel} ${verb}`, 6000);
        // Another app has focus → the toast is invisible; go native. The last
        // committed agent turn is the freshest "here's the work" preview.
        if (!document.hasFocus()) {
          const last = [...s.thread].reverse().find((t) => t.role === "agent")?.text ?? "";
          notifyNative(s.id, `@${s.expertLabel} ${verb}`, last.length > 160 ? last.slice(0, 160) + "…" : last);
        }
      }
      prev[s.id] = s.status;
    }
    for (const id of Object.keys(prev)) if (!classicSessions.some((s) => s.id === id)) delete prev[id];
  }, [classicSessions, focusedId, pushToast, notifyNative]);

  // toggle an agent in/out of the activated set (manage overlay)
  function toggleEnabled(id: string) {
    setEnabled((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const final = next.length ? next : prev; // keep at least one
      localStorage.setItem(LS_ENABLED, JSON.stringify(final));
      if (!final.includes(active)) {
        setActiveState(final[0]);
        localStorage.setItem(LS_ACTIVE, final[0]);
      }
      return final;
    });
  }
  function enterSplit(ids: string[], intent?: "brief_expert" | "start_recruiter", expertSlug?: string, customPrompt?: string) {
    const list = ids.length ? ids : ["claude"];
    setEnabled(list);
    setActiveState(list[0]);
    localStorage.setItem(LS_ENABLED, JSON.stringify(list));
    localStorage.setItem(LS_ACTIVE, list[0]);
    localStorage.setItem(LS_DONE, "1");
    setOnboarded(true);
    // Onboarding final-slide CTAs:
    // - clicking an expert card → expertSlug set, no auto-launch (user types
    //   their own prompt in the home composer with that expert pre-selected)
    // - "Hire @Socrates" → auto-launches a recruiter session straight away
    // - brief_expert auto-launches the spotlighted expert (page-3 Spotlight)
    //   with the typed topic; falls back to consultant + a sample brief.
    if (expertSlug) {
      setExpertSlug(expertSlug);
    }
    if (intent === "brief_expert") {
      const slug = expertSlug || "consultant";
      const prompt = customPrompt || "Brief me on the EV market outlook for 2026";
      const turn = composeTurn(prompt, []);
      setExpertSlug(slug);
      start({ harness: list[0], expertSlug: slug, display: turn.display, wire: turn.wire, files: turn.files }).then(setFocusedId);
    } else if (intent === "start_recruiter") {
      const slug = "genius_socrates";
      const prompt = "Help me design my first custom expert";
      const turn = composeTurn(prompt, []);
      setExpertSlug(slug);
      start({ harness: list[0], expertSlug: slug, display: turn.display, wire: turn.wire, files: turn.files }).then(setFocusedId);
    }
  }

  function launch() {
    if (!canSubmit) return;
    if (H[active]?.reserve) {
      pushToast(`${H[active].label} isn't installed yet`);
      return;
    }
    const taken = takeTurn({ consumeProject: true });
    if (!taken) return;
    const { turn } = taken;
    start({ harness: active, expertSlug, display: turn.display, wire: turn.wire, files: turn.files, project: taken.project }).then(setFocusedId);
  }
  function reply() {
    if (!focused) return;
    const taken = takeTurn();
    if (!taken) return;
    send(focused.id, taken.turn);
  }
  function submit() {
    if (focused) reply();
    else launch();
  }

  const expertLabel = experts[expertSlug]?.label || "Consultant";

  function onKey(e: React.KeyboardEvent) {
    // While the @-mention / #-project picker is open, Enter picks the top
    // filtered entry (insert it into the input) instead of submitting.
    if (handlePickerEnter(e)) return;
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") {
      if (menu) closePickers();
      else if (cabinet) setCabinet(false);
      else if (overlay) setOverlay(false);
      else if (atelierMode) exitAtelier();
      else if (focused) setFocusedId(null);
      else hide();
    }
  }

  return (
    <div className={"app" + (shownSkin ? ` theme-${shownSkin}` : "")} style={vars({ "--engine": accent })}>
      {dragging && <div className="drop">⬇ Drop a file to attach</div>}

      {/* chrome */}
      <div className="chrome" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("button, .wm-name")) startMove(); }}>
        <span className={"wm" + (anyRunning ? " live" : "")}>
          {/* The chrome mark stays still on purpose: the working heartbeat
              lives in the session UI (TurnSpinner, rows), not in the chrome —
              a glowing logo up here read as noise. */}
          <SplitMark size={22} />
          {/* The wordmark is excluded from window-drag so its clicks land —
              5 quick ones flip the hidden Noir skin (see noirEgg). */}
          <span className="wm-name" onClick={noirEgg}>split</span>
        </span>
        {/* The night star — only in the sky from midnight, while the bar
            wears Minuit (and kept lit inside Cosmos so you can fly back).
            No tooltip: you notice the glint, or you don't. See cosmosEgg. */}
        {((shownSkin === "minuit" && smallHours) || skin === "cosmos") && (
          <button className={"wm-star" + (skin === "cosmos" ? " in" : "")} onClick={cosmosEgg} type="button">✦</button>
        )}
        <span className="chrome-meta">{focused ? `on ${H[focused.harness]?.label || focused.harness}` : classicSessions.length ? `${classicSessions.length} session${classicSessions.length === 1 ? "" : "s"}` : "ready"}</span>
        <span className="spacer" />
        {onboarded && (view === "atelier" || !focused) && (
          <div className="seg" style={{ marginRight: 2 }}>
            {/* Top-level posture: Simple (one expert in the bar) vs Atelier (the
                whole roster in parallel, fullscreen). Atelier replaces the old
                Teams slot — Teams (a Chief of Staff conducting the roster) is
                parked behind TEAMS_ENABLED and folds in here as an atelier
                sub-mode ("conducted by the AI") later. */}
            {/* User-facing labels describe the WINDOW: the floating bar is
                "split" (it shares your screen with your other apps), the
                fullscreen control room is "focus" (immersive, takes over the
                screen). The internal codename for the fullscreen mode stays
                "atelier" (the value of `view`) to avoid colliding with the
                product name + the art-SPLIT deliverable view. */}
            {(["simple", "atelier"] as const).map((m) => {
              const isAtelier = m === "atelier";
              const on = isAtelier ? view === "atelier" : view !== "atelier";
              return (
                <button
                  key={m}
                  className={on ? "on" : ""}
                  onClick={() => (isAtelier ? setView("atelier") : exitAtelier())}
                  title={isAtelier ? "Focus — full screen, the whole roster, no distractions" : "Split — the companion bar, sitting on your desktop"}
                >{isAtelier ? "focus" : "split"}</button>
              );
            })}
          </div>
        )}
        <button className="iconbtn" onClick={() => setCabinet(true)} title="Browse cabinet — use cases & examples per expert" aria-label="Browse cabinet">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>
        <button className="iconbtn" onClick={() => setHistoryOpen(true)} title="Past conversations">🕰️</button>
        <button className="iconbtn" onClick={() => setVaultOpen(true)} title="Vault — everything your experts know & produce">🗃️</button>
        <div className="skin-wrap">
          <button className="iconbtn" onClick={() => setMoreMenu((v) => (v ? false : "root"))} title="More — skin, onboarding">⋯</button>
          {moreMenu && (
            <>
              <div className="skin-scrim" onClick={() => setMoreMenu(false)} />
              <div className="skin-menu" role="menu">
                {moreMenu === "root" ? (
                  <>
                    <button className="more-item" onClick={() => setMoreMenu("skins")} role="menuitem">
                      <span className="more-ic">✿</span>
                      <span className="more-meta">
                        <b>Skin</b>
                        <small>{SKINS.find((s) => s.id === shownSkin)?.label ?? "Classic"}</small>
                      </span>
                      <span className="more-chev">▸</span>
                    </button>
                    <button className="more-item" onClick={() => { setMoreMenu(false); setVaultOpen(true); }} role="menuitem">
                      <span className="more-ic">🗃️</span>
                      <span className="more-meta">
                        <b>Vault</b>
                        <small>tout ce que tes experts savent</small>
                      </span>
                    </button>
                    <button className="more-item" onClick={() => { setMoreMenu(false); localStorage.removeItem(LS_DONE); setOnboarded(false); }} role="menuitem">
                      <span className="more-ic">↻</span>
                      <span className="more-meta">
                        <b>Replay onboarding</b>
                        <small>the guided tour, from the top</small>
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="more-item more-back" onClick={() => setMoreMenu("root")}>
                      <span className="more-ic">‹</span>
                      <span className="more-meta"><b>Skin</b></span>
                    </button>
                    {runwayOffer && (
                      <button className="skin-item runway-offer" onClick={() => { setMoreMenu(false); startRunway(); }} role="menuitem">
                        <span className="skin-sw" style={{ background: "conic-gradient(from 20deg, #0053fd, #d4a574, #d4af37, #c89c4a, #ff3df2, #8e7bff, #0053fd)" }} />
                        <span className="skin-meta">
                          <b>Toujours pas décidé ?</b>
                          <small>Lancer la Fashion Week — tout le vestiaire défile</small>
                        </span>
                      </button>
                    )}
                    {/* Hidden skins (Noir) only list while worn — so you can
                        leave; night skins (Minuit) only exist after dark. */}
                    {SKINS.filter((s) => (!s.hidden || skin === s.id) && (!s.night || night)).map((s) => (
                      <button key={s.id || "classic"} className={"skin-item" + (shownSkin === s.id ? " on" : "")} onClick={() => { setMoreMenu(false); pickSkin(s.id); }} role="menuitem">
                        <span className="skin-sw" style={{ background: `linear-gradient(135deg, ${s.sw[0]} 0%, ${s.sw[0]} 50%, ${s.sw[1]} 50%, ${s.sw[1]} 100%)`, boxShadow: `inset 0 0 0 1.5px ${s.sw[2]}` }} />
                        <span className="skin-meta">
                          <b>{s.label}</b>
                          <small>{s.hint}</small>
                        </span>
                        {shownSkin === s.id && <span className="skin-tick">●</span>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* When the focused session has at least one artifact, the conversation
          becomes a left rail and a viewer fills the rest — same fullscreen
          fill behaviour Teams uses, so the window owns its own scroll regions
          and the adaptive ResizeObserver is paused (we want a fixed canvas). */}
      {(() => {
        // `fill` = the inner view owns its own scroll regions on a fixed canvas
        // (no adaptive growth). Every focused conversation qualifies now — the
        // thread scrolls internally with the header + composer pinned — alongside
        // Teams and the atelier. Home keeps the adaptive bar (`tall` for overlays).
        const fillMode = mode === "teams" || atelierMode || !!focused;
        const bodyCls = "body" + (fillMode ? " fill" : isFullscreen ? " tall" : "");
        const measureCls = "measure" + (fillMode ? " fill" : isFullscreen ? " tall" : "") + (roomyHome && !focused && classicSessions.length < 3 ? " center" : "");
        // A deliverable is open in the atelier → the centre splits (conversation
        // left, artifact right) and both flanking rails fold for focus.
        const atelierArtOpen = !!(focused && atelierArt && focused.artifacts.some((a) => a.rel === atelierArt));
        return (
      <div className={bodyCls}>
        <div ref={measureRef} className={measureCls}>
        {!onboarded ? (
          /* ============ ONBOARDING (5 pages: concept · demo · pick · @Wolfgang · @Socrates) ============ */
          <Onboarding onEnter={enterSplit} skin={skin} onPickSkin={pickSkin} />
        ) : atelierMode ? (
          /* ============ ATELIER (fullscreen control room: roster · centre · reflet) ============ */
          <div className="atelier">
            <AtelierLeft
              experts={experts}
              sessions={classicSessions}
              focusedId={focusedId}
              armedSlug={expertSlug}
              onArm={(slug) => { setExpertSlug(slug); setFocusedId(null); }}
              onFocus={setFocusedId}
              collapsed={!rosterOpen}
              onToggleCollapsed={() => setRosterOpen((v) => !v)}
            />
            <div className="atelier-conv">
              {focused ? (
                <div className={"atelier-stage" + (atelierArtOpen ? " split" : "")}>
                  <div className="atelier-stage-conv">
                    <Conversation
                      session={focused}
                      experts={experts}
                      value={value}
                      inputRef={inputRef}
                      slashQuery={slashQuery}
                      chips={chips}
                      onBack={() => setFocusedId(null)}
                      onStop={stop}
                      onClose={() => { stop(focused.id); remove(focused.id); setFocusedId(null); }}
                      onAuth={sendAuth}
                      onPermission={sendPermission}
                      godMode={godMode}
                      onToggleGodMode={toggleGodMode}
                      onCancelQueued={cancelQueued}
                      onInputChange={handleInputChange}
                      onKey={onKey}
                      onReply={reply}
                      onAttach={pickAttachments}
                      onPickCommand={pickCommand}
                      onPickArtifact={(_id, rel) => setAtelierArt(rel)}
                      expanded={true}
                      onTogglePosture={exitAtelier}
                      peers={peerAlerts}
                      onFocusPeer={setFocusedId}
                    />
                  </div>
                  {atelierArtOpen && (
                    <div className="atelier-split-view">
                      <div className="atelier-art">
                        <div className="atelier-art-bar">
                          <button className="atelier-art-back" onClick={() => setAtelierArt(null)} title="Close deliverable — back to the conversation">✕ close</button>
                          <ArtifactStrip artifacts={focused.artifacts} activeArtifact={atelierArt!} onPick={(rel) => setAtelierArt(rel)} />
                        </div>
                        <div className="atelier-art-body">
                          <ArtifactViewer artifact={focused.artifacts.find((a) => a.rel === atelierArt)!} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="atelier-welcome">
                  {/* atmosphere — concentrated blooms + drifting starfield behind the hero */}
                  <div className="aw-atmos" aria-hidden="true">
                    <i className="aw-bloom b2" /><i className="aw-bloom b3" /><i className="aw-bloom b1" />
                    <div className="aw-stars">
                      {AW_STARS.map((s, i) => (
                        <span
                          key={i}
                          className={"aw-star" + (s.big ? " big" : "")}
                          style={vars({ left: s.left, top: s.top, "--tw": s.tw, "--td": s.td })}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="aw-hero">
                    <span className="aw-kicker"><span className="aw-pulse" />Atelier · new session</span>

                    <div className="aw-crest-wrap">
                      <span className="aw-crest-halo" aria-hidden="true" />
                      <Crest kind={experts[expertSlug]?.kind} seed={expertSlug} size={120} />
                    </div>

                    <h2 className="aw-greet">Hi, I'm your <span className="aw-em">{expertLabel}</span>.</h2>
                    {experts[expertSlug]?.blurb && <p className="aw-blurb">{experts[expertSlug]!.blurb}</p>}

                    <div className="aw-meta">
                      {experts[expertSlug]?.kind && <span className="aw-chip"><span className="aw-k">{experts[expertSlug]!.kind}</span></span>}
                      <span className="aw-chip eng"><span className="aw-dot" /><span className="aw-k">engine</span> {H[active]?.label || active}</span>
                    </div>

                    {(experts[expertSlug]?.starters?.length ?? 0) > 0 && (
                      <div className="aw-starters">
                        {experts[expertSlug]!.starters!.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            className="aw-starter"
                            onClick={() => { handleInputChange(s, null); inputRef.current?.focus(); }}
                          >
                            <span className="aw-idx">{String(i + 1).padStart(2, "0")}<span className="aw-arrow">→</span></span>
                            <span className="aw-label">{s}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="aw-footer">
                    <Composer
                      experts={experts} expertSlug={expertSlug} expertLabel={expertLabel} active={active}
                      engines={enabledHarnesses} onAddAgent={() => setOverlay(true)}
                      menu={menu} setMenu={setMenu} setActive={setActive}
                      value={value} onChange={handleInputChange} onKey={onKey} onRun={launch} chips={chips} inputRef={inputRef}
                      expertEntries={filteredExperts} onPickExpert={pickExpert}
                      projects={filteredProjects} onPickProject={pickProject}
                      lockExpert onAttach={pickAttachments}
                    />
                  </div>
                </div>
              )}
            </div>
            {!refletOpen ? (
              <button className="rail-stub right" onClick={() => setRefletOpen(true)} title="Expand the reflet">
                <span className="rail-stub-x">‹</span>
                <span className="rail-stub-label">Reflet</span>
                <span className="rail-stub-dots">
                  {(focused?.artifacts ?? []).slice(0, 4).map((a) => <span key={a.rel} className="rail-stub-dot" />)}
                </span>
              </button>
            ) : focused ? (
              <Reflet session={focused} experts={experts} onPickArtifact={(_id, rel) => setAtelierArt(rel)} onCollapse={() => setRefletOpen(false)} />
            ) : (
              <aside className="reflet" aria-label="About the agent">
                <button className="reflet-collapse" onClick={() => setRefletOpen(false)} title="Collapse">›</button>
                <div className="reflet-card">
                  <Crest kind={experts[expertSlug]?.kind} seed={expertSlug} size={34} />
                  <div className="reflet-id">
                    <div className="reflet-name">{expertLabel}</div>
                    <div className="reflet-on">{experts[expertSlug]?.role || experts[expertSlug]?.category || "agent"}</div>
                  </div>
                </div>
                <details className="reflet-sec" open>
                  <summary>About</summary>
                  <div className="reflet-body"><p className="reflet-task">{experts[expertSlug]?.blurb}</p></div>
                </details>
                {(experts[expertSlug]?.skills?.length ?? 0) > 0 && (
                  <details className="reflet-sec" open>
                    <summary>Skills <span className="reflet-count">{experts[expertSlug]!.skills!.length}</span></summary>
                    <div className="reflet-body reflet-pills">
                      {experts[expertSlug]!.skills!.map((s) => <span key={s} className="reflet-pill">{s}</span>)}
                    </div>
                  </details>
                )}
              </aside>
            )}
          </div>
        ) : focused ? (
          /* ============ CONVERSATION (+ artifact viewer when deliverables exist) ============ */
          artMode ? (
            <div className="art-split" style={{ ["--rail-w" as string]: `${railWidth}px` }}>
              {classicSessions.length > 1 && (
                <AttentionRail
                  sessions={classicSessions}
                  focusedId={focusedId}
                  experts={experts}
                  onFocus={setFocusedId}
                />
              )}
              <div className="art-split-conv">
                <Conversation
                  session={focused}
                  experts={experts}
                  value={value}
                  inputRef={inputRef}
                  slashQuery={slashQuery}
                  chips={chips}
                  onBack={() => setFocusedId(null)}
                  onStop={stop}
                  onClose={() => { stop(focused.id); remove(focused.id); setFocusedId(null); }}
                  onAuth={sendAuth}
                  onPermission={sendPermission}
                  godMode={godMode}
                  onToggleGodMode={toggleGodMode}
                  onCancelQueued={cancelQueued}
                  onInputChange={handleInputChange}
                  onKey={onKey}
                  onReply={reply}
                  onAttach={pickAttachments}
                  onPickCommand={pickCommand}
                  onPickArtifact={pickArtifact}
                  expanded={true}
                  onTogglePosture={() => togglePosture(focused.id, true)}
                  peers={peerAlerts}
                  onFocusPeer={setFocusedId}
                />
              </div>
              <div
                className="art-split-handle"
                onMouseDown={onRailHandleDown}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize conversation rail"
                title="Drag to resize"
              />
              <div className="art-split-view">
                {(() => {
                  const activeRel = focused.activeArtifact
                    ?? focused.artifacts[focused.artifacts.length - 1]?.rel
                    ?? null;
                  const art = activeRel ? focused.artifacts.find((a) => a.rel === activeRel) : null;
                  return art ? <ArtifactViewer artifact={art} /> : (
                    <div className="art-empty">
                      <div className="art-empty-ic">🗒️</div>
                      <div className="art-empty-t">Atelier open</div>
                      <div className="art-empty-s">No deliverable yet — it'll show up here once {focused.expertLabel} produces one.</div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
          <Conversation
            session={focused}
            experts={experts}
            value={value}
            inputRef={inputRef}
            slashQuery={slashQuery}
            chips={chips}
            onBack={() => setFocusedId(null)}
            onStop={stop}
            onClose={() => { stop(focused.id); remove(focused.id); setFocusedId(null); }}
            onAuth={sendAuth}
            onPermission={sendPermission}
            godMode={godMode}
            onToggleGodMode={toggleGodMode}
            onCancelQueued={cancelQueued}
            onInputChange={handleInputChange}
            onKey={onKey}
            onReply={reply}
            onAttach={pickAttachments}
            onPickCommand={pickCommand}
            onPickArtifact={pickArtifact}
            expanded={false}
            onTogglePosture={() => togglePosture(focused.id, false)}
            peers={peerAlerts}
            onFocusPeer={setFocusedId}
          />
          )
        ) : mode === "teams" ? (
          /* ============ TEAMS (Chief-of-Staff orchestration) ============ */
          <Teams
            project={project} channels={channels} activeChannel={activeChannel} activeRoster={activeRoster}
            sessions={sessions}
            onNewChannel={(g) => newChannel(g, active)} onSelectChannel={setActiveChannel}
            onStopChannel={stopChannel} onRemoveChannel={removeChannel}
          />
        ) : (
          /* ============ HOME ============ */
          <div className={"home" + (roomyHome ? " roomy" : "") + (roomyHome && classicSessions.length < 3 ? " center" : "")}>
            <div className={"home-orb" + (expanded ? " mini" : "")}>
              <div className="split-levitate">
                <SplitMark size={expanded ? 72 : 140} isSpeaking={anyRunning} bowOnClick />
              </div>
              <div className="split-shadow" aria-hidden="true" />
              {!expanded && <div className="home-eyebrow">one runtime · each expert on its own engine</div>}
            </div>
            <Composer
              experts={experts} expertSlug={expertSlug} expertLabel={expertLabel} active={active}
              engines={enabledHarnesses} onAddAgent={() => setOverlay(true)}
              menu={menu} setMenu={setMenu} setActive={setActive}
              value={value} onChange={handleInputChange} onKey={onKey} onRun={launch} chips={chips} inputRef={inputRef}
              expertEntries={filteredExperts} onPickExpert={pickExpert}
              projects={filteredProjects} onPickProject={pickProject}
              onAttach={pickAttachments}
            />

            {/* The minimal-bar idle state shows ONLY the composer — adaptive
                window auto-fits to ~150 px. The roster + sessions surface only
                once the bar is "expanded" (sessions exist, overlay opened, etc).
                Picking an engine for the next session is still possible via the
                composer's left chip. */}
            {expanded && <>
            <div className="sec sec-row">
              <span>sessions</span>
              <span className="muted">each on its own engine</span>
            </div>
            <div className="sessions">
              {classicSessions.length === 0 ? (
                <div className="empty">No sessions yet — brief an expert above.<br />Its engine's logo shows here while it runs.</div>
              ) : (
                classicSessions.map((s) => <SessionRow key={s.id} s={s} kind={experts[s.expertSlug]?.kind} onOpen={() => setFocusedId(s.id)} onStop={() => stop(s.id)} onClose={() => remove(s.id)} />)
              )}
              {TEAMS_ENABLED && teamSessionsCount > 0 && (
                <button className="teams-pointer" onClick={() => setMode("teams")}>
                  {teamSessionsCount} team session{teamSessionsCount === 1 ? "" : "s"} running in Teams →
                </button>
              )}
            </div>
            </>}

            {/* The cabinet/gallery opens only from the chrome button now — the
                maximised home stays a clean orb + composer, no wall below. */}
          </div>
        )}
        </div>
      </div>
        );
      })()}

      {overlay && (
        <div className="overlay" onClick={() => setOverlay(false)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-head">
              <div>
                <div className="ob-eyebrow">your roster</div>
                <h2 className="ob2-h2">Your <em>agents</em></h2>
              </div>
              <button className="btn ghost" onClick={() => setOverlay(false)}>done</button>
            </div>
            <p className="ob2-lede" style={{ marginBottom: 22 }}>
              Toggle the agents you want — only these appear in your roster &amp; menus.
              Install &amp; sign-in state shows on each card; expand a card to manage.
            </p>
            <League isSelected={(id) => enabled.includes(id)} onPick={toggleEnabled} lifecycle={lifecycle} />
          </div>
        </div>
      )}

      {cabinet && (
        <Cabinet
          experts={experts}
          initialSlug={typeof cabinet === "string" ? cabinet : null}
          onIceberg={titanicEgg}
          onClose={() => setCabinet(false)}
          onLaunch={(slug, prompt) => {
            setCabinet(false);
            setExpertSlug(slug);
            if (!prompt) return;
            const turn = composeTurn(prompt, []);
            start({ harness: active, expertSlug: slug, display: turn.display, wire: turn.wire, files: turn.files }).then(setFocusedId);
          }}
        />
      )}

      {historyOpen && (
        <HistoryOverlay
          experts={experts}
          onClose={() => setHistoryOpen(false)}
          onOpen={async (meta) => {
            const id = await openArchive(meta);
            if (id) {
              setFocusedId(id);
              setHistoryOpen(false);
            }
          }}
          onResume={async (meta) => {
            const id = await resumeArchive(meta);
            if (id) {
              setFocusedId(id);
              setHistoryOpen(false);
            }
          }}
        />
      )}

      {vaultOpen && <VaultOverlay onClose={() => setVaultOpen(false)} />}

      {authSession && <AuthModal session={authSession} onPick={(m) => sendAuth(authSession.id, m)} />}

      {/* Fashion-Week proposal — the runway eggs ask instead of firing during
          onboarding (see runway()/startRunway). */}
      {runwayAsk && (
        <div className="modal-bg" onClick={() => setRunwayAsk(false)}>
          <div className="am" onClick={(e) => e.stopPropagation()}>
            <h3>✨ Fashion Week ?</h3>
            <p>On dirait que tu hésites — envie de voir tous les skins défiler une fois avant de choisir ?</p>
            <div className="am-acts">
              <button className="btn" onClick={() => { setRunwayAsk(false); startRunway(); }}>Lancer le défilé</button>
              <button className="btn ghost" onClick={() => setRunwayAsk(false)}>Plus tard</button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>}
    </div>
  );
}
