import { League } from "../shared/ui";
import { useHarnessScan } from "../shared/useHarnessScan";
import { useHarnessStates } from "../shared/useHarnessStates";

// The "Your agents" overlay. Owns its own `useHarnessScan` so the machine probe
// runs when the overlay OPENS (not on every app boot), mirroring how onboarding
// scans on mount. The scan streams health badges onto each card and auto-rescans
// on window focus, so signing in / installing reflects without a manual refresh.
export function RosterOverlay({
  enabled,
  onToggle,
  lifecycle,
  onClose,
}: {
  enabled: string[];
  onToggle: (id: string) => void;
  lifecycle: ReturnType<typeof useHarnessStates>;
  onClose: () => void;
}) {
  const scan = useHarnessScan();
  const foundCount = Object.values(scan.byId).filter((d) => d.available).length;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head">
          <div>
            <div className="ob-eyebrow">your roster</div>
            <h2 className="ob2-h2">Your <em>agents</em></h2>
          </div>
          <button className="btn ghost" onClick={onClose}>done</button>
        </div>
        <p className="ob2-lede" style={{ marginBottom: 16 }}>
          Toggle the agents you want — only these appear in your roster &amp; menus.
          Install &amp; sign-in state shows on each card; expand a card to manage.
        </p>
        <div className="ob2-scanline">
          {scan.scanning ? (
            <span className="ob2-scanstat scanning">
              <span className="ob2-scandot" aria-hidden="true" />
              Scanning your machine…
            </span>
          ) : (
            <span className="ob2-scanstat">
              {foundCount > 0
                ? <>Found <b>{foundCount}</b> agent{foundCount > 1 ? "s" : ""} ready on your machine.</>
                : <>No agents detected yet — install one below, or it'll fetch on first run.</>}
            </span>
          )}
          <button type="button" className="ob2-rescan" onClick={scan.rescan} disabled={scan.scanning}>
            ↻ Rescan
          </button>
        </div>
        <League isSelected={(id) => enabled.includes(id)} onPick={onToggle} lifecycle={lifecycle} scan={scan} />
      </div>
    </div>
  );
}
