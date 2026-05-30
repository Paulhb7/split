// OpenCode is provider-agnostic via the AI SDK + models.dev catalogue (75+
// providers, OAuth or API key). We surface a short hand-curated list as
// dropdown options for the configure panel — the user picks one and we
// translate to an OpenCode `provider/model` string at spawn time. For local
// Ollama we ALSO write a managed `opencode.json` that declares the ollama
// provider block (with explicit baseURL, since OpenCode doesn't auto-detect).
//
// Each cloud provider's `keyEnv` MUST be in lib.rs's KNOWN_KEYS allowlist
// (otherwise `save_api_key` refuses to persist it to the keychain). Extend
// both in lockstep when adding a new provider.

import type { CloudProvider } from "./model-picker";

export const OPENCODE_CLOUD_PROVIDERS: CloudProvider[] = [
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
    id: "google",
    name: "Google Gemini",
    keyEnv: "GEMINI_API_KEY",
    signupUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", blurb: "Free tier friendly" },
    ],
  },
];
