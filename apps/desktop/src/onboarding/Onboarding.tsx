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
import { MajordomeOrbit } from "../home/MajordomeOrbit";
import { CastSpread } from "./CastSpread";
import { OnboardingDemo } from "./OnboardingDemo";
import "./onboarding.css";
import "./finalstretch.css";

// "open_gallery" → finish onboarding and land on the in-app work Gallery
// (the cast page's "See the complete gallery" button).
export type EnterIntent = "start_recruiter" | "open_gallery" | undefined;

export default function Onboarding({
  onEnter,
  skin,
  onPickSkin,
  team,
  onToggleHire,
}: {
  onEnter: (ids: string[], intent?: EnterIntent, expertSlug?: string) => void;
  skin: Skin;
  onPickSkin: (s: Skin) => void;
  /** The hired team (shared/team.ts) — favourited experts pinned to the rail. */
  team: string[];
  onToggleHire: (slug: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
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
  // 6 pages: welcome (0) · theme (1) · pick (2) · vault (3) · demo (4) · hire team (5).
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
          // The threshold: the majordome is "loaded" at the centre — the one
          // runtime — with the agent engines (Claude, Codex, Gemini…) orbiting
          // him in a slow ring. The welcome copy sits below the orbit.
          <div className="ob2-welcome">
            <div className="ob2-welcome-orbit">
              <MajordomeOrbit active="" diameter="clamp(340px, 42vw, 500px)" coreSize={150} />
            </div>
            <div className="ob2-welcome-text stagger">
              <h1 className="ob2-welcome-h1">Welcome to <em>Split</em>.</h1>
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
          <div className="stagger ob2-center">
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
          // The walkthrough: a fictitious cursor drives a miniature atelier so a
          // first-launch user *sees* the core loop — pick an expert, brief them,
          // watch them work, a deliverable lands — before configuring anything.
          <div className="stagger ob2-center">
            <div className="ob-eyebrow">how it works · 04</div>
            <h2 className="ob2-h2">See it <em>in action</em></h2>
            <p className="ob2-lede" style={{ marginBottom: 18 }}>
              Pick an expert from the rail, brief them in plain words, and they get to
              work — filing the deliverable in your vault. Here's the whole loop.
            </p>
            <OnboardingDemo />
          </div>
        )}

        {page === 5 && (
          // The activation: hire your team. The roster index is now a picker —
          // ★ an expert to pin it to your atelier rail. A starter team is
          // pre-hired so no one enters with an empty rail.
          <CastSpread
            experts={experts}
            team={team}
            onToggleHire={onToggleHire}
            onHireRecruiter={() => onEnter(picks, "start_recruiter")}
          />
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
              {page === 2 ? "Continue →" : page === 4 ? "Next — hire your team →" : "Next →"}
            </button>
          ) : (
            <>
              <button className="btn ghost" onClick={() => onEnter(picks, "open_gallery")}>See the complete gallery</button>
              <button className="btn" onClick={() => onEnter(picks)}>
                Enter Split → {team.length > 0 && <span className="ob2-team-ct">{team.length} hired</span>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
