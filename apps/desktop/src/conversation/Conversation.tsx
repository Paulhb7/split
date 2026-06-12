import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { H } from "../shared/harnesses";
import { useSmoothText, stabilizeMarkdown } from "../shared/useSmoothText";
import { useExperts } from "../shared/util";
import { Logo } from "../shared/ui";
import { Crest } from "../shared/Crest";
import { TurnSpinner } from "../shared/TurnSpinner";
import type { Session, Step } from "../shared/models";
import type { Artifact } from "../shared/events";
import { ArtifactStrip } from "./ArtifactViewer";

type PermissionScope = "once" | "session" | "always-allow" | "always-deny";

// A peer session (not the focused one) that needs the boss — surfaced as a
// banner at the top of the thread so attention isn't trapped in one session.
export interface PeerAlert {
  id: string;
  label: string;
  reason: "auth" | "permission";
}

// Emoji by extension for the promoted deliverable card. Keeps the card from
// reading as a generic file row — a deck looks like a deck, data like data.
function artIcon(rel: string): string {
  const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "html" || ext === "htm") return "🖥️";
  if (ext === "md" || ext === "markdown" || ext === "txt") return "📝";
  if (ext === "csv" || ext === "tsv" || ext === "json") return "📊";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  if (ext === "pdf") return "📄";
  return "📦";
}

function humanMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}`;
}

// Collapsed "what it did" fold — the secondary layer. Summarises the turn's
// steps under one line (count + duration); expands to the step list. Closed by
// default so the answer (primary) stays the eye's first stop.
function ActivityFold({ steps, tookMs }: { steps: Step[]; tookMs?: number }) {
  const last = steps[steps.length - 1];
  return (
    <details className="didfold">
      <summary>
        <span className="chev">▸</span>
        {steps.length} step{steps.length === 1 ? "" : "s"}
        {last?.title ? <span className="didfold-last"> · {last.title}</span> : null}
        {tookMs != null && <span className="n">{humanMs(tookMs)}</span>}
      </summary>
      <div className="didfold-body">
        {steps.map((st, i) => (
          <div key={i} className="didfold-step">
            <span className="k">✓</span>
            <span className="didfold-step-t">{st.title}</span>
            {st.status ? <span className="didfold-step-s">{st.status}</span> : null}
          </div>
        ))}
      </div>
    </details>
  );
}

// Promoted deliverable card — the primary "here's the output" affordance shown
// in compact posture. Clicking expands into the side-by-side atelier with the
// file open. The most-recent artifact gets the big card; the rest sit in a
// compact strip below.
function DeliverableCard({ a, onOpen }: { a: Artifact; onOpen: () => void }) {
  const name = a.rel.split("/").pop() || a.rel;
  return (
    <button className="deliv" onClick={onOpen} title={a.path}>
      <span className="deliv-ic">{artIcon(a.rel)}</span>
      <span className="deliv-meta">
        <span className="deliv-t">{name}</span>
        <span className="deliv-s">{a.op} · {a.rel}</span>
      </span>
      <span className="deliv-open">Open ▸</span>
    </button>
  );
}

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
  // Opens the native file picker → pending attachment (📎 paperclip).
  onAttach: () => void;
  onPickCommand: (name: string) => void;
  onPickArtifact: (id: string, rel: string) => void;
  // Posture: `expanded` = the side-by-side atelier (rail + thread + viewer).
  // `onTogglePosture` flips this session between compact and expanded.
  expanded: boolean;
  onTogglePosture: () => void;
  // Other sessions that need the boss right now — rendered as a banner so
  // attention isn't trapped in the focused session. `onFocusPeer` jumps to one.
  peers: PeerAlert[];
  onFocusPeer: (id: string) => void;
}) {
  const {
    session: focused, experts, value, inputRef, slashQuery, chips,
    onBack, onStop, onClose, onAuth, onPermission,
    godMode, onToggleGodMode,
    onCancelQueued, onInputChange, onKey, onReply, onAttach, onPickCommand, onPickArtifact,
    expanded, onTogglePosture, peers, onFocusPeer,
  } = props;
  // Scope persistence for the next permission decision (drives both Allow and
  // Deny — you pick how long the decision sticks, then allow or deny once).
  const [permScope, setPermScope] = useState<"once" | "session" | "always">("session");

  // Typewriter buffer: the wire's bursty chunks accumulate in
  // `answer`/`thoughts`; what we render is the smoothed reveal. Flushed
  // instantly when the turn ends (status leaves "running").
  const streaming = focused.status === "running";
  const smoothAnswer = useSmoothText(focused.answer, streaming, focused.id);
  const smoothThoughts = useSmoothText(focused.thoughts, streaming, focused.id);

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
  }, [focused.id, smoothAnswer, smoothThoughts, focused.thread.length]);

  return (
    <div className="conv">
      <div className="conv-head">
        <button className="iconbtn" onClick={onBack} title="Back">‹</button>
        <Crest kind={experts[focused.expertSlug]?.kind} seed={focused.expertSlug} size={38} />
        <div>
          <div className="conv-title">@{focused.expertLabel}{experts[focused.expertSlug]?.role ? <span className="conv-role"> · {experts[focused.expertSlug]?.role}</span> : null}</div>
          <div className="conv-on">on <Logo id={focused.harness} size={13} /><b>{H[focused.harness]?.label || focused.harness}</b> · {focused.status}</div>
        </div>
        <span className="spacer" />
        <button
          className={"iconbtn" + (expanded ? " on" : "")}
          onClick={onTogglePosture}
          title={expanded ? "Back to compact view" : "Open in the atelier (side by side)"}
        >{expanded ? "⊟" : "⊡"}</button>
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
        {peers.length > 0 && (
          <div className="peerbanner">
            {peers.map((p) => (
              <button key={p.id} className="peerbanner-row" onClick={() => onFocusPeer(p.id)}>
                <span className="attn-dot" />
                <span className="peerbanner-tx"><b>@{p.label}</b> {p.reason === "auth" ? "needs sign-in" : "needs your approval"}</span>
                <span className="peerbanner-go">View ▸</span>
              </button>
            ))}
          </div>
        )}
        {focused.thread.length === 0 && focused.status !== "running" && (() => {
          const starters = experts[focused.expertSlug]?.starters ?? [];
          return (
            <div className="conv-empty">
              <div className="conv-empty-crest">
                <Crest kind={experts[focused.expertSlug]?.kind} seed={focused.expertSlug} size={104} />
              </div>
              <h2 className="conv-empty-h">Hi, I'm your {focused.expertLabel}.</h2>
              <p className="conv-empty-p">Ask a question, drop a document, or pick a starting point.</p>
              {starters.length > 0 && (
                <div className="conv-starters">
                  {starters.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className="conv-starter"
                      onClick={() => { onInputChange(s, null); inputRef.current?.focus(); }}
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
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
              {isAgent && turn.steps?.length ? <ActivityFold steps={turn.steps} tookMs={turn.tookMs} /> : null}
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
        {smoothThoughts && (
          <div className="turn thought">
            <span className="role">{focused.expertLabel} · thinking</span>
            <div className="text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{stabilizeMarkdown(smoothThoughts)}</ReactMarkdown></div>
          </div>
        )}
        {smoothAnswer && (
          <div className="turn agent">
            <div className="turn-head">
              <span className="role">{focused.expertLabel}</span>
              <CopyBtn text={focused.answer} />
            </div>
            <div className="text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{stabilizeMarkdown(smoothAnswer)}</ReactMarkdown></div>
          </div>
        )}
        {focused.status === "running" && (
          <TurnSpinner
            kind={experts[focused.expertSlug]?.kind}
            summary={focused.summary}
            streamedChars={focused.answer.length + focused.thoughts.length}
            thoughtChars={focused.thoughts.length}
            startedAt={focused.turnStartedAt}
          />
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
          // The radio chooses how long the decision sticks; the two buttons
          // apply it (allow or deny) — so "always-allow" and "always-deny" can
          // never be selected at once, they're two outcomes of one scope.
          const SCOPES: { id: "once" | "session" | "always"; label: string }[] = [
            { id: "once", label: "once" },
            { id: "session", label: "this session" },
            { id: "always", label: "always" },
          ];
          const allow = () => allowId && ask(allowId, permScope === "always" ? "always-allow" : permScope);
          const deny = () => ask(null, permScope === "always" ? "always-deny" : "once");
          return (
            <div className="perm">
              <div className="perm-head">
                <span className="perm-ic">🔐</span>
                <span className="perm-t">Allow an action</span>
                <span className="perm-who">{pp.expert}</span>
              </div>
              <div className="perm-tool"><code>{pp.toolId}</code></div>
              <div className="perm-scope" role="radiogroup" aria-label="Decision scope">
                {SCOPES.map((sc) => (
                  <button
                    key={sc.id}
                    role="radio"
                    aria-checked={permScope === sc.id}
                    className={"perm-scope-opt" + (permScope === sc.id ? " on" : "")}
                    onClick={() => setPermScope(sc.id)}
                  >{sc.label}</button>
                ))}
              </div>
              <div className="perm-acts">
                <button className="btn perm-allow" onClick={allow} disabled={!allowId}>Allow</button>
                <button className="btn perm-deny" onClick={deny}>{permScope === "always" ? "Block always" : "Deny"}</button>
              </div>
            </div>
          );
        })()}
        {focused.queued && <div className="thinking">⏳ queued · {focused.queued.display || "(file)"} <button className="xbtn" onClick={() => onCancelQueued(focused.id)}>✕</button></div>}
      </div>

      {focused.artifacts.length > 0 && (
        expanded ? (
          // Atelier: the viewer is shown side-by-side by the shell, so here we
          // only need the tab strip to switch which file it shows.
          <ArtifactStrip
            artifacts={focused.artifacts}
            activeArtifact={focused.activeArtifact}
            onPick={(rel) => onPickArtifact(focused.id, rel)}
          />
        ) : (
          // Compact: promote the latest deliverable to a real card; the rest
          // sit in a quiet strip. Opening either lifts into the atelier.
          <div className="deliv-wrap">
            <DeliverableCard
              a={focused.artifacts[focused.artifacts.length - 1]}
              onOpen={() => { onPickArtifact(focused.id, focused.artifacts[focused.artifacts.length - 1].rel); onTogglePosture(); }}
            />
            {focused.artifacts.length > 1 && (
              <ArtifactStrip
                artifacts={focused.artifacts.slice(0, -1)}
                activeArtifact={null}
                onPick={(rel) => { onPickArtifact(focused.id, rel); onTogglePosture(); }}
              />
            )}
          </div>
        )
      )}

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
              <button className="clip" onClick={onAttach} title="Attach a file" aria-label="Attach a file">📎</button>
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
