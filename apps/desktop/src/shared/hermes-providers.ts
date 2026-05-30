// Hand-curated catalogue of cloud providers + Ollama model recipes for the
// generic model picker (used by Hermes via [[model-picker]]). The shared
// `OLLAMA_RECIPES` list is also re-used by other model-agnostic harnesses
// (OpenCode etc.).
//
// Each cloud provider's `keyEnv` MUST be in lib.rs's KNOWN_KEYS allowlist
// (otherwise save_api_key refuses to persist it to the keychain). Extend both
// in lockstep when adding a new provider.

import type { CloudProvider, OllamaRecipe } from "./model-picker";

export const HERMES_CLOUD_PROVIDERS: CloudProvider[] = [
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

// Curated short list — opinionated picks across coding + general use. The
// user can pull anything from ollama.com/library outside this menu; this is
// just the "no need to think" starting point. Shared across every model-
// agnostic harness — the local-LLM choice doesn't care which harness will
// consume it.
export const OLLAMA_RECIPES: OllamaRecipe[] = [
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", size: "4.7 GB", blurb: "Fast coder, fits 16 GB RAM" },
  { id: "qwen2.5-coder:14b", name: "Qwen 2.5 Coder 14B", size: "9.0 GB", blurb: "Better coder, needs 24 GB" },
  { id: "qwen2.5-coder:32b", name: "Qwen 2.5 Coder 32B", size: "19 GB", blurb: "Best small-ish coder" },
  { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder v2 16B", size: "10 GB", blurb: "Strong coding alt" },
  { id: "llama3.3:70b", name: "Llama 3.3 70B", size: "40 GB", blurb: "General reasoning — needs 64 GB+" },
];
