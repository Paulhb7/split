import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

// Adaptive bar window — fits its height to the natural content height, like the
// original Split bar. Width is fixed at the Tauri level (680 px, non-resizable);
// only height changes. The Rust side owns the resize call via the `set_bar_height`
// command so the React side stays out of platform DPI quirks.
//
// Height bounds (logical pixels):
const MIN_HEIGHT = 130;         // floor: chrome + composer + a bit of slack
const MAX_FRAC = 0.7;           // ceiling: 70% of the user's screen height
const CHROME_H = 46;            // .chrome's fixed CSS height (see app.css)
const SLACK = 24;               // bottom gutter so the last line breathes

/** Tiny utility hook around chrome controls that are NOT height-related:
 * hide, drag the window by the chrome bar. */
export function useWindowChrome() {
  const win = getCurrentWindow();

  const startMove = useCallback(() => {
    win.startDragging();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hide = useCallback(() => {
    win.hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { startMove, hide };
}

/** Auto-fit the Tauri window height to the natural content height.
 *
 * The caller wraps the body content in a `<div ref={measureRef}>` whose
 * natural `offsetHeight` reflects what's drawn. The window height becomes
 * `clamp(chrome + content + slack, MIN_HEIGHT, MAX)` — always, no special
 * "compact" short-circuit. The minimal state comes from the body rendering
 * less content (e.g. just the composer when idle), not from forcing a
 * sub-content window height.
 *
 * Implementation notes:
 *   - Dedupes via `lastHeightRef` — we don't spam the Rust IPC if the
 *     measured height didn't move (common during animations).
 *   - Coalesces with `requestAnimationFrame` — multiple synchronous
 *     mutations only fire one re-fit.
 *   - The `MAX_FRAC` cap is computed against `window.screen.height` so we
 *     don't push past the user's display on a small screen.
 *   - `extraDeps` re-fits when something outside the measured DOM moves
 *     (a menu opening above the input, a network toggle, …).
 */
export function useAdaptiveHeight(opts: {
  measureRef: React.RefObject<HTMLElement | null>;
  /** When true, the auto-fit is disabled — useful when an external state owns
   *  the window geometry (e.g. fullscreen for the Teams mode). The hook keeps
   *  the observer paused so it doesn't fight the OS window size. */
  disabled?: boolean;
  /** Extra logical pixels to reserve at the bottom (in addition to the natural
   *  body content height). Used to grow the bar when an `@` / engine dropdown
   *  opens — those menus are `position: absolute` and don't contribute to the
   *  measured wrapper's offsetHeight, so we have to add them explicitly. */
  menuExtra?: number;
  extraDeps?: unknown[];
}) {
  const { measureRef, disabled, menuExtra = 0 } = opts;
  const lastHeightRef = useRef(0);

  const setHeight = useCallback((h: number) => {
    const v = Math.round(h);
    if (lastHeightRef.current === v) return;
    lastHeightRef.current = v;
    invoke("set_bar_height", { height: v }).catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    if (disabled) return;
    const measureEl = measureRef.current;
    if (!measureEl) return;
    // Invalidate the cache so the next fit always fires, even if the natural
    // height equals the last value adapted before we were disabled (typical
    // case: returning from the overlay's forced-tall height to compact body).
    lastHeightRef.current = -1;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const measureH = measureEl.offsetHeight || 0;
        const screen = window.screen?.height ?? 1080;
        const MAX = Math.floor(screen * MAX_FRAC);
        const desired = CHROME_H + measureH + menuExtra + SLACK;
        const clamped = Math.max(MIN_HEIGHT, Math.min(MAX, desired));
        setHeight(clamped);
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(measureEl);
    // Also re-fit on OS-driven window resizes (exiting native fullscreen, the
    // green traffic light, a manual edge-drag). The ResizeObserver above watches
    // the content; this watches the WINDOW. Without it, exiting fullscreen
    // leaves the window at the fullscreen size because nothing changed inside.
    const unlistenPromise = listen("geom-changed", () => {
      lastHeightRef.current = -1;
      fit();
    });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      unlistenPromise.then((un) => un()).catch(() => { /* ignore */ });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, menuExtra, ...(opts.extraDeps ?? [])]);
}

/** Drive the Tauri bar's logical WIDTH. Width is normally fixed (680 px) and
 *  only height adapts to content; this hook switches between widths so
 *  occasional views that need more room — e.g. the "Your agents" overlay or
 *  any future model-picker — can breathe. Restores to the default on unmount
 *  by re-applying it on every effect run (last write wins). */
export function useBarWidth(width: number) {
  useEffect(() => {
    invoke("set_bar_width", { width }).catch(() => { /* ignore */ });
  }, [width]);
}

/** Observe the window's ACTUAL fullscreen state (the user's green traffic
 *  light included), as opposed to `useFullscreen`'s app-driven flag. The home
 *  uses it to fill the canvas with the expert gallery when the user maximised
 *  the bar themselves: native fullscreen is the only persistent large state —
 *  manual edge-drags get re-fit back to content height by `useAdaptiveHeight`. */
export function useNativeFullscreen(): boolean {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    let alive = true;
    const check = () => {
      win.isFullscreen().then((v) => { if (alive) setFs(v); }).catch(() => { /* headless test */ });
    };
    check();
    const un = win.onResized(check);
    return () => {
      alive = false;
      un.then((f) => f()).catch(() => { /* ignore */ });
    };
  }, []);
  return fs;
}

/** Toggle the Tauri window to native fullscreen (macOS creates a dedicated
 *  Space). Used by the Teams mode, which needs the full canvas to render the
 *  Chief-of-Staff orchestration view. The window is resizable globally now,
 *  so we don't toggle that flag — just the fullscreen state. */
export function useFullscreen(active: boolean) {
  useEffect(() => {
    const win = getCurrentWindow();
    win.setFullscreen(active).catch(() => { /* capability not granted, headless test, etc. */ });
  }, [active]);
}
