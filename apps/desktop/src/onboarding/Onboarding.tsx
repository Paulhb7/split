import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { H, HARNESSES } from "../shared/harnesses";
import { League, vars } from "../shared/ui";
import { useHarnessStates } from "../shared/useHarnessStates";
import { useHarnessScan, rankHarnesses, healthOf } from "../shared/useHarnessScan";
import { useExperts } from "../shared/util";
import { isActiveExpert } from "../shared/experts";
import { SKINS, type Skin } from "../shared/skins";
import { RollCall } from "./RollCall";
import { CastSpread } from "./CastSpread";
import { Cinema } from "./Cinema";
import "./onboarding.css";
import "./finalstretch.css";

// "open_gallery" → finish onboarding and land on the in-app work Gallery
// (the cast page's "See the complete gallery" button).
export type EnterIntent = "start_recruiter" | "open_gallery" | undefined;

type SkinDef = (typeof SKINS)[number];

// The mocked Split window each skin paints itself into (page 1 miniatures +
// the enlarged preview). Entirely self-contained: four inline custom props
// (--m0 base, --m1 panel, --ma accent, --mt text ink) drive every surface.
function SkinMini({ s }: { s: SkinDef }) {
  const mt = s.dark ? "#efeee9" : "#171922";
  return (
    <div className="mini" style={vars({ "--m0": s.sw[0], "--m1": s.sw[1], "--ma": s.sw[2], "--mt": mt })} aria-hidden="true">
      <div className="mtb">
        <i className="tl r" /><i className="tl y" /><i className="tl g" />
        <span className="mwm">Split</span>
        <span className="mpin" />
      </div>
      <div className="mbody">
        <div className="mrail"><b className="on" /><b /><b /><b className="dm" /></div>
        <div className="mthread">
          <span className="mline" style={{ width: "54%" }} />
          <span className="mline" style={{ width: "80%" }} />
          <span className="mline acc" style={{ width: "34%" }} />
          <div className="mcard">
            <span className="mline" style={{ width: "62%" }} />
            <span className="mline" style={{ width: "40%" }} />
          </div>
          <div className="mcomposer"><span className="mline" style={{ width: "40%" }} /><i className="msend" /></div>
        </div>
      </div>
    </div>
  );
}

// Page-3 tree glyphs (hairline strokes, currentColor).
const FolderIc = () => (
  <svg className="tico" viewBox="0 0 16 16"><path d="M1.9 5.1c0-.8.65-1.45 1.45-1.45h2.9l1.5 1.7h4.9c.8 0 1.45.65 1.45 1.45v4.9c0 .8-.65 1.45-1.45 1.45H3.35c-.8 0-1.45-.65-1.45-1.45z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
const FileIc = () => (
  <svg className="tico" viewBox="0 0 16 16"><path d="M3.9 1.9h5.2l3 3.1v9.1H3.9z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M9.1 1.9v3.1h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
);
const IndexIc = () => (
  <svg className="tico" viewBox="0 0 16 16"><path d="M3.9 1.9h5.2l3 3.1v9.1H3.9z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M9.1 1.9v3.1h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 8.2h4M6 10.7h4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
);
const VaultIc = () => (
  <svg viewBox="0 0 20 20"><rect x="2.7" y="3" width="14.6" height="4.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M4.1 7.4v7.4c0 1 .8 1.8 1.8 1.8h8.2c1 0 1.8-.8 1.8-1.8V7.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M8 10.8h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
);

// A tree row: <TR d={n} kind="file" name="brief" ext an="…" />
function TR({ d, kind, name, ext, an }: { d: number; kind: "dir" | "file" | "idx"; name: string; ext?: boolean; an?: string }) {
  return (
    <div className={"trow " + (kind === "dir" ? "dir" : kind === "idx" ? "file idx" : "file")} style={vars({ "--d": d })}>
      {kind === "dir" ? <FolderIc /> : kind === "idx" ? <IndexIc /> : <FileIc />}
      <span className="tnm">{name}{ext !== false && kind !== "dir" && <span className="ext">.md</span>}</span>
      {an && <span className="tan">{an}</span>}
    </div>
  );
}

// Shorten the home prefix and bold the vault folder name for the tree header.
function prettyVaultPath(p: string) {
  const short = p.replace(/^\/Users\/[^/]+/, "~");
  const cut = Math.max(short.lastIndexOf("/"), short.lastIndexOf("\\"));
  if (cut < 0) return <b>{short}</b>;
  return <>{short.slice(0, cut + 1)}<b>{short.slice(cut + 1)}</b></>;
}

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
  const defaultVaultRef = useRef<string>("");
  useEffect(() => {
    invoke<string>("get_vault_root").then((p) => {
      setVaultPath(p);
      if (!defaultVaultRef.current) defaultVaultRef.current = p;
    }).catch(() => {});
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
  const useDefaultVault = async () => {
    const def = defaultVaultRef.current;
    if (!def || def === vaultPath) return;
    const cut = Math.max(def.lastIndexOf("/"), def.lastIndexOf("\\"));
    const parent = cut > 0 ? def.slice(0, cut) : "";
    if (!parent) return;
    try {
      setVaultPath(await invoke<string>("set_vault_root", { parent }));
    } catch {
      /* keep the previous path on failure */
    }
  };
  const lifecycle = useHarnessStates();
  const scan = useHarnessScan();
  const experts = useExperts();
  // Socrates is the recruiter, not a hireable expert — excluded so the p0
  // count matches page 5's "N experts. Hire your team." roster total.
  const expertCount = useMemo(
    () => Object.keys(experts).filter((s) => s !== "genius_socrates" && isActiveExpert(experts, s)).length,
    [experts],
  );

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
  // 6 pages: welcome (0) · skin (1) · pick (2) · second brain (3) · demo (4) · hire team (5).
  // Page 2 = picker; can't advance until at least one agent is selected.
  const canNext = page !== 2 || picks.length > 0;
  const toggle = (id: string) => {
    setTouched(true);
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  // How many CLIs the scan actually found on this machine (scanline copy).
  const foundCount = Object.values(scan.byId).filter((d) => d.available).length;
  // The skeleton only covers the FIRST scan — rescan() empties byId on every
  // pass (incl. focus-triggered ones), so latch on the first completion
  // instead of inferring "first" from an empty byId.
  const [scanSettled, setScanSettled] = useState(false);
  const sawScanRef = useRef(false);
  useEffect(() => {
    if (scan.scanning) sawScanRef.current = true;
    else if (sawScanRef.current) setScanSettled(true);
  }, [scan.scanning]);
  const firstScan = scan.scanning && !scanSettled;

  const visibleSkins = SKINS.filter((s) => !s.hidden && !s.night);
  const selSkin = SKINS.find((s) => s.id === skin) ?? visibleSkins[0];

  return (
    <div className="ob2" style={engineStyle}>
      <div className="ob2-page" key={page}>
        {page === 0 && (
          // The threshold — the Roll Call: the whole roster streams up in two
          // mono columns while the welcome holds centre stage behind an ink
          // scrim. Counts come from the live registries, not copy.
          <div className="ob2-p0">
            <RollCall experts={experts} />
            <div className="p0-mid">
              <div className="p0-stage stagger">
                <div className="ob-eyebrow">now in residence</div>
                <h1 className="p0-h1">Welcome to <em>Split</em>.</h1>
                <p className="p0-lede">
                  One runtime. A roster of experts —<br />
                  each running on the <b>agent you already have</b>.
                </p>
                <div className="p0-count">
                  <b>{expertCount}</b> experts <i /> <b>{HARNESSES.length}</b> engines <i /> one window
                </div>
              </div>
            </div>
          </div>
        )}

        {page === 1 && (
          // The Miniatures: nine tiny mocked Split windows, each painted in its
          // skin; the selection enlarges on the left. Picking applies the skin
          // live — the whole app repaints as you click.
          <div className="ob2-p1">
            <div className="p1-left stagger">
              <div className="ob-eyebrow">first, the room · 01</div>
              <h1 className="p1-h">Pick your <em>skin</em>.</h1>
              <p className="ob2-lede">
                Split is a place you'll come back to often. Choose how it should feel —
                you can switch any time from the chrome bar.
              </p>
              <p className="p1-seed">live preview — it applies as you click</p>
              <div className="p1-big" key={selSkin.id || "classic"}>
                <div className="bb-prevwrap"><SkinMini s={selSkin} /></div>
                <div className="bb-meta">
                  <div className="bb-name">{selSkin.label} <span className="ptag">{selSkin.dark ? "dark" : "light"} room</span></div>
                  <div className="bb-hint">{selSkin.hint}</div>
                </div>
              </div>
            </div>
            <div className="p1-right">
              <div className="p1-grid" role="listbox" aria-label="skins">
                {visibleSkins.map((s) => (
                  <button
                    key={s.id || "classic"}
                    type="button"
                    role="option"
                    aria-selected={skin === s.id}
                    className={"thumb" + (skin === s.id ? " on" : "")}
                    onClick={() => onPickSkin(s.id)}
                  >
                    <SkinMini s={s} />
                    <span className="tick">
                      <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <span className="tlbl">
                      <span
                        className="tsw"
                        style={{
                          background: `linear-gradient(135deg, ${s.sw[0]} 50%, ${s.sw[1]} 50%)`,
                          boxShadow: `inset 0 0 0 1px ${s.sw[2]}`,
                        }}
                      />
                      <b>{s.label}</b>
                      <small>{s.dark ? "dark" : "light"}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 2 && (
          <div className="ob2-p2 stagger">
            <div className="ob-eyebrow">pick your agents · 02</div>
            <h2 className="ob2-h2">Pick your <em>agents</em>.</h2>
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

            <div className="ob2-pickhint">
              Split will only show the agents you pick — add more anytime.
              {picks.length > 0 && <b>{picks.length} selected</b>}
            </div>
            {firstScan ? (
              <div className="ob2-skel" aria-hidden="true"><i /><i /><i /></div>
            ) : (
              <League isSelected={(id) => picks.includes(id)} onPick={toggle} lifecycle={lifecycle} scan={scan} recommendedId={recommended} />
            )}
          </div>
        )}

        {page === 3 && (
          // The Drawer, rebranded: "Your second brain" — the copy + location
          // picker on the left, a live-looking SplitVault file tree on the
          // right whose rows slide open one by one.
          <div className="ob2-p3 ob2-tex">
            <div className="p3-grid">
              <div className="stagger">
                <div className="ob-eyebrow">where your experts remember · 03</div>
                <h2 className="ob2-h2">Your <em>second brain</em>.</h2>
                <p className="ob2-lede p3-lede">
                  A plain folder of Markdown your experts keep for you — notes, briefs,
                  projects, and what they learn along the way. Split creates a{" "}
                  <b>SplitVault</b> folder; choose where it lives. Plain files — any
                  editor opens them, iCloud syncs them.
                </p>
                <div className="loc-card">
                  <span className="loc-ic" aria-hidden="true"><VaultIc /></span>
                  <div className="loc-meta">
                    <div className="loc-cap">Vault location</div>
                    <div className="loc-path" title={vaultPath}>{vaultPath || "…"}</div>
                  </div>
                  <button type="button" className="btn ghost sm" onClick={chooseVault}>Choose location…</button>
                </div>
                <div className="loc-alt">
                  <button type="button" className="linkbtn" onClick={useDefaultVault}>Use default</button>
                  <span>— Split creates the folder on your first session; move it later from the vault view.</span>
                </div>
              </div>
              <div>
                <div className="tree-panel">
                  <div className="tree-head">
                    <span className="tree-path" title={vaultPath}>{prettyVaultPath(vaultPath || "~/Documents/SplitVault")}</span>
                    <span className="tree-tag">plain markdown</span>
                  </div>
                  <div className="tree">
                    <TR d={0} kind="idx" name="INDEX" an="the scope list" />
                    <TR d={1} kind="dir" name="_meta/" />
                    <div className="branch">
                      <TR d={2} kind="file" name="boss-profile" an="facts about you" />
                    </div>
                    <TR d={3} kind="dir" name="notes/" an="default bucket" />
                    <div className="branch">
                      <TR d={4} kind="file" name="2026-06-30 — gtm-readout" />
                    </div>
                    <TR d={5} kind="dir" name="projects/" />
                    <div className="branch">
                      <TR d={6} kind="dir" name="acme-gtm/" />
                      <div className="branch">
                        <TR d={7} kind="file" name="MEMORY" an="project index" />
                        <TR d={8} kind="file" name="brief" />
                        <TR d={9} kind="file" name="pricing-model" />
                      </div>
                    </div>
                  </div>
                  <div className="tree-foot">Real files on disk — <b>no database, no lock-in</b>.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {page === 4 && (
          // The Cinema: a spotlit miniature atelier, a scripted cursor, a beat
          // rail — the whole loop (pick → brief → watch → deliver) plays out
          // before anything is configured.
          <div className="ob2-p4 ob2-tex">
            <div className="p4-head stagger">
              <div className="ob-eyebrow">how it works · 04</div>
              <h2 className="ob2-h2">See it <em className="it">in action</em>.</h2>
              <p className="ob2-lede">
                Pick an expert from the rail, brief them in plain words, and they get
                to work — filing the deliverable in your vault.
              </p>
            </div>
            <div className="p4-stagewrap stagger">
              <Cinema />
            </div>
          </div>
        )}

        {page === 5 && (
          // The activation: hire your team. Two candidate faces — the Spread
          // (framed editorial board) and the Cast (the chromeless app page) —
          // switchable top-right while the choice settles.
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
              {page === 0 ? "Begin →" : page === 2 ? "Continue →" : page === 4 ? "Next — hire your team →" : "Next →"}
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
