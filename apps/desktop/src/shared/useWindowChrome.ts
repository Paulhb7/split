import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";

// @tauri-apps/api declares ResizeDirection but doesn't export it; mirror it.
export type RzDir =
  | "North" | "South" | "East" | "West"
  | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";

const LS_GEOM = "split.geom";

export type Preset = "S" | "M" | "L";
export const PRESETS: Record<Preset, { w: number; h: number }> = {
  S: { w: 440, h: 152 },
  M: { w: 760, h: 560 },
  L: { w: 1080, h: 780 },
};

// Owns window geometry: restore on launch, persist on resize/move, presets,
// free move + edge/corner resize (custom chrome on a borderless window), pin.
export function useWindowChrome() {
  const win = getCurrentWindow();
  const [pinned, setPinned] = useState(true);
  const [width, setWidth] = useState(760);
  const saveT = useRef<number | null>(null);

  // restore saved geometry once
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(LS_GEOM);
        if (raw) {
          const g = JSON.parse(raw);
          if (g.w && g.h) await win.setSize(new LogicalSize(g.w, g.h));
          if (typeof g.x === "number" && typeof g.y === "number")
            await win.setPosition(new LogicalPosition(g.x, g.y));
        }
        const f = await win.scaleFactor();
        const s = await win.innerSize();
        setWidth(Math.round(s.width / f));
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // track current width + persist geometry (debounced)
  useEffect(() => {
    const save = async () => {
      try {
        const f = await win.scaleFactor();
        const s = await win.innerSize();
        const p = await win.outerPosition();
        setWidth(Math.round(s.width / f));
        if (saveT.current) clearTimeout(saveT.current);
        saveT.current = window.setTimeout(() => {
          localStorage.setItem(
            LS_GEOM,
            JSON.stringify({ w: Math.round(s.width / f), h: Math.round(s.height / f), x: Math.round(p.x / f), y: Math.round(p.y / f) })
          );
        }, 350);
      } catch {
        /* ignore */
      }
    };
    const u1 = win.onResized(save);
    const u2 = win.onMoved(save);
    return () => {
      u1.then((f) => f());
      u2.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = useCallback((p: Preset) => {
    const { w, h } = PRESETS[p];
    win.setSize(new LogicalSize(w, h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startResize = useCallback((dir: RzDir) => {
    // the SDK's param type isn't exported; the string union matches at runtime
    win.startResizeDragging(dir as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMove = useCallback(() => {
    win.startDragging();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePin = useCallback(() => {
    setPinned((p) => {
      const np = !p;
      win.setAlwaysOnTop(np);
      return np;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hide = useCallback(() => {
    win.hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { width, pinned, applyPreset, startResize, startMove, togglePin, hide };
}
