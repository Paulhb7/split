// Shared presentational bits used by both the app and the onboarding.
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HARNESSES, H, logoUrl, brandOf } from "./harnesses";
import { type HarnessStateMap } from "./useHarnessStates";
import { healthOf, rankHarnesses, type ScanAPI, type Health } from "./useHarnessScan";
import { ModelPickerPanel } from "./ModelPickerPanel";
import { SUBSCRIPTION_PICKERS, loadSubConfig, saveSubConfig } from "./model-picker";

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

// Inline model field for the single-vendor subscription CLIs (Claude / Codex /
// Gemini): a compact <select> that autosaves the pick straight to disk via
// saveSubConfig — the same store harness_config::apply reads at spawn. Reasoning
// effort (Codex) is preserved from any prior save. Free-pinned ids stay
// selectable by seeding the saved value into the option list.
function InlineModel({ id }: { id: string }) {
  const picker = SUBSCRIPTION_PICKERS[id];
  const saved = loadSubConfig(id);
  const [model, setModel] = useState(saved?.model ?? picker?.models[0]?.id ?? "");
  if (!picker) return null;
  const reasoning = saved?.reasoning ?? picker.reasoning?.[2]?.id ?? "";
  const ids = Array.from(
    new Set([model, ...picker.models.map((m) => m.id)].filter(Boolean)),
  ) as string[];
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    setModel(v);
    await saveSubConfig(id, picker.reasoning ? { model: v, reasoning } : { model: v });
  }
  return (
    <label className="gc-mfield" onClick={stop} onPointerDown={stop}>
      <span className="gc-mlbl">model</span>
      <select value={model} onChange={onChange} onClick={stop} onPointerDown={stop}>
        {ids.map((mid) => {
          const known = picker.models.find((m) => m.id === mid);
          return <option key={mid} value={mid}>{known ? known.name : mid}</option>;
        })}
      </select>
    </label>
  );
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

  const version = detected?.version;

  // One health, three answers; fall back to lifecycle state with no scan.
  const installReady = state ? state.install.state === "ready" : true;
  const authReady = state ? state.configure.state === "ready" : true;
  const eff: Health = health ?? (!installReady ? "needs-install" : !authReady ? "needs-auth" : "ready");
  const authLabel = isApiKey ? "Add key" : hasModelPicker ? "Set up" : "Sign in";

  async function onInstall(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try { await invoke<string>("install_harness", { id }); }
    catch (err) { console.error("install_harness failed", err); }
    finally { setBusy(false); }
  }
  async function onSignin(e: React.MouseEvent) {
    e.stopPropagation();
    // Kinds whose "sign-in" is an inline form (paste an API key, pick a
    // local/cloud model), not a browser handoff: just open the expander.
    // Calling configure_harness for these returns metadata only — the click
    // would otherwise be a silent no-op (the symptom for Vibe/Qwen). NOTE: the
    // subscription CLIs (claude/codex/gemini) are `oauth`, not these — their
    // sign-in IS a browser handoff, so they fall through to configure_harness.
    if (isApiKey || hasModelPicker) {
      setOpen(true);
      return;
    }
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

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const pillText =
    eff === "ready" ? "ready" : eff === "needs-auth" ? "sign-in" : eff === "needs-install" ? "install" : "scanning";
  const pillCls =
    eff === "ready" ? "ready" : eff === "needs-auth" ? "auth" : eff === "needs-install" ? "inst" : "scan";

  return (
    <div
      className={"gcard" + (h.reserve ? " reserve" : "") + (selected ? " sel" : "") + (open ? " open" : "") + (open && hasModelPicker ? " modelopen" : "") + " sc-" + eff}
      style={vars({ "--brand": h.brand })}
      role="button"
      tabIndex={0}
      onClick={() => onPick(id)}
    >
      <div className="gc-head">
        <Tile id={id} size={30} />
        <div className="gc-idb">
          <div className="gc-nm">{h.label}</div>
          <div className="gc-sub">{h.vendor}{version ? " · " + version : " · " + h.tag}</div>
        </div>
        <span className={"gc-pill " + pillCls}><i />{pillText}</span>
      </div>

      {lifecycle && (
        <div className="gc-ctl" onClick={stop}>
          <div className="gc-life">
            {progress && <span className="gc-seg" style={{ color: "var(--brand)" }}>{progress}</span>}
            <span className="gc-seg">install{" "}
              {installReady
                ? <span className="gc-ok"><CheckMark /></span>
                : <button className="gc-btn primary" disabled={busy} onClick={onInstall}>{state?.install.kind === "external" ? "Get app" : "Install"}</button>}
            </span>
            <span className="gc-dot" />
            <span className="gc-seg">sign-in{" "}
              {authReady
                ? <span className="gc-ok"><CheckMark /></span>
                : !installReady
                  ? <span className="gc-wait">after install</span>
                  : <button className="gc-btn ghost" disabled={busy} onClick={onSignin}>{authLabel}</button>}
            </span>
          </div>

          {/* model field */}
          {eff === "needs-install"
            ? <span className="gc-mph">model · set after install</span>
            : hasSub
              ? <InlineModel id={id} />
              : hasModelPicker
                ? <button className="gc-mbtn" onClick={(e) => { stop(e); setOpen((o) => !o); }}>configure model…</button>
                : <span className="gc-mstatic">model · default</span>}
        </div>
      )}

      {open && (hasModelPicker || isApiKey) && (
        <div className="gc-cfg" onClick={stop}>
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

// Small inline check used in the lifecycle steps.
function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
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
  // Group by the machine SCAN, not cloud/local: what's already on the machine
  // (detected, ready-or-needs-sign-in) vs what we propose installing (the binary
  // is genuinely missing). rankHarnesses orders best-first, so "on your machine"
  // naturally shows ready agents before the ones still needing a sign-in.
  const scanning = scan?.scanning ?? false;
  const byId = scan?.byId ?? {};
  const ordered = scan ? rankHarnesses(byId, scanning) : HARNESSES.map((h) => h.id);
  const onMachine = ordered.filter((id) => healthOf(byId[id], scanning) !== "needs-install");
  const toInstall = ordered.filter((id) => healthOf(byId[id], scanning) === "needs-install");

  const grid = (ids: string[], cls = "") => (
    <div className={"ecard-grid" + cls}>
      {ids.map((id) => (
        <EngineCard key={id} id={id} selected={isSelected(id)} onPick={onPick} lifecycle={lifecycle} scan={scan} />
      ))}
    </div>
  );

  return (
    <>
      {onMachine.length > 0 && (
        <>
          <div className="alane ok">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            <span className="at">On your machine</span>
            <span className="as">— found by the scan</span>
            <span className="ar" />
            <span className="ac">{onMachine.length} detected</span>
          </div>
          {grid(onMachine)}
        </>
      )}
      {toInstall.length > 0 && (
        <>
          <div className="alane add">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></svg>
            <span className="at">Suggested to install</span>
            <span className="as">— not detected yet; one click to add</span>
            <span className="ar" />
            <span className="ac">{toInstall.length} available</span>
          </div>
          {grid(toInstall, " suggest")}
        </>
      )}
    </>
  );
}
