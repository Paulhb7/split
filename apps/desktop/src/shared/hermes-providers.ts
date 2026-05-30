// Hand-curated catalogue of cloud providers + Ollama model recipes for the
// Hermes configure panel. Hermes itself is provider-agnostic; this is just the
// short list we offer as a dropdown so the user doesn't have to type
// `provider:model` strings or read the upstream docs.
//
// Each cloud provider's `keyEnv` MUST be in lib.rs's KNOWN_KEYS allowlist
// (otherwise save_api_key refuses to persist it to the keychain). Extend both
// in lockstep when adding a new provider.
import { invoke } from "@tauri-apps/api/core";

export interface HermesCloudModel {
  id: string;       // string Hermes accepts: e.g. "claude-sonnet-4-6"
  name: string;     // human label for the dropdown
  blurb?: string;
}

export interface HermesCloudProvider {
  id: string;
  name: string;
  keyEnv: string;   // env var name; saved to the OS keychain via save_api_key
  models: HermesCloudModel[];
  signupUrl?: string;
}

export const HERMES_CLOUD_PROVIDERS: HermesCloudProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    signupUrl: "https://console.anthropic.com/",
    models: [
      { id: "claude-opus-4-7", name: "Claude Opus 4.7", blurb: "Frontier reasoning" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", blurb: "Balanced default" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", blurb: "Fast & cheap" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    signupUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-5", name: "GPT-5" },
      { id: "gpt-5-codex", name: "GPT-5 Codex", blurb: "Coding-tuned" },
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    keyEnv: "GEMINI_API_KEY",
    signupUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", blurb: "Free tier friendly" },
    ],
  },
  {
    id: "mistral",
    name: "Mistral",
    keyEnv: "MISTRAL_API_KEY",
    signupUrl: "https://console.mistral.ai/",
    models: [
      { id: "mistral-large-latest", name: "Mistral Large" },
      { id: "codestral-latest", name: "Codestral", blurb: "Coding-tuned" },
    ],
  },
  {
    id: "qwen",
    name: "Qwen (DashScope)",
    keyEnv: "DASHSCOPE_API_KEY",
    signupUrl: "https://dashscope.console.aliyun.com/",
    models: [
      { id: "qwen3.5-plus", name: "Qwen 3.5 Plus" },
      { id: "qwen3-coder-plus", name: "Qwen 3 Coder Plus", blurb: "Coding-tuned" },
    ],
  },
];

export interface OllamaRecipe {
  id: string;       // tag passed to `ollama pull` and used in API requests
  name: string;     // human label
  size: string;     // approximate on-disk size shown in the picker
  blurb?: string;
}

// Curated short list — opinionated picks across coding + general use. The user
// can pull anything from ollama.com/library outside this menu; this is just
// the "no need to think" starting point.
export const OLLAMA_RECIPES: OllamaRecipe[] = [
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", size: "4.7 GB", blurb: "Fast coder, fits 16 GB RAM" },
  { id: "qwen2.5-coder:14b", name: "Qwen 2.5 Coder 14B", size: "9.0 GB", blurb: "Better coder, needs 24 GB" },
  { id: "qwen2.5-coder:32b", name: "Qwen 2.5 Coder 32B", size: "19 GB", blurb: "Best small-ish coder" },
  { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder v2 16B", size: "10 GB", blurb: "Strong coding alt" },
  { id: "llama3.3:70b", name: "Llama 3.3 70B", size: "40 GB", blurb: "General reasoning — needs 64 GB+" },
];

// Persisted shape in localStorage under "split.hermes.config".
export interface HermesConfig {
  mode: "cloud" | "local";
  cloud?: { providerId: string; modelId: string };
  local?: { modelId: string };
}

export const HERMES_CONFIG_KEY = "split.hermes.config";

export function loadHermesConfig(): HermesConfig | null {
  try {
    const raw = localStorage.getItem(HERMES_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HermesConfig;
  } catch {
    return null;
  }
}

// Mirror the choice to disk via Tauri so the Rust spawn path can read it and
// inject the HERMES_MODEL env var into hermes acp. localStorage alone isn't
// readable from Rust, hence the dual write. Best-effort: a failed Tauri call
// still leaves localStorage populated for the UI.
export async function saveHermesConfig(cfg: HermesConfig) {
  localStorage.setItem(HERMES_CONFIG_KEY, JSON.stringify(cfg));
  try {
    await invoke("save_hermes_config", { cfg: JSON.stringify(cfg) });
  } catch (e) {
    console.error("save_hermes_config (disk mirror) failed", e);
  }
}
