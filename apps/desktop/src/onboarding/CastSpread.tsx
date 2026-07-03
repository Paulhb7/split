import { useEffect, useMemo, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { Avatar } from "../shared/Avatar";
import { getPortrait } from "../shared/portraits";
import { vars } from "../shared/ui";
import { Preview, TYPE_LABEL } from "../conversation/DeliverableExamples";
import { isActiveExpert, type ExpertMap } from "../shared/experts";
import "./finalstretch.css";

// Onboarding page 5 — HIRE YOUR TEAM, "stage" layout: a big always-on hero
// render (full-body avatar of the active maker + who they are + their pitch +
// Hire) sits above a full-width grid of avatar cards. Clicking any card swaps
// the stage to that maker. The Spread/Cast toggle only re-labels the roster
// categories. Hiring pins an expert to the atelier rail (shared/team.ts).
// Socrates is a separate recruiter card.

// Crafted in-character voice lines (≤ ~12 words). Keyed by slug; makers without
// one fall back to their blurb.
const VOICE: Record<string, string> = {
  consultant: "Give me the question. I bring back the slide you can present — sourced, scored.",
  scientist: "I read the field so you don’t have to — then draw the bridge nobody connected.",
  financier: "Numbers don’t volunteer. I make them speak — live, charted, scenario by scenario.",
  lawyer: "I read every clause like it might bite — then show you where the teeth are.",
  data_analyst: "Hand me the raw file. I’ll give back the chart that ends the argument.",
  engineer: "Describe it once. I hand you a working URL, not a wireframe.",
  designer: "Taste isn’t a vibe — it’s a decision, made a thousand times.",
  influencer: "The first three seconds decide everything. Let me write yours.",
  genius_davinci: "A flat image is a sketch waiting to be a world. I’ll give you the room.",
  genius_karl: "Fashion tells the world who you are before you speak. Give me a mood.",
  genius_gaudi: "The curved line belongs to the maker. Tell me the plot; I’ll draw the home.",
  genius_wolfgang: "Hum it badly. That’s all I need — I’ll hand back the theme and the score.",
  genius_homer: "Every idea wants to be told aloud. I’ll write it, voice it, cut the episode.",
  genius_hitchcock: "No terror in the bang — only the anticipation. I’ll direct the dread.",
  genius_ride: "The stars were always there. I wire the live feeds so you can look up and know.",
  genius_curie: "Nothing is to be feared, only understood. Name the disease; I’ll dock the candidate.",
  genius_tesla: "The future is mine. Describe the part; I’ll model it to print.",
  genius_alfred: "Your majordome — I drive your apps with your logins, book, file, run the admin.",
  genius_maradona: "The ball doesn’t get dirty. I read the duel that decides the match — live.",
  genius_marcopolo: "The road is the destination. Name the country; I’ll draw the carnet.",
  genius_vatel: "An evening is staged, not served. The menu, the table, the minute by minute.",
  coach: "Nutrition, training, learning, cooking — one plan that fits your week, held together. I’ll build it and track it.",
};

// Per-agent signature hue (mirrors EXPERT_HUE / KIND_HUE in Crest.tsx). Drives
// the stage glow + card accent so each maker reads as its own colour.
const HUE: Record<string, string> = {
  consultant: "#5b8bff", scientist: "#2fae9b", financier: "#3a9d5d", lawyer: "#9a6b3f",
  data_analyst: "#4aa3df", engineer: "#ff8a3c", designer: "#e85ad0", influencer: "#ff5c8a",
  project_manager: "#6c8cff", sales: "#e0a52e", coach: "#5ec27a",
  genius_davinci: "#e0603c", genius_karl: "#7c8696", genius_gaudi: "#ef7d57", genius_wolfgang: "#f2b53a",
  genius_homer: "#3f6fb0", genius_hitchcock: "#b23a48", genius_bronte: "#9b6a9e", genius_ride: "#3aa0d9",
  genius_curie: "#39d98a", genius_tesla: "#8b6cff", genius_alfred: "#6b8cae", genius_socrates: "#a3a05a",
  genius_indiana: "#c79a3c", genius_maradona: "#5aa9e6", genius_marcopolo: "#2bbfa0", genius_vatel: "#b5543f",
  genius_machiavelli: "#9e2b3a", genius_moriarty: "#355e7a", genius_faust: "#b5462a", genius_hannibal: "#7a2e3a", genius_loki: "#36b37e",
};
const hueFor = (slug: string) => HUE[slug] ?? "#8891a6";

const FEATURED = ["consultant", "genius_davinci", "coach"];
const CAT_ORDER: ("super" | "genius" | "coach")[] = ["super", "genius", "coach"];
const CAT_LABEL: Record<string, Record<string, string>> = {
  spread: { super: "Staff", genius: "Geniuses in residence", coach: "Coaches" },
  cast: { super: "Staff", genius: "Geniuses", coach: "Coaches" },
};
const CAT_TAG: Record<string, string> = { super: "In the staff", genius: "A genius in residence", coach: "Your coach" };

export function CastSpread({ experts, team, onToggleHire, onHireRecruiter }: {
  experts: ExpertMap;
  /** The hired team (shared/team.ts) — ★ slugs pinned to the atelier rail. */
  team: string[];
  onToggleHire: (slug: string) => void;
  onHireRecruiter: () => void;
}) {
  const hiredSet = new Set(team);
  const [face, setFace] = useState<"spread" | "cast">("spread");
  const groups = useMemo(() => {
    const out: Record<string, string[]> = { super: [], genius: [], coach: [] };
    for (const slug of Object.keys(experts)) {
      if (slug === "genius_socrates" || !isActiveExpert(experts, slug)) continue;
      const cat = experts[slug].category ?? "super";
      (out[cat] ??= []).push(slug);
    }
    return out;
  }, [experts]);
  const total = CAT_ORDER.reduce((n, c) => n + (groups[c]?.length ?? 0), 0);

  const featured = FEATURED.filter((s) => experts[s]);
  // The maker the stage shows. Defaults to the first featured; any card click
  // pins it here. (No auto-rotation — the grid is the selector.)
  const [selected, setSelected] = useState<string | null>(null);
  // Real showcase pieces (config/library/<slug>/<dir>/thumb.png), keyed
  // "<slug>/<dir>" for the ex.lib join — same source as the Cabinet Gallery.
  const [lib, setLib] = useState<Record<string, { thumb?: string; mtime?: number }>>({});
  useEffect(() => {
    invoke<string>("library_index")
      .then((raw) => {
        const m: Record<string, { thumb?: string; mtime?: number }> = {};
        for (const p of JSON.parse(raw) as { expert: string; dir: string; thumb?: string; mtime?: number }[]) {
          m[p.expert + "/" + p.dir] = { thumb: p.thumb, mtime: p.mtime };
        }
        setLib(m);
      })
      .catch(() => {}); // no library on disk → Preview SVG fallback
  }, []);
  const activeSlug = selected ?? featured[0];
  const active = experts[activeSlug];

  return (
    <div className={"cst-spread cst-stagev face-" + face}>
      <nav className="cst-toggle" aria-label="Page 5 candidates">
        <button type="button" className={face === "spread" ? "on" : undefined} onClick={() => setFace("spread")}>Spread (board)</button>
        <button type="button" className={face === "cast" ? "on" : undefined} onClick={() => setFace("cast")}>Cast (app)</button>
      </nav>

      <div className="cst-head">
        <div className="cst-eyebrow">hire your team · 05</div>
        <h2 className="cst-statement"><span className="n">{total}</span> experts. <em>Hire your team.</em></h2>
        <p className="cst-lede">Click any maker to open them — who they are, their pitch, one tap to hire. ★ pins them to your atelier rail.</p>
      </div>

      {active && (
        // key=activeSlug → the render cross-fades in on each swap.
        <div key={activeSlug} className={"cst-stage " + (active.category ?? "super")} style={vars({ "--hue": hueFor(activeSlug) })}>
          <div className="cst-stage-pic">
            <span className="cst-stage-glow" aria-hidden="true" />
            <img className="cst-stage-img" src={getPortrait(activeSlug)} alt="" aria-hidden="true" draggable={false} />
          </div>
          <div className="cst-stage-info">
            <div className="cst-stage-tag">{CAT_TAG[active.category ?? "super"]}</div>
            <div className={"cst-stage-nm" + ((active.category ?? "super") === "genius" ? " gen" : "")}>{active.label}</div>
            <div className="cst-stage-role">{active.role ? active.role + " · " : ""}{active.kind}</div>
            <div className="cst-stage-voice"><span className="mk">“</span>{VOICE[activeSlug] ?? active.blurb}</div>
            {active.examples?.length ? (
              <div className="cst-stage-work">
                <div className="cst-stage-work-lbl">What {active.label} makes</div>
                <div className="cst-stage-work-row">
                  {active.examples.slice(0, 3).map((ex, i) => {
                    const piece = ex.lib ? lib[activeSlug + "/" + ex.lib] : undefined;
                    return (
                      <div key={i} className="cst-work-card">
                        <div className="cst-work-prev">
                          {piece?.thumb
                            ? <img className="cst-work-thumb" src={convertFileSrc(piece.thumb) + "?v=" + (piece.mtime ?? 0)} alt="" loading="lazy" />
                            : <Preview type={ex.type} fit="slice" />}
                        </div>
                        <div className="cst-work-meta">
                          <div className="cst-work-type"><i />{TYPE_LABEL[ex.type] ?? "Work"}</div>
                          <div className="cst-work-title">{ex.title}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className={"cst-stage-hire" + (hiredSet.has(activeSlug) ? " on" : "")}
              onClick={() => onToggleHire(activeSlug)}
            >
              {hiredSet.has(activeSlug) ? "★ Hired · on your rail" : "☆ Hire " + active.label}
            </button>
          </div>
        </div>
      )}

      <div className="cst-roster">
        <div className="cst-ix-head"><span className="h">The full roster</span><span className="ct">{team.length} of {total} hired</span></div>
        {CAT_ORDER.map((c) => (groups[c]?.length ? (
          <div key={c}>
            <div className="cst-ix-cat"><span className="c">{CAT_LABEL[face][c]}</span><span className="ct">{groups[c].length}</span></div>
            <div className="cst-cards">
              {groups[c].map((slug) => {
                const e = experts[slug];
                const hired = hiredSet.has(slug);
                return (
                  <button
                    type="button"
                    key={slug}
                    className={"cst-card " + c + (hired ? " hired" : "") + (slug === activeSlug ? " active" : "")}
                    style={vars({ "--hue": hueFor(slug) })}
                    title={`${e.label} — ${e.blurb}`}
                    aria-pressed={slug === activeSlug}
                    onClick={() => setSelected(slug)}
                  >
                    {/* Full-body avatar fills the card (source is 3:4, so no crop). */}
                    <img className="cst-card-img" src={getPortrait(slug)} alt="" aria-hidden="true" draggable={false} loading="lazy" />
                    <span className="cst-card-cap">
                      <span className="cst-card-nm">{e.label}</span>
                      <span className="cst-card-kd">{e.role || e.kind}</span>
                    </span>
                    {/* Star = mouse shortcut to hire straight from the card. */}
                    <span
                      className="cst-card-star"
                      aria-hidden="true"
                      title={hired ? "Hired — click to drop" : "Hire"}
                      onClick={(ev) => { ev.stopPropagation(); onToggleHire(slug); }}
                    >
                      {hired ? "★" : "☆"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null))}
        <button className="cst-recruit" onClick={onHireRecruiter}>
          <span className="cst-recruit-ic"><Avatar slug="genius_socrates" size={40} /></span>
          <div>
            <b>Missing a maker? Hire <span className="rn">@{experts.genius_socrates?.label ?? "Socrates"}</span>.</b>
            <p>He runs a Socratic interview and drafts a brand-new expert from your answers — no menus, no code.</p>
          </div>
          <span className="cst-recruit-cta">Hire him →</span>
        </button>
      </div>
    </div>
  );
}
