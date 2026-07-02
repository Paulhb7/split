import { useEffect, useMemo, useState } from "react";
import { Crest } from "../shared/Crest";
import { Preview, TYPE_LABEL } from "../conversation/DeliverableExamples";
import { isActiveExpert, type ExpertMap } from "../shared/experts";
import "./finalstretch.css";

// Onboarding page 5 — HIRE YOUR TEAM. Two candidate faces share one spread
// (rotating featured maker left, roster index right) and one hired state:
//   · Spread (board) — the framed editorial hero card, italic voice, work-peek
//     corner tag, "Geniuses in residence".
//   · Cast (app)     — the chromeless app page, hero flush in the column.
// The top-right toggle switches faces while the choice settles. Hiring pins an
// expert to the atelier rail (shared/team.ts); a starter team is pre-hired.
// Socrates is a separate recruiter card. Real Crest + real Preview keep it
// identical to the live app.

// Crafted in-character voice lines (≤ ~12 words). Keyed by slug so any maker can
// be featured. Non-featured index cells don't need one.
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
  genius_bronte: "I am no bird, and no net ensnares me. Give me a world; I’ll write the book.",
  genius_ride: "The stars were always there. I wire the live feeds so you can look up and know.",
  genius_curie: "Nothing is to be feared, only understood. Name the disease; I’ll dock the candidate.",
  genius_tesla: "The future is mine. Describe the part; I’ll model it to print.",
  genius_alfred: "Your majordome — I drive your apps with your logins, book, file, run the admin.",
  genius_maradona: "The ball doesn’t get dirty. I read the duel that decides the match — live.",
  genius_marcopolo: "The road is the destination. Name the country; I’ll draw the carnet.",
  genius_vatel: "An evening is staged, not served. The menu, the table, the minute by minute.",
  coach_diet: "You don’t need willpower — you need a plan that fits your week. I’ll build it.",
  coach_learning: "Any subject is learnable on a schedule. I’ll map the weeks and the recalls.",
  coach_sport: "Progress is periodized, not punished. I’ll design the cycle and adapt it.",
  coach_cooking: "Recipes are training wheels; technique is the bike. I’ll teach you to ride.",
};

const FEATURED = ["consultant", "genius_davinci", "coach_sport"];
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
  // The two candidate faces (final-flow board, p5) — switchable while the
  // Spread-vs-Cast choice settles. Same state, different chrome.
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
  const [fi, setFi] = useState(0);
  // The expert whose details fill the left panel. null → the featured rotation
  // drives it; clicking any roster cell on the right pins it here (and pauses
  // the rotation) so you can read what a maker does before hiring.
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (selected || featured.length <= 1) return;
    const t = setInterval(() => setFi((i) => (i + 1) % featured.length), 5000);
    return () => clearInterval(t);
  }, [featured.length, selected]);
  const featSlug = featured[fi] ?? featured[0];
  const activeSlug = selected ?? featSlug;
  const active = experts[activeSlug];
  const activeEx = active?.examples?.[0];

  return (
    <div className={"cst-spread face-" + face}>
      <nav className="cst-toggle" aria-label="Page 5 candidates">
        <button type="button" className={face === "spread" ? "on" : undefined} onClick={() => setFace("spread")}>Spread (board)</button>
        <button type="button" className={face === "cast" ? "on" : undefined} onClick={() => setFace("cast")}>Cast (app)</button>
      </nav>

      <div className="cst-left">
        <div className="cst-eyebrow">hire your team · 05</div>
        <h2 className="cst-statement">
          <span className="n">{total}</span> experts. <em>Hire your team.</em>
        </h2>
        <p className="cst-lede">
          ★ the ones you’ll use. They pin to your atelier rail, one click away. Add or drop anytime.
        </p>

        <div className="cst-feature">
          {active && (
            // key=activeSlug → remounts on selection/rotation so the card fades in.
            <div key={activeSlug} className="cst-hero show">
              <div className="cst-hero-byline">
                <span className="cst-hero-crest"><Crest kind={active.kind} seed={activeSlug} size={62} /></span>
                <div>
                  <div className="cst-hero-cat">{CAT_TAG[active.category ?? "super"]}</div>
                  <div className={"cst-hero-name" + ((active.category ?? "super") === "genius" ? " gen" : "")}>{active.label}</div>
                  <div className="cst-hero-role">{active.role ? active.role + " · " : ""}{active.kind}</div>
                </div>
                <button
                  type="button"
                  className={"cst-hero-hire" + (hiredSet.has(activeSlug) ? " on" : "")}
                  onClick={() => onToggleHire(activeSlug)}
                >
                  {hiredSet.has(activeSlug) ? "★ Hired" : "☆ Hire"}
                </button>
              </div>
              <div className="cst-hero-voice"><span className="mk">“</span>{VOICE[activeSlug] ?? active.blurb}</div>
              {activeEx && (
                <div className="cst-peek">
                  <div className="cst-peek-prev"><Preview type={activeEx.type} fit="slice" /></div>
                  <div className="cst-peek-meta">
                    <div>
                      <div className="cst-peek-type"><i />{TYPE_LABEL[activeEx.type] ?? "Work"}</div>
                      <div className="cst-peek-title">{activeEx.title}</div>
                      <div className="cst-peek-desc">{activeEx.desc}</div>
                    </div>
                    {face === "spread" && <div className="cst-peek-tag">work peek</div>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="cst-rail">
          {/* key includes the active flag so the on pip remounts when it becomes
              active → its ::after progress-fill animation restarts each rotation */}
          {featured.map((s, i) => (
            <button key={s + (!selected && i === fi ? "-on" : "")} className={"cst-pip" + (!selected && i === fi ? " on" : "")} onClick={() => { setSelected(null); setFi(i); }} title={experts[s].label} aria-label={`Feature ${experts[s].label}`} />
          ))}
          <span className="cst-rail-lbl">
            {selected ? <>selected · <b>{active?.label}</b></> : <>featured · <b>{experts[featSlug]?.label}</b></>}
          </span>
        </div>
      </div>

      <div className="cst-right">
        <div className="cst-ix-head"><span className="h">The full roster</span><span className="ct">{team.length} of {total} hired</span></div>
        <div className="cst-ix-scroll">
          {CAT_ORDER.map((c) => (groups[c]?.length ? (
            <div key={c}>
              <div className="cst-ix-cat"><span className="c">{CAT_LABEL[face][c]}</span><span className="ct">{groups[c].length}</span></div>
              <div className="cst-ix-grid">
                {groups[c].map((slug) => {
                  const e = experts[slug];
                  const hired = hiredSet.has(slug);
                  return (
                    <button
                      type="button"
                      key={slug}
                      className={"cst-ix-cell " + c + (hired ? " hired" : "") + (slug === activeSlug ? " sel" : "")}
                      title={`${e.label} — ${e.blurb}`}
                      aria-pressed={slug === activeSlug}
                      onClick={() => setSelected(slug)}
                    >
                      <span className="cst-ix-crest"><Crest kind={e.kind} seed={slug} size={28} /></span>
                      <div><div className="cst-ix-nm">{e.label}</div><div className="cst-ix-kd">{e.role || e.kind}</div></div>
                      {/* The star is a mouse shortcut for hiring straight from
                          the index (hidden from AT — nested in the cell button;
                          the accessible path is select row → hero Hire). */}
                      <span
                        className="cst-ix-star"
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
        </div>
        <button className="cst-recruit" onClick={onHireRecruiter}>
          <span className="cst-recruit-ic"><Crest kind="recruiter" seed="genius_socrates" size={40} /></span>
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
