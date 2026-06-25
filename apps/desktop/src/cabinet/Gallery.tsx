import { useEffect, useMemo, useRef, useState } from "react";
import { Crest } from "../shared/Crest";
import { Preview, TYPE_LABEL } from "../conversation/DeliverableExamples";
import { isActiveExpert, type ExpertMap, type ExpertKind, type DeliverableExample } from "../shared/experts";
import "./gallery.css";

// The Gallery — the cabinet, flipped. Instead of a roster of portraits, the
// landing is a WALL OF WORK: every deliverable the experts produce, drawn with
// the same typed faux-render SVGs as the atelier welcome, at gallery scale. The
// maker is a small byline under each piece, not the headline — you browse
// OUTCOMES and hire the maker. Click a piece → a launch sheet shows the render,
// the maker, the exact prompt that produces it, and a CTA that opens the expert
// in the atelier on that brief. The roster (people-first) is gone; the proof
// (work-first) leads, which is where Split's actual moat lives.

interface WorkItem {
  slug: string;
  label: string;
  kind: ExpertKind;
  category: "super" | "genius" | "coach";
  ex: DeliverableExample;
}

// Stagger the tile heights for a real masonry texture (CSS columns + varied
// preview heights). Deterministic per piece so the wall doesn't reshuffle on
// every keystroke.
const HEIGHTS = [150, 184, 216];
const heightOf = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HEIGHTS[h % HEIGHTS.length];
};

export default function Gallery({ experts, initialSlug = null, onClose, onLaunch, onIceberg }: {
  experts: ExpertMap;
  initialSlug?: string | null;
  onClose: () => void;
  onLaunch: (slug: string, prompt: string) => void;
  onIceberg?: () => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [maker, setMaker] = useState<string | null>(initialSlug);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<WorkItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Focus the overlay on mount so "/" (focus search) and Esc work without a
  // click first; App's global Esc handler also closes it as a backstop.
  useEffect(() => { overlayRef.current?.focus(); }, []);

  // Round-robin interleave across experts so the wall mixes makers + types
  // rather than grouping all of one expert's work together.
  const items = useMemo<WorkItem[]>(() => {
    const lists = Object.keys(experts)
      .filter((slug) => isActiveExpert(experts, slug))
      .map((slug) => {
        const e = experts[slug];
        return (e.examples ?? []).map((ex) => ({
          slug, label: e.label, kind: e.kind, category: (e.category ?? "super") as WorkItem["category"], ex,
        }));
      })
      .filter((l) => l.length > 0);
    const out: WorkItem[] = [];
    const max = lists.reduce((m, l) => Math.max(m, l.length), 0);
    for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
    return out;
  }, [experts]);

  // Deliverable types present → filter chips, most-common first.
  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.ex.type, (m.get(it.ex.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const q = query.trim().toLowerCase();
  const shown = items.filter((it) =>
    (filter === "all" || it.ex.type === filter) &&
    (maker === null || it.slug === maker) &&
    (q === "" || (it.ex.title + " " + it.ex.desc + " " + it.label).toLowerCase().includes(q))
  );
  const makerLabel = maker ? experts[maker]?.label : null;

  // "/" focuses search (matches the conversation slash affordance).
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "/" && document.activeElement !== searchRef.current) {
      e.preventDefault(); searchRef.current?.focus();
    } else if (e.key === "Escape") {
      if (sheet) setSheet(null); else onClose();
    }
  };

  return (
    <div className="gal-overlay" ref={overlayRef} onKeyDown={onKey} tabIndex={-1}>
      <button className="gal-close" onClick={onClose} title="Close (Esc)">✕</button>

      <header className="gal-head">
        <div className="gal-eyebrow">the gallery</div>
        <h1>What your studio makes.</h1>
        <p className="gal-lede">
          Not a roster of faces — a wall of finished work. Find an outcome you want, and the maker
          wakes up ready to build you one.
        </p>
      </header>

      <div className="gal-bar">
        <div className="gal-chips">
          <button className={"gal-chip" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>
            All<span className="gal-chip-ct">{items.length}</span>
          </button>
          {types.map(([t, n]) => (
            <button key={t} className={"gal-chip" + (filter === t ? " on" : "")} onClick={() => setFilter(t)}>
              {TYPE_LABEL[t] ?? t}<span className="gal-chip-ct">{n}</span>
            </button>
          ))}
        </div>
        <div className="gal-search">
          <span className="gal-search-ic">⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the work…  (/)"
            spellCheck={false}
          />
        </div>
      </div>

      {maker && (
        <div className="gal-makerbar">
          <button className="gal-maker-back" onClick={() => setMaker(null)}>← all work</button>
          <span className="gal-maker-who">
            <Crest kind={experts[maker]?.kind} seed={maker} size={22} /> @{makerLabel}'s work
          </span>
        </div>
      )}

      <div className="gal-scroll">
        {shown.length === 0 ? (
          <div className="gal-empty">No work matches that yet.</div>
        ) : (
          <div className="gal-wall">
            {shown.map((it) => (
              <button
                key={it.slug + "/" + it.ex.type + "/" + it.ex.title}
                className="gal-tile"
                onClick={() => setSheet(it)}
                title={it.ex.title}
              >
                <div className="gal-tile-prev" style={{ height: heightOf(it.slug + it.ex.title) }}>
                  <Preview type={it.ex.type} fit="slice" />
                  <span className="gal-tile-cta">Make one like this →</span>
                </div>
                <div className="gal-tile-meta">
                  <span className="gal-tile-type">{TYPE_LABEL[it.ex.type] ?? "Work"}</span>
                  <span className="gal-tile-title">{it.ex.title}</span>
                  <span className="gal-tile-by">
                    <Crest kind={it.kind} seed={it.slug} size={18} /> by @{it.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        {onIceberg && shown.length > 0 && (
          <button className="gal-egg" onClick={onIceberg} title="the last exhibit" aria-label="hidden exhibit">✦</button>
        )}
      </div>

      {sheet && (
        <div className="gal-sheet-scrim" onClick={() => setSheet(null)}>
          <div className="gal-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="gal-sheet-x" onClick={() => setSheet(null)} title="Close (Esc)">✕</button>
            <div className="gal-sheet-prev"><Preview type={sheet.ex.type} fit="meet" /></div>
            <div className="gal-sheet-body">
              <span className="gal-sheet-type">{TYPE_LABEL[sheet.ex.type] ?? "Deliverable"}</span>
              <h2>{sheet.ex.title}</h2>
              <p className="gal-sheet-desc">{sheet.ex.desc}</p>
              <div className="gal-sheet-by">
                <Crest kind={sheet.kind} seed={sheet.slug} size={26} />
                <span>by <b>@{sheet.label}</b><i>{sheet.kind}</i></span>
              </div>
              <div className="gal-sheet-prompt">
                <span className="gal-sheet-prompt-k">the brief</span>
                "{sheet.ex.prompt}"
              </div>
              <button className="gal-sheet-cta" onClick={() => onLaunch(sheet.slug, sheet.ex.prompt)}>
                Make one like this — in the Atelier <span aria-hidden>⤢</span>
              </button>
              <button className="gal-sheet-alt" onClick={() => { setMaker(sheet.slug); setFilter("all"); setSheet(null); }}>
                See all of @{sheet.label}'s work →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
