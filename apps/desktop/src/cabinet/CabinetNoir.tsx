import { useMemo, useState } from "react";
import { isDarkExpert, type ExpertMap } from "../shared/experts";
import "./cabinet-noir.css";

// The Cabinet Noir — the hidden, black-&-gold chamber where the dark geniuses
// wait. They never appear in the roster, gallery, composer or cast (isActiveExpert
// excludes them); the ONLY way in is the secret seal (long-press the logo, or the
// midnight hour). Summoning one is talk-first: you don't get a launch sheet, you
// get a conversation — they speak first, provoke, and the deliverable stays sealed
// until the exchange earns it. So this surface just presents the five and hands
// off to a (dark-skinned) atelier session via onSummon.

// Short in-character voice lines (display flavour; the real opening comes from the
// persona itself when summoned).
const VOICE: Record<string, string> = {
  genius_machiavelli: "You don’t win by being loved — you win by being necessary. Show me the board.",
  genius_moriarty: "Your plan is elegant. That is precisely why it has three flaws.",
  genius_faust: "Caution is a debt you pay in regret. What is it you truly want?",
  genius_hannibal: "People never lie about what they desire. Let me listen.",
  genius_loki: "One truth well told outweighs ten naked facts. Give me the scene.",
};

// A gold-on-black crest, distinct from the app's azure crests — these figures
// have no presence anywhere else, so they get their own mark.
function darkCrest(seed: string) {
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  const k = x % 5;
  const g = "#d9b65c", g2 = "#8a7332", g3 = "#e7cd86";
  const sh = [
    `<circle cx="50" cy="50" r="25" fill="none" stroke="${g}" stroke-width="2"/><circle cx="50" cy="50" r="11" fill="${g2}"/><circle cx="50" cy="50" r="4" fill="${g3}"/>`,
    `<polygon points="50,24 72,42 64,70 36,70 28,42" fill="none" stroke="${g}" stroke-width="2"/><circle cx="50" cy="51" r="9" fill="${g2}"/>`,
    `<path d="M50 26 L70 50 L50 74 L30 50 Z" fill="none" stroke="${g}" stroke-width="2"/><path d="M50 38 L60 50 L50 62 L40 50 Z" fill="${g2}"/>`,
    `<path d="M30 52 Q50 22 70 52 Q50 78 30 52 Z" fill="none" stroke="${g}" stroke-width="2"/><circle cx="50" cy="52" r="6" fill="${g3}"/>`,
    `<circle cx="50" cy="50" r="24" fill="none" stroke="${g}" stroke-width="1.6" stroke-dasharray="3 4"/><polygon points="50,32 58,50 50,68 42,50" fill="${g2}"/>`,
  ][k];
  return `<svg viewBox="0 0 100 100"><defs><radialGradient id="dc${seed}" cx="50%" cy="38%"><stop offset="0" stop-color="#1b150a"/><stop offset="1" stop-color="#080603"/></radialGradient></defs><rect width="100" height="100" fill="url(#dc${seed})"/>${sh}</svg>`;
}

const EMBERS = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  dur: 8 + ((i * 13) % 9),
  delay: -((i * 7) % 12),
  big: i % 5 === 0,
}));

export function CabinetNoir({ experts, onSummon, onClose }: {
  experts: ExpertMap;
  onSummon: (slug: string) => void;
  onClose: () => void;
}) {
  const dark = useMemo(
    () => Object.keys(experts).filter((s) => isDarkExpert(experts[s])).map((slug) => ({ slug, e: experts[slug] })),
    [experts],
  );
  const [leaving, setLeaving] = useState(false);
  const close = () => { setLeaving(true); setTimeout(onClose, 400); };

  return (
    <div className={"cnoir" + (leaving ? " leaving" : "")} role="dialog" aria-label="Cabinet Noir" onKeyDown={(e) => e.key === "Escape" && close()} tabIndex={-1}>
      <div className="cnoir-embers" aria-hidden="true">
        {EMBERS.map((m, i) => (
          <span key={i} className={"cnoir-ember" + (m.big ? " big" : "")}
            style={{ left: m.left + "%", animationDuration: m.dur + "s", animationDelay: m.delay + "s" }} />
        ))}
      </div>

      <button className="cnoir-x" onClick={close} title="Close the cabinet (Esc)">✕</button>

      <div className="cnoir-head">
        <div className="cnoir-eyebrow">the dark geniuses</div>
        <h1>The ones you summon only last.</h1>
        <p>Clarity without comfort. You call on them when you need a mind that spares nothing.
          They appear on no roster — they speak first, and deliver only once the scene is played.</p>
      </div>

      <div className="cnoir-roster">
        {dark.map(({ slug, e }, i) => (
          <button key={slug} className="cnoir-dg" style={{ animationDelay: 0.12 + i * 0.08 + "s" }}
            onClick={() => onSummon(slug)} title={`Summon ${e.label}`}>
            <span className="cnoir-aura" aria-hidden="true" />
            <span className="cnoir-crest" aria-hidden="true" dangerouslySetInnerHTML={{ __html: darkCrest(e.label) }} />
            <span className="cnoir-name">{e.label}</span>
            <span className="cnoir-role">{e.role ?? e.kind}</span>
            <span className="cnoir-craft">{e.blurb}</span>
            {VOICE[slug] && <span className="cnoir-voice">“{VOICE[slug]}”</span>}
            <span className="cnoir-summon">⚜ speak with them →</span>
          </button>
        ))}
      </div>

      <div className="cnoir-foot">
        <span className="cnoir-note">{dark.length} dark geniuses · unseen in the roster · sealed</span>
        <span className="cnoir-seal-line">“What is said here never leaves this room.”</span>
      </div>
    </div>
  );
}
