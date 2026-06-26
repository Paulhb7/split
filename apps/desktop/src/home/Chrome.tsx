import { useRef, useState } from "react";
import { SKINS, type Skin } from "../shared/skins";
import SplitMark from "../shared/SplitMark";

// The window chrome bar: the split mark (with the secret long-press into the
// Cabinet Noir), the live/meta status, the expand chevron, and the gallery /
// vault / ⋯ controls. Owns its own ephemeral UI state — the overflow menu and
// the seal long-press timer — so App doesn't carry them.
export function Chrome({
  running,
  meta,
  showExpandToggle,
  atelierMode,
  onToggleView,
  onOpenGallery,
  onOpenVault,
  onOpenNoir,
  onReplayOnboarding,
  onStartMove,
  skin,
  shownSkin,
  night,
  smallHours,
  onPickSkin,
  onNoirEgg,
  onCosmosEgg,
}: {
  running: boolean;
  meta: string;
  showExpandToggle: boolean;
  atelierMode: boolean;
  onToggleView: () => void;
  onOpenGallery: () => void;
  onOpenVault: () => void;
  onOpenNoir: () => void;
  onReplayOnboarding: () => void;
  onStartMove: () => void;
  skin: Skin;
  shownSkin: Skin;
  night: boolean;
  smallHours: boolean;
  onPickSkin: (s: Skin) => void;
  onNoirEgg: () => void;
  onCosmosEgg: () => void;
}) {
  const [moreMenu, setMoreMenu] = useState<false | "root" | "skins">(false);
  const noirHold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return (
    <div className="chrome" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("button, .wm-name, .wm-seal")) onStartMove(); }}>
      <span className={"wm" + (running ? " live" : "")}>
        {/* The mark is also the secret knock: hold it ~1.4s to break the seal
            and enter the Cabinet Noir. No tooltip — you know it, or you don't.
            Excluded from window-drag so the press lands. */}
        <span
          className="wm-seal"
          onPointerDown={() => { noirHold.current = setTimeout(onOpenNoir, 1400); }}
          onPointerUp={() => clearTimeout(noirHold.current)}
          onPointerLeave={() => clearTimeout(noirHold.current)}
        >
          <SplitMark size={22} />
        </span>
        {/* The wordmark is excluded from window-drag so its clicks land —
            5 quick ones flip the hidden Noir skin (see noirEgg). */}
        <span className="wm-name" onClick={onNoirEgg}>split</span>
        {/* The witching hour: between midnight and 1am a faint gold seal
            surfaces on its own — the cabinet's self-reveal. No tooltip. */}
        {smallHours && <button className="wm-seal-glint" onClick={onOpenNoir} aria-label="Cabinet Noir">⚜</button>}
      </span>
      {/* The night star — only in the sky from midnight, while the bar wears
          Minuit (and kept lit inside Cosmos so you can fly back). */}
      {((shownSkin === "minuit" && smallHours) || skin === "cosmos") && (
        <button className={"wm-star" + (skin === "cosmos" ? " in" : "")} onClick={onCosmosEgg} type="button">✦</button>
      )}
      <span className="chrome-meta">{meta}</span>
      <span className="spacer" />
      {/* The window SIZE is the mode — one chevron toggles it: ⊡ maximise →
          atelier, ⊟ shrink → the floating bar. Shown only when NO conversation
          is focused; inside a conversation the header's own chevron takes over. */}
      {showExpandToggle && (
        <button
          className={"iconbtn" + (atelierMode ? " on" : "")}
          onClick={onToggleView}
          title={atelierMode ? "Shrink — back to the bar" : "Expand — enter the fullscreen atelier"}
          aria-label={atelierMode ? "Collapse to the bar" : "Expand to the atelier"}
        >{atelierMode ? "⊟" : "⊡"}</button>
      )}
      <button className="iconbtn" onClick={onOpenGallery} title="The gallery — browse the work your studio makes" aria-label="Open the gallery">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </button>
      {/* History lives in the atelier rail's History tab now (one entry, no
          redundant chrome button) — see AtelierLeft + "Tout l'historique →". */}
      <button className="iconbtn" onClick={onOpenVault} title="Vault — everything your experts know & produce">🗃️</button>
      <div className="skin-wrap">
        <button className="iconbtn" onClick={() => setMoreMenu((v) => (v ? false : "root"))} title="More — skin, onboarding">⋯</button>
        {moreMenu && (
          <>
            <div className="skin-scrim" onClick={() => setMoreMenu(false)} />
            <div className="skin-menu" role="menu">
              {moreMenu === "root" ? (
                <>
                  <button className="more-item" onClick={() => setMoreMenu("skins")} role="menuitem">
                    <span className="more-ic">✿</span>
                    <span className="more-meta">
                      <b>Skin</b>
                      <small>{SKINS.find((s) => s.id === shownSkin)?.label ?? "Classic"}</small>
                    </span>
                    <span className="more-chev">▸</span>
                  </button>
                  <button className="more-item" onClick={() => { setMoreMenu(false); onOpenVault(); }} role="menuitem">
                    <span className="more-ic">🗃️</span>
                    <span className="more-meta">
                      <b>Vault</b>
                      <small>tout ce que tes experts savent</small>
                    </span>
                  </button>
                  <button className="more-item" onClick={() => { setMoreMenu(false); onReplayOnboarding(); }} role="menuitem">
                    <span className="more-ic">↻</span>
                    <span className="more-meta">
                      <b>Replay onboarding</b>
                      <small>the guided tour, from the top</small>
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <button className="more-item more-back" onClick={() => setMoreMenu("root")}>
                    <span className="more-ic">‹</span>
                    <span className="more-meta"><b>Skin</b></span>
                  </button>
                  {/* Hidden skins (Noir) only list while worn — so you can
                      leave; night skins (Minuit) only exist after dark. */}
                  {SKINS.filter((s) => (!s.hidden || skin === s.id) && (!s.night || night)).map((s) => (
                    <button key={s.id || "classic"} className={"skin-item" + (shownSkin === s.id ? " on" : "")} onClick={() => { setMoreMenu(false); onPickSkin(s.id); }} role="menuitem">
                      <span className="skin-sw" style={{ background: `linear-gradient(135deg, ${s.sw[0]} 0%, ${s.sw[0]} 50%, ${s.sw[1]} 50%, ${s.sw[1]} 100%)`, boxShadow: `inset 0 0 0 1.5px ${s.sw[2]}` }} />
                      <span className="skin-meta">
                        <b>{s.label}</b>
                        <small>{s.hint}</small>
                      </span>
                      {shownSkin === s.id && <span className="skin-tick">●</span>}
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
