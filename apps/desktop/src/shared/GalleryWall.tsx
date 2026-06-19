// GalleryWall — the cabinet visualized as a museum hanging.
//
// Three "wings" stacked vertically: the geniuses (gilded frames, salon-hanging
// with irregular spans + slight rotations), the working hands (super agents —
// dark walnut frames in a regular row), the coaches (terracotta frames). An
// optional fourth section for `status: "next"` experts renders dimmer with an
// "on tour" placard so they stay visible without inviting a click.
//
// The parent owns filtering / sorting; this component just renders. Both the
// Cabinet's landing view and Onboarding page 3 use the same wall so curating
// the gallery happens in one place.
import type { ReactNode } from "react";
import { isClassicExpert, isNextExpert, type Expert, type ExpertKind, type ExpertMap } from "./experts";
import { Crest } from "./Crest";

export type WingId = "super" | "genius" | "coach" | "next";

export interface WingEntry {
  slug: string;
  expert: Expert;
}

export interface Wing {
  id: WingId;
  eyebrow: string;
  title: string;
  entries: WingEntry[];
}

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

/** The canonical hanging: full roster bucketed into the four wings, in the
 * museum order. Cabinet's landing and the fullscreen home both render this;
 * onboarding page 3 keeps its own curated wings (it filters out the experts
 * already featured on the page). */
export function buildWings(experts: ExpertMap): Wing[] {
  const classic = Object.entries(experts)
    .filter(([slug]) => isClassicExpert(slug))
    .sort(([, a], [, b]) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const active = classic.filter(([, e]) => !isNextExpert(e));
  const next = classic.filter(([, e]) => isNextExpert(e));
  const entriesOf = (list: [string, Expert][]): WingEntry[] => list.map(([slug, expert]) => ({ slug, expert }));
  return [
    { id: "super", eyebrow: "main floor", title: "the working hands", entries: entriesOf(active.filter(([, e]) => (e.category ?? "super") === "super")) },
    { id: "genius", eyebrow: "east wing · aka the nobel band", title: "the geniuses", entries: entriesOf(active.filter(([, e]) => e.category === "genius")) },
    { id: "coach", eyebrow: "west wing", title: "the coaches", entries: entriesOf(active.filter(([, e]) => e.category === "coach")) },
    { id: "next", eyebrow: "on tour", title: "coming next", entries: entriesOf(next) },
  ];
}

export interface GalleryWallProps {
  wings: Wing[];
  /** Called with the slug when a portrait is clicked. */
  onPick: (slug: string) => void;
  /** Optional intro shown above the first wing (cabinet landing only). */
  intro?: { eyebrow: string; title: ReactNode; lede?: ReactNode };
  /** Easter egg — when provided, a tiny unframed exhibit ("untitled — 1912")
   * closes the hanging; clicking it is the Titanic skin toggle. Only the
   * Cabinet passes this: no egg before onboarding is even done. */
  onIceberg?: () => void;
}

export default function GalleryWall({ wings, onPick, intro, onIceberg }: GalleryWallProps) {
  return (
    <div className="gw">
      {intro && (
        <header className="gw-head">
          <div className="gw-head-eyebrow">{intro.eyebrow}</div>
          <h1 className="gw-head-title">{intro.title}</h1>
          {intro.lede && <p className="gw-head-lede">{intro.lede}</p>}
        </header>
      )}

      {wings.map((wing) =>
        wing.entries.length === 0 ? null : (
          <section key={wing.id} className={"gw-wing gw-wing-" + wing.id}>
            <div className="gw-rail" aria-hidden="true" />
            <div className="gw-wing-head">
              <div className="gw-wing-eyebrow">{wing.eyebrow}</div>
              <h2 className="gw-wing-title">{wing.title}</h2>
            </div>
            <div className={"gw-row gw-row-" + wing.id}>
              {wing.entries.map((entry, idx) => (
                <Portrait
                  key={entry.slug}
                  slug={entry.slug}
                  expert={entry.expert}
                  wing={wing.id}
                  index={idx}
                  onPick={onPick}
                />
              ))}
            </div>
          </section>
        ),
      )}

      {onIceberg && (
        <div className="gw-last-exhibit">
          <button className="gw-iceberg" onClick={onIceberg} type="button">
            <span className="gw-iceberg-ice" aria-hidden="true">🧊</span>
            <span className="gw-iceberg-plaque">untitled — 1912</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Per-portrait button. Salon-hanging rhythm (spans, aspect ratios, slight
// rotations) is driven by `index % 5` for the genius row so any number of
// portraits keeps the irregular feel. Super + coach rows are uniform.
// A 3–4 word "what they do → what you get" line for each plaque. Beats the bare
// kind ("researcher", "analyst"), which repeats across experts who do very
// different things (four researchers, three creators…). Falls back to the
// kind/role/figure when a slug isn't listed.
const CRAFT: Record<string, string> = {
  // geniuses
  genius_davinci: "Image → 3D world",
  genius_wolfgang: "Original music & scores",
  genius_homer: "Full podcasts, voiced",
  genius_kubrick: "Directs short films",
  genius_bronte: "Writes full novels",
  genius_ride: "Reads the sky, live",
  genius_curie: "Protein & molecular design",
  genius_tesla: "Circuits & embedded systems",
  genius_alfred: "Drives your apps",
  genius_socrates: "Designs custom experts",
  genius_indiana: "Hunts rare archives",
  // working hands
  toscanini: "Runs the whole team",
  consultant: "Research → slides & memos",
  scientist: "State-of-the-art briefs",
  financier: "Markets & financial models",
  lawyer: "Legal reads & contracts",
  data_analyst: "Data → live dashboards",
  engineer: "Ships micro-apps & sites",
  designer: "App & site mockups",
  project_manager: "Plans, owners & dates",
  sales: "Leads, outreach & follow-up",
  // coaches
  coach_diet: "Meal plans & nutrition",
  coach_learning: "Study plans & flashcards",
  coach_sport: "Training cycles & recovery",
  coach_cooking: "Techniques, recipes & subs",
};

function Portrait({
  slug,
  expert,
  wing,
  index,
  onPick,
}: {
  slug: string;
  expert: Expert;
  wing: WingId;
  index: number;
  onPick: (slug: string) => void;
}) {
  // Salon variation index — only used by the genius wing.
  const variant = wing === "genius" ? (index % 5) + 1 : 0;
  const cls = ["gw-portrait", "gw-portrait-" + wing, variant ? "gw-v" + variant : ""]
    .filter(Boolean)
    .join(" ");
  // Prefer the craft line (what they do → what you get); fall back to the old
  // per-wing logic (coach specialty, else figure/role/kind) when unlisted.
  const role =
    CRAFT[slug] ??
    (wing === "genius"
      ? expert.kind
      : wing === "coach"
        ? (expert.role ?? expert.kind)
        : (expert.figure ?? expert.role ?? expert.kind));

  return (
    <button className={cls} onClick={() => onPick(slug)} title={`@${expert.label} — ${expert.blurb}`}>
      <span className="gw-spotlight" aria-hidden="true" />
      <span className="gw-frame">
        <span className="gw-pic">
          {/* Every expert wears its crest — the photo portraits clashed with
              the etched-glass DA. The kind sets the archetype; the slug seeds a
              unique milled rim so same-kind figures (the geniuses) stay
              distinct. */}
          <Crest kind={expert.kind} seed={slug} size={120} className="gw-crest" />
        </span>
      </span>
      <span className="gw-plaque">
        <span className="gw-plaque-name">{expert.label}</span>
        <span className="gw-plaque-role">{role}</span>
        {wing === "next" && <span className="gw-on-tour">on tour</span>}
      </span>
    </button>
  );
}
