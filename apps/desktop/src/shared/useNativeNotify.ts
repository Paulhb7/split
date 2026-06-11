import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Native macOS notification for "an agent finished while Split was in the
// background". The Rust `notify_turn_done` command posts the banner (with an
// "Open" button) and emits `notification-open` with the session id when the
// user clicks it — here we raise the window and hand the id to `onOpen` so
// the user lands straight on the work. Non-macOS builds: the command is a
// no-op and the event never fires; the in-app toasts cover the rest.
export function useNativeNotify(onOpen: (sessionId: string) => void) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const un = listen<string>("notification-open", (e) => {
      const w = getCurrentWindow();
      w.show().catch(() => {});
      w.setFocus().catch(() => {});
      onOpenRef.current(e.payload);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Stable identity — callers keep it in effect dep arrays.
  return useCallback((sessionId: string, title: string, body: string) => {
    invoke("notify_turn_done", { id: sessionId, title, body }).catch(() => {});
  }, []);
}
