import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { HARNESSES, H, brandOf } from "./shared/harnesses";
import { useExperts, composeTurn, type Attachment } from "./shared/util";
import { isActiveExpert, isDarkExpert } from "./shared/experts";
import { loadTeam, saveTeam } from "./shared/team";
import { useSessions } from "./shared/useSessions";
import { useWindowChrome, useAdaptiveHeight, useFullscreen, useNativeFullscreen, useBarWidth } from "./shared/useWindowChrome";
import { useHarnessStates } from "./shared/useHarnessStates";
import { useToasts } from "./shared/useToasts";
import { useNativeNotify } from "./shared/useNativeNotify";
import { Chrome } from "./home/Chrome";
import { useSkin } from "./shared/useSkin";
import { useComposer } from "./shared/useComposer";
import { useGodMode } from "./shared/useGodMode";
import { vars } from "./shared/ui";
import { Composer } from "./home/Composer";
import { RosterOverlay } from "./home/RosterOverlay";
import { SessionRow } from "./home/SessionRow";
import { Conversation, type PeerAlert } from "./conversation/Conversation";
import { ArtifactViewer } from "./conversation/ArtifactViewer";
import { AtelierLeft } from "./conversation/AtelierLeft";
import { AtelierWelcome } from "./conversation/AtelierWelcome";
import { AtelierCanvasEmpty } from "./conversation/AtelierCanvasEmpty";
import { AtelierLiveView } from "./conversation/AtelierLiveView";
import { QuestionsPanel, type SubmitSource } from "./conversation/QuestionsPanel";
import { formatFormAnswers } from "./shared/questionForm";
import { HistoryOverlay } from "./history/HistoryOverlay";
import { AuthModal } from "./auth/AuthModal";
import Onboarding from "./onboarding/Onboarding";
import Gallery from "./cabinet/Gallery";
import { CabinetNoir } from "./cabinet/CabinetNoir";
import { AtelierInvite } from "./home/AtelierInvite";
import { MajordomeOrbit } from "./home/MajordomeOrbit";
import { VaultOverlay } from "./vault/VaultOverlay";
import "./app.css";

const LS_DONE = "split.onboarded";
const LS_DEF = "split.defaultHarness"; // legacy single-pick (migrated to LS_ENABLED)
const LS_ENABLED = "split.enabledHarnesses"; // the agents the user activated
const LS_ACTIVE = "split.activeHarness"; // the armed engine for the next session

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
  const { sessions, start, send, sendAuth, sendPermission, stop, remove, cancelQueued, openArchive, resumeArchive } = useSessions(experts);
  const { startMove, hide } = useWindowChrome();
  const lifecycle = useHarnessStates();

  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem(LS_DONE));
  const [enabled, setEnabled] = useState<string[]>(loadEnabled);
  const [active, setActiveState] = useState(loadActive);
  const [expertSlug, setExpertSlug] = useState("consultant");
  // The hired team — favourited experts pinned to the atelier rail (shared/team.ts).
  // Seeded once experts load: from localStorage, or the DEFAULT_TEAM on first run.
  const [team, setTeam] = useState<string[]>([]);
  const teamSeeded = useRef(false);
  useEffect(() => {
    if (teamSeeded.current || Object.keys(experts).length === 0) return;
    teamSeeded.current = true;
    setTeam(loadTeam(experts));
  }, [experts]);
  const toggleTeam = (slug: string) =>
    setTeam((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      saveTeam(next);
      return next;
    });
  const [overlay, setOverlay] = useState(false);
  // "list" = the floating bar (home or compact conversation). "atelier" = the
  // fullscreen control room (roster · conversation · project). The window SIZE is
  // the mode: maximising (the green traffic light, a delivery, the expand
  // chevron) → atelier; shrinking → bar. Never persisted — the app always boots
  // small, and the OS fullscreen state is the source of truth (see the effect
  // below that adopts the user's own green-light toggles).
  const [view, setView] = useState<"list" | "atelier">("list");

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { toasts, push: pushToast } = useToasts();
  // The whole wardrobe — day skin, auto-Minuit, the three easter eggs — lives
  // in shared/useSkin.ts; `shownSkin` is what the window wears right now.
  const { skin, shownSkin, night, smallHours, pickSkin, noirEgg, titanicEgg, cosmosEgg } =
    useSkin({ pushToast });
  const [historyOpen, setHistoryOpen] = useState(false);
  // God Mode: auto-approve every pending permission ask — shared/useGodMode.ts.
  const { godMode, toggleGodMode } = useGodMode(sessions, sendPermission);
  // Cabinet overlay state:
  //   - false       = closed
  //   - true        = open on the full grid view (chrome button)
  //   - <slug>      = open directly on that expert's detail page (future:
  //                   from @ chip or focused conversation header)
  // Closes via ✕ / Esc / clicking a use case (which also launches a session).
  const [cabinet, setCabinet] = useState<boolean | string>(false);
  // The Cabinet Noir — the hidden black-&-gold chamber of dark geniuses. Opened
  // only via the secret seal (long-press the logo, or the midnight hour).
  const [cabinetNoir, setCabinetNoir] = useState(false);
  // Vault overlay — the boss's window into $SPLIT_VAULT (tree + editor).
  // Like Cabinet, it forces fullscreen geometry.
  const [vaultOpen, setVaultOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const measureRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef<Record<string, string>>({});

  const focused = sessions.find((s) => s.id === focusedId) ?? null;
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
  // any "serious" surface — onboarding, Add Agent, Cabinet, History, and art
  // mode (focused session with deliverables).
  // Fullscreen pauses the adaptive fit so the OS owns the window; on exit
  // the ResizeObserver re-fits whatever the body now shows.
  const expanded = !!focused || sessions.length > 0 || !!authSession;
  // The window SIZE is the split/atelier switch (see the nativeFs effect below).
  // Maximising routes into the Atelier focus mode — the single fullscreen
  // surface; a fresh deliverable maximises automatically. Shrinking returns to
  // the floating bar: the compact conversation when a session is focused, the
  // home when nothing is. Window size and which session is open are independent
  // axes — collapsing the atelier no longer drops your focus.
  // Atelier — the fullscreen control room (roster left · conversation centre ·
  // reflet right). Enterable EMPTY: you launch agents from its left roster, so
  // it never requires a pre-existing session. The centre shows the focused
  // session's conversation, or — when nothing is focused — the armed expert's
  // welcome + starter prompts (the pre-session launch surface).
  const atelierMode = view === "atelier";
  const exitAtelier = () => setView("list");
  // Enter the Atelier (focus mode) on a session — the single fullscreen surface
  // now that the artMode side-by-side shell folded into it.
  const enterAtelier = (id?: string) => { if (id) setFocusedId(id); setView("atelier"); };
  // Deliverable opened in the atelier centre (rel) — swaps the conversation for
  // the ArtifactViewer. Cleared whenever the focused session changes so you
  // never land on a stale artifact after switching agents.
  const [atelierArt, setAtelierArt] = useState<string | null>(null);
  // Open a deliverable: jump into the Atelier focused on its session with the
  // artifact showing (the rail-fold effect below gives the focus posture).
  const openArtifact = (id: string, rel: string) => { setFocusedId(id); setView("atelier"); setAtelierArt(rel); };
  useEffect(() => {
    // Keep the open deliverable if it still belongs to the newly-focused session
    // (so openArtifact's focus+art set isn't clobbered). Otherwise, if the
    // focused session ALREADY has deliverables — opening a past/archived session,
    // or refocusing one that produced work — surface its latest one instead of
    // the placeholder canvas (that's what "open the old session, see the artifact"
    // means). Fall back to null only for a session with nothing to show. Keyed on
    // focusedId only — `focused` is read fresh, intentionally not a dep.
    setAtelierArt((cur) => {
      if (cur && focused?.artifacts.some((a) => a.rel === cur)) return cur;
      const arts = focused?.artifacts ?? [];
      if (arts.length === 0) return null;
      // Prefer the reducer's tracked active artifact (last one that arrived),
      // else the most recent in the list.
      return focused?.activeArtifact ?? arts[arts.length - 1]!.rel;
    });
  }, [focusedId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Atelier left rail. It's the navigator (Agents · Sessions · History) and
  // stays OPEN while you brief — it only folds to a thin strip when a deliverable
  // opens, so the conversation|document split gets the full centre (the "focus"
  // posture). It re-expands on demand via its stub, and closing the deliverable
  // restores it. The reflet (a separate right mirror) was retired: the right
  // pane is now the progressive "project" surface, not a status mirror.
  const [rosterOpen, setRosterOpen] = useState(true);
  // Fold the rail on the transition INTO an open deliverable, restore on the
  // transition OUT — but not when merely switching between deliverables, so a
  // rail you re-opened by hand stays open while you flip through them.
  const prevArt = useRef<string | null>(null);
  useEffect(() => {
    const had = prevArt.current !== null, has = atelierArt !== null;
    if (has && !had) setRosterOpen(false);
    else if (!has && had) setRosterOpen(true);
    prevArt.current = atelierArt;
  }, [atelierArt]);
  // Peer sessions blocked on the boss (auth / a permission) — surfaced as a
  // banner in the focused conversation so attention isn't trapped in one room.
  const peerAlerts: PeerAlert[] = sessions
    .filter((s) => s.id !== focusedId && (s.status === "auth" || !!s.pendingPermission))
    .map((s) => ({ id: s.id, label: s.expertLabel, reason: s.status === "auth" ? "auth" : "permission" }));
  // Two layers of fullscreen. `overlayFullscreen` = a surface that owns the whole
  // screen on its own terms (cabinet, history, vault, onboarding). The atelier is
  // the OTHER layer — driven by the window size. Together they decide whether the
  // OS window is fullscreen.
  const overlayFullscreen = overlay || !!cabinet || cabinetNoir || historyOpen || !onboarded || vaultOpen;
  const isFullscreen = overlayFullscreen || atelierMode;
  useFullscreen(isFullscreen);
  const nativeFs = useNativeFullscreen();
  // The window SIZE is the split/atelier switch. When the user flips the native
  // fullscreen state THEMSELVES (the green traffic light), the OS diverges from
  // the fullscreen we asked for — that's the signal to adopt it as the mode. Our
  // OWN pushes (useFullscreen echoing a view change, or an overlay forcing
  // fullscreen) land with nativeFs already matching intent, so they no-op here.
  // We depend on `nativeFs` alone and read view/overlay through refs, so a view
  // change (a delivery, the expand chevron) doesn't re-run this effect and
  // revert itself before the OS animation has caught up.
  const viewRef = useRef(view); viewRef.current = view;
  const overlayFsRef = useRef(overlayFullscreen); overlayFsRef.current = overlayFullscreen;
  useEffect(() => {
    if (overlayFsRef.current) return;        // an overlay owns the screen — leave the bar/atelier axis alone
    const intendedFs = viewRef.current === "atelier";
    if (nativeFs === intendedFs) return;     // OS matches what we asked for — our own echo, nothing to adopt
    setView(nativeFs ? "atelier" : "list");  // user toggled OS fullscreen → that IS the mode now
  }, [nativeFs]);
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
    // (overlays/atelier), ANY focused conversation (it's a fixed
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
  // Give it a sensible working height ONCE per entry; after that the window is the
  // user's to resize (adaptive stays paused, nothing snaps it back).
  //
  // We DEFER while the OS owns the window — an overlay/atelier is fullscreen, OR
  // we're mid fullscreen-EXIT (isFullscreen already false but nativeFs still true
  // during the ~350ms macOS animation, e.g. collapsing the atelier back to the
  // compact conversation with focus kept). Firing set_bar_height mid-animation
  // jitters the window; instead we re-arm and let the effect re-run once nativeFs
  // settles. `enteredConvRef` is only marked once the height is actually set, so
  // the deferred case still gets sized after the animation.
  const enteredConvRef = useRef(false);
  useEffect(() => {
    const inConv = !!focusedId && !atelierMode;
    if (!inConv) { enteredConvRef.current = false; return; } // left the compact conversation — re-arm
    if (enteredConvRef.current) return;                      // already sized this entry
    if (isFullscreen || nativeFs) return;                    // OS owns the window (fullscreen or mid-exit) — wait
    enteredConvRef.current = true;
    const screenH = window.screen?.height ?? 900;
    invoke("set_bar_height", { height: Math.min(760, Math.round(screenH * 0.72)) })
      .catch(() => { /* ignore */ });
  }, [focusedId, atelierMode, isFullscreen, nativeFs]);

  // arm an engine for the next session (persisted)
  const setActive = (id: string) => {
    setActiveState(id);
    localStorage.setItem(LS_ACTIVE, id);
  };

  useEffect(() => {
    // Dark geniuses are valid armable experts (just hidden) — don't reset them.
    if (!experts[expertSlug] || (!isActiveExpert(experts, expertSlug) && !isDarkExpert(experts[expertSlug]))) {
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
    setFocusedId(sid);
    // The notification means "an agent finished" — surface its work full-screen,
    // the same posture a live delivery routes into (see the auto-atelier effect).
    setView("atelier");
  });

  // toast a session that finished while you weren't watching it.
  useEffect(() => {
    const prev = prevStatus.current;
    for (const s of sessions) {
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
    for (const id of Object.keys(prev)) if (!sessions.some((s) => s.id === id)) delete prev[id];
  }, [sessions, focusedId, pushToast, notifyNative]);

  // Auto-atelier on delivery. When a session produces a NEW deliverable, surface
  // it full-screen in the atelier — but only if you're already watching that
  // session, or nothing is focused. A background agent finishing while you're in
  // a different room never yanks you out (the toast above covers that). Seeded
  // per session on first sighting so opening an archive already full of
  // artifacts doesn't trigger — only deliveries that land while we watch count.
  const prevArtCount = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const s of sessions) {
      const seen = s.id in prevArtCount.current;
      const before = prevArtCount.current[s.id] ?? 0;
      const now = s.artifacts.length;
      prevArtCount.current[s.id] = now;
      if (!seen || now <= before) continue;
      if (focusedId === s.id || focusedId === null) {
        setFocusedId(s.id);
        setView("atelier");
        setAtelierArt(s.artifacts[now - 1]?.rel ?? null);
      }
    }
    for (const id of Object.keys(prevArtCount.current)) {
      if (!sessions.some((s) => s.id === id)) delete prevArtCount.current[id];
    }
  }, [sessions, focusedId]);

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
  function enterSplit(ids: string[], intent?: "start_recruiter" | "open_gallery", expertSlug?: string) {
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
    // - open_gallery enters and lands on the in-app work Gallery.
    if (expertSlug) {
      setExpertSlug(expertSlug);
    }
    if (intent === "start_recruiter") {
      const slug = "genius_socrates";
      const prompt = "Help me design my first custom expert";
      const turn = composeTurn(prompt, []);
      setExpertSlug(slug);
      start({ harness: list[0], expertSlug: slug, display: turn.display, wire: turn.wire, files: turn.files }).then(setFocusedId);
    } else if (intent === "open_gallery") {
      // "See the complete gallery" → land straight on the in-app work Gallery.
      setCabinet(true);
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
  // The boss answered (or skipped) the atelier Questions panel → send the
  // formatted answers as the next turn. `send` clears `questionForm`, so the
  // panel folds and the pane returns to the deliverable/canvas.
  function answerForm(answers: Record<string, string | string[]>, source: SubmitSource) {
    if (!focused?.questionForm) return;
    const wire = formatFormAnswers(focused.questionForm, answers);
    const display = source === "skip" ? "↪︎ Questions passées — valeurs par défaut" : wire;
    send(focused.id, { display, wire, files: [] });
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
      else if (cabinetNoir) setCabinetNoir(false);
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
      <Chrome
        running={anyRunning}
        meta={focused ? `on ${H[focused.harness]?.label || focused.harness}` : sessions.length ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}` : "ready"}
        showExpandToggle={onboarded && !focused}
        atelierMode={atelierMode}
        onToggleView={() => setView(atelierMode ? "list" : "atelier")}
        onOpenGallery={() => setCabinet(true)}
        onOpenVault={() => setVaultOpen(true)}
        onOpenNoir={() => setCabinetNoir(true)}
        onReplayOnboarding={() => { localStorage.removeItem(LS_DONE); setOnboarded(false); }}
        onStartMove={startMove}
        skin={skin}
        shownSkin={shownSkin}
        night={night}
        smallHours={smallHours}
        onPickSkin={pickSkin}
        onNoirEgg={noirEgg}
        onCosmosEgg={cosmosEgg}
      />

      {/* When the focused session has at least one artifact, the conversation
          becomes a left rail and a viewer fills the rest, so the window owns its
          own scroll regions and the adaptive ResizeObserver is paused (we want a
          fixed canvas). */}
      {(() => {
        // `fill` = the inner view owns its own scroll regions on a fixed canvas
        // (no adaptive growth). Every focused conversation qualifies now — the
        // thread scrolls internally with the header + composer pinned — alongside
        // the atelier. Home keeps the adaptive bar (`tall` for overlays).
        const fillMode = atelierMode || !!focused;
        const bodyCls = "body" + (fillMode ? " fill" : isFullscreen ? " tall" : "");
        const measureCls = "measure" + (fillMode ? " fill" : isFullscreen ? " tall" : "");
        // A deliverable is open in the atelier → the centre splits (conversation
        // left, artifact right) and both flanking rails fold for focus.
        const atelierArtOpen = !!(focused && atelierArt && focused.artifacts.some((a) => a.rel === atelierArt));
        // A pending clarifying form takes the stage over the deliverable until
        // answered (live sessions only — not a stale form replayed from archive).
        const formOpen = !!(focused && focused.questionForm && !focused.archived);
        return (
      <div className={bodyCls}>
        <div ref={measureRef} className={measureCls}>
        {!onboarded ? (
          /* ============ ONBOARDING (5 pages: welcome · skin · agents · vault · hire team) ============ */
          <Onboarding onEnter={enterSplit} skin={skin} onPickSkin={pickSkin} team={team} onToggleHire={toggleTeam} />
        ) : atelierMode ? (
          /* ============ ATELIER (fullscreen control room: roster · centre · project) ============ */
          /* When a dark genius holds the stage, the room goes black-&-gold (`noir`)
              — talk-first, the project pane sealed until the exchange earns it. */
          <div className={"atelier" + (focused && experts[focused.expertSlug]?.dark ? " noir" : "")}>
            <AtelierLeft
              experts={experts}
              sessions={sessions}
              focusedId={focusedId}
              armedSlug={expertSlug}
              team={team}
              onToggleTeam={toggleTeam}
              onArm={(slug) => { setExpertSlug(slug); setFocusedId(null); }}
              onFocus={setFocusedId}
              onResume={async (meta) => { const id = await resumeArchive(meta); if (id) setFocusedId(id); }}
              onOpenHistory={() => setHistoryOpen(true)}
              collapsed={!rosterOpen}
              onToggleCollapsed={() => setRosterOpen((v) => !v)}
            />
            <div className="atelier-conv">
              {focused ? (
                <div className={"atelier-stage split" + (formOpen || atelierArtOpen || focused.liveFrame ? " delivered" : "")}>
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
                      activeArtifact={atelierArt}
                      expanded={true}
                      onTogglePosture={exitAtelier}
                      peers={peerAlerts}
                      onFocusPeer={setFocusedId}
                    />
                  </div>
                  {/* The PROJECT pane: a narrow teaser of "what this expert makes"
                      until a deliverable lands; on delivery the rail folds and this
                      grows to dominate (see `.delivered`), showing the viewer + a
                      deliverable switcher (the strip that replaced the Reflet list). */}
                  <div className="atelier-project">
                    {formOpen ? (
                      <div className="atelier-questions">
                        <QuestionsPanel
                          key={focused.questionForm!.id}
                          form={focused.questionForm!}
                          busy={focused.status === "running"}
                          onSubmit={answerForm}
                        />
                      </div>
                    ) : atelierArtOpen ? (
                      <div className="atelier-art">
                        <div className="atelier-art-bar">
                          {focused.artifacts.length > 1 && (
                            <div className="atelier-deliv-tabs" role="tablist">
                              {focused.artifacts.map((a) => (
                                <button
                                  key={a.rel}
                                  role="tab"
                                  aria-selected={a.rel === atelierArt}
                                  className={"atelier-deliv-tab" + (a.rel === atelierArt ? " on" : "")}
                                  onClick={() => setAtelierArt(a.rel)}
                                  title={a.rel}
                                >{a.rel.split("/").pop()}</button>
                              ))}
                            </div>
                          )}
                          <span className="atelier-art-spacer" />
                          <button className="atelier-art-back" onClick={() => setAtelierArt(null)} title="Close deliverable — back to the project">✕ close</button>
                        </div>
                        <div className="atelier-art-body">
                          <ArtifactViewer artifact={focused.artifacts.find((a) => a.rel === atelierArt)!} />
                        </div>
                      </div>
                    ) : focused.liveFrame ? (
                      <AtelierLiveView session={focused} />
                    ) : (
                      <AtelierCanvasEmpty
                        session={focused}
                        experts={experts}
                        onPick={(p) => { handleInputChange(p, null); inputRef.current?.focus(); }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <AtelierWelcome
                  experts={experts}
                  expertSlug={expertSlug}
                  expertLabel={expertLabel}
                  onPick={(p) => { handleInputChange(p, null); inputRef.current?.focus(); }}
                >
                  <Composer
                    experts={experts} expertSlug={expertSlug} expertLabel={expertLabel} active={active}
                    engines={enabledHarnesses} onAddAgent={() => setOverlay(true)}
                    menu={menu} setMenu={setMenu} setActive={setActive}
                    value={value} onChange={handleInputChange} onKey={onKey} onRun={launch} chips={chips} inputRef={inputRef}
                    expertEntries={filteredExperts} onPickExpert={pickExpert}
                    projects={filteredProjects} onPickProject={pickProject}
                    lockExpert onAttach={pickAttachments}
                  />
                </AtelierWelcome>
              )}
            </div>
          </div>
        ) : focused ? (
          /* ====== CONVERSATION (compact; deliverables open into the Atelier focus mode) ====== */
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
            onAnswerForm={answerForm}
            onAttach={pickAttachments}
            onPickCommand={pickCommand}
            onPickArtifact={openArtifact}
            expanded={false}
            onTogglePosture={() => enterAtelier(focused.id)}
            peers={peerAlerts}
            onFocusPeer={setFocusedId}
          />
        ) : (
          /* ============ HOME ============ */
          <div className="home">
            <div className={"home-orb" + (expanded ? " mini" : "")}>
              <MajordomeOrbit
                speaking={anyRunning}
                active={active}
                enabled={enabled}
                mini={expanded}
                onPick={(id) => {
                  // Tapping an engine arms it for the next session if it's one
                  // you've activated; otherwise open the roster to add it.
                  if (enabled.includes(id)) setActive(id);
                  else setOverlay(true);
                }}
              />
              {!expanded && <div className="home-eyebrow">one runtime · the agents orbit it</div>}
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

            {/* Pull to fullscreen: the home bar is a doorway, the atelier is the
                studio. This invite makes the door inviting (breathing aura, a
                peek of the work inside, a soft idle pulse) and is the main push
                toward fullscreen the bar was missing. */}
            <AtelierInvite onEnter={() => setView("atelier")} idleSignal={value} />

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
              {sessions.length === 0 ? (
                <div className="empty">No sessions yet — brief an expert above.<br />Its engine's logo shows here while it runs.</div>
              ) : (
                sessions.map((s) => <SessionRow key={s.id} s={s} kind={experts[s.expertSlug]?.kind} onOpen={() => setFocusedId(s.id)} onStop={() => stop(s.id)} onClose={() => remove(s.id)} />)
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
        <RosterOverlay
          enabled={enabled}
          onToggle={toggleEnabled}
          lifecycle={lifecycle}
          onClose={() => setOverlay(false)}
        />
      )}

      {cabinet && (
        <Gallery
          experts={experts}
          initialSlug={typeof cabinet === "string" ? cabinet : null}
          onIceberg={titanicEgg}
          onClose={() => setCabinet(false)}
          onLaunch={(slug, prompt) => {
            // Launching a piece of work pushes straight into the atelier (the
            // fullscreen studio) — the gallery's highest-intent click is also
            // the strongest pull toward fullscreen.
            setCabinet(false);
            setExpertSlug(slug);
            setView("atelier");
            if (!prompt) return;
            const turn = composeTurn(prompt, []);
            start({ harness: active, expertSlug: slug, display: turn.display, wire: turn.wire, files: turn.files }).then(setFocusedId);
          }}
        />
      )}

      {cabinetNoir && (
        <CabinetNoir
          experts={experts}
          onClose={() => setCabinetNoir(false)}
          onSummon={(slug) => {
            // Talk-first: summoning sends a hidden priming cue so the genius
            // OPENS the conversation in character — no work-spotlight, no launch
            // sheet. The atelier goes black-&-gold (see the `noir` class below).
            setExpertSlug(slug);
            setView("atelier");
            setCabinetNoir(false);
            const wire = "[You have just been summoned from the Cabinet Noir. Open the conversation yourself, in character, per your talk-first protocol: a single short, cold provocation — then wait. Do NOT produce any deliverable yet.]";
            start({ harness: active, expertSlug: slug, display: "(the seal breaks)", wire, files: [] }).then(setFocusedId);
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

      {toasts.length > 0 && <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>}
    </div>
  );
}
