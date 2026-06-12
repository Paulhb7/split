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
  /** Growth ceiling as a fraction of the screen height. Defaults to MAX_FRAC
   *  (0.7); the bar posture passes a lower cap so a streaming turn stops
   *  pumping the window early and scrolls instead. */
  maxFrac?: number;
  extraDeps?: unknown[];
}) {
  const { measureRef, disabled, menuExtra = 0, maxFrac = MAX_FRAC } = opts;
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
        const MAX = Math.floor(screen * maxFrac);
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
    // Debounce the window-resize re-fit so it acts on the SETTLED size, not on
    // every intermediate frame of a native-fullscreen animation. By the time it
    // fires (~420ms), `useNativeFullscreen` has flipped `nativeFs` true and this
    // effect has been torn down via `disabled` — so we never push a content-sized
    // `set_bar_height` against a window macOS is taking fullscreen.
    let geomTimer: ReturnType<typeof setTimeout> | undefined;
    const unlistenPromise = listen("geom-changed", () => {
      if (geomTimer) clearTimeout(geomTimer);
      geomTimer = setTimeout(() => {
        lastHeightRef.current = -1;
        fit();
      }, 420);
    });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      if (geomTimer) clearTimeout(geomTimer);
      unlistenPromise.then((un) => un()).catch(() => { /* ignore */ });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, menuExtra, maxFrac, ...(opts.extraDeps ?? [])]);
}

/** Drive the Tauri bar's logical WIDTH. Width is normally fixed (680 px) and
 *  only height adapts to content; this hook switches between widths so
 *  occasional views that need more room — e.g. the "Your agents" overlay or
 *  any future model-picker — can breathe. Restores to the default on unmount
 *  by re-applying it on every effect run (last write wins). */
export function useBarWidth(width: number | null) {
  useEffect(() => {
    // `null` = don't touch the width — used when the window is natively
    // fullscreen, where forcing 680 just fights the OS geometry (macOS ignores
    // the resize but the attempt still churns) and the CSS column owns the
    // layout instead. Skipping it keeps the webview full-width and stable.
    if (width == null) return;
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      win.isFullscreen().then((v) => { if (alive) setFs(v); }).catch(() => { /* headless test */ });
    };
    // macOS flips the fullscreen flag on `windowDidEnterFullScreen`, which fires
    // AFTER the final `Resized` event of the ~250ms animation. So an immediate
    // read during the transition reports the stale value and nothing re-reads it
    // — leaving `nativeFs` false even though we ARE fullscreen. Read now for the
    // live size and again once the animation has settled.
    const check = () => {
      read();
      if (timer) clearTimeout(timer);
      timer = setTimeout(read, 350);
    };
    check();
    const un = win.onResized(check);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
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
