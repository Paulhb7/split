import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { HARNESSES, H, brandOf } from "./shared/harnesses";
import { useExperts, composeTurn, type Attachment } from "./shared/util";
import { useSessions } from "./shared/useSessions";
import { useWindowChrome, useAdaptiveHeight, useFullscreen, useBarWidth, useBarHeight } from "./shared/useWindowChrome";
import { useHarnessStates } from "./shared/useHarnessStates";
import { useToasts } from "./shared/useToasts";
import { SKINS, isSkin, type Skin } from "./shared/skins";
import { League, vars } from "./shared/ui";
import { Composer } from "./home/Composer";
import { SessionRow } from "./home/SessionRow";
import { Conversation } from "./conversation/Conversation";
import { HistoryOverlay } from "./history/HistoryOverlay";
import { AuthModal } from "./auth/AuthModal";
import Onboarding from "./onboarding/Onboarding";
import Stage from "./stage/Stage";
import Teams from "./teams/Teams";
import { useTeam } from "./teams/useTeam";
import "./app.css";

const LS_DONE = "split.onboarded";
const LS_VIEW = "split.sessionView"; // "list" | "stage"
const LS_DEF = "split.defaultHarness"; // legacy single-pick (migrated to LS_ENABLED)
const LS_ENABLED = "split.enabledHarnesses"; // the agents the user activated
const LS_ACTIVE = "split.activeHarness"; // the armed engine for the next session
const LS_MODE = "split.mode"; // "simple" (one expert/session) | "teams" (Chief-of-Staff)
const LS_SKIN = "split.skin"; // "" (default dark) | "pastel" | "cyberpunk" | "tokyo"

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
  const { sessions, start, send, sendAuth, sendLogout, sendPermission, stop, remove, cancelQueued, openArchive, resumeArchive } = useSessions(experts);
  const teamApi = useMemo(() => ({ start, send, stop }), [start, send, stop]);
  const { project, channels, activeChannel, activeRoster, setActiveChannel, newChannel, stopChannel, removeChannel } = useTeam(teamApi, experts);
  const { pinned, startMove, togglePin, hide } = useWindowChrome();
  const lifecycle = useHarnessStates();

  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem(LS_DONE));
  const [enabled, setEnabled] = useState<string[]>(loadEnabled);
  const [active, setActiveState] = useState(loadActive);
  const [expertSlug, setExpertSlug] = useState("consultant");
  const [menu, setMenu] = useState<"engine" | "expert" | "slash" | null>(null);
  // Query after the `/` at the cursor — null when no slash is active. Drives
  // the slash-command palette in the focused conversation composer.
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
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
    return isSkin(raw) ? raw : "";
  });
  const pickSkin = (s: Skin) => {
    setSkinState(s);
    localStorage.setItem(LS_SKIN, s);
    setSkinMenu(false);
  };
  const [skinMenu, setSkinMenu] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const { toasts, push: pushToast } = useToasts();
  // `@` type-ahead state: when the cursor sits inside an `@…` mention with no
  // whitespace between the `@` and the cursor, this holds the text typed after
  // the `@` (so the expert dropdown can filter). null = not in mention mode.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef<Record<string, string>>({});

  const focused = sessions.find((s) => s.id === focusedId) ?? null;
  const authSession = sessions.find((s) => s.auth) ?? null;
  const anyRunning = sessions.some((s) => s.status === "running");
  const accent = focused ? brandOf(focused.harness) : brandOf(active);
  const enabledHarnesses = HARNESSES.filter((h) => enabled.includes(h.id));

  // Adaptive bar: ResizeObserver fits the window to the natural body content.
  // The "minimal" state is achieved by rendering less body (just the composer
  // when truly idle — see the home branch below), not by forcing a sub-content
  // window height.
  //
  // Teams mode is the one exception — it goes native fullscreen so the Chief
  // of Staff orchestration view has the canvas it needs. Auto-fit is paused
  // while in fullscreen; on exit, `useAdaptiveHeight` re-fits to whatever the
  // body now shows.
  const expanded =
    !!focused || sessions.length > 0 || mode === "teams" || overlay || !!authSession || !onboarded;
  const isTeamsFullscreen = mode === "teams";
  useFullscreen(isTeamsFullscreen);
  // Pre-compute how much extra height the open dropdown needs. The menu is
  // `position: absolute` so it doesn't contribute to `measureRef`'s natural
  // offsetHeight; we reserve room manually so the window grows tall enough
  // to render it without clipping. Bounded by the CSS `max-height` of `.menu`.
  const menuExtra = !menu
    ? 0
    : menu === "engine"
      ? Math.min(320, enabledHarnesses.length * 56 + 80)
      : Math.min(320, Object.keys(experts).length * 56 + 16);
  // The "Your agents" overlay (and any future panel that needs more room) gets
  // a wider + taller bar — caps to a fraction of the user's screen so it
  // doesn't overflow a small display. Teams fullscreen owns its own geometry;
  // don't fight it. The overlay content lives OUTSIDE `measureRef` (rendered
  // after it in the JSX), so `useAdaptiveHeight` can't see it — disable
  // adaptive fit and force an explicit tall height for the duration.
  const wideOverlay = overlay && !isTeamsFullscreen;
  const screenW = typeof window !== "undefined" ? window.screen?.width ?? 1440 : 1440;
  const screenH = typeof window !== "undefined" ? window.screen?.height ?? 900 : 900;
  const wideWidth = Math.min(1200, Math.floor(screenW * 0.7));
  const tallHeight = Math.min(1100, Math.floor(screenH * 0.85));
  useAdaptiveHeight({
    measureRef,
    disabled: isTeamsFullscreen || wideOverlay,
    menuExtra,
    extraDeps: [
      menu,
      overlay,
      expanded,
      focused?.thread.length ?? 0,
      focused?.answer.length ?? 0,
      focused?.logs.length ?? 0,
      view,
      mode,
      onboarded,
    ],
  });
  useBarWidth(wideOverlay ? wideWidth : 680);
  useBarHeight(wideOverlay ? tallHeight : null);

  // arm an engine for the next session (persisted)
  const setActive = (id: string) => {
    setActiveState(id);
    localStorage.setItem(LS_ACTIVE, id);
  };

  useEffect(() => {
    if (!experts[expertSlug]) {
      const first = Object.keys(experts)[0];
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

  // toast a session that finished while you weren't watching it
  useEffect(() => {
    const prev = prevStatus.current;
    for (const s of sessions) {
      const was = prev[s.id];
      if (was === "running" && s.status !== "running" && s.id !== focusedId) {
        const verb = s.status === "ended" ? "ended" : s.status === "error" ? "errored" : "is ready";
        pushToast(`@${s.expertLabel} ${verb}`, 6000);
      }
      prev[s.id] = s.status;
    }
    for (const id of Object.keys(prev)) if (!sessions.some((s) => s.id === id)) delete prev[id];
  }, [sessions, focusedId, pushToast]);

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
  function enterSplit(ids: string[], intent?: "test_wolfgang" | "start_recruiter") {
    const list = ids.length ? ids : ["claude"];
    setEnabled(list);
    setActiveState(list[0]);
    localStorage.setItem(LS_ENABLED, JSON.stringify(list));
    localStorage.setItem(LS_ACTIVE, list[0]);
    localStorage.setItem(LS_DONE, "1");
    setOnboarded(true);
    // Page 4/5 CTAs auto-launch a session on the primary agent so the user lands
    // straight in a running thread (Wolfgang with the EV prompt, or a fresh
    // Socrates interview). Skip path = no intent, lands on home composer.
    if (intent === "test_wolfgang") {
      const slug = "consultant";
      const prompt = "Research the EV market outlook for 2026";
      const turn = composeTurn(prompt, []);
      setExpertSlug(slug);
      start({ harness: list[0], expertSlug: slug, display: turn.display, wire: turn.wire, files: turn.files }).then(setFocusedId);
    } else if (intent === "start_recruiter") {
      const slug = "recruiter";
      const prompt = "Help me design my first custom expert";
      const turn = composeTurn(prompt, []);
      setExpertSlug(slug);
      start({ harness: list[0], expertSlug: slug, display: turn.display, wire: turn.wire, files: turn.files }).then(setFocusedId);
    }
  }

  function openWorkspaceFolder(sessionId?: string) {
    const workspace = localStorage.getItem("split.workspace") || "";
    invoke("open_workspace", { workspace, sessionId: sessionId ?? null });
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
    start({ harness: active, expertSlug, display: turn.display, wire: turn.wire, files: turn.files }).then(setFocusedId);
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

  const expertEntries = useMemo(() => Object.entries(experts), [experts]);
  const expertLabel = experts[expertSlug]?.label || "Consultant";

  // The expert list shown in the dropdown: full when the menu was opened by
  // clicking the chip; case-insensitive prefix-filtered by `mentionQuery` when
  // the menu was triggered by typing `@…` in the input.
  const filteredExperts = useMemo(() => {
    if (mentionQuery == null || mentionQuery === "") return expertEntries;
    const q = mentionQuery.toLowerCase();
    return expertEntries.filter(([, x]) => x.label.toLowerCase().startsWith(q));
  }, [expertEntries, mentionQuery]);

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
        return;
      }
      if (newValue[i] === "/" && i === 0) {
        setSlashQuery(newValue.slice(i + 1, cursor));
        setMenu("slash");
        if (mentionQuery !== null) { setMentionQuery(null); }
        return;
      }
      i--;
    }
    // Cursor is not inside a mention or slash command — close any open menus.
    if (mentionQuery !== null) {
      setMentionQuery(null);
      if (menu === "expert") setMenu(null);
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
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") {
      if (menu) { setMenu(null); setMentionQuery(null); setSlashQuery(null); }
      else if (overlay) setOverlay(false);
      else if (focused) setFocusedId(null);
      else hide();
    }
  }

  // shared attachment chips
  const chips = attachments.map((a, i) => (
    <span key={i} className="chip">
      📎 {a.name}
      <button className="xbtn" onMouseDown={(e) => { e.preventDefault(); setAttachments((p) => p.filter((_, k) => k !== i)); }}>✕</button>
    </span>
  ));

  return (
    <div className={"app" + (skin ? ` theme-${skin}` : "")} style={vars({ "--brand": accent })}>
      {dragging && <div className="drop">⬇ Drop a file to attach</div>}

      {/* chrome */}
      <div className="chrome" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("button")) startMove(); }}>
        <span className={"wm" + (anyRunning ? " live" : "")}>split<span className="dot" /></span>
        <span className="chrome-meta">{focused ? `on ${H[focused.harness]?.label || focused.harness}` : sessions.length ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}` : "ready"}</span>
        <span className="spacer" />
        {onboarded && !focused && (
          <div className="seg" style={{ marginRight: 2 }}>
            {(["simple", "teams"] as const).map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} title={m === "simple" ? "Simple — one expert per session" : "Teams — a Chief of Staff orchestrates the experts"}>{m}</button>
            ))}
          </div>
        )}
        <button className="iconbtn" onClick={() => { localStorage.removeItem(LS_DONE); setOnboarded(false); }} title="Replay onboarding">↻</button>
        <button className="iconbtn" onClick={() => setHistoryOpen(true)} title="Past conversations">📜</button>
        <div className="skin-wrap">
          <button className={"iconbtn" + (skin ? " on" : "")} onClick={() => setSkinMenu((v) => !v)} title="Skin">✿</button>
          {skinMenu && (
            <>
              <div className="skin-scrim" onClick={() => setSkinMenu(false)} />
              <div className="skin-menu" role="menu">
                {SKINS.map((s) => (
                  <button key={s.id || "classic"} className={"skin-item" + (skin === s.id ? " on" : "")} onClick={() => pickSkin(s.id)} role="menuitem">
                    <span className="skin-sw" style={{ background: `linear-gradient(135deg, ${s.sw[0]} 0%, ${s.sw[0]} 50%, ${s.sw[1]} 50%, ${s.sw[1]} 100%)`, boxShadow: `inset 0 0 0 1.5px ${s.sw[2]}` }} />
                    <span className="skin-meta">
                      <b>{s.label}</b>
                      <small>{s.hint}</small>
                    </span>
                    {skin === s.id && <span className="skin-tick">●</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button className={"iconbtn" + (pinned ? " on" : "")} onClick={togglePin} title={pinned ? "Unpin (allow behind)" : "Pin on top"}>{pinned ? "◆" : "◇"}</button>
        <button className="iconbtn" onClick={hide} title="Hide (⌘J)">—</button>
      </div>

      <div className={"body" + (isTeamsFullscreen ? " fill" : "")}>
        <div ref={measureRef} className={"measure" + (isTeamsFullscreen ? " fill" : "")}>
        {!onboarded ? (
          /* ============ ONBOARDING (5 pages: concept · demo · pick · @Wolfgang · @Socrates) ============ */
          <Onboarding onEnter={enterSplit} />
        ) : focused ? (
          /* ============ CONVERSATION ============ */
          <Conversation
            session={focused}
            experts={experts}
            value={value}
            inputRef={inputRef}
            slashQuery={slashQuery}
            chips={chips}
            onBack={() => setFocusedId(null)}
            onOpenWorkspace={openWorkspaceFolder}
            onLogout={sendLogout}
            onStop={stop}
            onClose={() => { stop(focused.id); remove(focused.id); setFocusedId(null); }}
            onAuth={sendAuth}
            onPermission={sendPermission}
            onCancelQueued={cancelQueued}
            onInputChange={handleInputChange}
            onKey={onKey}
            onReply={reply}
            onPickCommand={pickCommand}
          />
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
          <div className="home">
            <Composer
              experts={experts} expertSlug={expertSlug} expertLabel={expertLabel} active={active}
              engines={enabledHarnesses} onAddAgent={() => setOverlay(true)}
              menu={menu} setMenu={setMenu} setActive={setActive}
              value={value} onChange={handleInputChange} onKey={onKey} onRun={launch} chips={chips} inputRef={inputRef}
              expertEntries={filteredExperts} onPickExpert={pickExpert}
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
              <Stage sessions={sessions} onOpen={setFocusedId} onStop={stop} onClose={remove} />
            ) : (
              <div className="sessions">
                {sessions.length === 0 ? (
                  <div className="empty">No sessions yet — brief an expert above.<br />Its engine's logo shows here while it runs.</div>
                ) : (
                  sessions.map((s) => <SessionRow key={s.id} s={s} onOpen={() => setFocusedId(s.id)} onStop={() => stop(s.id)} onClose={() => remove(s.id)} />)
                )}
              </div>
            )}
            </>}
          </div>
        )}
        </div>
      </div>

      {overlay && (
        <div className="overlay" onClick={() => setOverlay(false)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="league-head" style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: 30 }}>Your <em>agents</em></h2>
              <button className="btn ghost" onClick={() => setOverlay(false)}>done</button>
            </div>
            <div className="ob2-pickhint">Toggle the agents you want — only these appear in your roster &amp; menus. Add or remove anytime.</div>
            <League isSelected={(id) => enabled.includes(id)} onPick={toggleEnabled} lifecycle={lifecycle} />
          </div>
        </div>
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

      {authSession && <AuthModal session={authSession} onPick={(m) => sendAuth(authSession.id, m)} />}

      {toasts.length > 0 && <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>}
    </div>
  );
}
