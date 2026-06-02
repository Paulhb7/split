import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { H } from "../shared/harnesses";
import { Tile, League, vars } from "../shared/ui";
import { useHarnessStates } from "../shared/useHarnessStates";
import { useExperts } from "../shared/util";
import { isClassicExpert, type ExpertKind } from "../shared/experts";
import { SKINS, type Skin } from "../shared/skins";
import SiriOrb from "../shared/SiriOrb";
import "./onboarding.css";

// Inline Lucide-style SVG glyphs per expert kind. Single-stroke, currentColor,
// 24×24 viewBox — pairs with the Bright skin's SaaS register. Sized in CSS
// (see `.ob2-cabinet-icon svg`); the previous emoji set (🔬⚖️📊…) clashed
// with the lighter, line-art aesthetic.
const KIND_GLYPH: Record<ExpertKind, ReactNode> = {
  researcher: (
    <>
      <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
      <path d="M6.453 15h11.094" />
      <path d="M8.5 2h7" />
    </>
  ),
  analyst: (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  advisor: (
    <>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </>
  ),
  builder: (
    <>
      <path d="m15 12-8.5 8.5c-.83.83-2.17.83-3 0a2.12 2.12 0 0 1 0-3L12 9" />
      <path d="M17.64 15 22 10.64" />
      <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
    </>
  ),
  operator: (
    <>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </>
  ),
  organizer: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </>
  ),
  finder: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  creator: (
    <>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h1.99c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2Z" />
    </>
  ),
  recruiter: (
    <>
      <path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0Z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </>
  ),
  coach: (
    <>
      <path d="M7 20h10" />
      <path d="M10 20c5.5-2.5.8-6.4 3-10" />
      <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
      <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
    </>
  ),
};

function KindIcon({ kind }: { kind: ExpertKind }) {
  return (
    <svg
      className="kind-glyph"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {KIND_GLYPH[kind]}
    </svg>
  );
}

// Cabinet display order: think → process → advise → build → operate → find →
// create → coach. Recruiter handled separately via the "hire" CTA.
const KIND_ORDER: ExpertKind[] = [
  "researcher",
  "analyst",
  "advisor",
  "builder",
  "organizer",
  "operator",
  "finder",
  "creator",
  "coach",
  "recruiter",
];

const SHOWCASE = ["claude", "codex", "gemini", "mistral-vibe", "copilot", "opencode", "qwen"];
const EXPERTS = ["Consultant", "Scientist", "Engineer", "Analyst", "Lawyer", "Finder"];

export type EnterIntent = "test_wolfgang" | "start_recruiter" | undefined;

export default function Onboarding({
  onEnter,
  skin,
  onPickSkin,
}: {
  onEnter: (ids: string[], intent?: EnterIntent, expertSlug?: string, prompt?: string) => void;
  skin: Skin;
  onPickSkin: (s: Skin) => void;
}) {
  const [page, setPage] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [wolfgangTopic, setWolfgangTopic] = useState("");
  const { states, progress } = useHarnessStates();
  const experts = useExperts();

  const engineId = picks[0] || "claude"; // "primary" = the first picked agent
  const primarySt = states[engineId];
  const accent = H[engineId].brand;
  // 4 pages: theme (0) · welcome (1) · pick (2) · brief (3).
  // Page 2 = picker; can't advance until at least one agent is selected.
  const canNext = page !== 2 || picks.length > 0;
  const toggle = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="ob2" style={vars({ "--brand": accent })}>
      <div className="ob2-page" key={page}>
        {page === 0 && (
          <div className="ob2-hero">
            <div className="ob2-hero-text stagger">
              <div className="ob-eyebrow">first, the room · 00</div>
              <h1 className="ob2-h1">Pick your <em>skin</em>.</h1>
              <p className="ob2-lede">
                Split is a place you'll come back to often. Choose how it should feel —
                you can switch any time from the chrome bar.
              </p>
              <p className="ob2-seed">Live preview — it applies as you click.</p>
            </div>
            <div className="ob2-hero-visual">
              <div className="ob2-skins">
                {SKINS.map((s) => (
                  <button
                    key={s.id || "classic"}
                    className={"ob2-skin" + (skin === s.id ? " on" : "")}
                    onClick={() => onPickSkin(s.id)}
                    type="button"
                  >
                    <span
                      className="ob2-skin-sw"
                      style={{
                        background: `linear-gradient(135deg, ${s.sw[0]} 0%, ${s.sw[0]} 50%, ${s.sw[1]} 50%, ${s.sw[1]} 100%)`,
                        boxShadow: `inset 0 0 0 2px ${s.sw[2]}`,
                      }}
                    />
                    <span className="ob2-skin-meta">
                      <b>{s.label}</b>
                      <small>{s.hint}</small>
                    </span>
                    {skin === s.id && <span className="ob2-skin-tick">●</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 1 && (
          <div className="ob2-hero">
            <div className="ob2-hero-text stagger">
              <div className="ob-eyebrow">welcome to your cabinet · 01</div>
              <h1 className="ob2-h1">Any AI agent.<br />Now a <em>genius</em>.</h1>
              <p className="ob2-lede">
                Bring <b>Claude</b>, <b>Codex</b>, <b>Gemini</b>, <b>Mistral Vibe</b> — whatever AI you use.
                <b> Split</b> wraps it in an <b>expert persona</b>: Wolfgang the consultant, Marie the scientist,
                Picasso the creator… so it doesn't just chat — it <em>specializes, acts and ships</em>.
              </p>
              <p className="ob2-seed">An <b>agent</b> is a model with hands. An <b>expert</b> is that agent with a craft.</p>
            </div>
            <div className="ob2-hero-visual">
              <div className="ob2-orb-wrap">
                <SiriOrb size={200} coreColor={accent} />
              </div>
              <div className="cons">
                <div className="cons-row engines">
                  {SHOWCASE.map((id, i) => (
                    <span key={id} className="cons-engine" style={vars({ animationDelay: `${0.15 + i * 0.05}s`, "--brand": H[id].brand })}>
                      <Tile id={id} size={42} />
                      <span className="cons-name">{H[id].label}</span>
                    </span>
                  ))}
                </div>
                <div className="cons-link">wrapped, becomes</div>
                <div className="cons-row experts">
                  {EXPERTS.map((e, i) => (
                    <span key={e} className="cons-expert" style={{ animationDelay: `${0.4 + i * 0.05}s` }}>@{e}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {page === 2 && (
          <div className="stagger">
            <div className="ob-eyebrow">pick your agents · 02</div>
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

        {page === 3 && (
          <div className="stagger">
            <div className="ob-eyebrow">meet your cabinet · 03</div>
            <h2 className="ob2-h2">Brief your first <em>expert</em></h2>
            <p className="ob2-lede" style={{ marginBottom: 18 }}>
              Start with <b>@{experts.consultant?.label || "Wolfgang"}</b> — your research consultant.
              Type a topic, get back a structured brief.
            </p>
            {experts.consultant && (
              <form
                className="ob2-wolfgang"
                style={vars({ "--brand": H[engineId].brand })}
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = wolfgangTopic.trim();
                  if (!t) return;
                  onEnter(picks, "test_wolfgang", "consultant", `Brief me on ${t}`);
                }}
              >
                <div className="ob2-wolfgang-head">
                  <KindIcon kind="researcher" />
                  <span className="ob2-wolfgang-at">@{experts.consultant.label}</span>
                  <span className="ob2-wolfgang-prefix">Brief me on</span>
                </div>
                <div className="ob2-wolfgang-row">
                  <input
                    type="text"
                    className="ob2-wolfgang-input"
                    placeholder="the EV market outlook for 2026"
                    value={wolfgangTopic}
                    onChange={(e) => setWolfgangTopic(e.target.value)}
                    autoFocus
                  />
                  <button className="btn" type="submit" disabled={!wolfgangTopic.trim()}>Run →</button>
                </div>
                <p className="ob2-wolfgang-hint">runs on {H[engineId].label} · structured markdown back, no slides yet</p>
              </form>
            )}
            {(() => {
              const cabinet = Object.entries(experts)
                .filter(([slug]) => slug !== "recruiter" && slug !== "consultant" && isClassicExpert(slug))
                .sort(([, a], [, b]) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
              const supers = cabinet.filter(([, e]) => (e.category ?? "super") === "super");
              const genii = cabinet.filter(([, e]) => e.category === "genius");
              const coaches = cabinet.filter(([, e]) => e.category === "coach");
              return (
                <>
                  {supers.length > 0 && (
                    <>
                      <div className="ob-eyebrow ob-eyebrow-section">super agents · jobs you already know, done in seconds</div>
                      <div className="ob2-cabinet">
                        {supers.map(([slug, exp]) => (
                          <button
                            key={slug}
                            className="ob2-cabinet-card"
                            onClick={() => onEnter(picks, undefined, slug)}
                          >
                            <span className="ob2-cabinet-name">
                              <span className="ob2-cabinet-icon"><KindIcon kind={exp.kind} /></span>
                              @{exp.label}
                            </span>
                            <span className="ob2-cabinet-role">{exp.figure ?? exp.role ?? slug}</span>
                            <span className="ob2-cabinet-blurb">{exp.blurb}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {genii.length > 0 && (
                    <>
                      <div className="ob-eyebrow ob-eyebrow-section genius">genius agents · what only a genius could make</div>
                      <div className="ob2-cabinet ob2-cabinet-genius">
                        {genii.map(([slug, exp]) => (
                          <button
                            key={slug}
                            className="ob2-cabinet-card"
                            onClick={() => onEnter(picks, undefined, slug)}
                          >
                            <span className="ob2-cabinet-name">
                              <span className="ob2-cabinet-icon"><KindIcon kind={exp.kind} /></span>
                              @{exp.label}
                            </span>
                            <span className="ob2-cabinet-role">{exp.role ?? "genius"}</span>
                            <span className="ob2-cabinet-blurb">{exp.blurb}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {coaches.length > 0 && (
                    <>
                      <div className="ob-eyebrow ob-eyebrow-section coach">coaches · grow with them, day after day</div>
                      <div className="ob2-cabinet ob2-cabinet-coach">
                        {coaches.map(([slug, exp]) => (
                          <button
                            key={slug}
                            className="ob2-cabinet-card"
                            onClick={() => onEnter(picks, undefined, slug)}
                          >
                            <span className="ob2-cabinet-name">
                              <span className="ob2-cabinet-icon"><KindIcon kind={exp.kind} /></span>
                              @{exp.label}
                            </span>
                            <span className="ob2-cabinet-role">coach</span>
                            <span className="ob2-cabinet-blurb">{exp.blurb}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              );
            })()}
            {experts.recruiter && (
              <button className="ob2-hire" onClick={() => onEnter(picks, "start_recruiter")}>
                <span className="ob2-hire-ic"><KindIcon kind="recruiter" /></span>
                <span className="ob2-hire-body">
                  <span className="ob2-hire-title">Don't see what you need? Hire @{experts.recruiter.label}.</span>
                  <span className="ob2-hire-text">
                    He runs a Socratic interview and drafts a brand-new expert from your answers — no menus, no
                    code. Custom experts live in your private data folder, alongside the shipped ones.
                  </span>
                </span>
                <span className="ob2-hire-cta">Hire him →</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ob2-foot">
        <div className="dots">
          {[0, 1, 2, 3].map((i) => (
            <button key={i} className={"dot2" + (i === page ? " on" : "")} onClick={() => setPage(i)} aria-label={`page ${i + 1}`} />
          ))}
        </div>
        <div className="ob2-actions">
          {page > 0 && <button className="btn ghost" onClick={() => setPage((p) => p - 1)}>← back</button>}
          {page < 3 ? (
            <button className="btn" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>{page === 2 ? "Continue →" : "Next →"}</button>
          ) : (
            <button className="btn" onClick={() => onEnter(picks)}>Enter Split →</button>
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

