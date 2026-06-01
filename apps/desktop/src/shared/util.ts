import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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

// Load the expert registry from Rust (shipped config/experts.json merged with
// custom <VAR_DIR>/experts/*.json — written by Recruiter/Socrates), falling
// back to defaults. Refreshes on app focus AND whenever any session goes idle,
// so an expert Socrates wrote during a turn appears in the picker without an
// app restart.
export function useExperts(): ExpertMap {
  const [experts, setExperts] = useState<ExpertMap>(DEFAULT_EXPERTS);
  useEffect(() => {
    const refresh = () =>
      invoke<string>("list_experts")
        .then((raw) => {
          const obj = JSON.parse(raw) as ExpertMap;
          if (obj && Object.keys(obj).length) setExperts(obj);
        })
        .catch(() => {});
    refresh();
    let unlisten: UnlistenFn | null = null;
    listen<{ type?: string; status?: string }>("session-event", (e) => {
      if (e.payload?.type === "status" && e.payload?.status === "idle") refresh();
    }).then((fn) => {
      unlisten = fn;
    });
    window.addEventListener("focus", refresh);
    return () => {
      unlisten?.();
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return experts;
}
