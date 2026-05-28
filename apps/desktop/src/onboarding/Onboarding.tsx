import { useEffect, useState } from "react";
import { H } from "../shared/harnesses";
import { Logo, Tile, League, vars } from "../shared/ui";
import "./onboarding.css";

const SHOWCASE = ["claude", "codex", "gemini", "mistral-vibe", "copilot", "opencode", "qwen"];
const EXPERTS = ["Consultant", "Scientist", "Engineer", "Analyst", "Lawyer", "Finder"];
const DEMO_PROMPT = "Research the EV market outlook for 2026";
const DEMO_ANSWER =
  "EV sales should grow ~24% YoY in 2026, led by China and the EU. Battery packs dip below $90/kWh, and three sub-$25k models reshape demand. Top drivers: policy, charging density, and LFP supply.";

type Phase = "type" | "thinking" | "writing" | "done";

export default function Onboarding({ onEnter }: { onEnter: (ids: string[]) => void }) {
  const [page, setPage] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [demo, setDemo] = useState<{ typed: string; phase: Phase; answer: string }>({ typed: "", phase: "type", answer: "" });

  const engineId = picks[0] || "claude";
  const accent = H[engineId].brand;
  const canNext = page === 0 || (page === 1 && picks.length > 0);
  const toggle = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // page-3 scripted demo loop (only runs while the demo page is visible)
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
            <div className="ob-eyebrow">choose your agents · 02</div>
            <h2 className="ob2-h2">You pick <em>agents</em>, not models</h2>
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
                <span className="amx-i" title="Think engine vs car: a model is the engine, an agent is the whole car (engine + wheels + dashboard). You don't drive an engine. Cloud agents bring their own engine; on-device agents let you drop in a free local one.">ⓘ</span>
              </p>
            </div>
            <div className="ob2-paths">
              <div className="ob2-path cloud">
                <div className="ic">☁</div>
                <h4>Cloud</h4>
                <p>Use the subscriptions you already pay for — Claude, ChatGPT, Gemini, Copilot. Each agent signs in with its own account. Frontier quality.</p>
              </div>
              <div className="ob2-path local">
                <div className="ic">🖥</div>
                <h4>On-device</h4>
                <p>Open-weight brains via OpenCode / Qwen, pointed at Ollama. Zero key, zero cloud, $0 per task — and fully private.</p>
              </div>
            </div>
            <div className="ob2-pickhint">Pick the agents you'll use — the ones you have access to. Split shows only these; add more anytime. {picks.length > 0 && <b>{picks.length} selected</b>}</div>
            <League isSelected={(id) => picks.includes(id)} onPick={toggle} />
          </div>
        )}

        {page === 2 && (
          <div className="stagger">
            <div className="ob-eyebrow">see it run · 03</div>
            <h2 className="ob2-h2">Brief an expert. <em>Watch it work.</em></h2>
            <p className="ob2-lede" style={{ marginBottom: 18 }}>A live taste — @Consultant running on {H[engineId].label}.</p>
            <Demo engineId={engineId} demo={demo} />
          </div>
        )}
      </div>

      <div className="ob2-foot">
        <div className="dots">
          {[0, 1, 2].map((i) => (
            <button key={i} className={"dot2" + (i === page ? " on" : "")} onClick={() => setPage(i)} aria-label={`page ${i + 1}`} />
          ))}
        </div>
        <div className="ob2-actions">
          {page > 0 && <button className="btn ghost" onClick={() => setPage((p) => p - 1)}>← back</button>}
          {page < 2 ? (
            <button className="btn" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>{page === 1 ? "Continue →" : "Next →"}</button>
          ) : (
            <button className="btn" onClick={() => onEnter(picks)}>Enter Split →</button>
          )}
        </div>
      </div>
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
