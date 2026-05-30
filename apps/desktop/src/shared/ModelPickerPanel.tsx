// Generic Local/Cloud model picker for any model-agnostic harness (Hermes,
// OpenCode, eventually Qwen / DeepAgents). The UX is identical across
// harnesses; what varies is (1) the cloud-provider catalogue (per
// [[model-picker]] registry, keyed by harnessId) and (2) the harness-specific
// translation from the saved JSON to spawn-time CLI args + env, which lives
// on the Python side in `split/core.py::apply_<harness>_config`.
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  PICKERS,
  loadConfig,
  saveConfig,
  type ModelConfig,
} from "./model-picker";

interface OllamaState {
  installed: boolean;
  running: boolean;
  models: string[];
}

export function ModelPickerPanel({
  harnessId,
  onClose,
}: {
  harnessId: string;
  onClose: () => void;
}) {
  // Defensive: a harness with configure.kind="model-picker" but no registry
  // entry shouldn't crash the UI. We can't early-return here (the Rules of
  // Hooks demand a stable hook order across renders), so we fall back to a
  // safe empty picker and render the missing-registry message at the JSX
  // level when relevant. This keeps every useState/useEffect below
  // unconditional. Memoize the fallback so the object identity is stable
  // across renders (otherwise it churns dependent useMemo / useEffect).
  const noPicker = !PICKERS[harnessId];
  const picker = useMemo(
    () => PICKERS[harnessId] ?? { cloud: [], ollama: [] },
    [harnessId],
  );

  const initial = loadConfig(harnessId);
  const [mode, setMode] = useState<"local" | "cloud">(initial?.mode ?? "cloud");

  // Cloud state — picker.cloud may be empty when noPicker is true; guard the
  // initial values so we don't deref an undefined entry.
  const [providerId, setProviderId] = useState(
    initial?.cloud?.providerId ?? picker.cloud[0]?.id ?? "",
  );
  const provider = useMemo(
    () => picker.cloud.find((p) => p.id === providerId) ?? picker.cloud[0],
    [picker, providerId],
  );
  const [cloudModelId, setCloudModelId] = useState(
    initial?.cloud?.modelId ?? provider?.models[0]?.id ?? "",
  );
  const [apiKey, setApiKey] = useState("");

  // Local state
  const [localModelId, setLocalModelId] = useState(
    initial?.local?.modelId ?? picker.ollama[0]?.id ?? "",
  );
  const [ollama, setOllama] = useState<OllamaState | null>(null);
  const [ollamaChecking, setOllamaChecking] = useState(false);

  const [busy, setBusy] = useState(false);

  async function refreshOllama() {
    setOllamaChecking(true);
    try {
      const raw = await invoke<string>("check_ollama");
      setOllama(JSON.parse(raw));
    } catch (e) {
      console.error("check_ollama failed", e);
    } finally {
      setOllamaChecking(false);
    }
  }

  useEffect(() => {
    if (mode === "local") refreshOllama();
  }, [mode]);

  // Switching provider resets the model to the first model of the new
  // provider (otherwise the picker can end up with a model that doesn't
  // belong here).
  useEffect(() => {
    if (!provider) return;
    if (!provider.models.some((m) => m.id === cloudModelId)) {
      setCloudModelId(provider.models[0].id);
    }
  }, [provider, cloudModelId]);

  const pulledLocally = !!ollama?.models.includes(localModelId);
  // Recommended Ollama models the user hasn't pulled yet — split so the
  // dropdown can show "On your machine" first (instantly usable) and then
  // "Recommended (will pull X GB)" second.
  const recommendedToPull = picker.ollama.filter(
    (r) => !ollama?.models.includes(r.id),
  );

  // When Ollama is first detected, if the user hasn't saved a choice yet and
  // the current default isn't on their machine, prefer one they already have.
  // Saves the user from picking a recommendation that requires a 4-40 GB pull.
  useEffect(() => {
    if (!ollama || ollama.models.length === 0) return;
    if (initial?.local?.modelId) return;
    if (ollama.models.includes(localModelId)) return;
    setLocalModelId(ollama.models[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollama]);

  async function onInstallOllama() {
    setBusy(true);
    try {
      await invoke("install_ollama", { harnessId });
      setTimeout(refreshOllama, 1500);
    } catch (e) {
      console.error("install_ollama failed", e);
    } finally {
      setBusy(false);
    }
  }

  async function onPullModel() {
    setBusy(true);
    try {
      await invoke("pull_ollama_model", { harnessId, model: localModelId });
      setTimeout(refreshOllama, 2000);
    } catch (e) {
      console.error("pull_ollama_model failed", e);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveApiKey() {
    if (!apiKey.trim()) return;
    setBusy(true);
    try {
      await invoke("save_api_key", { name: provider.keyEnv, value: apiKey });
      setApiKey("");
    } catch (e) {
      console.error("save_api_key failed", e);
    } finally {
      setBusy(false);
    }
  }

  async function onSaveConfig() {
    const cfg: ModelConfig =
      mode === "cloud"
        ? { mode: "cloud", cloud: { providerId, modelId: cloudModelId } }
        : { mode: "local", local: { modelId: localModelId } };
    setBusy(true);
    try {
      await saveConfig(harnessId, cfg);
    } finally {
      setBusy(false);
      onClose();
    }
  }

  // EngineCard's outer button (.ecard-pick) sits as a sibling in the same
  // .ecard container; bubbled mousedown/click events can race with select
  // dropdown openings and input focus on Tauri's WKWebView. We stop every
  // pointer event at the panel root AND at each interactive control.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (noPicker) {
    return (
      <div
        className="hermes-panel"
        onClick={stop}
        onMouseDown={stop}
        onPointerDown={stop}
      >
        <p className="hermes-tip">No model picker registered for "{harnessId}".</p>
        <div className="hermes-foot">
          <button
            className="card-act"
            onClick={(e) => { stop(e); onClose(); }}
            type="button"
          >
            close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="hermes-panel"
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <div className="hermes-tabs">
        <button
          className={"hermes-tab" + (mode === "local" ? " on" : "")}
          onClick={(e) => { stop(e); setMode("local"); }}
          disabled={busy}
          type="button"
        >
          Local (Ollama)
        </button>
        <button
          className={"hermes-tab" + (mode === "cloud" ? " on" : "")}
          onClick={(e) => { stop(e); setMode("cloud"); }}
          disabled={busy}
          type="button"
        >
          Cloud
        </button>
      </div>

      {mode === "cloud" && (
        <div className="hermes-body">
          <label className="hermes-row">
            <span>Provider</span>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              onClick={stop}
              onMouseDown={stop}
              disabled={busy}
            >
              {picker.cloud.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="hermes-row">
            <span>Model</span>
            <select
              value={cloudModelId}
              onChange={(e) => setCloudModelId(e.target.value)}
              onClick={stop}
              onMouseDown={stop}
              disabled={busy}
            >
              {provider.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.blurb ? ` — ${m.blurb}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="hermes-row">
            <span>{provider.keyEnv}</span>
            <input
              type="password"
              placeholder="paste your key…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onClick={stop}
              onMouseDown={stop}
            />
          </label>

          <div className="hermes-acts">
            {provider.signupUrl && (
              <a
                className="hermes-link"
                href={provider.signupUrl}
                target="_blank"
                rel="noreferrer"
                onClick={stop}
              >
                Get a key →
              </a>
            )}
            <button
              className="card-act"
              disabled={busy || !apiKey.trim()}
              onClick={(e) => { stop(e); onSaveApiKey(); }}
              type="button"
            >
              save key 🔒
            </button>
          </div>
        </div>
      )}

      {mode === "local" && (
        <div className="hermes-body">
          <div className="hermes-status">
            {ollamaChecking && <span>Detecting Ollama…</span>}
            {!ollamaChecking && ollama && !ollama.installed && (
              <span className="warn">
                Ollama not installed. The official installer is small and runs locally.
              </span>
            )}
            {!ollamaChecking && ollama?.installed && !ollama.running && (
              <span className="warn">
                Ollama installed but daemon not running — start it (the Ollama
                menubar app launches it).
              </span>
            )}
            {!ollamaChecking && ollama?.installed && ollama.running && (
              <span className="ok">
                ✓ Ollama running ({ollama.models.length} model
                {ollama.models.length === 1 ? "" : "s"} installed)
              </span>
            )}
          </div>

          {ollama && !ollama.installed && (
            <div className="hermes-acts">
              <button
                className="card-act"
                disabled={busy}
                onClick={(e) => { stop(e); onInstallOllama(); }}
                type="button"
              >
                Install Ollama
              </button>
            </div>
          )}

          <label className="hermes-row">
            <span>Model</span>
            <select
              value={localModelId}
              onChange={(e) => setLocalModelId(e.target.value)}
              onClick={stop}
              onMouseDown={stop}
              disabled={busy}
            >
              {ollama && ollama.models.length > 0 && (
                <optgroup label="On your machine">
                  {ollama.models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </optgroup>
              )}
              {recommendedToPull.length > 0 && (
                <optgroup
                  label={
                    ollama && ollama.models.length > 0
                      ? "Recommended (will pull)"
                      : "Recommended"
                  }
                >
                  {recommendedToPull.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.size}){m.blurb ? ` — ${m.blurb}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <div className="hermes-acts">
            {pulledLocally ? (
              <span className="hermes-badge ok">✓ pulled</span>
            ) : (
              <button
                className="card-act"
                disabled={busy || !ollama?.installed || !ollama?.running}
                onClick={(e) => { stop(e); onPullModel(); }}
                type="button"
                title={
                  !ollama?.installed
                    ? "Install Ollama first"
                    : !ollama?.running
                      ? "Start Ollama first"
                      : "Download this model"
                }
              >
                Pull {localModelId}
              </button>
            )}
            <button
              className="card-act"
              disabled={busy}
              onClick={(e) => { stop(e); refreshOllama(); }}
              type="button"
            >
              Recheck
            </button>
          </div>

          <p className="hermes-tip">
            Tip: long-context models need <code>OLLAMA_CONTEXT_LENGTH=32768</code> (or
            more) in Ollama's launch env — the default 4096 will truncate real coding
            tasks.
          </p>
        </div>
      )}

      <div className="hermes-foot">
        <button
          className="card-act"
          onClick={(e) => { stop(e); onClose(); }}
          disabled={busy}
          type="button"
        >
          cancel
        </button>
        <button
          className="card-act ok"
          onClick={(e) => { stop(e); onSaveConfig(); }}
          disabled={busy}
          type="button"
        >
          save config
        </button>
      </div>
    </div>
  );
}
