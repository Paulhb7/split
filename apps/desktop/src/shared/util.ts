import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

// A real library piece handed along as a starting template ("Make one like
// this"): its full self-contained HTML source, injected wire-only so the agent
// clones the craft, not just the brief.
export interface Template {
  title: string;
  html: string;
}

// Fold typed text + attachments (+ an optional template) into a turn. `display`
// is what the thread shows (just the typed text); `wire` is what the agent
// receives (typed text + file contents inline + paths so tool-capable experts
// can read the full file + the template source when cloning a gallery piece).
export function composeTurn(typed: string, attachments: Attachment[], template?: Template) {
  const files = attachments.map((a) => a.name);
  const blocks = attachments.map((a) =>
    a.binary
      ? `Attached file: ${a.name} (binary, ${a.bytes} bytes, path: ${a.path}). Not inlined — read it from the path if you have file tools.`
      : `Attached file: ${a.name} (path: ${a.path}${a.truncated ? ", truncated" : ""})\n\`\`\`\n${a.text}\n\`\`\``
  );
  if (template) {
    files.push(`template: ${template.title}`);
    blocks.push(
      `You are creating a NEW deliverable for the request above. Below is the full source of "${template.title}", an existing Split library piece of the same kind — use it as your STARTING TEMPLATE. Keep its structure, the skill it is built on, its craft, and its self-contained single-file approach; but produce a fresh piece for the request above (replace its subject and content — do not merely copy it, and give it its own distinct art direction unless the request says otherwise).\n\n\`\`\`html\n${template.html}\n\`\`\``
    );
  }
  if (!blocks.length) return { display: typed, wire: typed, files: [] as string[] };
  const instruction = typed || (attachments.length ? "Analyze the attached file(s)." : "Create a piece like the template below.");
  return { display: typed, wire: `${instruction}\n\n${blocks.join("\n\n")}`, files };
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
    // The broadcast payload is the WireEvent envelope {id, vevt?, log?, exit}
    // — the VEVT itself is a JSON string under `.vevt`. Cheap substring guard
    // first: this listener fires for every chunk of every session.
    const un = listen<{ vevt?: string | null }>("session-event", (e) => {
      const raw = e.payload?.vevt;
      if (!raw || !raw.includes('"status"')) return;
      try {
        const v = JSON.parse(raw) as { type?: string; status?: string };
        if (v.type === "status" && v.status === "idle") refresh();
      } catch {
        /* not JSON we care about */
      }
    });
    window.addEventListener("focus", refresh);
    return () => {
      // `un` may still be pending at unmount — resolve-then-unlisten so the
      // listener never leaks (same pattern as useSessions).
      un.then((f) => f());
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return experts;
}
