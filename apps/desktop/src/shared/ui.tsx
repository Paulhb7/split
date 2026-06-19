// Shared presentational bits used by both the app and the onboarding.
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HARNESSES, H, logoUrl, brandOf } from "./harnesses";
import { type HarnessStateMap } from "./useHarnessStates";
import { healthOf, type ScanAPI, type Health } from "./useHarnessScan";
import { ModelPickerPanel } from "./ModelPickerPanel";
import { SubscriptionModelPicker } from "./SubscriptionModelPicker";
import { SUBSCRIPTION_PICKERS, loadSubConfig } from "./model-picker";

export const vars = (o: Record<string, string | number>) => o as React.CSSProperties;

// `themed` keeps the logo shape (so you still recognise which harness it is)
// but lets the colour fall through to the skin's `--brand` instead of the
// harness's own brand colour. Used by single-harness contexts (chrome bar,
// session row, conversation head, stage, composer) where the harness is
// already named in text beside the mark, so the colour isn't carrying ID
// info — the surface reads more cohesive when the tile tracks the theme.
// Multi-harness contexts (League grid, onboarding carousels) leave `themed`
// off so each agent keeps its own accent.
export function Logo({ id, size = 18, themed = false }: { id: string; size?: number; themed?: boolean }) {
  const style = themed
    ? vars({ "--logo": logoUrl(id), "--s": `${size}px` })
    : vars({ "--logo": logoUrl(id), "--brand": brandOf(id), "--s": `${size}px` });
  return <span className="logo" style={style} />;
}

export function Tile({ id, size = 44, themed = false }: { id: string; size?: number; themed?: boolean }) {
  const style = themed
    ? vars({ "--t": `${size}px` })
    : vars({ "--brand": brandOf(id), "--t": `${size}px` });
  return (
    <span className="tile" style={style}>
      <Logo id={id} size={size - 20} themed={themed} />
    </span>
  );
}

// Lifecycle is opt-in: pass it from a manage-agents view to surface Install /
// Configure controls and a status pastille. Onboarding leaves it undefined so
// the card stays minimal — pickers shouldn't double as installers.
export interface LifecycleAPI {
  states: HarnessStateMap;
  progress: Record<string, string>;
  refresh: () => void;
}

// Trim a model id for the at-a-glance summary line (drop provider prefix, cap).
function shortModel(id: string): string {
  const s = id.includes("/") ? id.split("/").pop() ?? id : id;
  return s.length > 24 ? s.slice(0, 23) + "…" : s;
}

function EngineCard({
  id,
  selected,
  onPick,
  lifecycle,
  scan,
}: {
  id: string;
  selected: boolean;
  onPick: (id: string) => void;
  lifecycle?: LifecycleAPI;
  scan?: ScanAPI;
}) {
  const h = H[id];
  const state = lifecycle?.states[id];
  const progress = lifecycle?.progress[id];
  const detected = scan?.byId[id];
  const health: Health | null = scan ? healthOf(detected, scan.scanning) : null;
  const [open, setOpen] = useState(false);
  const [keyVal, setKeyVal] = useState("");
  const [busy, setBusy] = useState(false);

  // What the expand can configure: a subscription model picker (Claude/Codex/
  // Gemini), the local/cloud model picker (Hermes/OpenCode), or a raw API key
  // (Qwen/Vibe). Drives whether a configure chevron is offered at all.
  const cfgKind = state?.configure.kind;
  const hasSub = !!SUBSCRIPTION_PICKERS[id];
  const hasModelPicker = cfgKind === "model-picker";
  const isApiKey = cfgKind === "api-key";
  const configurable = hasSub || hasModelPicker || isApiKey;

  const savedModel = hasSub ? loadSubConfig(id)?.model : undefined;
  const effModel = savedModel ?? (hasSub ? SUBSCRIPTION_PICKERS[id]?.models[0]?.id : undefined);
  const version = detected?.version;

  // Right-side affordance follows scan health ("one shape, three
  // answers"); fall back to lifecycle state when there's no scan context.
  const installReady = state ? state.install.state === "ready" : true;
  const authReady = state ? state.configure.state === "ready" : true;
  const eff: Health = health ?? (!installReady ? "needs-install" : !authReady ? "needs-auth" : "ready");

  async function onInstall(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try { await invoke<string>("install_harness", { id }); }
    catch (err) { console.error("install_harness failed", err); }
    finally { setBusy(false); }
  }
  async function onSignin(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try { await invoke<string>("configure_harness", { id }); lifecycle?.refresh(); }
    catch (err) { console.error("configure_harness failed", err); }
    finally { setBusy(false); }
  }
  async function onSaveKey(e: React.MouseEvent) {
    e.stopPropagation();
    if (!state?.configure.key) return;
    setBusy(true);
    try {
      await invoke("save_api_key", { name: state.configure.key, value: keyVal });
      setOpen(false);
      setKeyVal("");
      lifecycle?.refresh();
    } catch (err) {
      console.error("save_api_key failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={"ecard" + (h.reserve ? " reserve" : "") + (selected ? " sel" : "") + (open ? " open" : "") + " sc-" + eff}
      style={vars({ "--brand": h.brand })}
    >
      {/* summary row — click selects (enable); the side controls stop propagation */}
      <div className="ecard-sum" role="button" tabIndex={0} onClick={() => onPick(id)}>
        <span className="check" />
        <Tile id={id} size={30} />
        <div className="ecard-idb">
          <div className="ecard-nmrow">
            <span className="ec-nm">{h.label}</span>
            <span className="ec-vd">· {h.vendor}</span>
          </div>
          <div className="ecard-sub">
            {version ? <span className="ec-ver">{version}</span> : <span className="ec-ver dimer">{h.tag}</span>}
            {configurable && <> · <span className="ec-mut">model</span> {effModel ? shortModel(effModel) : "Default"}</>}
          </div>
        </div>
        {lifecycle && (
          <div className="ecard-side" onClick={(e) => e.stopPropagation()}>
            {progress && <span className="ec-progress">{progress}</span>}
            {eff === "needs-install" && (
              <button className="ec-act" disabled={busy} onClick={onInstall}>
                {state?.install.kind === "external" ? "Get app" : "Install"}
              </button>
            )}
            {eff === "needs-auth" && (
              <button className="ec-act" disabled={busy} onClick={onSignin}>Sign in</button>
            )}
            {eff === "scanning" && <span className="ec-scan">scanning…</span>}
            {eff === "ready" && configurable && (
              <button className="ec-chev" aria-label="Configure model" onClick={() => setOpen((o) => !o)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            )}
            {eff === "ready" && !configurable && <span className="ec-ok">✓</span>}
          </div>
        )}
      </div>

      {open && configurable && (
        <div className="ecard-cfg" onClick={(e) => e.stopPropagation()}>
          {hasSub && (
            <SubscriptionModelPicker harnessId={id} onClose={() => { setOpen(false); lifecycle?.refresh(); }} />
          )}
          {hasModelPicker && (
            <ModelPickerPanel harnessId={id} onClose={() => { setOpen(false); lifecycle?.refresh(); }} />
          )}
          {isApiKey && (
            <div className="ec-keyform">
              <label>{state?.configure.key}</label>
              <input
                type="password"
                placeholder="paste your key…"
                value={keyVal}
                onChange={(e) => setKeyVal(e.target.value)}
                autoFocus
              />
              <div className="cfg-acts">
                <button className="card-act" onClick={() => { setOpen(false); setKeyVal(""); }}>cancel</button>
                <button className="card-act ok" disabled={busy || !keyVal} onClick={onSaveKey}>save</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// `isSelected` is a predicate so the league works for single-pick or multi-select.
// `scan` is opt-in: pass it from the onboarding wizard to surface per-card
// machine-scan health badges (installed / signed-in / needs-install / needs-auth).
export function League({
  isSelected,
  onPick,
  lifecycle,
  scan,
}: {
  isSelected: (id: string) => boolean;
  onPick: (id: string) => void;
  lifecycle?: LifecycleAPI;
  scan?: ScanAPI;
}) {
  return (
    <>
      <div className="lane">☁ Cloud · your subscriptions</div>
      <div className="ecard-list">
        {HARNESSES.filter((h) => h.lane === "cloud").map((h) => (
          <EngineCard key={h.id} id={h.id} selected={isSelected(h.id)} onPick={onPick} lifecycle={lifecycle} scan={scan} />
        ))}
      </div>
      <div className="lane">🖥 On-device · your machine</div>
      <div className="ecard-list">
        {HARNESSES.filter((h) => h.lane === "local").map((h) => (
          <EngineCard key={h.id} id={h.id} selected={isSelected(h.id)} onPick={onPick} lifecycle={lifecycle} scan={scan} />
        ))}
      </div>
    </>
  );
}
