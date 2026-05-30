// The generic Local/Cloud model picker — same UX for every model-agnostic
// harness (Hermes, OpenCode, eventually Qwen, DeepAgents). Each harness gets
// its own curated catalogue of cloud providers (different model IDs, auth
// patterns) but shares the curated Ollama recipe list (the local-LLM choice
// doesn't care which harness will consume it).
//
// The save path mirrors the user's choice into both:
//  1. localStorage["split.<harness>.config"] — for the UI to repopulate
//  2. var/state/<harness>.config.json — for the Python runner to read at
//     spawn time and translate to harness-specific CLI args + env (each
//     harness has its own apply_<harness>_config in split/core.py).

import { invoke } from "@tauri-apps/api/core";
import { HERMES_CLOUD_PROVIDERS, OLLAMA_RECIPES } from "./hermes-providers";
import { OPENCODE_CLOUD_PROVIDERS } from "./opencode-providers";

export interface CloudModel {
  id: string;
  name: string;
  blurb?: string;
}

export interface CloudProvider {
  id: string;
  name: string;
  keyEnv: string;
  models: CloudModel[];
  signupUrl?: string;
}

export interface OllamaRecipe {
  id: string;
  name: string;
  size: string;
  blurb?: string;
}

export interface HarnessPicker {
  cloud: CloudProvider[];
  ollama: OllamaRecipe[];
}

// Registry of which catalogue each model-agnostic harness uses. To add a
// harness: drop a `<name>-providers.ts` with its curated cloud list, then
// register it here. The Ollama side is shared.
export const PICKERS: Record<string, HarnessPicker> = {
  hermes: { cloud: HERMES_CLOUD_PROVIDERS, ollama: OLLAMA_RECIPES },
  opencode: { cloud: OPENCODE_CLOUD_PROVIDERS, ollama: OLLAMA_RECIPES },
};

export interface ModelConfig {
  mode: "cloud" | "local";
  cloud?: { providerId: string; modelId: string };
  local?: { modelId: string };
}

const configKey = (harness: string) => `split.${harness}.config`;

export function loadConfig(harness: string): ModelConfig | null {
  try {
    const raw = localStorage.getItem(configKey(harness));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Best-effort dual write: localStorage for the UI, disk via Tauri so the
// Python runner can pick it up at spawn time. A failed Tauri call still
// leaves the UI choice persisted.
export async function saveConfig(harness: string, cfg: ModelConfig) {
  localStorage.setItem(configKey(harness), JSON.stringify(cfg));
  try {
    await invoke("save_model_config", { harness, cfg: JSON.stringify(cfg) });
  } catch (e) {
    console.error("save_model_config failed", e);
  }
}
