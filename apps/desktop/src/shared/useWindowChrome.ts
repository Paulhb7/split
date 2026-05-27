import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
 * pin (always-on-top), hide, drag the borderless window by the chrome bar. */
export function useWindowChrome() {
  const win = getCurrentWindow();
  const [pinned, setPinned] = useState(true);

  const togglePin = useCallback(() => {
    setPinned((p) => {
      const np = !p;
      win.setAlwaysOnTop(np);
      return np;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMove = useCallback(() => {
    win.startDragging();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hide = useCallback(() => {
    win.hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pinned, togglePin, startMove, hide };
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
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, menuExtra, ...(opts.extraDeps ?? [])]);
}

/** Toggle the Tauri window to native fullscreen (macOS creates a dedicated
 *  Space). Used by the Teams mode, which needs the full canvas to render the
 *  Chief-of-Staff orchestration view comfortably. Exiting fullscreen returns
 *  the window to its pre-fullscreen size, and `useAdaptiveHeight` resumes
 *  fitting it to the body content.
 *
 *  macOS native fullscreen silently rejects the call when the window is
 *  marked non-resizable in tauri.conf.json. We toggle `resizable` around the
 *  fullscreen call: true → enter → false on exit, so the adaptive bar
 *  outside Teams mode keeps its non-resizable contract. */
export function useFullscreen(active: boolean) {
  useEffect(() => {
    const win = getCurrentWindow();
    (async () => {
      try {
        if (active) {
          await win.setResizable(true);
          await win.setFullscreen(true);
        } else {
          await win.setFullscreen(false);
          await win.setResizable(false);
        }
      } catch {
        /* ignore — capability not granted, headless test, etc. */
      }
    })();
  }, [active]);
}
