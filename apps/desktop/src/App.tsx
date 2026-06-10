import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { HARNESSES, H, brandOf } from "./shared/harnesses";
import { useExperts, composeTurn, type Attachment } from "./shared/util";
import { isActiveExpert } from "./shared/experts";
import { useSessions } from "./shared/useSessions";
import { useWindowChrome, useAdaptiveHeight, useFullscreen, useNativeFullscreen, useBarWidth } from "./shared/useWindowChrome";
import { useHarnessStates } from "./shared/useHarnessStates";
import { useToasts } from "./shared/useToasts";
import { SKINS } from "./shared/skins";
import { useSkin } from "./shared/useSkin";
import { useComposer } from "./shared/useComposer";
import { useGodMode } from "./shared/useGodMode";
import { useRailResize } from "./shared/useRailResize";
import { League, vars } from "./shared/ui";
import { Composer } from "./home/Composer";
import { SessionRow } from "./home/SessionRow";
import { Conversation } from "./conversation/Conversation";
import { ArtifactViewer } from "./conversation/ArtifactViewer";
import { HistoryOverlay } from "./history/HistoryOverlay";
import { AuthModal } from "./auth/AuthModal";
import Onboarding from "./onboarding/Onboarding";
import Stage from "./stage/Stage";
import Teams from "./teams/Teams";
import { useTeam } from "./teams/useTeam";
import Cabinet from "./cabinet/Cabinet";
import { VaultOverlay } from "./vault/VaultOverlay";
import SplitMark from "./shared/SplitMark";
import GalleryWall, { buildWings } from "./shared/GalleryWall";
import "./app.css";

const LS_DONE = "split.onboarded";
const LS_VIEW = "split.sessionView"; // "list" | "stage"
const LS_DEF = "split.defaultHarness"; // legacy single-pick (migrated to LS_ENABLED)
const LS_ENABLED = "split.enabledHarnesses"; // the agents the user activated
const LS_ACTIVE = "split.activeHarness"; // the armed engine for the next session
const LS_MODE = "split.mode"; // "simple" (one expert/session) | "teams" (Chief-of-Staff)

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
  const [view, setViewState] = useState<"list" | "stage">(() => (localStorage.getItem(LS_VIEW) === "stage" ? "stage" : "list"));
  const setView = (v: "list" | "stage") => {
    setViewState(v);
    localStorage.setItem(LS_VIEW, v);
  };

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [mode, setModeState] = useState<"simple" | "teams">(() => (localStorage.getItem(LS_MODE) === "teams" ? "teams" : "simple"));
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
  // Teams). Recomputed every render so the moment a deliverable lands the
  // window expands; restored to the 680 default when artifacts vanish or the
  // user backs out of the focused session.
  const artMode = !!focused && focused.artifacts.length > 0;
  const isFullscreen = mode === "teams" || overlay || !!cabinet || historyOpen || !onboarded || vaultOpen || artMode;
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
    disabled: isFullscreen || artMode,
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
  useBarWidth(artMode ? 1180 : 680);

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

  // drop a file anywhere → pending attachment
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent(async (e) => {
      if (e.payload.type === "enter" || e.payload.type === "over") setDragging(true);
      else if (e.payload.type === "leave") setDragging(false);
      else if (e.payload.type === "drop") {
        setDragging(false);
        const paths = e.payload.paths ?? [];
        if (!paths.length) return;
        try {
          const raw = await invoke<string>("read_files_for_agent", { paths });
          addAttachments(JSON.parse(raw) as Attachment[]);
        } catch {
          /* ignore */
        }
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // toast a session that finished while you weren't watching it — only for
  // classic-UI sessions; Teams members complete inside the Teams view and
  // their state changes shouldn't toast the global home.
  useEffect(() => {
    const prev = prevStatus.current;
    for (const s of classicSessions) {
      const was = prev[s.id];
      if (was === "running" && s.status !== "running" && s.id !== focusedId) {
        const verb = s.status === "ended" ? "ended" : s.status === "error" ? "errored" : "is ready";
        pushToast(`@${s.expertLabel} ${verb}`, 6000);
      }
      prev[s.id] = s.status;
    }
    for (const id of Object.keys(prev)) if (!classicSessions.some((s) => s.id === id)) delete prev[id];
  }, [classicSessions, focusedId, pushToast]);

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
  function enterSplit(ids: string[], intent?: "test_wolfgang" | "start_recruiter", expertSlug?: string, customPrompt?: string) {
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
    // - test_wolfgang now carries a custom topic ("Brief me on …") from the
    //   page-3 form; falls back to a sample EV-market brief if no topic.
    if (expertSlug) {
      setExpertSlug(expertSlug);
    }
    if (intent === "test_wolfgang") {
      const slug = "consultant";
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
          {/* The chrome mark uses the same Three.js orb as the home hero,
              just much smaller. `anyRunning` → isSpeaking makes it swell &
              swirl faster when any session is working — visual heartbeat. */}
          <SplitMark size={22} isSpeaking={anyRunning} />
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
        {onboarded && !focused && (
          <div className="seg" style={{ marginRight: 2 }}>
            {(["simple", "teams"] as const).map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} title={m === "simple" ? "Simple — one expert per session" : "Teams — a Chief of Staff orchestrates the experts"}>{m}</button>
            ))}
          </div>
        )}
        <button className="iconbtn" onClick={() => setCabinet(true)} title="Browse cabinet — use cases & examples per expert">☷</button>
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
        const bodyCls = "body" + (mode === "teams" || artMode ? " fill" : isFullscreen ? " tall" : "");
        const measureCls = "measure" + (mode === "teams" || artMode ? " fill" : isFullscreen ? " tall" : "");
        return (
      <div className={bodyCls}>
        <div ref={measureRef} className={measureCls}>
        {!onboarded ? (
          /* ============ ONBOARDING (5 pages: concept · demo · pick · @Wolfgang · @Socrates) ============ */
          <Onboarding onEnter={enterSplit} skin={skin} onPickSkin={pickSkin} />
        ) : focused ? (
          /* ============ CONVERSATION (+ artifact viewer when deliverables exist) ============ */
          artMode ? (
            <div className="art-split" style={{ ["--rail-w" as string]: `${railWidth}px` }}>
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
                  onPickCommand={pickCommand}
                  onPickArtifact={pickArtifact}
                />
              </div>
              <div
                className="art-split-handle"
                onMouseDown={onRailHandleDown}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize conversation rail"
                title="Glisser pour redimensionner"
              />
              <div className="art-split-view">
                {(() => {
                  const activeRel = focused.activeArtifact
                    ?? focused.artifacts[focused.artifacts.length - 1]?.rel
                    ?? null;
                  const art = activeRel ? focused.artifacts.find((a) => a.rel === activeRel) : null;
                  return art ? <ArtifactViewer artifact={art} /> : null;
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
            onPickCommand={pickCommand}
            onPickArtifact={pickArtifact}
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
          <div className={"home" + (roomyHome ? " roomy" : "")}>
            <div className={"home-orb" + (expanded ? " mini" : "")}>
              <div className="split-levitate">
                <SplitMark size={expanded ? 72 : 140} isSpeaking={anyRunning} />
              </div>
              <div className="split-shadow" aria-hidden="true" />
            </div>
            <Composer
              experts={experts} expertSlug={expertSlug} expertLabel={expertLabel} active={active}
              engines={enabledHarnesses} onAddAgent={() => setOverlay(true)}
              menu={menu} setMenu={setMenu} setActive={setActive}
              value={value} onChange={handleInputChange} onKey={onKey} onRun={launch} chips={chips} inputRef={inputRef}
              expertEntries={filteredExperts} onPickExpert={pickExpert}
              projects={filteredProjects} onPickProject={pickProject}
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
              <span className="spacer" />
              <div className="seg">
                {(["list", "stage"] as const).map((v) => (
                  <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)} title={v === "list" ? "List view" : "Live stage"}>{v}</button>
                ))}
              </div>
            </div>
            {view === "stage" ? (
              <Stage sessions={classicSessions} onOpen={setFocusedId} onStop={stop} onClose={remove} />
            ) : (
              <div className="sessions">
                {classicSessions.length === 0 ? (
                  <div className="empty">No sessions yet — brief an expert above.<br />Its engine's logo shows here while it runs.</div>
                ) : (
                  classicSessions.map((s) => <SessionRow key={s.id} s={s} onOpen={() => setFocusedId(s.id)} onStop={() => stop(s.id)} onClose={() => remove(s.id)} />)
                )}
                {teamSessionsCount > 0 && (
                  <button className="teams-pointer" onClick={() => setMode("teams")}>
                    {teamSessionsCount} team session{teamSessionsCount === 1 ? "" : "s"} running in Teams →
                  </button>
                )}
              </div>
            )}
            </>}

            {/* Maximised home: the void below the composer becomes the cabinet
                hanging. A portrait click opens the expert's fiche (use cases +
                launch CTA) via the Cabinet overlay. */}
            {roomyHome && (
              <div className="home-gallery">
                <div className="sec">
                  <span>the cabinet</span>
                  <span className="muted">pick a portrait — they wake up ready to brief</span>
                </div>
                <GalleryWall wings={buildWings(experts)} onPick={(slug) => setCabinet(slug)} />
              </div>
            )}
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
