import { useMemo } from "react";
import { Crest } from "../shared/Crest";
import { Preview, TYPE_LABEL } from "../conversation/DeliverableExamples";
import { isActiveExpert, type ExpertKind, type ExpertMap } from "../shared/experts";
import "./finalstretch.css";

// Onboarding page 4 — the work-first wall. Every active maker's deliverables,
// interleaved, rendered with the real Preview SVGs. Picking a piece PINS it as
// your first brief (editable below); page 5's "Enter Split" launches it. The
// wow + the activation in one, mirroring the in-app Gallery.

export interface FirstBrief { slug: string; label: string; kind: ExpertKind; prompt: string; }

const HEIGHTS = [140, 176, 210];
const hOf = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HEIGHTS[h % HEIGHTS.length];
};

export function WorkGalleryPage({ experts, pinned, onPin }: {
  experts: ExpertMap;
  pinned: FirstBrief | null;
  onPin: (p: FirstBrief | null) => void;
}) {
  const items = useMemo(() => {
    const lists = Object.keys(experts)
      .filter((s) => s !== "genius_socrates" && isActiveExpert(experts, s))
      .map((slug) => {
        const e = experts[slug];
        return (e.examples ?? []).map((ex) => ({ slug, label: e.label, kind: e.kind, ex }));
      })
      .filter((l) => l.length > 0);
    const out: { slug: string; label: string; kind: ExpertKind; ex: { type: string; title: string; desc: string; prompt: string } }[] = [];
    const max = lists.reduce((m, l) => Math.max(m, l.length), 0);
    for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
    return out;
  }, [experts]);

  const fallback = experts.consultant ? "consultant" : (Object.keys(experts)[0] ?? "consultant");

  return (
    <div className="wkg">
      <div className="wkg-wall-wrap">
        <div className="wkg-wall">
          {items.map((it) => {
            const on = pinned?.slug === it.slug && pinned?.prompt === it.ex.prompt;
            return (
              <button
                key={it.slug + "/" + it.ex.type + "/" + it.ex.title}
                className={"wkg-tile" + (on ? " on" : "")}
                onClick={() => onPin({ slug: it.slug, label: it.label, kind: it.kind, prompt: it.ex.prompt })}
                title={it.ex.title}
              >
                <div className="wkg-tile-prev" style={{ height: hOf(it.slug + it.ex.title) }}>
                  <Preview type={it.ex.type} fit="slice" />
                  <span className="wkg-tile-cta">Make one like this →</span>
                </div>
                <div className="wkg-tile-meta">
                  <span className="wkg-tile-type">{TYPE_LABEL[it.ex.type] ?? "Work"}</span>
                  <span className="wkg-tile-title">{it.ex.title}</span>
                  <span className="wkg-tile-by"><Crest kind={it.kind} seed={it.slug} size={18} /> by @{it.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className={"wkg-brief" + (pinned ? " live" : "")}>
        <span className="wkg-brief-k">your first brief</span>
        <input
          className="wkg-brief-in"
          placeholder="Pick a piece above — or type your own first brief…"
          value={pinned?.prompt ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v.trim()) { onPin(null); return; }            // empty → un-pin
            if (pinned) onPin({ ...pinned, prompt: v });        // keep the chosen maker, edit the brief
            else onPin({ slug: fallback, label: experts[fallback]?.label ?? "Consultant", kind: experts[fallback]?.kind ?? "researcher", prompt: v });
          }}
        />
        {pinned && (
          <span className="wkg-brief-by"><Crest kind={pinned.kind} seed={pinned.slug} size={18} /> @{pinned.label}</span>
        )}
      </div>
    </div>
  );
}
