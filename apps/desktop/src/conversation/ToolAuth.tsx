// Sign-in chips for skills that wrap a vendor CLI with its own browser login —
// separate from harness ACP auth (AuthModal / browser_login) and from provider
// API keys. Driven by the Rust `tool_login` / `tool_status` commands. The
// Designer's higgsfield-* media skills are the first case; add a row here to
// cover another tool, no other change needed.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// skillPrefix → the tool id understood by the Rust allowlist.
const TOOL_LOGINS: { tool: string; label: string; skillPrefix: string }[] = [
  { tool: "higgsfield", label: "Higgsfield", skillPrefix: "higgsfield-" },
];

function toolsForSkills(skills: string[] | undefined): { tool: string; label: string }[] {
  if (!skills?.length) return [];
  return TOOL_LOGINS.filter((t) => skills.some((s) => s.startsWith(t.skillPrefix))).map(
    ({ tool, label }) => ({ tool, label }),
  );
}

function readState(raw: string): "ready" | "missing" {
  try {
    return JSON.parse(raw).state === "ready" ? "ready" : "missing";
  } catch {
    return "missing";
  }
}

function Chip({ tool, label }: { tool: string; label: string }) {
  const [state, setState] = useState<"ready" | "missing" | "unknown">("unknown");
  const [busy, setBusy] = useState(false);
  const poll = useRef<number | null>(null);

  useEffect(() => {
    invoke<string>("tool_status", { tool })
      .then((raw) => setState(readState(raw)))
      .catch(() => setState("missing"));
    return () => {
      if (poll.current) window.clearInterval(poll.current);
    };
  }, [tool]);

  async function onConnect() {
    if (state === "ready" || busy) return;
    setBusy(true);
    try {
      await invoke("tool_login", { tool }); // opens the browser (device login)
    } catch {
      setBusy(false);
      return;
    }
    // Browser sign-in runs out of band; poll the on-disk creds for ~2 min.
    let tries = 0;
    poll.current = window.setInterval(async () => {
      tries += 1;
      const raw = await invoke<string>("tool_status", { tool }).catch(() => "");
      if (raw && readState(raw) === "ready") {
        setState("ready");
        setBusy(false);
        if (poll.current) window.clearInterval(poll.current);
      } else if (tries > 60) {
        setBusy(false);
        if (poll.current) window.clearInterval(poll.current);
      }
    }, 2000);
  }

  const ready = state === "ready";
  return (
    <button
      className={"toolchip" + (ready ? " ok" : "")}
      onClick={onConnect}
      disabled={ready || busy}
      title={ready ? `${label} connected` : `Sign in to ${label} — opens your browser`}
    >
      {ready ? `✓ ${label}` : busy ? `${label}…` : `Connect ${label}`}
    </button>
  );
}

export function ToolAuthChips({ skills }: { skills: string[] | undefined }) {
  const tools = toolsForSkills(skills);
  if (!tools.length) return null;
  return (
    <>
      {tools.map((t) => (
        <Chip key={t.tool} tool={t.tool} label={t.label} />
      ))}
    </>
  );
}
