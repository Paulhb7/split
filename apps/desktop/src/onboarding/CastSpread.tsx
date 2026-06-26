import { useEffect, useMemo, useState } from "react";
import { Crest } from "../shared/Crest";
import { Preview, TYPE_LABEL } from "../conversation/DeliverableExamples";
import { isActiveExpert, type ExpertMap } from "../shared/experts";
import "./finalstretch.css";

// Onboarding page 4 — HIRE YOUR TEAM. An editorial two-column spread: a few
// featured makers rotate on the left (each a serif voice line + a real work
// peek + a ★ Hire toggle), the full roster sits as the index on the right where
// every cell is a ★ hire toggle. Hiring pins an expert to the atelier rail (a
// favourites set, shared/team.ts) so the rail shows your handful, not all ~26.
// A starter team is pre-hired. Socrates is a separate recruiter card. Real Crest
// + real Preview keep it identical to the live app.

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
  genius_maradona: "The ball doesn’t get dirty. I read the duel that decides the match — live.",
  genius_vatel: "An evening is staged, not served. The menu, the table, the minute by minute.",
  coach_diet: "You don’t need willpower — you need a plan that fits your week. I’ll build it.",
  coach_learning: "Any subject is learnable on a schedule. I’ll map the weeks and the recalls.",
  coach_sport: "Progress is periodized, not punished. I’ll design the cycle and adapt it.",
  coach_cooking: "Recipes are training wheels; technique is the bike. I’ll teach you to ride.",
};

const FEATURED = ["consultant", "genius_davinci", "coach_sport"];
const CAT_ORDER: ("super" | "genius" | "coach")[] = ["super", "genius", "coach"];
const CAT_LABEL: Record<string, string> = { super: "Jobs · the staff", genius: "Geniuses · the makers", coach: "Coaches · life" };
const CAT_TAG: Record<string, string> = { super: "In the staff", genius: "A genius in residence", coach: "Your coach" };

export function CastSpread({ experts, team, onToggleHire, onHireRecruiter }: {
  experts: ExpertMap;
  /** The hired team (shared/team.ts) — ★ slugs pinned to the atelier rail. */
  team: string[];
  onToggleHire: (slug: string) => void;
  onHireRecruiter: () => void;
}) {
  const hiredSet = new Set(team);
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
    <div className="cst-spread">
      <div className="cst-left">
        <div className="cst-eyebrow">hire your team · 04</div>
        <h2 className="cst-statement">
          <span className="n">{total}</span> experts. <em>Hire your team.</em>
          <span className="rt">The ones you ★ pin to your atelier rail.</span>
        </h2>
        <p className="cst-lede">
          Each is a persona, a craft, a kit of skills. Click a name to see what they make, then ★ Hire the ones
          you’ll actually use — they’re one click away in the atelier. Add or drop any anytime.
        </p>

        <div className="cst-feature">
          {active && (
            // key=activeSlug → remounts on selection/rotation so the card fades in.
            <div key={activeSlug} className="cst-hero show">
              <div className="cst-hero-byline">
                <span className="cst-hero-crest"><Crest kind={active.kind} seed={activeSlug} size={62} /></span>
                <div>
                  <div className="cst-hero-cat">{CAT_TAG[active.category ?? "super"]}</div>
                  <div className="cst-hero-name">{active.label}</div>
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
              <div className="cst-hero-blurb">{active.blurb}</div>
              {activeEx && (
                <div className="cst-peek">
                  <div className="cst-peek-prev"><Preview type={activeEx.type} fit="slice" /></div>
                  <div className="cst-peek-meta">
                    <div>
                      <div className="cst-peek-type"><i />{TYPE_LABEL[activeEx.type] ?? "Work"} · signature work</div>
                      <div className="cst-peek-title">{activeEx.title}</div>
                      <div className="cst-peek-desc">{activeEx.desc}</div>
                    </div>
                    <div className="cst-peek-tag">one of {active.label}’s</div>
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
            {selected ? <>selected · {active?.label}</> : <>featured · {experts[featSlug]?.label}</>}
          </span>
        </div>
      </div>

      <div className="cst-right">
        <div className="cst-ix-head"><span className="h">The full roster</span><span className="ct">{team.length} of {total} hired</span></div>
        <div className="cst-ix-scroll">
          {CAT_ORDER.map((c) => (groups[c]?.length ? (
            <div key={c}>
              <div className="cst-ix-cat"><span className="c">{CAT_LABEL[c]}</span> · {groups[c].length}</div>
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
                      <span className="cst-ix-star" title={hired ? "Hired" : undefined}>{hired ? "★" : "☆"}</span>
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
