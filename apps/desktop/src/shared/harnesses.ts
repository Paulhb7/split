// The engine "league" — display metadata for each ACP harness.
// Ported verbatim from acp-client/web/index.html. This is the source of brand
// colors / lanes / tags; harnesses.json (read by Rust `list_harnesses`) holds
// the launch config. Join the two by `id`.

export interface Harness {
  id: string;
  label: string;
  vendor: string;
  brand: string; // accent color (hex)
  lane: "cloud" | "local";
  tag: string;
  blurb: string;
  reserve?: boolean; // not installed / paid beta — shown dimmed, not launchable
}

export const HARNESSES: Harness[] = [
  { id: "claude", label: "Claude", vendor: "Anthropic", brand: "#d97757", lane: "cloud", tag: "Claude Pro/Max", blurb: "Frontier reasoning, on your Claude subscription." },
  { id: "codex", label: "Codex", vendor: "OpenAI", brand: "#10a37f", lane: "cloud", tag: "ChatGPT sub", blurb: "GPT-5 Codex via your ChatGPT plan." },
  { id: "gemini", label: "Gemini", vendor: "Google", brand: "#4285f4", lane: "cloud", tag: "Free tier", blurb: "Google login. Generous free tier." },
  { id: "mistral-vibe", label: "Mistral Vibe", vendor: "Mistral AI", brand: "#fa520f", lane: "cloud", tag: "API key", blurb: "Mistral's Vibe agent. Open weights, EU." },
  { id: "copilot", label: "Copilot", vendor: "GitHub", brand: "#a371f7", lane: "cloud", tag: "Copilot sub", blurb: "Your GitHub Copilot subscription." },
  { id: "cursor", label: "Cursor", vendor: "Cursor", brand: "#cfd2d6", lane: "cloud", tag: "Cursor sub", blurb: "The Cursor agent, your Cursor plan." },
  { id: "deepagents", label: "DeepAgents", vendor: "LangChain", brand: "#1fae9b", lane: "cloud", tag: "Any provider", blurb: "Model-agnostic LangChain agent." },
  { id: "grok", label: "Grok", vendor: "xAI", brand: "#e6e6e6", lane: "cloud", tag: "SuperGrok · beta", blurb: "xAI Grok Build. Paid beta — reserve.", reserve: true },
  { id: "opencode", label: "OpenCode", vendor: "open source", brand: "#ff7a59", lane: "local", tag: "100% local", blurb: "75+ providers. Point at Ollama → $0." },
  { id: "hermes", label: "Hermes", vendor: "Nous Research", brand: "#c8a878", lane: "local", tag: "100% local", blurb: "Open weights on your machine. No key." },
  { id: "qwen", label: "Qwen", vendor: "Alibaba", brand: "#7c5cff", lane: "local", tag: "Local or key", blurb: "Qwen3.5 — local via Ollama, or cloud." },
];

export const H: Record<string, Harness> = Object.fromEntries(HARNESSES.map((h) => [h.id, h]));

// Logos live in public/logos/<id>.svg, used as a CSS mask tinted by brand color.
export const logoUrl = (id: string) => `url(/logos/${id}.svg)`;

// Brand color for any harness id, with a neutral fallback.
export const brandOf = (id: string) => H[id]?.brand ?? "#888";
