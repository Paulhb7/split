// Shared presentational bits used by both the app and the onboarding.
import { HARNESSES, H, logoUrl, brandOf } from "./harnesses";

export const vars = (o: Record<string, string | number>) => o as React.CSSProperties;

export function Logo({ id, size = 18 }: { id: string; size?: number }) {
  return <span className="logo" style={vars({ "--logo": logoUrl(id), "--brand": brandOf(id), "--s": `${size}px` })} />;
}

export function Tile({ id, size = 44 }: { id: string; size?: number }) {
  return (
    <span className="tile" style={vars({ "--brand": brandOf(id), "--t": `${size}px` })}>
      <Logo id={id} size={size - 20} />
    </span>
  );
}

export function EngineCard({ id, selected, onPick }: { id: string; selected: boolean; onPick: (id: string) => void }) {
  const h = H[id];
  return (
    <button className={"ecard" + (h.reserve ? " reserve" : "") + (selected ? " sel" : "")} style={vars({ "--brand": h.brand })} onClick={() => onPick(id)}>
      <span className="check" />
      <div className="top">
        <Tile id={id} size={40} />
        <span>
          <div className="nm">{h.label}</div>
          <div className="vd">{h.vendor}</div>
        </span>
      </div>
      <div className="bl">{h.blurb}</div>
      <span className="tag">{h.tag}</span>
    </button>
  );
}

// `isSelected` is a predicate so the league works for single-pick or multi-select.
export function League({ isSelected, onPick }: { isSelected: (id: string) => boolean; onPick: (id: string) => void }) {
  return (
    <>
      <div className="lane">☁ Cloud · your subscriptions</div>
      <div className="grid">
        {HARNESSES.filter((h) => h.lane === "cloud").map((h) => (
          <EngineCard key={h.id} id={h.id} selected={isSelected(h.id)} onPick={onPick} />
        ))}
      </div>
      <div className="lane">🖥 On-device · your machine</div>
      <div className="grid">
        {HARNESSES.filter((h) => h.lane === "local").map((h) => (
          <EngineCard key={h.id} id={h.id} selected={isSelected(h.id)} onPick={onPick} />
        ))}
      </div>
    </>
  );
}
