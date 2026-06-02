import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { H } from "../shared/harnesses";
import { useExperts } from "../shared/util";
import { Tile } from "../shared/ui";
import type { Session } from "../shared/models";

type PermissionScope = "once" | "session" | "always-allow" | "always-deny";

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
  onOpenWorkspace: (id: string) => void;
  onLogout: (id: string) => void;
  onStop: (id: string) => void;
  onClose: () => void;
  onAuth: (id: string, methodId: string) => void;
  onPermission: (id: string, requestId: string, optionId: string | null, scope: PermissionScope) => void;
  onCancelQueued: (id: string) => void;
  onInputChange: (v: string, cursor: number | null) => void;
  onKey: (e: React.KeyboardEvent) => void;
  onReply: () => void;
  onPickCommand: (name: string) => void;
}) {
  const {
    session: focused, experts, value, inputRef, slashQuery, chips,
    onBack, onOpenWorkspace, onLogout, onStop, onClose, onAuth, onPermission,
    onCancelQueued, onInputChange, onKey, onReply, onPickCommand,
  } = props;

  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [focused.answer, focused.thoughts, focused.thread.length]);

  return (
    <div className="conv">
      <div className="conv-head">
        <button className="iconbtn" onClick={onBack} title="Back">‹</button>
        <Tile id={focused.harness} size={38} />
        <div>
          <div className="conv-title">@{focused.expertLabel}{experts[focused.expertSlug]?.role ? <span className="conv-role"> · {experts[focused.expertSlug]?.role}</span> : null}</div>
          <div className="conv-on">on <b>{H[focused.harness]?.label || focused.harness}</b> · {focused.status}</div>
        </div>
        <span className="spacer" />
        <button className="iconbtn" onClick={() => onOpenWorkspace(focused.id)} title="Open this session's folder">📁</button>
        {(focused.status === "idle" || focused.status === "running") && !focused.archived && (
          <button className="iconbtn" style={{ width: "auto", padding: "2px 8px", fontSize: 11 }}
                  onClick={() => onLogout(focused.id)}
                  title={`Sign out of ${H[focused.harness]?.label || focused.harness}`}>sign out</button>
        )}
        {focused.status === "running" ? (
          <button className="iconbtn" onClick={() => onStop(focused.id)} title="Stop">■</button>
        ) : focused.status !== "ended" ? (
          <button className="iconbtn" onClick={onClose} title="Close">✕</button>
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
