// Compact model selector for single-vendor subscription CLIs (Claude, Codex,
// Gemini). Unlike the model-agnostic ModelPickerPanel (Local/Cloud, providers,
// Ollama), these have one provider and a short model list — plus a
// reasoning-effort level for the Codex-style engines. The model field is
// free-text with suggestions so a pinned/exotic id always works. The saved
// `{ model, reasoning? }` is read at spawn time by harness_config::apply and
// turned into env (ANTHROPIC_MODEL / GEMINI_MODEL) or a managed CODEX_HOME.
import { useState } from "react";
import {
  SUBSCRIPTION_PICKERS,
  loadSubConfig,
  saveSubConfig,
  type SubModelConfig,
} from "./model-picker";

export function SubscriptionModelPicker({
  harnessId,
  onClose,
}: {
  harnessId: string;
  onClose: () => void;
}) {
  const picker = SUBSCRIPTION_PICKERS[harnessId];
  const saved = loadSubConfig(harnessId);
  const [model, setModel] = useState(
    saved?.model ?? picker?.models[0]?.id ?? "",
  );
  // Default reasoning to "high" when offered (index 2 of low/medium/high/xhigh).
  const [reasoning, setReasoning] = useState(
    saved?.reasoning ?? picker?.reasoning?.[2]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);

  // EngineCard's outer .ecard-pick button is a sibling; stop pointer events so
  // selecting a model doesn't also toggle the card (matches ModelPickerPanel).
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!picker) return null;

  async function onSave(e: React.SyntheticEvent) {
    stop(e);
    const trimmed = model.trim();
    if (!trimmed) return;
    setBusy(true);
    const cfg: SubModelConfig = picker.reasoning
      ? { model: trimmed, reasoning }
      : { model: trimmed };
    try {
      await saveSubConfig(harnessId, cfg);
    } finally {
      setBusy(false);
      onClose();
    }
  }

  const listId = `${harnessId}-models`;

  return (
    <div
      className="hermes-panel"
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
    >
      <div className="hermes-body">
        <label className="hermes-row">
          <span>Model</span>
          <input
            list={listId}
            value={model}
            placeholder="model id…"
            onChange={(e) => setModel(e.target.value)}
            onClick={stop}
            onMouseDown={stop}
            disabled={busy}
          />
          <datalist id={listId}>
            {picker.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
        </label>

        {picker.reasoning && (
          <label className="hermes-row">
            <span>Reasoning</span>
            <select
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              onClick={stop}
              onMouseDown={stop}
              disabled={busy}
            >
              {picker.reasoning.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {picker.note && <p className="hermes-tip">{picker.note}</p>}
      </div>

      <div className="hermes-foot">
        <button
          className="card-act"
          onClick={(e) => {
            stop(e);
            onClose();
          }}
          disabled={busy}
          type="button"
        >
          cancel
        </button>
        <button
          className="card-act ok"
          onClick={onSave}
          disabled={busy || !model.trim()}
          type="button"
        >
          save model
        </button>
      </div>
    </div>
  );
}
