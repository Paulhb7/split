import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { HARNESSES, H, logoUrl, brandOf, type Harness } from "./shared/harnesses";
import { useExperts, composeTurn, type Attachment } from "./shared/util";
import { useSessions } from "./shared/useSessions";
import { useWindowChrome, useAdaptiveHeight, useFullscreen, useBarWidth, useBarHeight } from "./shared/useWindowChrome";
import type { Session } from "./shared/models";
import type { ArchivedSessionMeta } from "./shared/events";
import { Logo, Tile, League, vars } from "./shared/ui";
import { useHarnessStates } from "./shared/useHarnessStates";
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
type Skin = "" | "pastel" | "cyberpunk" | "tokyo";
const SKINS: { id: Skin; label: string; hint: string; sw: [string, string, string] }[] = [
  { id: "", label: "Classic", hint: "Anthracite night, warm copper accent", sw: ["#0a0b0e", "#1c1f28", "#d97757"] },
  { id: "pastel", label: "Wes Anderson", hint: "Cream salon, serif display, dusty rose", sw: ["#ecd9c0", "#fbf2e2", "#c95a7a"] },
  { id: "cyberpunk", label: "Night City", hint: "Neon magenta + cyan on bluish black", sw: ["#07070d", "#13102a", "#ff3df2"] },
  { id: "tokyo", label: "Tokyo Night", hint: "Deep indigo, calm violet & teal accents", sw: ["#0e0f1d", "#1a1b2e", "#bb9af7"] },
];
const isSkin = (v: string | null): v is Skin =>
  v === "" || v === "pastel" || v === "cyberpunk" || v === "tokyo";

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
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);
  // `@` type-ahead state: when the cursor sits inside an `@…` mention with no
  // whitespace between the `@` and the cursor, this holds the text typed after
  // the `@` (so the expert dropdown can filter). null = not in mention mode.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [focused?.answer, focused?.thoughts, focused?.thread.length, focusedId]);

  // toast a session that finished while you weren't watching it
  useEffect(() => {
    const prev = prevStatus.current;
    for (const s of sessions) {
      const was = prev[s.id];
      if (was === "running" && s.status !== "running" && s.id !== focusedId) {
        const tid = `${s.id}-${Date.now()}`;
        const verb = s.status === "ended" ? "ended" : s.status === "error" ? "errored" : "is ready";
        setToasts((t) => [...t, { id: tid, text: `@${s.expertLabel} ${verb}` }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== tid)), 6000);
      }
      prev[s.id] = s.status;
    }
    for (const id of Object.keys(prev)) if (!sessions.some((s) => s.id === id)) delete prev[id];
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
  function enterSplit(ids: string[]) {
    const list = ids.length ? ids : ["claude"];
    setEnabled(list);
    setActiveState(list[0]);
    localStorage.setItem(LS_ENABLED, JSON.stringify(list));
    localStorage.setItem(LS_ACTIVE, list[0]);
    localStorage.setItem(LS_DONE, "1");
    setOnboarded(true);
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
  function pushToast(text: string) {
    const tid = `t-${Date.now()}`;
    setToasts((x) => [...x, { id: tid, text }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== tid)), 5000);
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
          /* ============ ONBOARDING (3 animated pages) ============ */
          <Onboarding onEnter={enterSplit} />
        ) : focused ? (
          /* ============ CONVERSATION ============ */
          <div className="conv">
            <div className="conv-head">
              <button className="iconbtn" onClick={() => setFocusedId(null)} title="Back">‹</button>
              <Tile id={focused.harness} size={38} />
              <div>
                <div className="conv-title">@{focused.expertLabel}{experts[focused.expertSlug]?.role ? <span className="conv-role"> · {experts[focused.expertSlug]?.role}</span> : null}</div>
                <div className="conv-on">on <b>{H[focused.harness]?.label || focused.harness}</b> · {focused.status}</div>
              </div>
              <span className="spacer" />
              <button className="iconbtn" onClick={() => openWorkspaceFolder(focused.id)} title="Open this session's folder">📁</button>
              {(focused.status === "idle" || focused.status === "running") && !focused.archived && (
                <button className="iconbtn" style={{ width: "auto", padding: "2px 8px", fontSize: 11 }}
                        onClick={() => sendLogout(focused.id)}
                        title={`Sign out of ${H[focused.harness]?.label || focused.harness}`}>sign out</button>
              )}
              {focused.status === "running" ? (
                <button className="iconbtn" onClick={() => stop(focused.id)} title="Stop">■</button>
              ) : focused.status !== "ended" ? (
                <button className="iconbtn" onClick={() => { stop(focused.id); remove(focused.id); setFocusedId(null); }} title="Close">✕</button>
              ) : null}
            </div>

            <div className="thread" ref={threadRef}>
              {focused.thread.map((turn, i) => (
                <div key={i} className={"turn " + turn.role}>
                  <span className="role">
                    {turn.role === "user" ? "You" : turn.role === "thought" ? `${focused.expertLabel} · thinking` : focused.expertLabel}
                  </span>
                  <div className="text">
                    {turn.role === "user" ? (
                      <>
                        {turn.text}
                        {turn.files?.length ? <div className="attach">{turn.files.map((f, j) => <span key={j} className="chip">📎 {f}</span>)}</div> : null}
                      </>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              {focused.thoughts && (
                <div className="turn thought">
                  <span className="role">{focused.expertLabel} · thinking</span>
                  <div className="text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{focused.thoughts}</ReactMarkdown></div>
                </div>
              )}
              {focused.answer && (
                <div className="turn agent">
                  <span className="role">{focused.expertLabel}</span>
                  <div className="text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{focused.answer}</ReactMarkdown></div>
                </div>
              )}
              {focused.status === "running" && (
                <div className="thinking"><span className="dot running" /> <span className="thinking-line">{focused.summary || `${focused.expertLabel} is thinking…`}</span></div>
              )}
              {focused.auth && (
                <div className="thinking">
                  needs sign-in:
                  {focused.auth.methods.map((m) => <button key={m.id} className="iconbtn" style={{ width: "auto", padding: "4px 10px" }} onClick={() => sendAuth(focused.id, m.id)}>{m.name || m.id}</button>)}
                  {focused.auth.hasLogin && <button className="iconbtn" style={{ width: "auto", padding: "4px 10px" }} onClick={() => invoke("browser_login", { harness: focused.auth!.harness })}>Sign in</button>}
                </div>
              )}
              {focused.pendingPermission && (() => {
                const pp = focused.pendingPermission;
                // Pick the agent option to use when we say "allow": prefer a
                // non-`always` allow (we own persistence on our side).
                const allowOpt = pp.options.find((o) => /allow/i.test(o.kind) && !/always/i.test(o.kind))
                              ?? pp.options.find((o) => /allow/i.test(o.kind));
                const allowId = allowOpt?.id ?? null;
                const ask = (optionId: string | null, scope: "once" | "session" | "always-allow") =>
                  sendPermission(focused.id, pp.id, optionId, scope);
                return (
                  <div className="thinking">
                    🔧 needs approval · <code>{pp.toolId}</code>
                    <button className="iconbtn" style={{ width: "auto", padding: "4px 10px" }}
                            onClick={() => allowId && ask(allowId, "once")} disabled={!allowId}>Allow once</button>
                    <button className="iconbtn" style={{ width: "auto", padding: "4px 10px" }}
                            onClick={() => allowId && ask(allowId, "session")} disabled={!allowId}>Allow session</button>
                    <button className="iconbtn" style={{ width: "auto", padding: "4px 10px" }}
                            onClick={() => allowId && ask(allowId, "always-allow")} disabled={!allowId}>Always ({pp.expert})</button>
                    <button className="iconbtn" style={{ width: "auto", padding: "4px 10px" }}
                            onClick={() => ask(null, "once")}>Deny</button>
                  </div>
                );
              })()}
              {focused.queued && <div className="thinking">⏳ queued · {focused.queued.display || "(file)"} <button className="xbtn" onClick={() => cancelQueued(focused.id)}>✕</button></div>}
            </div>

            {focused.logs.length > 0 && (
              <details className="logs" open={focused.status === "running"}>
                <summary>
                  <span className="logs-label">logs</span>
                  <span className="logs-count">{focused.logs.length} line{focused.logs.length === 1 ? "" : "s"}</span>
                </summary>
                <pre className="logs-pre" ref={(el) => { if (el && focused.status === "running") el.scrollTop = el.scrollHeight; }}>
                  {focused.logs.slice(-200).join("\n")}
                </pre>
              </details>
            )}

            {focused.status !== "ended" && (() => {
              // Slash palette — populated from the agent's
              // `available_commands_update` notifications. Only renders when
              // the user has typed `/` at the start of the input AND the agent
              // advertised at least one command. Click → fill input with
              // `/<name> ` and refocus; Enter on no-match falls through to a
              // regular send so the user's text isn't trapped.
              const slashOpen = slashQuery !== null && focused.commands.length > 0;
              const matches = slashOpen
                ? focused.commands.filter((c) =>
                    c.name.toLowerCase().startsWith((slashQuery || "").toLowerCase())
                  )
                : [];
              const pickCmd = (name: string) => {
                setValue(`/${name} `);
                setSlashQuery(null);
                setMenu(null);
                setTimeout(() => inputRef.current?.focus(), 0);
              };
              return (
                <>
                  {slashOpen && matches.length > 0 && (
                    <div className="slash-menu" role="listbox" aria-label="Slash commands">
                      {matches.map((c) => (
                        <button
                          key={c.name}
                          className="slash-item"
                          onClick={() => pickCmd(c.name)}
                          title={c.description}
                        >
                          <span className="slash-name">/{c.name}</span>
                          {c.hint && <span className="slash-hint"> {c.hint}</span>}
                          {c.description && <span className="slash-desc">— {c.description}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="composer" style={{ marginTop: 16, marginBottom: 0 }}>
                    {chips}
                    <input ref={inputRef} value={value} onChange={(e) => handleInputChange(e.target.value, e.target.selectionStart)} onKeyDown={onKey}
                      placeholder={focused.status === "running" ? `${focused.expertLabel} is working — queue the next…` : `Reply to ${focused.expertLabel}…`} />
                    {focused.status === "running" ? (
                      <button className="stop" onClick={() => stop(focused.id)}>■</button>
                    ) : (
                      <button className="run" onClick={reply} title="Send">▶</button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
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

// ---- composer (engine + expert + prompt) ----
function Composer(props: {
  experts: ReturnType<typeof useExperts>;
  expertSlug: string; expertLabel: string; active: string;
  engines: Harness[]; onAddAgent: () => void;
  menu: "engine" | "expert" | "slash" | null; setMenu: (m: "engine" | "expert" | "slash" | null) => void;
  setActive: (s: string) => void;
  value: string; onChange: (v: string, cursor: number | null) => void; onKey: (e: React.KeyboardEvent) => void; onRun: () => void;
  chips: React.ReactNode; inputRef: React.RefObject<HTMLInputElement | null>;
  expertEntries: [string, { label: string; kind: string; blurb: string }][];
  onPickExpert: (slug: string) => void;
}) {
  const { menu, setMenu, active, setActive, engines, onAddAgent, expertSlug, experts, expertLabel, value, onChange, onKey, onRun, chips, inputRef, expertEntries, onPickExpert } = props;
  return (
    <div className="composer">
      {menu === "engine" && (
        <div className="menu">
          {engines.map((h) => (
            <button key={h.id} className={"mi" + (h.id === active ? " sel" : "")} onClick={() => { setActive(h.id); setMenu(null); inputRef.current?.focus(); }}>
              <span className="logo" style={vars({ "--logo": logoUrl(h.id), "--brand": h.brand, "--s": "16px" })} />
              <span className="mn">{h.label}</span>
              <span className="mk">{h.reserve ? "reserve" : h.lane}</span>
              <span className="mb">{h.blurb}</span>
            </button>
          ))}
          <button className="mi mi-add" onClick={() => { setMenu(null); onAddAgent(); }}>
            <span className="mi-plus">＋</span>
            <span className="mn">Add agent…</span>
            <span className="mk">manage</span>
          </button>
        </div>
      )}
      {menu === "expert" && (
        <div className="menu">
          {expertEntries.length === 0 ? (
            <div className="mi mi-empty">No expert matches that name. Type a different prefix or press Esc.</div>
          ) : (
            expertEntries.map(([slug, x]) => {
              // Show "Consultant · researcher" so users learn who's who.
              const role = (x as { role?: string }).role ?? slug.replace(/_/g, " ");
              return (
                <button key={slug} className={"mi" + (slug === expertSlug ? " sel" : "")} onClick={() => onPickExpert(slug)}>
                  <span />
                  <span className="mn">@{x.label} <span className="mn-role">{role}</span></span>
                  <span className="mk">{x.kind}</span>
                  <span className="mb">{x.blurb}</span>
                </button>
              );
            })
          )}
        </div>
      )}
      <button className="pick" onClick={() => setMenu(menu === "engine" ? null : "engine")} title="Engine">
        <Logo id={active} size={15} />
        {H[active]?.label || active}
      </button>
      <button className="pick" onClick={() => setMenu(menu === "expert" ? null : "expert")} title={`@${expertLabel} — ${experts[expertSlug]?.role ?? "Expert"}`}>
        @{expertLabel} <span className="k pick-role">{experts[expertSlug]?.role ?? ""}</span> <span className="k">▾</span>
      </button>
      {chips}
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value, e.target.selectionStart)} onKeyDown={onKey}
        placeholder={`Brief @${experts[expertSlug]?.label || "your expert"} on ${H[active]?.label || active}…`} />
      <button className="run" onClick={onRun} title="Run">▶</button>
    </div>
  );
}

function SessionRow({ s, onOpen, onStop, onClose }: { s: Session; onOpen: () => void; onStop: () => void; onClose: () => void }) {
  const h = H[s.harness];
  const badge = s.archived
    ? "past"
    : ({ running: "running", idle: "ready", ended: "ended", error: "error", auth: "sign-in" } as Record<string, string>)[s.status] || s.status;
  return (
    <div className="srow" style={vars({ "--brand": brandOf(s.harness) })} onClick={onOpen}>
      <Tile id={s.harness} size={40} />
      <div className="meta">
        <div className="ln1">
          <span className={"dot " + s.status} />
          <span className="who">@{s.expertLabel}</span>
          <span className="on">on <b>{h?.label || s.harness}</b></span>
        </div>
        <div className="sum">{s.summary}</div>
      </div>
      {s.cost != null && <span className="badge">${s.cost.toFixed(3)}</span>}
      <span className={"badge " + s.status}>{badge}</span>
      {s.status === "running" ? (
        <button className="xbtn" title="Stop" onClick={(e) => { e.stopPropagation(); onStop(); }}>■</button>
      ) : (
        <button className="xbtn" title="Close" onClick={(e) => { e.stopPropagation(); onClose(); }}>✕</button>
      )}
    </div>
  );
}

// Past-conversations picker. Loads on mount, then refreshes when the user
// deletes a row. Reads `list_archived_sessions` (sorted desc by started_at)
// and `delete_archived_session`; the open action is delegated up so the parent
// can materialize the archive into a focused session.
function HistoryOverlay({
  experts,
  onClose,
  onOpen,
  onResume,
}: {
  experts: ReturnType<typeof useExperts>;
  onClose: () => void;
  onOpen: (meta: ArchivedSessionMeta) => void;
  onResume: (meta: ArchivedSessionMeta) => void;
}) {
  const [items, setItems] = useState<ArchivedSessionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    invoke<string>("list_archived_sessions")
      .then((raw) => {
        try {
          const arr = JSON.parse(raw) as ArchivedSessionMeta[];
          setItems(Array.isArray(arr) ? arr : []);
        } catch {
          setItems([]);
        }
      })
      .catch((e) => setError(String(e)));
  };
  useEffect(refresh, []);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <div className="league-head" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 30 }}>Past <em>conversations</em></h2>
          <button className="btn ghost" onClick={onClose}>done</button>
        </div>
        <div className="ob2-pickhint">Read-only replays from <code>var/sessions/</code>. Click one to open it; the composer stays disabled (the agent process is long gone).</div>
        {error && <div className="empty">Couldn't load history: {error}</div>}
        {!items ? (
          <div className="empty">Loading…</div>
        ) : items.length === 0 ? (
          <div className="empty">No past conversations yet. Each session you run from now on shows up here.</div>
        ) : (
          <div className="sessions" style={{ maxHeight: 420, overflowY: "auto" }}>
            {items.map((m) => {
              const h = H[m.harness];
              const expertLabel = experts[m.expert]?.label ?? m.expert;
              const when = m.started_at ? new Date(m.started_at).toLocaleString() : "";
              return (
                <div key={m.id} className="srow" style={vars({ "--brand": brandOf(m.harness) })} onClick={() => onOpen(m)}>
                  <Tile id={m.harness} size={40} />
                  <div className="meta">
                    <div className="ln1">
                      <span className="who">@{expertLabel}</span>
                      <span className="on">on <b>{h?.label || m.harness}</b></span>
                    </div>
                    <div className="sum">{m.title || "(untitled)"}</div>
                  </div>
                  <span className="badge">{when}</span>
                  <button
                    className="iconbtn"
                    style={{ width: "auto", padding: "2px 8px", fontSize: 11 }}
                    title="Resume — replay thread and reconnect to the agent's prior session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResume(m);
                    }}
                  >resume</button>
                  <button
                    className="xbtn"
                    title="Delete this archive"
                    onClick={(e) => {
                      e.stopPropagation();
                      invoke("delete_archived_session", { id: m.id }).then(refresh);
                    }}
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AuthModal({ session, onPick }: { session: Session; onPick: (methodId: string) => void }) {
  const a = session.auth!;
  const h = H[a.harness];
  return (
    <div className="modal-bg">
      <div className="am" style={vars({ "--brand": brandOf(a.harness) })}>
        <span className="logo am-logo" style={vars({ "--logo": logoUrl(a.harness), "--brand": brandOf(a.harness), "--s": "34px" })} />
        <h3>Sign in to {h?.label || a.harness}</h3>
        <p>{a.note || `${h?.label || a.harness} needs to authenticate before this session can run.`}</p>
        <div className="am-acts">
          {a.methods.map((m) => <button key={m.id} className="btn" onClick={() => onPick(m.id)}>{m.name || `Sign in · ${m.id}`}</button>)}
          {a.hasLogin && <button className="btn ghost" onClick={() => invoke("browser_login", { harness: a.harness })}>Sign in in browser</button>}
          {!a.methods.length && !a.hasLogin && <p style={{ margin: 0 }}>{a.note || "See this engine's auth note in config."}</p>}
        </div>
      </div>
    </div>
  );
}
