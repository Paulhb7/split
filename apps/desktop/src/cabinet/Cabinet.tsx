import { useState } from "react";
import { type ExpertMap, isClassicExpert, type ExpertKind } from "../shared/experts";
import { EXPERT_CONTENT, type UseCase } from "../shared/expertContent";
import "./cabinet.css";

// Cabinet overlay — two views inside one shell:
//   1. Grid (default) — all experts laid out in big cards, sectioned super /
//      genius, taking the full width. The "browse" landing.
//   2. Detail — picked from the grid, opens a 2-pane view: roster rail on the
//      left for sibling navigation + curated detail page on the right (use
//      cases, deliverables, example output). Clicking a use case launches a
//      real session on the user's primary agent.

const KIND_ORDER: ExpertKind[] = [
  "researcher",
  "analyst",
  "advisor",
  "builder",
  "operator",
  "finder",
  "creator",
  "recruiter",
];

interface CabinetProps {
  experts: ExpertMap;
  /** Optional pre-selected expert (e.g. when opened from the @ chip). null =
   * land on the grid view. */
  initialSlug?: string | null;
  onClose: () => void;
  onLaunch: (slug: string, prompt: string) => void;
}

export default function Cabinet({ experts, initialSlug = null, onClose, onLaunch }: CabinetProps) {
  const [selected, setSelected] = useState<string | null>(initialSlug);

  const classicEntries = Object.entries(experts)
    .filter(([slug]) => isClassicExpert(slug))
    .sort(([, a], [, b]) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

  const supers = classicEntries.filter(([, e]) => (e.category ?? "super") === "super");
  const genii = classicEntries.filter(([, e]) => e.category === "genius");
  const coaches = classicEntries.filter(([, e]) => e.category === "coach");

  return (
    <div className="cab-overlay" onClick={onClose}>
      <div className={"cab-card" + (selected ? " detail" : " grid")} onClick={(e) => e.stopPropagation()}>
        <button className="cab-close" onClick={onClose} title="Close">✕</button>

        {selected === null ? (
          /* ============ GRID VIEW — full-width landing ============ */
          <div className="cab-grid-page">
            <header className="cab-grid-head">
              <span className="cab-eyebrow">your cabinet</span>
              <h1>Pick the expert you want to brief.</h1>
              <p className="cab-grid-lede">
                Each one ships with their own skills and tools. <b>Super agents</b> handle jobs you
                already know — done in seconds. <b>Genius agents</b> make what only a genius could.
              </p>
            </header>

            {supers.length > 0 && (
              <section className="cab-grid-section">
                <div className="cab-section">super agents</div>
                <div className="cab-grid">
                  {supers.map(([slug, e]) => {
                    const curated = !!EXPERT_CONTENT[slug];
                    return (
                      <button key={slug} className="cab-tile" onClick={() => setSelected(slug)}>
                        <span className="cab-tile-name">@{e.label}</span>
                        <span className="cab-tile-figure">{e.figure ?? e.role ?? e.kind}</span>
                        <span className="cab-tile-blurb">{e.blurb}</span>
                        {curated && <span className="cab-tile-badge">curated</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {genii.length > 0 && (
              <section className="cab-grid-section">
                <div className="cab-section genius">genius agents</div>
                <div className="cab-grid">
                  {genii.map(([slug, e]) => {
                    const curated = !!EXPERT_CONTENT[slug];
                    return (
                      <button key={slug} className="cab-tile genius" onClick={() => setSelected(slug)}>
                        <span className="cab-tile-name">@{e.label}</span>
                        <span className="cab-tile-figure">{e.role ?? e.kind}</span>
                        <span className="cab-tile-blurb">{e.blurb}</span>
                        {curated && <span className="cab-tile-badge">curated</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {coaches.length > 0 && (
              <section className="cab-grid-section">
                <div className="cab-section coach">coaches</div>
                <div className="cab-grid">
                  {coaches.map(([slug, e]) => {
                    const curated = !!EXPERT_CONTENT[slug];
                    return (
                      <button key={slug} className="cab-tile coach" onClick={() => setSelected(slug)}>
                        <span className="cab-tile-name">@{e.label}</span>
                        <span className="cab-tile-figure">coach</span>
                        <span className="cab-tile-blurb">{e.blurb}</span>
                        {curated && <span className="cab-tile-badge">curated</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        ) : (
          /* ============ DETAIL VIEW — 2-pane (rail + detail) ============ */
          <>
            <aside className="cab-rail">
              <button className="cab-rail-back" onClick={() => setSelected(null)} title="Back to all experts">
                <span aria-hidden>←</span> all experts
              </button>
              {supers.length > 0 && (
                <>
                  <div className="cab-section">super agents</div>
                  {supers.map(([s, e]) => (
                    <button
                      key={s}
                      className={"cab-row" + (s === selected ? " on" : "")}
                      onClick={() => setSelected(s)}
                    >
                      <span className="cab-row-name">@{e.label}</span>
                      <span className="cab-row-figure">{e.figure ?? e.role ?? s}</span>
                    </button>
                  ))}
                </>
              )}
              {genii.length > 0 && (
                <>
                  <div className="cab-section genius">genius agents</div>
                  {genii.map(([s, e]) => (
                    <button
                      key={s}
                      className={"cab-row genius" + (s === selected ? " on" : "")}
                      onClick={() => setSelected(s)}
                    >
                      <span className="cab-row-name">@{e.label}</span>
                      <span className="cab-row-figure">{e.role ?? e.kind}</span>
                    </button>
                  ))}
                </>
              )}
              {coaches.length > 0 && (
                <>
                  <div className="cab-section coach">coaches</div>
                  {coaches.map(([s, e]) => (
                    <button
                      key={s}
                      className={"cab-row coach" + (s === selected ? " on" : "")}
                      onClick={() => setSelected(s)}
                    >
                      <span className="cab-row-name">@{e.label}</span>
                      <span className="cab-row-figure">coach</span>
                    </button>
                  ))}
                </>
              )}
            </aside>
            <DetailPane slug={selected} experts={experts} onLaunch={onLaunch} />
          </>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Detail pane: identity → tagline → use cases → deliverables → example.
// Renders a "coming soon" stub when the slug has no curated entry yet, so we
// can ship the cabinet shell before all experts are written up.
//
// Exported so onboarding page 3 can render the same fiche in an overlay
// when the user clicks an expert card during the picker flow.
// --------------------------------------------------------------------------
export function DetailPane({
  slug,
  experts,
  onLaunch,
}: {
  slug: string;
  experts: ExpertMap;
  onLaunch: (slug: string, prompt: string) => void;
}) {
  const expert = experts[slug];
  const content = EXPERT_CONTENT[slug];

  if (!expert) {
    return <main className="cab-detail"><div className="cab-empty">Expert not found.</div></main>;
  }

  return (
    <main className="cab-detail">
      <header className="cab-head">
        <div className="cab-head-titles">
          <span className={"cab-category" + ((expert.category ?? "super") === "genius" ? " genius" : "")}>
            {(expert.category ?? "super")} agent
          </span>
          <h1>@{expert.label}</h1>
          {(expert.figure || expert.role) && (
            <p className="cab-subtitle">
              {expert.figure ? <><b>{expert.figure}</b> · </> : null}
              {expert.role ?? expert.kind}
            </p>
          )}
        </div>
      </header>

      {content ? (
        <>
          <p className="cab-tagline">{content.tagline}</p>

          <section className="cab-section-block">
            <h2>Brief examples</h2>
            {content.useCases.some((uc) => uc.preview) ? (
              // Rich mode: at least one use case carries a preview artifact
              // (real deck or styled placeholder). Render tabs + panels so
              // the user can see the actual deliverable before launching.
              <UseCaseTabs
                useCases={content.useCases}
                expertLabel={expert.label}
                onLaunch={(prompt) => onLaunch(slug, prompt)}
              />
            ) : (
              // Legacy mode: card grid, kept for experts that don't have
              // previews wired yet (designer, curie, tesla…).
              <>
                <p className="cab-section-hint">Click any of these — Split opens with the brief running on your primary agent.</p>
                <div className="cab-usecases">
                  {content.useCases.map((uc, i) => (
                    <button key={i} className="cab-usecase" onClick={() => onLaunch(slug, uc.prompt)}>
                      <span className="cab-usecase-hook">{uc.hook}</span>
                      <span className="cab-usecase-prompt">"{uc.prompt}"</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="cab-section-block">
            <h2>What you get back</h2>
            <ul className="cab-deliverables">
              {content.deliverables.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </section>

          {content.example && (
            <section className="cab-section-block">
              <h2>Example output</h2>
              <figure className="cab-example">
                {content.example.kind === "image" && (
                  <img src={content.example.src} alt={content.example.caption} loading="lazy" />
                )}
                {content.example.kind === "audio" && (
                  <audio controls src={content.example.src} />
                )}
                {content.example.kind === "video" && (
                  <video controls src={content.example.src} />
                )}
                {content.example.kind === "site" && (
                  <iframe src={content.example.src} title={content.example.caption} />
                )}
                <figcaption>{content.example.caption}</figcaption>
              </figure>
            </section>
          )}
        </>
      ) : (
        <div className="cab-coming">
          <p className="cab-tagline">{expert.blurb}</p>
          <p className="cab-coming-note">
            Curated brief examples for <b>@{expert.label}</b> are being written. In the meantime, you can brief
            them directly with anything you'd ask a real {expert.role ?? expert.kind}.
          </p>
          <button className="btn" onClick={() => onLaunch(slug, "")}>
            Open a session with @{expert.label} →
          </button>
        </div>
      )}
    </main>
  );
}

// --------------------------------------------------------------------------
// UseCaseTabs: tabs across the top + an active panel below showing the
// prompt that will be sent, a preview of the artifact, and a launch CTA.
// Used only when at least one use case carries a `preview` field; falls
// back to the legacy card grid in DetailPane when none do.
// --------------------------------------------------------------------------
function UseCaseTabs({
  useCases,
  expertLabel,
  onLaunch,
}: {
  useCases: UseCase[];
  expertLabel: string;
  onLaunch: (prompt: string) => void;
}) {
  const [active, setActive] = useState(0);
  const uc = useCases[active] ?? useCases[0];
  if (!uc) return null;
  return (
    <div className="cab-tabs">
      <div className="cab-tabstrip" role="tablist">
        {useCases.map((u, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === active}
            className={"cab-tab" + (i === active ? " active" : "")}
            onClick={() => setActive(i)}
          >
            {u.hook}
          </button>
        ))}
      </div>
      <div className="cab-panel" role="tabpanel">
        <div className="cab-panel-prompt">"{uc.prompt}"</div>
        {uc.preview?.kind === "deck" && (
          <figure className="cab-panel-stage">
            <iframe
              src={uc.preview.path}
              title={uc.preview.title}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
            />
            <figcaption>
              {uc.preview.title} · {uc.preview.slides} slides
            </figcaption>
          </figure>
        )}
        {uc.preview?.kind === "placeholder" && (
          <div className="cab-panel-placeholder">
            <div className="cab-panel-placeholder-kicker">Preview coming</div>
            <div className="cab-panel-placeholder-body">
              {uc.preview.note ?? "Real artifact coming soon."}
            </div>
          </div>
        )}
        <button className="cab-panel-cta" onClick={() => onLaunch(uc.prompt)}>
          → Brief @{expertLabel} with this prompt
        </button>
      </div>
    </div>
  );
}
