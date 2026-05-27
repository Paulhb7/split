import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

// Adaptive bar window — fits its height to the natural content height, like the
// original Split bar. Width is fixed at the Tauri level (680 px, non-resizable);
// only height changes. The Rust side owns the resize call via the `set_bar_height`
// command so the React side stays out of platform DPI quirks.
//
// Height bounds (logical pixels):
const COMPACT = 96;             // idle: just the composer row
const MIN_EXPANDED = 200;       // floor whenever the bar is "expanded"
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
 * natural `offsetHeight` reflects what's drawn. When `expanded` is false the
 * bar collapses to `COMPACT`; otherwise the window height becomes
 * `clamp(chrome + content + slack, MIN_EXPANDED, MAX)`.
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
  expanded: boolean;
  extraDeps?: unknown[];
}) {
  const { measureRef, expanded } = opts;
  const lastHeightRef = useRef(0);

  const setHeight = useCallback((h: number) => {
    const v = Math.round(h);
    if (lastHeightRef.current === v) return;
    lastHeightRef.current = v;
    invoke("set_bar_height", { height: v }).catch(() => { /* ignore */ });
  }, []);

  // Compact mode — short-circuit, no observer needed.
  useEffect(() => {
    if (expanded) return;
    setHeight(COMPACT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Expanded mode — observe the measure wrapper.
  useEffect(() => {
    if (!expanded) return;
    const measureEl = measureRef.current;
    if (!measureEl) return;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const measureH = measureEl.offsetHeight || 0;
        const screen = window.screen?.height ?? 1080;
        const MAX = Math.floor(screen * MAX_FRAC);
        const desired = CHROME_H + measureH + SLACK;
        const clamped = Math.max(MIN_EXPANDED, Math.min(MAX, desired));
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
  }, [expanded, ...(opts.extraDeps ?? [])]);
}
