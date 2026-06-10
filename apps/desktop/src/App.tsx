import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { HARNESSES, H, brandOf } from "./shared/harnesses";
import { useExperts, composeTurn, type Attachment } from "./shared/util";
import { isActiveExpert } from "./shared/experts";
import { useSessions } from "./shared/useSessions";
import { useWindowChrome, useAdaptiveHeight, useFullscreen, useNativeFullscreen, useBarWidth } from "./shared/useWindowChrome";
import { useHarnessStates } from "./shared/useHarnessStates";
import { useToasts } from "./shared/useToasts";
import { SKINS, isSkin, DEFAULT_SKIN, isNight, nightId, type Skin } from "./shared/skins";
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
const LS_SKIN = "split.skin"; // skin id ("" = Classic dark) — see shared/skins.ts for the registry
const LS_NIGHT_OPTOUT = "split.skin.nightOptOut"; // nightId() of the evening the user opted out of auto-Minuit
const LS_PRENOIR = "split.skin.preNoir"; // skin to restore when the Noir easter egg is toggled off
const LS_PRETITANIC = "split.skin.preTitanic"; // skin to refloat when the Titanic easter egg is toggled off
const LS_PRECOSMOS = "split.skin.preCosmos"; // skin to come back down to when the Cosmos easter egg is toggled off
const LS_RAILW = "split.artRailWidth"; // px width of the conversation rail in artifact-split mode
const LS_GOD = "split.godMode"; // "1" = auto-approve every tool permission request
const RAIL_MIN = 320;
const RAIL_MAX = 900;
const RAIL_DEFAULT = 460;

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
  const [menu, setMenu] = useState<"engine" | "expert" | "slash" | "project" | null>(null);
  // Query after the `/` at the cursor — null when no slash is active. Drives
  // the slash-command palette in the focused conversation composer.
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  // `#` type-ahead state (home composer only): query after the `#` at the
  // cursor, null when inactive. Drives the vault-project picker.
  const [projectQuery, setProjectQuery] = useState<string | null>(null);
  // Vault project pinned on the NEXT session (the `#project` chip). Per
  // session-start only: the persona is projected once, so a pin can't change
  // mid-session.
  const [pinnedProject, setPinnedProject] = useState<string | null>(null);
  // Project slugs read from the vault's projects/ folder, refreshed each
  // time the `#` menu opens.
  const [vaultProjects, setVaultProjects] = useState<string[]>([]);
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
  const [skin, setSkinState] = useState<Skin>(() => {
    const raw = localStorage.getItem(LS_SKIN);
    const s = raw === null ? DEFAULT_SKIN : isSkin(raw) ? raw : DEFAULT_SKIN;
    return s === "minuit" ? DEFAULT_SKIN : s; // minuit is the night state, never the day skin
  });
  // Auto-"Minuit": between 21:00 and 07:00 local the bar dresses for the
  // night, unless the user picked another skin tonight (opt-out scoped to
  // nightId() so it expires at the next sunset). The minute tick keeps the
  // flip honest for windows that stay open across 21:00 / 07:00.
  const [night, setNight] = useState(isNight());
  // The observatory window (Cosmos egg): the ✦ only rises at midnight —
  // 00:00 to 07:00, the small hours — not the whole Minuit evening.
  const [smallHours, setSmallHours] = useState(new Date().getHours() < 7);
  useEffect(() => {
    const tick = () => {
      setNight(isNight());
      setSmallHours(new Date().getHours() < 7);
    };
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  const [nightOptOut, setNightOptOut] = useState(() => localStorage.getItem(LS_NIGHT_OPTOUT) === nightId());
  useEffect(() => {
    if (night) setNightOptOut(localStorage.getItem(LS_NIGHT_OPTOUT) === nightId());
  }, [night]);
  // Fashion-Week easter egg (Konami code): while the runway is live this
  // override dresses the window, beating even the auto-Minuit night rule.
  const [runwaySkin, setRunwaySkin] = useState<Skin | null>(null);
  // What the window actually wears right now (runway look, else the day skin,
  // else Minuit after dark).
  const shownSkin: Skin = runwaySkin ?? (night && !nightOptOut ? "minuit" : skin);
  const withSkinTransition = (commit: () => void) => {
    // Cross-fade the whole window between skins (View Transitions API,
    // WebKit ≥ Safari 18). flushSync commits the new theme class inside the
    // transition's capture window; engines without the API swap instantly.
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
    if (vt) vt.call(document, () => flushSync(commit));
    else commit();
  };
  // Easter egg #3, the mainstream one — indecision: 4 skin picks within 6 s
  // reads as "can't choose", so the bar shows the whole wardrobe itself
  // (runway(), below) before settling on the user's last pick.
  const pickTimes = useRef<number[]>([]);
  const pickSkin = (s: Skin) => {
    setMoreMenu(false);
    const now = Date.now();
    pickTimes.current = [...pickTimes.current.filter((t) => now - t < 6000), now];
    if (pickTimes.current.length >= 4) {
      pickTimes.current = [];
      runway();
    }
    if (s === "minuit") {
      // Only offered at night, never persisted as the day skin — picking it
      // just re-arms the auto rule for tonight.
      localStorage.removeItem(LS_NIGHT_OPTOUT);
      withSkinTransition(() => setNightOptOut(false));
      return;
    }
    // Picking a skin after dark means "not tonight" — Minuit stands down for
    // the rest of this night only and returns tomorrow evening.
    if (isNight()) localStorage.setItem(LS_NIGHT_OPTOUT, nightId());
    localStorage.setItem(LS_SKIN, s);
    withSkinTransition(() => {
      if (isNight()) setNightOptOut(true);
      setSkinState(s);
    });
  };
  // Chrome overflow menu (⋯) — gathers the rare actions (skin, workspace,
  // replay onboarding) behind one glyph. "skins" is the drill-down page.
  const [moreMenu, setMoreMenu] = useState<false | "root" | "skins">(false);
  // Pin the native window appearance to the skin's polarity so the vibrancy
  // glass behind the translucent surface (lib.rs, Sidebar material) reads
  // bright under the light skins and deep under the dark ones.
  useEffect(() => {
    const dark = SKINS.find((x) => x.id === shownSkin)?.dark ?? true;
    getCurrentWindow().setTheme(dark ? "dark" : "light").catch(() => {});
  }, [shownSkin]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Width (in px) of the conversation rail when the artifact-split layout is
  // active. The user drags the divider to taste; we clamp to [RAIL_MIN,
  // RAIL_MAX] and persist so the next session honours their preference.
  const [railWidth, setRailWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(LS_RAILW));
    if (Number.isFinite(stored) && stored >= RAIL_MIN && stored <= RAIL_MAX) return stored;
    return RAIL_DEFAULT;
  });
  useEffect(() => { localStorage.setItem(LS_RAILW, String(Math.round(railWidth))); }, [railWidth]);

  // God Mode — when on, every pending permission_request is auto-resolved
  // with the agent's "allow" option (scope="once" so nothing gets persisted
  // to var/permissions.json). Toggle persisted in localStorage; the toggle
  // button lives in the conv-head.
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
  // Pointer drag for the split divider. We listen on the window for
  // mousemove/up so the drag survives the cursor briefly leaving the 6px
  // handle. The cursor is forced to col-resize across the whole document
  // during the drag so it never flickers back to text/default over the
  // editor or thread underneath.
  const railDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onRailHandleDown = (e: React.MouseEvent) => {
    e.preventDefault();
    railDragRef.current = { startX: e.clientX, startW: railWidth };
    const onMove = (m: MouseEvent) => {
      const r = railDragRef.current; if (!r) return;
      const next = r.startW + (m.clientX - r.startX);
      setRailWidth(Math.max(RAIL_MIN, Math.min(RAIL_MAX, next)));
    };
    const onUp = () => {
      railDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
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
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const { toasts, push: pushToast } = useToasts();
  // Easter egg — 5 quick clicks on the chrome wordmark toggle the hidden
  // film-noir skin (and back to whatever was worn before). Not in the picker,
  // not in a tooltip: you find it, or you hear about it.
  const eggClicks = useRef<number[]>([]);
  const noirEgg = () => {
    const now = Date.now();
    eggClicks.current = [...eggClicks.current.filter((t) => now - t < 1800), now];
    if (eggClicks.current.length < 5) return;
    eggClicks.current = [];
    if (skin === "noir") {
      const back = localStorage.getItem(LS_PRENOIR);
      pickSkin(isSkin(back) && back !== "noir" && back !== "minuit" ? back : DEFAULT_SKIN);
    } else {
      localStorage.setItem(LS_PRENOIR, skin);
      pickSkin("noir");
      pushToast("🕶️ Mode Noir. Motus.");
    }
  };
  // Easter egg — the Cabinet gallery's last exhibit ("untitled — 1912", a
  // tiny unframed 🧊). Clicking it sinks the bar into the hidden Titanic
  // skin; clicking again refloats whatever was worn before.
  const titanicEgg = () => {
    if (skin === "titanic") {
      const back = localStorage.getItem(LS_PRETITANIC);
      pickSkin(isSkin(back) && back !== "titanic" && back !== "noir" && back !== "minuit" ? back : DEFAULT_SKIN);
    } else {
      localStorage.setItem(LS_PRETITANIC, skin);
      pickSkin("titanic");
      pushToast("🧊 Iceberg, right ahead.");
    }
  };
  // Easter egg — the observatory only opens at midnight: in the small hours
  // (00:00–07:00), while the bar wears Minuit, a tiny ✦ glints in the chrome
  // next to the wordmark (the .wm-star button below). Clicking it flies to
  // the hidden Cosmos skin; the star stays lit inside so you can fly back.
  // Entering from Minuit stores
  // "minuit" as the way back — pickSkin("minuit") re-arms the night rule,
  // so leaving the observatory returns you to the night, not the day skin.
  const cosmosEgg = () => {
    if (skin === "cosmos") {
      const back = localStorage.getItem(LS_PRECOSMOS);
      pickSkin(isSkin(back) && back !== "cosmos" && back !== "noir" && back !== "titanic" ? back : DEFAULT_SKIN);
    } else {
      localStorage.setItem(LS_PRECOSMOS, shownSkin === "minuit" ? "minuit" : skin);
      pickSkin("cosmos");
      pushToast("🔭 Welcome to the observatory.");
    }
  };
  // Easter egg #2 — the Konami code (↑↑↓↓←→←→ B A) sends the whole wardrobe
  // down the runway: every skin for ~1 s, Noir closes the show, then the bar
  // goes back to whatever it was wearing. Nothing is persisted.
  const runwayLive = useRef(false);
  const runwayTimers = useRef<number[]>([]);
  useEffect(() => () => runwayTimers.current.forEach(clearTimeout), []);
  const startRunway = () => {
    if (runwayLive.current) return;
    runwayLive.current = true;
    pushToast("✨ Fashion Week — le vestiaire au complet.");
    const lineup = SKINS.map((s) => s.id);
    runwayTimers.current = lineup.map((id, i) => window.setTimeout(() => setRunwaySkin(id), 400 + 900 * i));
    runwayTimers.current.push(
      window.setTimeout(() => {
        setRunwaySkin(null);
        runwayLive.current = false;
      }, 400 + 900 * lineup.length),
    );
  };
  // Mid-onboarding the show isn't forced on the user — the egg asks first
  // (runwayAsk popup) instead of stealing the guided tour's screen.
  const [runwayAsk, setRunwayAsk] = useState(false);
  const runway = () => {
    if (runwayLive.current) return;
    if (!onboarded) {
      setRunwayAsk(true);
      return;
    }
    startRunway();
  };
  useEffect(() => {
    // e.key (not e.code) so the sequence survives AZERTY & friends.
    const seq = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      pos = k === seq[pos] ? pos + 1 : k === seq[0] ? 1 : 0;
      if (pos === seq.length) {
        pos = 0;
        runway();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `runway` only touches refs and stable setters — safe to bind once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Easter egg #3b — the patient cousin of the indecision trigger: linger in
  // the skin picker for 30 s without committing and a gentle offer slides in
  // at the top of the list to run the Fashion Week for you.
  const [runwayOffer, setRunwayOffer] = useState(false);
  useEffect(() => {
    if (moreMenu !== "skins") {
      setRunwayOffer(false);
      return;
    }
    const t = window.setTimeout(() => setRunwayOffer(true), 30_000);
    return () => window.clearTimeout(t);
  }, [moreMenu]);
  // `@` type-ahead state: when the cursor sits inside an `@…` mention with no
  // whitespace between the `@` and the cursor, this holds the text typed after
  // the `@` (so the expert dropdown can filter). null = not in mention mode.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
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
          const files = JSON.parse(raw) as Attachment[];
          if (files.length) setAttachments((p) => [...p, ...files]);
          inputRef.current?.focus();
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
    const t = value.trim();
    if (!t && !attachments.length) return;
    if (H[active]?.reserve) {
      pushToast(`${H[active].label} isn't installed yet`);
      return;
    }
    const turn = composeTurn(t, attachments);
    setValue("");
    setAttachments([]);
    setMenu(null);
    const project = pinnedProject ?? undefined;
    setPinnedProject(null);
    start({ harness: active, expertSlug, display: turn.display, wire: turn.wire, files: turn.files, project }).then(setFocusedId);
  }
  function reply() {
    if (!focused) return;
    const t = value.trim();
    if (!t && !attachments.length) return;
    const turn = composeTurn(t, attachments);
    setValue("");
    setAttachments([]);
    send(focused.id, turn);
  }
  function submit() {
    if (focused) reply();
    else launch();
  }
  // Fill the focused composer with a slash command and refocus (used by the
  // Conversation slash palette).
  function pickCommand(name: string) {
    setValue(`/${name} `);
    setSlashQuery(null);
    setMenu(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const expertEntries = useMemo(() => Object.entries(experts).filter(([slug]) => isActiveExpert(experts, slug)), [experts]);
  const expertLabel = experts[expertSlug]?.label || "Consultant";

  // The expert list shown in the dropdown: full when the menu was opened by
  // clicking the chip; case-insensitive prefix-filtered by `mentionQuery` when
  // the menu was triggered by typing `@…` in the input.
  const filteredExperts = useMemo(() => {
    if (mentionQuery == null || mentionQuery === "") return expertEntries;
    const q = mentionQuery.toLowerCase();
    return expertEntries.filter(([, x]) => x.label.toLowerCase().startsWith(q));
  }, [expertEntries, mentionQuery]);

  // Refresh the vault's project list each time the `#` picker opens — the
  // vault changes underneath us (agents create projects mid-flight).
  useEffect(() => {
    if (menu !== "project") return;
    invoke<string>("vault_tree")
      .then((raw) => {
        const data = JSON.parse(raw) as { tree: { name: string; dir: boolean; children: { name: string; dir: boolean }[] }[] };
        const projects = data.tree.find((n) => n.dir && n.name === "projects");
        setVaultProjects((projects?.children ?? []).filter((c) => c.dir).map((c) => c.name));
      })
      .catch(() => setVaultProjects([]));
  }, [menu]);

  const filteredProjects = useMemo(() => {
    if (projectQuery == null || projectQuery === "") return vaultProjects;
    const q = projectQuery.toLowerCase();
    return vaultProjects.filter((p) => p.toLowerCase().startsWith(q));
  }, [vaultProjects, projectQuery]);

  // Detect an active `@…` mention at the cursor and sync menu state. Called
  // from every input's onChange (the home composer and the conv reply input).
  function handleInputChange(newValue: string, cursorPos: number | null) {
    setValue(newValue);
    const cursor = cursorPos ?? newValue.length;
    // Walk back from the cursor until whitespace or start; if we hit `@` or `/`
    // first, we're in a mention / slash command. Slash only activates at the
    // very start of the input (ACP slash commands are first-token, like in IRC).
    let i = cursor - 1;
    while (i >= 0 && !/\s/.test(newValue[i])) {
      if (newValue[i] === "@") {
        setMentionQuery(newValue.slice(i + 1, cursor));
        setMenu("expert");
        if (slashQuery !== null) { setSlashQuery(null); }
        if (projectQuery !== null) { setProjectQuery(null); }
        return;
      }
      // `#project` picker — home composer only: the pin shapes the persona
      // projected at session START, so it's meaningless on a focused
      // session's reply input.
      if (newValue[i] === "#" && !focused) {
        setProjectQuery(newValue.slice(i + 1, cursor));
        setMenu("project");
        if (mentionQuery !== null) { setMentionQuery(null); }
        if (slashQuery !== null) { setSlashQuery(null); }
        return;
      }
      if (newValue[i] === "/" && i === 0) {
        setSlashQuery(newValue.slice(i + 1, cursor));
        setMenu("slash");
        if (mentionQuery !== null) { setMentionQuery(null); }
        if (projectQuery !== null) { setProjectQuery(null); }
        return;
      }
      i--;
    }
    // Cursor is not inside a mention or slash command — close any open menus.
    if (mentionQuery !== null) {
      setMentionQuery(null);
      if (menu === "expert") setMenu(null);
    }
    if (projectQuery !== null) {
      setProjectQuery(null);
      if (menu === "project") setMenu(null);
    }
    if (slashQuery !== null) {
      setSlashQuery(null);
      if (menu === "slash") setMenu(null);
    }
  }

  // Apply an expert pick. If a mention is active, replace `@<query>` in the
  // input with `@<ExpertLabel> ` and restore the cursor after the inserted
  // text. Otherwise just arm this expert as the default for the next session
  // (the old chip-click behaviour).
  function pickExpert(slug: string) {
    const exp = experts[slug];
    setExpertSlug(slug);
    setMenu(null);
    const wasMention = mentionQuery !== null;
    setMentionQuery(null);
    if (!exp || !wasMention) {
      inputRef.current?.focus();
      return;
    }
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? value.length;
    // Find the `@` that opened the mention (same walk-back as above).
    let i = cursor - 1;
    while (i >= 0 && !/\s/.test(value[i]) && value[i] !== "@") i--;
    if (i < 0 || value[i] !== "@") {
      inputRef.current?.focus();
      return;
    }
    const before = value.slice(0, i);
    const after = value.slice(cursor);
    const inserted = `@${exp.label} `;
    const next = before + inserted + after;
    setValue(next);
    const newCursor = before.length + inserted.length;
    setTimeout(() => {
      input?.focus();
      input?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  // Apply a project pick: strip the `#<query>` from the input (the pin lives
  // in the chip, not in the prompt text) and arm `pinnedProject` for the next
  // session start.
  function pickProject(slug: string) {
    setMenu(null);
    const wasHash = projectQuery !== null;
    setProjectQuery(null);
    setPinnedProject(slug);
    if (!wasHash) {
      inputRef.current?.focus();
      return;
    }
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? value.length;
    // Find the `#` that opened the picker (same walk-back as above).
    let i = cursor - 1;
    while (i >= 0 && !/\s/.test(value[i]) && value[i] !== "#") i--;
    if (i < 0 || value[i] !== "#") {
      inputRef.current?.focus();
      return;
    }
    const before = value.slice(0, i);
    const after = value.slice(cursor);
    const next = (before + after).replace(/\s{2,}/g, " ");
    setValue(next);
    const newCursor = before.length;
    setTimeout(() => {
      input?.focus();
      input?.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  function onKey(e: React.KeyboardEvent) {
    // While the @-mention picker is open, Enter picks the top filtered entry
    // (insert it into the input) instead of submitting the brief.
    if (menu === "expert" && mentionQuery !== null && e.key === "Enter") {
      if (filteredExperts.length > 0) {
        e.preventDefault();
        pickExpert(filteredExperts[0][0]);
        return;
      }
    }
    // Same for the #-project picker.
    if (menu === "project" && projectQuery !== null && e.key === "Enter") {
      if (filteredProjects.length > 0) {
        e.preventDefault();
        pickProject(filteredProjects[0]);
        return;
      }
    }
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") {
      if (menu) { setMenu(null); setMentionQuery(null); setSlashQuery(null); setProjectQuery(null); }
      else if (cabinet) setCabinet(false);
      else if (overlay) setOverlay(false);
      else if (focused) setFocusedId(null);
      else hide();
    }
  }

  // shared chips: the pinned vault project (home composer only) + attachments
  const projectChip = pinnedProject && !focused ? (
    <span className="chip chip-project" title={`Pinned vault project — this session writes to projects/${pinnedProject}/`}>
      #{pinnedProject}
      <button className="xbtn" onMouseDown={(e) => { e.preventDefault(); setPinnedProject(null); }}>✕</button>
    </span>
  ) : null;
  const attachmentChips = attachments.map((a, i) => (
    <span key={i} className="chip">
      📎 {a.name}
      <button className="xbtn" onMouseDown={(e) => { e.preventDefault(); setAttachments((p) => p.filter((_, k) => k !== i)); }}>✕</button>
    </span>
  ));
  const chips = (
    <>
      {projectChip}
      {attachmentChips}
    </>
  );

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
                      <button key={s.id || "classic"} className={"skin-item" + (shownSkin === s.id ? " on" : "")} onClick={() => pickSkin(s.id)} role="menuitem">
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
