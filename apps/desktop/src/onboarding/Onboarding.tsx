import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { H } from "../shared/harnesses";
import { Logo, Tile, League, vars } from "../shared/ui";
import { useHarnessStates } from "../shared/useHarnessStates";
import "./onboarding.css";

const SHOWCASE = ["claude", "codex", "gemini", "mistral-vibe", "copilot", "opencode", "qwen"];
const EXPERTS = ["Consultant", "Scientist", "Engineer", "Analyst", "Lawyer", "Finder"];
const DEMO_PROMPT = "Research the EV market outlook for 2026";
const DEMO_ANSWER =
  "EV sales should grow ~24% YoY in 2026, led by China and the EU. Battery packs dip below $90/kWh, and three sub-$25k models reshape demand. Top drivers: policy, charging density, and LFP supply.";

type Phase = "type" | "thinking" | "writing" | "done";
export type EnterIntent = "test_wolfgang" | "start_recruiter" | undefined;

export default function Onboarding({ onEnter }: { onEnter: (ids: string[], intent?: EnterIntent) => void }) {
  const [page, setPage] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [demo, setDemo] = useState<{ typed: string; phase: Phase; answer: string }>({ typed: "", phase: "type", answer: "" });
  const { states, progress } = useHarnessStates();

  const engineId = picks[0] || "claude"; // "primary" = the first picked agent
  const primarySt = states[engineId];
  const accent = H[engineId].brand;
  const canNext = page !== 3 || picks.length > 0;
  const toggle = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Scripted demo loop (only runs while the demo page is visible)
  useEffect(() => {
    if (page !== 2) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    (async () => {
      while (!cancelled) {
        setDemo({ typed: "", phase: "type", answer: "" });
        for (let i = 1; i <= DEMO_PROMPT.length && !cancelled; i++) {
          setDemo((d) => ({ ...d, typed: DEMO_PROMPT.slice(0, i) }));
          await sleep(26);
        }
        if (cancelled) break;
        await sleep(420);
        setDemo((d) => ({ ...d, phase: "thinking" }));
        await sleep(1100);
        setDemo((d) => ({ ...d, phase: "writing" }));
        const words = DEMO_ANSWER.split(" ");
        for (let i = 1; i <= words.length && !cancelled; i++) {
          setDemo((d) => ({ ...d, answer: words.slice(0, i).join(" ") }));
          await sleep(55);
        }
        if (cancelled) break;
        setDemo((d) => ({ ...d, phase: "done" }));
        await sleep(2600);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div className="ob2" style={vars({ "--brand": accent })}>
      <div className="ob2-page" key={page}>
        {page === 0 && (
          <div className="stagger">
            <div className="ob-eyebrow">welcome to your cabinet · 01</div>
            <h1 className="ob2-h1">Many experts.<br />Powered by <em>any</em> agent.</h1>
            <p className="ob2-lede">
              <b>Split</b> is an <b>agentic super-app</b> that runs <b>experts</b> — Consultant, Scientist, Engineer… —
              in parallel to research, build and operate your Mac. Each expert is driven by the <b>agent of your
              choice</b>: Codex, Gemini, Claude, Mistral Vibe and more.
            </p>
            <p className="ob2-seed">An <b>agent</b> is a model with hands — it doesn't just answer, it <em>acts</em>.</p>
            <div className="cons">
              <div className="cons-row experts">
                {EXPERTS.map((e, i) => (
                  <span key={e} className="cons-expert" style={{ animationDelay: `${0.15 + i * 0.05}s` }}>@{e}</span>
                ))}
              </div>
              <div className="cons-link">powered by</div>
              <div className="cons-row engines">
                {SHOWCASE.map((id, i) => (
                  <span key={id} className="cons-engine" style={vars({ animationDelay: `${0.35 + i * 0.05}s`, "--brand": H[id].brand })}>
                    <Tile id={id} size={42} />
                    <span className="cons-name">{H[id].label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 1 && (
          <div className="stagger">
            <div className="ob-eyebrow">what's an agent · 02</div>
            <h2 className="ob2-h2">A model with <em>hands</em></h2>
            <div className="amx">
              <div className="amx-diagram" aria-hidden="true">
                <div className="amx-agent">
                  <span className="amx-tag">agent</span>
                  <span className="amx-chip model">🧠 model</span>
                  <span className="amx-plus">+</span>
                  <span className="amx-chip"><span className="spin">⟳</span> loop</span>
                  <span className="amx-chip">🛠 tools</span>
                  <span className="amx-chip">⛁ memory</span>
                </div>
              </div>
              <p className="amx-note">
                A <b>model</b> is the brain (GPT-5, Claude, Mistral). An <b>agent</b> wraps it with hands — it runs
                tools, writes files, drives your Mac. You drive the agent, not the raw model.
                <span className="amx-i" title="Think engine vs car: a model is the engine, an agent is the whole car (engine + wheels + dashboard). You don't drive an engine.">ⓘ</span>
              </p>
            </div>
            <div className="amx-equals" aria-hidden="true">
              <span className="amx-equals-line" />
              <span className="amx-equals-label">harness examples</span>
              <span className="amx-equals-line" />
            </div>
            <div className="amx-diagram">
              <div className="amx-agent harness">
                <span className="amx-tag">harness</span>
                {SHOWCASE.slice(0, 5).map((id) => (
                  <span key={id} className="amx-chip harness-chip" style={vars({ "--brand": H[id].brand })}>
                    <Logo id={id} size={16} />
                    {H[id].label}
                  </span>
                ))}
                <span className="amx-chip harness-chip more">+{SHOWCASE.length - 5} more</span>
              </div>
            </div>
            <p className="amx-note" style={{ marginTop: 14 }}>
              In Split, a <b>harness</b> is an agent <em>already configured</em> — its loop, its tools, its
              sign-in, all packaged. <b>Claude Code</b>, <b>Codex</b>, <b>Gemini</b>, <b>Mistral Vibe</b>,
              <b> GitHub Copilot</b> are proprietary; <b>OpenCode</b>, <b>OpenClaw</b>, <b>Hermes</b> are
              open source. They all speak the same protocol (ACP) — you can swap one for another.
            </p>
          </div>
        )}

        {page === 2 && (
          <div className="stagger">
            <div className="ob-eyebrow">experts in split · 03</div>
            <h2 className="ob2-h2">A harness, given an <em>expertise</em></h2>
            <div className="amx">
              <div className="amx-diagram" aria-hidden="true">
                <div className="amx-agent expert">
                  <span className="amx-tag">expert</span>
                  <span className="amx-chip model">◉ harness</span>
                  <span className="amx-plus">+</span>
                  <span className="amx-chip">🎩 expertise</span>
                  <span className="amx-chip">✦ skills</span>
                  <span className="amx-chip">🔧 tools</span>
                </div>
              </div>
              <p className="amx-note">
                Split takes a <b>harness</b> (Claude Code, Codex…) and layers on an <b>expertise</b>
                (the persona — what the expert knows and how it thinks), <b>skills</b> (reusable
                playbooks, open Agent Skills format), and <b>tools</b> (MCP servers it can call).
                Same harness, different expert.
              </p>
            </div>
            <Demo engineId={engineId} demo={demo} />
          </div>
        )}

        {page === 3 && (
          <div className="stagger">
            <div className="ob-eyebrow">choose your agents · 04</div>
            <h2 className="ob2-h2">Pick your <em>agents</em></h2>
            <div className="ob2-pickhint">The ones you have access to. Split shows only these; add more anytime. {picks.length > 0 && <b>{picks.length} selected</b>}</div>
            <League isSelected={(id) => picks.includes(id)} onPick={toggle} />
            {picks.length > 0 && primarySt && (
              <div className="ob2-primary" style={vars({ "--brand": H[engineId].brand })}>
                <div className="ob2-primary-head">
                  <Tile id={engineId} size={32} />
                  <div className="ob2-primary-id">
                    <b>{H[engineId].label}</b>
                    <span className="ob2-primary-tag">primary — we install &amp; sign in this one now; others stay lazy</span>
                  </div>
                </div>
                <div className="ob2-primary-steps">
                  <PrimaryStep
                    label="install"
                    state={primarySt.install.state}
                    kind={primarySt.install.kind}
                    progress={progress[engineId]}
                    onAction={() => invoke("install_harness", { id: engineId }).catch(() => {})}
                    actionLabel={primarySt.install.kind === "external" ? "Get the app" : "Install"}
                  />
                  <PrimaryStep
                    label="sign-in"
                    state={primarySt.configure.state}
                    kind={primarySt.configure.kind}
                    progress={primarySt.configure.kind === "oauth" ? progress[engineId] : undefined}
                    onAction={() => invoke("configure_harness", { id: engineId }).catch(() => {})}
                    actionLabel="Sign in"
                    disabled={primarySt.install.state !== "ready"}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {page === 4 && (
          <div className="stagger">
            <div className="ob-eyebrow">your turn · 05</div>
            <h2 className="ob2-h2">Brief your first expert</h2>
            <p className="ob2-lede">
              @Wolfgang is a research consultant. Give him a topic, get back a structured answer in the same turn.
              He'll run on <b>{H[engineId].label}</b> — the agent you picked first.
            </p>
            <div className="ob2-tryout" style={vars({ "--brand": H[engineId].brand })}>
              <div className="ob2-tryout-prompt">
                <span className="ob2-tryout-at">@Wolfgang</span>
                <span className="ob2-tryout-text">{DEMO_PROMPT}</span>
              </div>
              <button className="btn" onClick={() => onEnter(picks, "test_wolfgang")}>
                Run this →
              </button>
              <p className="ob2-tryout-hint">opens Split and streams the answer live</p>
            </div>
          </div>
        )}

        {page === 5 && (
          <div className="stagger">
            <div className="ob-eyebrow">make it yours · 06</div>
            <h2 className="ob2-h2">Build your own expert</h2>
            <p className="ob2-lede">
              @Socrates interviews you and writes a new expert from your answers — no menus, no code, just a Socratic
              conversation. Your custom experts live in your private data folder, separate from the shipped ones.
            </p>
            <div className="ob2-tryout" style={vars({ "--brand": H[engineId].brand })}>
              <div className="ob2-tryout-prompt">
                <span className="ob2-tryout-at">@Socrates</span>
                <span className="ob2-tryout-text">Help me design my first custom expert</span>
              </div>
              <button className="btn" onClick={() => onEnter(picks, "start_recruiter")}>
                Talk to Socrates →
              </button>
              <p className="ob2-tryout-hint">opens Split with a fresh interview session</p>
            </div>
          </div>
        )}
      </div>

      <div className="ob2-foot">
        <div className="dots">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <button key={i} className={"dot2" + (i === page ? " on" : "")} onClick={() => setPage(i)} aria-label={`page ${i + 1}`} />
          ))}
        </div>
        <div className="ob2-actions">
          {page > 0 && <button className="btn ghost" onClick={() => setPage((p) => p - 1)}>← back</button>}
          {page < 5 ? (
            <button className="btn" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>{page === 3 ? "Continue →" : "Next →"}</button>
          ) : (
            <button className="btn ghost" onClick={() => onEnter(picks)}>Skip → Enter Split</button>
          )}
        </div>
      </div>
    </div>
  );
}

function PrimaryStep({
  label,
  state,
  kind,
  progress,
  onAction,
  actionLabel,
  disabled,
}: {
  label: string;
  state: "ready" | "missing" | "external";
  kind: string;
  progress?: string;
  onAction: () => void;
  actionLabel: string;
  disabled?: boolean;
}) {
  const ready = state === "ready";
  const noOp = !kind || (label === "sign-in" && kind === "api-key");
  return (
    <div className={"ob2-step" + (ready ? " ready" : "")}>
      <span className="ob2-step-label">{label}</span>
      {ready ? (
        <span className="ob2-step-ok">✓ ready</span>
      ) : noOp ? (
        <span className="ob2-step-hint">{kind === "api-key" ? "needs an API key — set it later" : "—"}</span>
      ) : (
        <button className="btn ghost" disabled={disabled} onClick={onAction}>
          {actionLabel}
        </button>
      )}
      {progress && !ready && <span className="ob2-step-progress">{progress}</span>}
    </div>
  );
}

function Demo({ engineId, demo }: { engineId: string; demo: { typed: string; phase: Phase; answer: string } }) {
  const status = demo.phase === "thinking" ? "thinking…" : demo.phase === "writing" ? "writing…" : demo.phase === "done" ? "done" : "briefing…";
  return (
    <div className="demo" style={vars({ "--brand": H[engineId].brand })}>
      <div className="demo-chrome">
        <span className="demo-wm">split<span className="demo-dot" /></span>
        <span className="demo-spacer" />
        <span className="demo-on"><Logo id={engineId} size={13} /> {H[engineId].label}</span>
      </div>
      <div className="demo-composer">
        <span className="demo-at">@Consultant</span>
        <span className="demo-typed">
          {demo.typed}
          {demo.phase === "type" && <span className="caret" />}
        </span>
      </div>
      {demo.phase !== "type" && (
        <div className="demo-session">
          <Tile id={engineId} size={34} />
          <div className="demo-meta">
            <div className="demo-line">
              <span className={"dot " + (demo.phase === "done" ? "idle" : "running")} />
              <b>@Consultant</b>
              <span className="demo-eng">on {H[engineId].label}</span>
              <span className="demo-status">· {status}</span>
            </div>
            {demo.phase === "thinking" && <div className="demo-answer dim">{H[engineId].label} is reading the web…</div>}
            {demo.answer && (
              <div className="demo-answer">
                {demo.answer}
                {demo.phase === "writing" && <span className="caret" />}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
