// Lifecycle state for every harness: is the runtime installed? are credentials
// configured? The Rust `harness_states` command derives this from harnesses.json
// + filesystem checks (creds dotfiles + .env / env vars). The hook subscribes to
// `install-event`s so an Install or Configure click refreshes the pastilles as
// soon as the underlying command finishes.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type LifecycleState = "ready" | "missing" | "external";
export type InstallKind = "npx" | "binary" | "external" | "script" | "";
export type ConfigureKind = "oauth" | "api-key" | "external" | "model-picker" | "";

export interface InstallSpecState {
  kind: InstallKind;
  state: LifecycleState;
  docUrl?: string;
}
export interface ConfigureSpecState {
  kind: ConfigureKind;
  state: LifecycleState;
  key?: string;     // api-key kind: the env var name to write (e.g. DASHSCOPE_API_KEY)
  docUrl?: string;  // external kind: link to the docs
}
export interface HarnessState {
  install: InstallSpecState;
  configure: ConfigureSpecState;
}
export type HarnessStateMap = Record<string, HarnessState>;

export interface InstallEvent {
  id: string;
  line: string;
  done: boolean;
  ok: boolean;
}

export function useHarnessStates() {
  const [states, setStates] = useState<HarnessStateMap>({});
  // id -> last status line streamed from the Rust install/configure command.
  // Cleared a short while after `done` so the UI doesn't keep showing it.
  const [progress, setProgress] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const raw = await invoke<string>("harness_states");
      setStates(JSON.parse(raw));
    } catch (e) {
      console.error("harness_states failed", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    let unlisten: UnlistenFn | null = null;
    listen<InstallEvent>("install-event", (e) => {
      const { id, line, done } = e.payload;
      setProgress((p) => ({ ...p, [id]: line }));
      if (done) {
        refresh();
        setTimeout(() => {
          setProgress((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
        }, 2200);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refresh]);

  return { states, progress, refresh };
}

// Worst of (install, configure) — what colour the pastille should be.
export function worstOf(s: HarnessState | undefined): LifecycleState {
  if (!s) return "missing";
  const order: Record<LifecycleState, number> = { missing: 0, external: 1, ready: 2 };
  return order[s.install.state] <= order[s.configure.state] ? s.install.state : s.configure.state;
}
