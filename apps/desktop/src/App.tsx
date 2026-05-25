import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { HARNESSES, H, logoUrl, brandOf, type Harness } from "./shared/harnesses";
import { useExperts, composeTurn, type Attachment } from "./shared/util";
import { useSessions } from "./shared/useSessions";
import { useWindowChrome, type Preset, type RzDir } from "./shared/useWindowChrome";
import type { Session } from "./shared/models";
import { Logo, Tile, League, vars } from "./shared/ui";
import Onboarding from "./onboarding/Onboarding";
import Stage from "./stage/Stage";
import "./app.css";

const LS_DONE = "split.onboarded";
const LS_VIEW = "split.sessionView"; // "list" | "stage"
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
  const { sessions, start, send, sendAuth, stop, remove, cancelQueued } = useSessions(experts);
  const { width, pinned, applyPreset, startResize, startMove, togglePin, hide } = useWindowChrome();

  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem(LS_DONE));
  const [enabled, setEnabled] = useState<string[]>(loadEnabled);
  const [active, setActiveState] = useState(loadActive);
  const [expertSlug, setExpertSlug] = useState("consultant");
  const [menu, setMenu] = useState<"engine" | "expert" | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [workspace, setWorkspace] = useState<string>(() => localStorage.getItem("split.workspace") || "");
  const [view, setViewState] = useState<"list" | "stage">(() => (localStorage.getItem(LS_VIEW) === "stage" ? "stage" : "list"));
  const setView = (v: "list" | "stage") => {
    setViewState(v);
    localStorage.setItem(LS_VIEW, v);
  };

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preset, setPreset] = useState<Preset>("M");
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef<Record<string, string>>({});

  const focused = sessions.find((s) => s.id === focusedId) ?? null;
  const authSession = sessions.find((s) => s.auth) ?? null;
  const anyRunning = sessions.some((s) => s.status === "running");
  const accent = focused ? brandOf(focused.harness) : brandOf(active);
  const compact = width < 520;
  const enabledHarnesses = HARNESSES.filter((h) => enabled.includes(h.id));

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
  }, [focused?.answer, focused?.thread.length, focusedId]);

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

  function setSize(p: Preset) {
    setPreset(p);
    applyPreset(p);
  }
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

  // workspace: the folder where agents save their files (per-session subdirs).
  const wsName = workspace ? workspace.replace(/\/+$/, "").split("/").pop() || workspace : "Default folder";
  async function pickWorkspace() {
    try {
      const dir = await openDialog({ directory: true, multiple: false, title: "Choose a default workspace folder", defaultPath: workspace || undefined });
      if (typeof dir === "string") {
        setWorkspace(dir);
        localStorage.setItem("split.workspace", dir);
      }
    } catch {
      /* cancelled */
    }
  }
  function openWorkspaceFolder(sessionId?: string) {
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

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") {
      if (menu) setMenu(null);
      else if (overlay) setOverlay(false);
      else if (focused) setFocusedId(null);
      else hide();
    }
  }

  const expertEntries = useMemo(() => Object.entries(experts), [experts]);
  const expertLabel = experts[expertSlug]?.label || "Consultant";

  // shared attachment chips
  const chips = attachments.map((a, i) => (
    <span key={i} className="chip">
      📎 {a.name}
      <button className="xbtn" onMouseDown={(e) => { e.preventDefault(); setAttachments((p) => p.filter((_, k) => k !== i)); }}>✕</button>
    </span>
  ));

  return (
    <div className={"app" + (compact ? " compact" : "")} style={vars({ "--brand": accent })}>
      {/* resize handles */}
      {([
        ["rz rz-n", "North"], ["rz rz-s", "South"], ["rz rz-e", "East"], ["rz rz-w", "West"],
        ["rz rz-ne", "NorthEast"], ["rz rz-nw", "NorthWest"], ["rz rz-se", "SouthEast"], ["rz rz-sw", "SouthWest"],
      ] as [string, RzDir][]).map(([cls, dir]) => (
        <div key={cls} className={cls} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startResize(dir); }} />
      ))}

      {dragging && <div className="drop">⬇ Drop a file to attach</div>}

      {/* chrome */}
      <div className="chrome" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("button")) startMove(); }}>
        <span className={"wm" + (anyRunning ? " live" : "")}>split<span className="dot" /></span>
        <span className="chrome-meta">{focused ? `on ${H[focused.harness]?.label || focused.harness}` : sessions.length ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}` : "ready"}</span>
        <span className="spacer" />
        <div className="seg">
          {(["S", "M", "L"] as Preset[]).map((p) => (
            <button key={p} className={preset === p ? "on" : ""} onClick={() => setSize(p)} title={`Resize · ${p}`}>{p}</button>
          ))}
        </div>
        <button className={"iconbtn" + (pinned ? " on" : "")} onClick={togglePin} title={pinned ? "Unpin (allow behind)" : "Pin on top"}>{pinned ? "◆" : "◇"}</button>
        <button className="iconbtn" onClick={hide} title="Hide (⌘J)">—</button>
      </div>

      <div className="body">
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
                <div className="conv-title">@{focused.expertLabel}</div>
                <div className="conv-on">on <b>{H[focused.harness]?.label || focused.harness}</b> · {focused.status}</div>
              </div>
              <span className="spacer" />
              <button className="iconbtn" onClick={() => openWorkspaceFolder(focused.id)} title="Open this session's folder">📁</button>
              {focused.status === "running" ? (
                <button className="iconbtn" onClick={() => stop(focused.id)} title="Stop">■</button>
              ) : focused.status !== "ended" ? (
                <button className="iconbtn" onClick={() => { stop(focused.id); remove(focused.id); setFocusedId(null); }} title="Close">✕</button>
              ) : null}
            </div>

            <div className="thread" ref={threadRef}>
              {focused.thread.map((turn, i) => (
                <div key={i} className={"turn " + turn.role}>
                  <span className="role">{turn.role === "user" ? "You" : focused.expertLabel}</span>
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
              {focused.answer && (
                <div className="turn agent">
                  <span className="role">{focused.expertLabel}</span>
                  <div className="text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{focused.answer}</ReactMarkdown></div>
                </div>
              )}
              {focused.status === "running" && !focused.answer && (
                <div className="thinking"><span className="dot running" /> {focused.expertLabel} is thinking…</div>
              )}
              {focused.auth && (
                <div className="thinking">
                  needs sign-in:
                  {focused.auth.methods.map((m) => <button key={m.id} className="iconbtn" style={{ width: "auto", padding: "4px 10px" }} onClick={() => sendAuth(focused.id, m.id)}>{m.name || m.id}</button>)}
                  {focused.auth.hasLogin && <button className="iconbtn" style={{ width: "auto", padding: "4px 10px" }} onClick={() => invoke("terminal_login", { harness: focused.auth!.harness })}>Open Terminal</button>}
                </div>
              )}
              {focused.queued && <div className="thinking">⏳ queued · {focused.queued.display || "(file)"} <button className="xbtn" onClick={() => cancelQueued(focused.id)}>✕</button></div>}
            </div>

            {focused.status !== "ended" && (
              <div className="composer" style={{ marginTop: 16, marginBottom: 0 }}>
                {chips}
                <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}
                  placeholder={focused.status === "running" ? `${focused.expertLabel} is working — queue the next…` : `Reply to ${focused.expertLabel}…`} />
                {focused.status === "running" ? (
                  <button className="stop" onClick={() => stop(focused.id)}>■</button>
                ) : (
                  <button className="run" onClick={reply} title="Send">▶</button>
                )}
              </div>
            )}
          </div>
        ) : compact && sessions.length === 0 ? (
          /* ============ COMPACT QUICK-LAUNCH ============ */
          <div className="home" style={{ paddingTop: 22 }}>
            <Composer
              experts={experts} expertSlug={expertSlug} expertLabel={expertLabel} active={active}
              engines={enabledHarnesses} onAddAgent={() => setOverlay(true)}
              menu={menu} setMenu={setMenu} setExpertSlug={setExpertSlug} setActive={setActive}
              value={value} setValue={setValue} onKey={onKey} onRun={launch} chips={chips} inputRef={inputRef}
              expertEntries={expertEntries}
            />
          </div>
        ) : (
          /* ============ HOME ============ */
          <div className="home">
            <Composer
              experts={experts} expertSlug={expertSlug} expertLabel={expertLabel} active={active}
              engines={enabledHarnesses} onAddAgent={() => setOverlay(true)}
              menu={menu} setMenu={setMenu} setExpertSlug={setExpertSlug} setActive={setActive}
              value={value} setValue={setValue} onKey={onKey} onRun={launch} chips={chips} inputRef={inputRef}
              expertEntries={expertEntries}
            />

            <div className="wsbar">
              <span className="ws-ic">📁</span>
              <span className="ws-label">Workspace</span>
              <span className="ws-name" title={workspace || "Default app folder · acp-client/workspace"}>{wsName}</span>
              <span className="spacer" />
              <button className="xbtn" onClick={pickWorkspace}>change…</button>
              <button className="xbtn" onClick={() => openWorkspaceFolder()}>open</button>
            </div>

            <div className="sec">engines <span className="muted">click to arm the next session · </span>
              <button className="xbtn" onClick={() => setOverlay(true)}>+ add agent</button>
            </div>
            {([["cloud", "☁ Cloud"], ["local", "🖥 On-device"]] as const).map(([lane, label]) => {
              const list = enabledHarnesses.filter((h) => h.lane === lane);
              if (!list.length) return null;
              return (
                <div key={lane} className="roster-group">
                  <div className="roster-lane">{label}</div>
                  <div className="roster">
                    {list.map((h) => (
                      <button key={h.id} className={"rchip" + (h.id === active ? " active" : "") + (h.reserve ? " reserve" : "")} style={vars({ "--brand": h.brand })} onClick={() => setActive(h.id)}>
                        <Logo id={h.id} size={16} />
                        <span className="rv">{h.vendor}</span>
                        <span className="nm">{h.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

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
          </div>
        )}
      </div>

      {overlay && (
        <div className="overlay" onClick={() => setOverlay(false)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="league-head" style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: 30 }}>Your <em>agents</em></h2>
              <button className="btn ghost" onClick={() => setOverlay(false)}>done</button>
            </div>
            <div className="ob2-pickhint">Toggle the agents you want — only these appear in your roster &amp; menus. Add or remove anytime.</div>
            <League isSelected={(id) => enabled.includes(id)} onPick={toggleEnabled} />
          </div>
        </div>
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
  menu: "engine" | "expert" | null; setMenu: (m: "engine" | "expert" | null) => void;
  setExpertSlug: (s: string) => void; setActive: (s: string) => void;
  value: string; setValue: (s: string) => void; onKey: (e: React.KeyboardEvent) => void; onRun: () => void;
  chips: React.ReactNode; inputRef: React.RefObject<HTMLInputElement | null>;
  expertEntries: [string, { label: string; kind: string; blurb: string }][];
}) {
  const { menu, setMenu, active, setActive, engines, onAddAgent, expertSlug, setExpertSlug, experts, expertLabel, value, setValue, onKey, onRun, chips, inputRef, expertEntries } = props;
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
          {expertEntries.map(([slug, x]) => (
            <button key={slug} className={"mi" + (slug === expertSlug ? " sel" : "")} onClick={() => { setExpertSlug(slug); setMenu(null); inputRef.current?.focus(); }}>
              <span />
              <span className="mn">@{x.label}</span>
              <span className="mk">{x.kind}</span>
              <span className="mb">{x.blurb}</span>
            </button>
          ))}
        </div>
      )}
      <button className="pick" onClick={() => setMenu(menu === "engine" ? null : "engine")} title="Engine">
        <Logo id={active} size={15} />
        {H[active]?.label || active}
      </button>
      <button className="pick" onClick={() => setMenu(menu === "expert" ? null : "expert")} title="Expert">
        @{expertLabel} <span className="k">▾</span>
      </button>
      {chips}
      <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey}
        placeholder={`Brief @${experts[expertSlug]?.label || "your expert"} on ${H[active]?.label || active}…`} />
      <button className="run" onClick={onRun} title="Run">▶</button>
    </div>
  );
}

function SessionRow({ s, onOpen, onStop, onClose }: { s: Session; onOpen: () => void; onStop: () => void; onClose: () => void }) {
  const h = H[s.harness];
  const badge = ({ running: "running", idle: "ready", ended: "ended", error: "error", auth: "sign-in" } as Record<string, string>)[s.status] || s.status;
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
          {a.hasLogin && <button className="btn ghost" onClick={() => invoke("terminal_login", { harness: a.harness })}>Open Terminal to sign in</button>}
          {!a.methods.length && !a.hasLogin && <p style={{ margin: 0 }}>{a.note || "See this engine's auth note in config."}</p>}
        </div>
      </div>
    </div>
  );
}
