import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_EXPERTS, type ExpertMap } from "./experts";

// A file dropped on a window, read by Rust, pending attachment to the next turn.
export interface Attachment {
  name: string;
  path: string;
  text: string;
  truncated: boolean;
  bytes: number;
  binary: boolean;
}

// Fold typed text + attachments into a turn. `display` is what the thread shows
// (just the typed text); `wire` is what the agent receives (typed text + file
// contents inline + paths so tool-capable experts can read the full file).
export function composeTurn(typed: string, attachments: Attachment[]) {
  if (!attachments.length) return { display: typed, wire: typed, files: [] as string[] };
  const blocks = attachments
    .map((a) =>
      a.binary
        ? `Attached file: ${a.name} (binary, ${a.bytes} bytes, path: ${a.path}). Not inlined — read it from the path if you have file tools.`
        : `Attached file: ${a.name} (path: ${a.path}${a.truncated ? ", truncated" : ""})\n\`\`\`\n${a.text}\n\`\`\``
    )
    .join("\n\n");
  const instruction = typed || "Analyze the attached file(s).";
  return {
    display: typed,
    wire: `${instruction}\n\n${blocks}`,
    files: attachments.map((a) => a.name),
  };
}

// Load the expert registry from Rust (experts.json), falling back to defaults.
export function useExperts(): ExpertMap {
  const [experts, setExperts] = useState<ExpertMap>(DEFAULT_EXPERTS);
  useEffect(() => {
    invoke<string>("list_experts")
      .then((raw) => {
        const obj = JSON.parse(raw) as ExpertMap;
        if (obj && Object.keys(obj).length) setExperts(obj);
      })
      .catch(() => {});
  }, []);
  return experts;
}
