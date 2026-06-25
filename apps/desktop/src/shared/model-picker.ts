// The generic Local/Cloud model picker — same UX for every model-agnostic
// harness (Hermes, OpenCode, eventually Qwen). Each harness gets
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

// --- Single-vendor subscription CLIs (Claude, Codex, Gemini) ----------------
// These aren't model-agnostic: one provider, a short model list, optionally a
// reasoning-effort level — no Local/Cloud mode. They launch via `npx`, so CLI
// args would hit npx, not the agent; the Rust side (harness_config::apply)
// reads `{ model, reasoning? }` and injects it as env (ANTHROPIC_MODEL /
// GEMINI_MODEL) or a managed CODEX_HOME/config.toml (with the real auth.json
// linked in). The model field stays free-text — the list is just suggestions,
// so a pinned/exotic id always works even as line-ups change.

export interface SubModelSuggestion {
  id: string;
  name: string;
}
export interface ReasoningLevel {
  id: string;
  name: string;
}
export interface SubscriptionPicker {
  models: SubModelSuggestion[];
  reasoning?: ReasoningLevel[];
  note?: string;
}

// Current as of June 2026 — line-ups move fast, but the field is free-text so
// stale suggestions never block a pinned/newer id.
export const SUBSCRIPTION_PICKERS: Record<string, SubscriptionPicker> = {
  claude: {
    models: [
      { id: "opus", name: "Opus 4.8 — deepest" },
      { id: "sonnet", name: "Sonnet 4.6 — balanced" },
      { id: "haiku", name: "Haiku 4.5 — fast & cheap" },
    ],
    note: "opus/sonnet/haiku are aliases (track the latest); paste a pinned id like claude-opus-4-8 to lock a version. → ANTHROPIC_MODEL",
  },
  codex: {
    models: [
      { id: "gpt-5.5", name: "GPT-5.5 — default" },
      { id: "gpt-5.4", name: "GPT-5.4 — flagship" },
      { id: "gpt-5.4-mini", name: "GPT-5.4 Mini — fast" },
      { id: "gpt-5.5-codex", name: "GPT-5.5 Codex — API billing only" },
    ],
    reasoning: [
      { id: "low", name: "Low" },
      { id: "medium", name: "Medium" },
      { id: "high", name: "High" },
      { id: "xhigh", name: "X-High" },
    ],
    note: "Exact ids show under /model in Codex. Leave blank to use your codex sign-in's own default. The `*-codex` models need an OpenAI API-key account — ChatGPT-subscription sign-ins must use a plain `gpt-5.x`. Written to a managed CODEX_HOME/config.toml; your sign-in is linked in.",
  },
  gemini: {
    models: [
      { id: "gemini-3.5-flash", name: "3.5 Flash — most intelligent (stable)" },
      { id: "gemini-3.1-pro-preview", name: "3.1 Pro — agentic/vibe coding (preview)" },
      { id: "gemini-3-flash", name: "3 Flash — frontier at low cost (preview)" },
      { id: "gemini-3.1-flash-lite", name: "3.1 Flash-Lite — cheapest" },
    ],
    note: "→ GEMINI_MODEL",
  },
};

export interface SubModelConfig {
  model: string;
  reasoning?: string;
}

export function loadSubConfig(harness: string): SubModelConfig | null {
  try {
    const raw = localStorage.getItem(configKey(harness));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveSubConfig(harness: string, cfg: SubModelConfig) {
  localStorage.setItem(configKey(harness), JSON.stringify(cfg));
  try {
    await invoke("save_model_config", { harness, cfg: JSON.stringify(cfg) });
  } catch (e) {
    console.error("save_model_config failed", e);
  }
}
