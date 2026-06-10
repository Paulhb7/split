// Shared presentational bits used by both the app and the onboarding.
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HARNESSES, H, logoUrl, brandOf } from "./harnesses";
import { worstOf, type HarnessStateMap } from "./useHarnessStates";
import { ModelPickerPanel } from "./ModelPickerPanel";

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

export function EngineCard({
  id,
  selected,
  onPick,
  lifecycle,
}: {
  id: string;
  selected: boolean;
  onPick: (id: string) => void;
  lifecycle?: LifecycleAPI;
}) {
  const h = H[id];
  const state = lifecycle?.states[id];
  const progress = lifecycle?.progress[id];
  const [expanded, setExpanded] = useState(false); // api-key inline form
  const [keyVal, setKeyVal] = useState("");
  const [busy, setBusy] = useState(false);

  const worst = state ? worstOf(state) : "missing";
  const hasInstall = !!state && state.install.kind !== "";
  const hasConfigure = !!state && state.configure.kind !== "";
  const installReady = state?.install.state === "ready";
  const configureReady = state?.configure.state === "ready";

  async function onInstall(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      await invoke<string>("install_harness", { id });
    } catch (err) {
      console.error("install_harness failed", err);
    } finally {
      setBusy(false);
    }
  }

  async function onConfigure(e: React.MouseEvent) {
    e.stopPropagation();
    if (!state) return;
    // Both inline forms — the simple api-key input and the generic
    // local/cloud model picker — are driven by the same `expanded` toggle
    // below; no Rust call.
    if (state.configure.kind === "api-key" || state.configure.kind === "model-picker") {
      setExpanded((v) => !v);
      return;
    }
    setBusy(true);
    try {
      await invoke<string>("configure_harness", { id });
      lifecycle?.refresh();
    } catch (err) {
      console.error("configure_harness failed", err);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveKey(e: React.MouseEvent) {
    e.stopPropagation();
    if (!state?.configure.key) return;
    setBusy(true);
    try {
      await invoke("save_api_key", { name: state.configure.key, value: keyVal });
      setExpanded(false);
      setKeyVal("");
      lifecycle?.refresh();
    } catch (err) {
      console.error("save_api_key failed", err);
    } finally {
      setBusy(false);
    }
  }

  const pillLabel = progress ?? (worst === "ready" ? "ready" : worst === "external" ? "manual" : "setup");

  // The generic model picker panel (Local/Cloud + dropdowns + status +
  // actions) is too dense for a single grid cell; break out and span the
  // full row when expanded.
  const wide = expanded && state?.configure.kind === "model-picker";

  return (
    <div
      className={
        "ecard" +
        (h.reserve ? " reserve" : "") +
        (selected ? " sel" : "") +
        (expanded ? " expanded" : "") +
        (wide ? " wide" : "")
      }
      style={vars({ "--brand": h.brand })}
    >
      <button className="ecard-pick" onClick={() => onPick(id)}>
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

      {lifecycle && state && (
        <div className="ecard-foot">
          <span
            className={"st-pill st-" + worst}
            title={`install: ${state.install.state} · configure: ${state.configure.state}`}
          >
            {pillLabel}
          </span>
          {hasInstall && (
            <button
              className={"card-act" + (installReady ? " done" : "")}
              disabled={busy}
              onClick={onInstall}
              title={installReady ? "Re-run the installer" : "Install this agent"}
            >
              {installReady ? "✓ install" : "install"}
            </button>
          )}
          {hasConfigure && (
            <button
              className={"card-act" + (configureReady ? " done" : "")}
              disabled={busy}
              onClick={onConfigure}
              title={configureReady ? "Re-configure credentials" : "Set up credentials"}
            >
              {configureReady ? "✓ configure" : state.configure.kind === "external" ? "docs" : "configure"}
            </button>
          )}
        </div>
      )}

      {expanded && state?.configure.kind === "api-key" && (
        <div className="ecard-cfg">
          <label>{state.configure.key}</label>
          <input
            type="password"
            placeholder="paste your key…"
            value={keyVal}
            onChange={(e) => setKeyVal(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
          <div className="cfg-acts">
            <button
              className="card-act"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(false);
                setKeyVal("");
              }}
            >
              cancel
            </button>
            <button className="card-act ok" disabled={busy || !keyVal} onClick={onSaveKey}>
              save
            </button>
          </div>
        </div>
      )}

      {expanded && state?.configure.kind === "model-picker" && (
        <div className="ecard-cfg">
          <ModelPickerPanel
            harnessId={id}
            onClose={() => {
              setExpanded(false);
              lifecycle?.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}

// `isSelected` is a predicate so the league works for single-pick or multi-select.
export function League({
  isSelected,
  onPick,
  lifecycle,
}: {
  isSelected: (id: string) => boolean;
  onPick: (id: string) => void;
  lifecycle?: LifecycleAPI;
}) {
  return (
    <>
      <div className="lane">☁ Cloud · your subscriptions</div>
      <div className="grid">
        {HARNESSES.filter((h) => h.lane === "cloud").map((h) => (
          <EngineCard key={h.id} id={h.id} selected={isSelected(h.id)} onPick={onPick} lifecycle={lifecycle} />
        ))}
      </div>
      <div className="lane">🖥 On-device · your machine</div>
      <div className="grid">
        {HARNESSES.filter((h) => h.lane === "local").map((h) => (
          <EngineCard key={h.id} id={h.id} selected={isSelected(h.id)} onPick={onPick} lifecycle={lifecycle} />
        ))}
      </div>
    </>
  );
}
