import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { H } from "../shared/harnesses";
import { useExperts } from "../shared/util";
import { Tile } from "../shared/ui";
import type { Session } from "../shared/models";
import { ArtifactStrip } from "./ArtifactViewer";

type PermissionScope = "once" | "session" | "always-allow" | "always-deny";

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="copy-btn"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard write can reject (denied / unfocused) — ignore */
        }
      }}
      title="Copy answer"
    >
      {done ? "✓ copied" : "copy"}
    </button>
  );
}

// The focused-session view: header (who/where + actions), the streamed thread
// (turns / live thoughts / answer / auth prompt / permission prompt / queued),
// the collapsible logs, and the reply composer with its slash-command palette.
// All session mutations are delegated up; this component owns only the
// thread-scroll ref.
export function Conversation(props: {
  session: Session;
  experts: ReturnType<typeof useExperts>;
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  slashQuery: string | null;
  chips: React.ReactNode;
  onBack: () => void;
  onStop: (id: string) => void;
  onClose: () => void;
  onAuth: (id: string, methodId: string) => void;
  onPermission: (id: string, requestId: string, optionId: string | null, scope: PermissionScope) => void;
  godMode: boolean;
  onToggleGodMode: () => void;
  onCancelQueued: (id: string) => void;
  onInputChange: (v: string, cursor: number | null) => void;
  onKey: (e: React.KeyboardEvent) => void;
  onReply: () => void;
  onPickCommand: (name: string) => void;
  onPickArtifact: (id: string, rel: string) => void;
}) {
  const {
    session: focused, experts, value, inputRef, slashQuery, chips,
    onBack, onStop, onClose, onAuth, onPermission,
    godMode, onToggleGodMode,
    onCancelQueued, onInputChange, onKey, onReply, onPickCommand, onPickArtifact,
  } = props;

  const threadRef = useRef<HTMLDivElement>(null);
  const lastSessionRef = useRef<string | null>(null);
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    // First render for this session → jump to bottom so the user lands on the
    // latest message. After that, only follow the stream if they're already
    // near the bottom; otherwise leave them where they were reading.
    if (lastSessionRef.current !== focused.id) {
      lastSessionRef.current = focused.id;
      el.scrollTo({ top: el.scrollHeight });
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight });
  }, [focused.id, focused.answer, focused.thoughts, focused.thread.length]);

  return (
    <div className="conv">
      <div className="conv-head">
        <button className="iconbtn" onClick={onBack} title="Back">‹</button>
        <Tile id={focused.harness} size={38} themed />
        <div>
          <div className="conv-title">@{focused.expertLabel}{experts[focused.expertSlug]?.role ? <span className="conv-role"> · {experts[focused.expertSlug]?.role}</span> : null}</div>
          <div className="conv-on">on <b>{H[focused.harness]?.label || focused.harness}</b> · {focused.status}</div>
        </div>
        <span className="spacer" />
        <button
          className={"iconbtn" + (godMode ? " on" : "")}
          onClick={onToggleGodMode}
          title={godMode ? "God Mode ON — every tool permission is auto-approved. Click to disable." : "God Mode OFF — click to auto-approve every tool permission."}
        >⚡</button>
        {focused.status === "running" ? (
          <button className="iconbtn" onClick={() => onStop(focused.id)} title="Stop">■</button>
        ) : focused.status !== "ended" ? (
          <button className="iconbtn" onClick={onClose} title="Close">✕</button>
        ) : null}
      </div>

      <div className="thread" ref={threadRef}>
        {focused.thread.map((turn, i) => {
          const isAgent = turn.role !== "user" && turn.role !== "thought";
          return (
            <div key={i} className={"turn " + turn.role}>
              <div className="turn-head">
                <span className="role">
                  {turn.role === "user" ? "You" : turn.role === "thought" ? `${focused.expertLabel} · thinking` : focused.expertLabel}
                </span>
                {isAgent && turn.text && <CopyBtn text={turn.text} />}
              </div>
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
          );
        })}
        {focused.thoughts && (
          <div className="turn thought">
            <span className="role">{focused.expertLabel} · thinking</span>
            <div className="text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{focused.thoughts}</ReactMarkdown></div>
          </div>
        )}
        {focused.answer && (
          <div className="turn agent">
            <div className="turn-head">
              <span className="role">{focused.expertLabel}</span>
              <CopyBtn text={focused.answer} />
            </div>
            <div className="text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{focused.answer}</ReactMarkdown></div>
          </div>
        )}
        {focused.status === "running" && (
          <div className="thinking"><span className="dot running" /> <span className="thinking-line">{focused.summary || `${focused.expertLabel} is thinking…`}</span></div>
        )}
        {focused.auth && (
          <div className="thinking">
            needs sign-in:
            {focused.auth.methods.map((m) => <button key={m.id} className="iconbtn" style={{ width: "auto", padding: "4px 10px" }} onClick={() => onAuth(focused.id, m.id)}>{m.name || m.id}</button>)}
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
          const ask = (optionId: string | null, scope: PermissionScope) =>
            onPermission(focused.id, pp.id, optionId, scope);
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
        {focused.queued && <div className="thinking">⏳ queued · {focused.queued.display || "(file)"} <button className="xbtn" onClick={() => onCancelQueued(focused.id)}>✕</button></div>}
      </div>

      <ArtifactStrip
        artifacts={focused.artifacts}
        activeArtifact={focused.activeArtifact}
        onPick={(rel) => onPickArtifact(focused.id, rel)}
      />

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
        // `available_commands_update` notifications. Only renders when the user
        // has typed `/` at the start of the input AND the agent advertised at
        // least one command. Click → fill input with `/<name> ` and refocus;
        // Enter on no-match falls through to a regular send so the user's text
        // isn't trapped.
        const slashOpen = slashQuery !== null && focused.commands.length > 0;
        const matches = slashOpen
          ? focused.commands.filter((c) =>
              c.name.toLowerCase().startsWith((slashQuery || "").toLowerCase())
            )
          : [];
        return (
          <>
            {slashOpen && matches.length > 0 && (
              <div className="slash-menu" role="listbox" aria-label="Slash commands">
                {matches.map((c) => (
                  <button
                    key={c.name}
                    className="slash-item"
                    onClick={() => onPickCommand(c.name)}
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
              <input ref={inputRef} value={value} onChange={(e) => onInputChange(e.target.value, e.target.selectionStart)} onKeyDown={onKey}
                placeholder={focused.status === "running" ? `${focused.expertLabel} is working — queue the next…` : `Reply to ${focused.expertLabel}…`} />
              {focused.status === "running" ? (
                <button className="stop" onClick={() => onStop(focused.id)}>■</button>
              ) : (
                <button className="run" onClick={onReply} title="Send">▶</button>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}
