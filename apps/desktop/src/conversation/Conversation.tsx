import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { H } from "../shared/harnesses";
import { useSmoothText, stabilizeMarkdown } from "../shared/useSmoothText";
import { visibleAnswer } from "../shared/questionForm";
import { QuestionsPanel, type SubmitSource } from "./QuestionsPanel";
import { useExperts } from "../shared/util";
import { fitBrief } from "../shared/useComposer";
import { Logo, Icon, type IconName } from "../shared/ui";
import { Crest } from "../shared/Crest";
import { TurnSpinner } from "../shared/TurnSpinner";
import type { Session, Step } from "../shared/models";
import type { Artifact } from "../shared/events";
import { ToolAuthChips } from "./ToolAuth";

type PermissionScope = "once" | "session" | "always-allow" | "always-deny";

// A peer session (not the focused one) that needs the boss — surfaced as a
// banner at the top of the thread so attention isn't trapped in one session.
export interface PeerAlert {
  id: string;
  label: string;
  reason: "auth" | "permission";
}

// Stroke icon by extension for the promoted deliverable card. Keeps the card
// from reading as a generic file row — a deck looks like a deck, data like data.
function artIcon(rel: string): IconName {
  const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "html" || ext === "htm") return "monitor";
  if (ext === "md" || ext === "markdown" || ext === "txt") return "file-text";
  if (ext === "csv" || ext === "tsv" || ext === "json") return "chart";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "file";
  return "box";
}

function humanMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}`;
}

// Step status → glyph + tone. The wire carries the Debug-formatted ACP
// ToolCallStatus (Pending / InProgress / Completed / Failed) or "" on updates
// that omit it — anything unrecognised falls back to the neutral pending mark.
function stepGlyph(status: string): { glyph: string; cls: string } {
  if (status === "Completed") return { glyph: "✓", cls: "" };
  if (status === "Failed") return { glyph: "✕", cls: " bad" };
  if (status === "InProgress") return { glyph: "●", cls: " run" };
  return { glyph: "○", cls: " wait" };
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
        {steps.map((st, i) => {
          const g = stepGlyph(st.status);
          return (
            <div key={i} className="didfold-step">
              <span className={"k" + g.cls}>{g.glyph}</span>
              <span className="didfold-step-t">{st.title}</span>
              {st.status ? <span className="didfold-step-s">{st.status}</span> : null}
            </div>
          );
        })}
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
      <span className="deliv-ic"><Icon name={artIcon(a.rel)} size={17} /></span>
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
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
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
  // The boss answered the inline discovery form (compact posture). Absent in
  // the atelier, where the right pane's QuestionsPanel owns the form.
  onAnswerForm?: (answers: Record<string, string | string[]>, source: SubmitSource) => void;
  // Opens the native file picker → pending attachment (📎 paperclip).
  onAttach: () => void;
  onPickCommand: (name: string) => void;
  onPickArtifact: (id: string, rel: string) => void;
  // The artifact the shell's viewer currently shows (atelier focus mode), so the
  // in-thread tab strip highlights the file actually on screen. Optional — the
  // compact view doesn't render that strip.
  activeArtifact?: string | null;
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
    onCancelQueued, onInputChange, onKey, onReply, onAnswerForm, onAttach, onPickCommand, onPickArtifact,
    expanded, onTogglePosture, peers, onFocusPeer,
  } = props;
  // Scope persistence for the next permission decision (drives both Allow and
  // Deny — you pick how long the decision sticks, then allow or deny once).
  const [permScope, setPermScope] = useState<"once" | "session" | "always">("session");
  // The header's overflow menu (posture toggle + God Mode). Keeps the header to
  // two visible affordances — the ⋯ menu and the close/stop control.
  const [headMenu, setHeadMenu] = useState(false);

  // Typewriter buffer: the wire's bursty chunks accumulate in
  // `answer`/`thoughts`; what we render is the smoothed reveal. Flushed
  // instantly when the turn ends (status leaves "running").
  const streaming = focused.status === "running";
  // Strip any `<question-form>` markup from the live stream — it renders in the
  // atelier panel, not the thread (committed turns are already stripped at the
  // reducer's idle commit).
  const smoothAnswer = useSmoothText(visibleAnswer(focused.answer), streaming, focused.id);
  const smoothThoughts = useSmoothText(focused.thoughts, streaming, focused.id);

  // Re-fit the auto-growing reply textarea on every edit AND on mount (the
  // draft is shared with the home composer, so it can arrive multi-line).
  useEffect(() => fitBrief(inputRef.current), [value, inputRef]);

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
        {/* Back — compact only. In the atelier the left rail navigates. */}
        {!expanded && <button className="iconbtn" onClick={onBack} title="Back">‹</button>}
        <Crest kind={experts[focused.expertSlug]?.kind} seed={focused.expertSlug} size={38} />
        {/* Two levels: L1 identity (name + live status dot), L2 a calm mono
            meta line — role · harness (said once, here) · connections. */}
        <div className="who">
          <div className="conv-l1">
            <span className="conv-title">@{focused.expertLabel}</span>
            <span className={"conv-dot " + focused.status} title={focused.status} />
          </div>
          <div className="conv-on">
            {experts[focused.expertSlug]?.role && <span>{experts[focused.expertSlug]?.role}</span>}
            {experts[focused.expertSlug]?.role && <span className="sep">·</span>}
            <span className="conv-engine"><Logo id={focused.harness} size={12} /><b>{H[focused.harness]?.label || focused.harness}</b></span>
            <ToolAuthChips skills={experts[focused.expertSlug]?.skills} />
          </div>
        </div>
        <div className="conv-acts">
          <div className="skin-wrap">
            <button className="iconbtn" onClick={() => setHeadMenu((v) => !v)} title="More — layout, permissions" aria-label="More">⋯</button>
            {headMenu && (
              <>
                <div className="skin-scrim" onClick={() => setHeadMenu(false)} />
                <div className="skin-menu" role="menu">
                  <button className="more-item" onClick={() => { setHeadMenu(false); onTogglePosture(); }} role="menuitem">
                    <span className="more-ic">{expanded ? "⊟" : "⊡"}</span>
                    <span className="more-meta">
                      <b>{expanded ? "Compact view" : "Open in the atelier"}</b>
                      <small>{expanded ? "back to the floating bar" : "side-by-side workspace"}</small>
                    </span>
                  </button>
                  <button className="more-item" onClick={() => { setHeadMenu(false); onToggleGodMode(); }} role="menuitem">
                    <span className="more-ic"><Icon name="bolt" size={13} /></span>
                    <span className="more-meta">
                      <b>God Mode · {godMode ? "on" : "off"}</b>
                      <small>auto-approve every tool permission</small>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
          {focused.status === "running" ? (
            <button className="iconbtn" onClick={() => onStop(focused.id)} title="Stop">■</button>
          ) : focused.status !== "ended" ? (
            <button className="iconbtn" onClick={onClose} title="Close">✕</button>
          ) : null}
        </div>
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
              {/* No label on the user's own turn — the right-aligned brand
                  bubble carries the role by position + colour. */}
              {turn.role !== "user" && (
                <div className="turn-head">
                  <span className="role">
                    {turn.role === "thought" ? `${focused.expertLabel} · thinking` : focused.expertLabel}
                  </span>
                  {isAgent && turn.text && <CopyBtn text={turn.text} />}
                </div>
              )}
              {isAgent && turn.steps?.length ? <ActivityFold steps={turn.steps} tookMs={turn.tookMs} /> : null}
              <div className="text">
                {turn.role === "user" ? (
                  <>
                    {turn.text}
                    {turn.files?.length ? <div className="attach">{turn.files.map((f, j) => <span key={j} className="chip"><Icon name="paperclip" size={11} /> {f}</span>)}</div> : null}
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
          <div className="authask">
            <div className="authask-head">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="7.5" cy="15.5" r="3.5" />
                <path d="M10.5 12.5 20 3" />
                <path d="M16 7.5 18.5 10" />
              </svg>
              <span className="authask-t">{H[focused.auth.harness]?.label || focused.auth.harness} needs a sign-in</span>
            </div>
            <div className="authask-acts">
              {focused.auth.methods.map((m) => <button key={m.id} className="btn" onClick={() => onAuth(focused.id, m.id)}>{m.name || m.id}</button>)}
              {focused.auth.hasLogin && <button className="btn ghost" onClick={() => invoke("browser_login", { harness: focused.auth!.harness })}>Sign in in browser</button>}
            </div>
            <div className="authask-hint">Your message is kept — it re-runs automatically after sign-in.</div>
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
          const deny = () => ask(null, permScope === "always" ? "always-deny" : permScope);
          return (
            <div className="perm">
              <div className="perm-head">
                <span className="perm-ic"><Icon name="lock" size={15} /></span>
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
      </div>

      {/* The expert's discovery form, inline (compact posture only — the atelier
          renders it in the right pane). Sits between the thread and the composer
          as the agent's current ask; answering it sends the next turn. */}
      {!expanded && focused.questionForm && onAnswerForm && (
        <div className="qf-inline">
          <QuestionsPanel
            key={focused.questionForm.id}
            form={focused.questionForm}
            busy={focused.status === "running"}
            onSubmit={onAnswerForm}
          />
        </div>
      )}

      {/* Deliverables live in the Reflet dock (right), not duplicated in the
          thread. Compact posture keeps ONLY the latest one as a headline card
          ("here's your result") + a hint to the dock for the rest; in the
          atelier the dock + viewer own them, so the thread shows none. */}
      {focused.artifacts.length > 0 && !expanded && (
        <div className="deliv-wrap">
          <DeliverableCard
            a={focused.artifacts[focused.artifacts.length - 1]}
            onOpen={() => { onPickArtifact(focused.id, focused.artifacts[focused.artifacts.length - 1].rel); onTogglePosture(); }}
          />
          {focused.artifacts.length > 1 && (
            <button
              className="deliv-more"
              onClick={onTogglePosture}
              style={{ all: "unset", cursor: "pointer", fontSize: 12.5, opacity: 0.7, padding: "4px 2px" }}
            >
              +{focused.artifacts.length - 1} more in the dock →
            </button>
          )}
        </div>
      )}

      {focused.logs.length > 0 && (
        <details className="logs" open={focused.status === "running"}>
          <summary>
            <span className="logs-label">logs</span>
            <span className="logs-count">· {focused.logs.length}</span>
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
            {/* Queued turn — pinned OUTSIDE the scrolling thread so it can't
                drift out of sight while the composer keeps inviting the next. */}
            {focused.queued && (
              <div className="queuepin">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15.5 14" />
                </svg>
                <div className="queuepin-m">
                  <span className="queuepin-l">Queued — sends when this turn ends</span>
                  <span className="queuepin-tx">{focused.queued.display || "(file)"}</span>
                </div>
                <button className="queuepin-x" onClick={() => onCancelQueued(focused.id)}>Cancel</button>
              </div>
            )}
            <div className="composer" style={{ marginTop: focused.queued ? 8 : 16, marginBottom: 0 }}>
              {chips}
              <textarea ref={inputRef} value={value} rows={1} onChange={(e) => onInputChange(e.target.value, e.target.selectionStart)} onKeyDown={onKey}
                placeholder={focused.status === "running" ? `${focused.expertLabel} is working — queue the next…` : `Reply to ${focused.expertLabel}…`} />
              <button className="clip" onClick={onAttach} title="Attach a file" aria-label="Attach a file"><Icon name="paperclip" size={16} /></button>
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
