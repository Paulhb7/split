import { useEffect, useRef, useState } from "react";
import { Preview } from "../conversation/DeliverableExamples";

// The pull-to-fullscreen invitation, shown in the home bar. The small floating
// bar is just a doorway; the *atelier* (fullscreen) is the studio — the roster,
// the live team, the wall of work. Users were under-pushed toward it, so this
// strip makes the door inviting: a faint breathing aura ("it wants to expand"),
// a peek of the work waiting inside, and — after the user lingers idle ~6s — a
// single soft emphasis pulse. Aspirational, not a nag: it pulses once, then
// settles, and resets the moment the user starts typing again.

const PEEK = ["deck", "scene", "site", "board", "track"];

export function AtelierInvite({ onEnter, idleSignal }: { onEnter: () => void; idleSignal: string }) {
  const [nudge, setNudge] = useState(false);
  const idleT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const offT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Restart the idle clock whenever the user does something (idleSignal = the
  // composer value). After 6s of stillness, pulse once for ~2.2s, then settle.
  useEffect(() => {
    setNudge(false);
    clearTimeout(idleT.current);
    clearTimeout(offT.current);
    idleT.current = setTimeout(() => {
      setNudge(true);
      offT.current = setTimeout(() => setNudge(false), 2200);
    }, 6000);
    return () => { clearTimeout(idleT.current); clearTimeout(offT.current); };
  }, [idleSignal]);

  return (
    <button
      className={"atelier-invite" + (nudge ? " nudge" : "")}
      onClick={onEnter}
      title="Enter the atelier — your studio, full-screen"
    >
      <span className="ai-glow" aria-hidden="true" />
      <span className="ai-main">
        <span className="ai-title">Enter the atelier <span className="ai-arrow" aria-hidden="true">⤢</span></span>
        <span className="ai-sub">Your studio, full-screen — watch the team work and browse everything they've made.</span>
      </span>
      <span className="ai-peek" aria-hidden="true">
        {PEEK.map((t, i) => (
          <span key={t} className="ai-thumb" style={{ animationDelay: `${i * 0.7}s` }}>
            <Preview type={t} fit="slice" />
          </span>
        ))}
      </span>
    </button>
  );
}
