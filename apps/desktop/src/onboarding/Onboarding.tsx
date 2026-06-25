import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { H } from "../shared/harnesses";
import { League, vars } from "../shared/ui";
import { useHarnessStates } from "../shared/useHarnessStates";
import { useHarnessScan, rankHarnesses, healthOf } from "../shared/useHarnessScan";
import { useExperts } from "../shared/util";
import { SKINS, type Skin } from "../shared/skins";
import SplitMark from "../shared/SplitMark";
import majordomeUrl from "../shared/majordome.svg";
import { WorkGalleryPage, type FirstBrief } from "./WorkGalleryPage";
import { CastSpread } from "./CastSpread";
import "./onboarding.css";
import "./finalstretch.css";

// "open_gallery" → finish onboarding and land on the in-app work Gallery
// (the cast page's "See the complete gallery" button).
export type EnterIntent = "brief_expert" | "start_recruiter" | "open_gallery" | undefined;

export default function Onboarding({
  onEnter,
  skin,
  onPickSkin,
}: {
  onEnter: (ids: string[], intent?: EnterIntent, expertSlug?: string, prompt?: string) => void;
  skin: Skin;
  onPickSkin: (s: Skin) => void;
}) {
  const [page, setPage] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  // The first brief, pinned on the gallery page (page 4) and launched by page
  // 5's "Enter Split". Editable; null = nothing chosen (just enter).
  const [pinned, setPinned] = useState<FirstBrief | null>(null);
  // The boss's vault location (page 3). Seeded from the Rust default
  // (`~/Documents/SplitVault`), overridable via a native folder picker.
  const [vaultPath, setVaultPath] = useState<string>("");
  useEffect(() => {
    invoke<string>("get_vault_root").then(setVaultPath).catch(() => {});
  }, []);
  const chooseVault = async () => {
    const parentHint = vaultPath.slice(0, vaultPath.lastIndexOf("/")) || undefined;
    const picked = await openDialog({ directory: true, multiple: false, defaultPath: parentHint });
    if (!picked || Array.isArray(picked)) return;
    try {
      setVaultPath(await invoke<string>("set_vault_root", { parent: picked }));
    } catch {
      /* keep the previous path on failure */
    }
  };
  const lifecycle = useHarnessStates();
  const scan = useHarnessScan();
  const experts = useExperts();

  // Ranked best-first by machine-scan health (installed+signed-in wins).
  const ranked = useMemo(
    () => rankHarnesses(scan.byId, scan.scanning),
    [scan.byId, scan.scanning],
  );
  const recommended = ranked[0] ?? "claude";

  // Auto-select the best detected agent(s) once the scan settles — but never
  // overwrite an explicit choice (the anti-race guard). `touched` flips on the
  // first manual toggle.
  const [touched, setTouched] = useState(false);
  const seededRef = useRef(false);
  useEffect(() => {
    if (touched || scan.scanning || seededRef.current) return;
    seededRef.current = true;
    const ready = ranked.filter((id) => healthOf(scan.byId[id], false) === "ready");
    setPicks(ready.length ? ready : [recommended]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.scanning]);

  // The active engine = the user's first explicit pick, else best-detected. It
  // tints engine-specific surfaces via `--engine` (never `--brand`, which stays
  // owned by the skin so CTAs keep tracking the skin choice).
  const engineId = picks[0] ?? recommended;
  const accent = H[engineId].brand;
  const engineStyle = vars({ "--engine": accent });
  // 6 pages: welcome (0) · theme (1) · pick (2) · vault (3) · gallery (4) · cast (5).
  // Page 2 = picker; can't advance until at least one agent is selected.
  const canNext = page !== 2 || picks.length > 0;
  const toggle = (id: string) => {
    setTouched(true);
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  // How many CLIs the scan actually found on this machine (scanline copy).
  const foundCount = Object.values(scan.byId).filter((d) => d.available).length;

  return (
    <div className="ob2" style={engineStyle}>
      <div className="ob2-page" key={page}>
        {page === 0 && (
          // The threshold: the majordome watches over in filigree — large, crisp
          // (a mask), bleeding off the bottom-right so copy never lands on his
          // face, inked in `--text` at low opacity so it reads on dark + light.
          <div className="ob2-welcome">
            <svg className="ob2-welcome-fil" viewBox="388 110 249 348" aria-hidden="true">
              <defs>
                <mask id="welcomeMask">
                  <image href={majordomeUrl} x="0" y="0" width="1024" height="544" />
                </mask>
              </defs>
              <rect className="ob2-welcome-fil-ink" x="388" y="110" width="249" height="348" mask="url(#welcomeMask)" />
            </svg>
            <div className="ob2-welcome-text stagger">
              <h1 className="ob2-welcome-h1">Welcome to <em>Split</em>.</h1>
              <p className="ob2-welcome-sub">I am your <b>Majordome</b>.</p>
              <p className="ob2-welcome-seed">A roster of experts, each in its own session — briefed by you, run on the brain of your choice.</p>
            </div>
          </div>
        )}

        {page === 1 && (
          <div className="ob2-hero">
            <div className="ob2-hero-text stagger">
              <div className="ob-eyebrow">first, the room · 01</div>
              <h1 className="ob2-h1">Pick your <em>skin</em>.</h1>
              <p className="ob2-lede">
                Split is a place you'll come back to often. Choose how it should feel —
                you can switch any time from the chrome bar.
              </p>
              <p className="ob2-seed">Live preview — it applies as you click.</p>
              <div className="ob2-skin-stage">
                <div className="split-levitate">
                  <SplitMark size={180} />
                </div>
                <div className="split-shadow" aria-hidden="true" />
              </div>
            </div>
            <div className="ob2-hero-visual">
              <div className="ob2-skins">
                {SKINS.filter((s) => !s.hidden && !s.night).map((s) => (
                  <button
                    key={s.id || "classic"}
                    className={"ob2-skin" + (skin === s.id ? " on" : "")}
                    onClick={() => onPickSkin(s.id)}
                    type="button"
                  >
                    <span
                      className="ob2-skin-sw"
                      style={{
                        background: `linear-gradient(135deg, ${s.sw[0]} 0%, ${s.sw[0]} 50%, ${s.sw[1]} 50%, ${s.sw[1]} 100%)`,
                        boxShadow: `inset 0 0 0 2px ${s.sw[2]}`,
                      }}
                    />
                    <span className="ob2-skin-meta">
                      <b>{s.label}</b>
                      <small>{s.hint}</small>
                    </span>
                    {skin === s.id && <span className="ob2-skin-tick">●</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 2 && (
          <div className="stagger">
            <div className="ob-eyebrow">pick your agents · 02</div>
            <h2 className="ob2-h2">Pick your <em>agents</em></h2>
            <div className="ob2-scanline">
              {scan.scanning ? (
                <span className="ob2-scanstat scanning">
                  <span className="ob2-scandot" aria-hidden="true" />
                  Scanning your machine for installed agents…
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

            <div className="ob2-pickhint">The ones you have access to — Split shows only these; add more anytime. {picks.length > 0 && <b>{picks.length} selected</b>}</div>
            <League isSelected={(id) => picks.includes(id)} onPick={toggle} lifecycle={lifecycle} scan={scan} />
          </div>
        )}

        {page === 3 && (
          <div className="stagger">
            <div className="ob-eyebrow">where your work is kept · 03</div>
            <h2 className="ob2-h2">Your <em>vault</em></h2>
            <p className="ob2-lede" style={{ marginBottom: 20 }}>
              A plain folder of Markdown where your experts file durable work and
              facts — notes, briefs, projects. Split creates a <b>SplitVault</b>
              {" "}folder for it — choose where that folder should live. It opens in
              any editor and syncs with iCloud/Dropbox if its location does.
            </p>
            <div className="ob2-vault">
              <div className="ob2-vault-card">
                <span className="ob2-vault-ic" aria-hidden="true">🗃️</span>
                <div className="ob2-vault-meta">
                  <div className="ob2-vault-cap">Vault location</div>
                  <div className="ob2-vault-path" title={vaultPath}>{vaultPath || "…"}</div>
                </div>
                <button type="button" className="btn ghost ob2-vault-pick" onClick={chooseVault}>
                  Choose location…
                </button>
              </div>
              <p className="ob2-seed">The default (in your Documents) is fine for most — Split creates the folder on your first session, and you can move it later from the vault view.</p>
            </div>
          </div>
        )}

        {page === 4 && (
          // The wow + the activation: a wall of the studio's WORK. Pick a piece
          // → it pins as your first brief (editable); page 5 launches it.
          <div className="ob-finalpage">
            <div className="stagger">
              <div className="ob-eyebrow">what your studio makes · 04</div>
              <h2 className="ob2-h2">Pick something to <em>make</em>.</h2>
              <p className="ob2-lede" style={{ marginBottom: 14 }}>
                Not a roster of faces — a wall of finished work. Choose an outcome you want;
                the maker starts on it the moment you enter.
              </p>
            </div>
            <WorkGalleryPage experts={experts} pinned={pinned} onPin={setPinned} />
          </div>
        )}

        {page === 5 && (
          // The reveal: who makes all that. An editorial spread, not a picker.
          <CastSpread experts={experts} onHireRecruiter={() => onEnter(picks, "start_recruiter")} />
        )}
      </div>

      <div className="ob2-foot">
        <div className="dots">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <button key={i} className={"dot2" + (i === page ? " on" : "")} onClick={() => setPage(i)} aria-label={`page ${i + 1}`} />
          ))}
        </div>
        <div className="ob2-actions">
          {page > 0 && <button className="btn ghost" onClick={() => setPage((p) => p - 1)}>← back</button>}
          {page < 5 ? (
            <button
              className="btn"
              disabled={!canNext}
              title={!canNext ? "Pick at least one agent to continue" : undefined}
              onClick={() => setPage((p) => p + 1)}
            >
              {page === 2 ? "Continue →" : page === 4 ? "Next — meet the cast →" : "Next →"}
            </button>
          ) : (
            <>
              <button className="btn ghost" onClick={() => onEnter(picks, "open_gallery")}>See the complete gallery</button>
              <button
                className="btn"
                onClick={() => onEnter(picks, pinned ? "brief_expert" : undefined, pinned?.slug, pinned?.prompt)}
              >
                Enter Split →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
