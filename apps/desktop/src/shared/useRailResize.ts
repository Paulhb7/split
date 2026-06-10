import { useEffect, useRef, useState } from "react";

const LS_RAILW = "split.artRailWidth"; // px width of the conversation rail in artifact-split mode
const RAIL_MIN = 320;
const RAIL_MAX = 900;
const RAIL_DEFAULT = 460;

// Width (in px) of the conversation rail when the artifact-split layout is
// active. The user drags the divider to taste; we clamp to [RAIL_MIN,
// RAIL_MAX] and persist so the next session honours their preference.
export function useRailResize() {
  const [railWidth, setRailWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(LS_RAILW));
    if (Number.isFinite(stored) && stored >= RAIL_MIN && stored <= RAIL_MAX) return stored;
    return RAIL_DEFAULT;
  });
  useEffect(() => { localStorage.setItem(LS_RAILW, String(Math.round(railWidth))); }, [railWidth]);

  // Pointer drag for the split divider. We listen on the window for
  // mousemove/up so the drag survives the cursor briefly leaving the 6px
  // handle. The cursor is forced to col-resize across the whole document
  // during the drag so it never flickers back to text/default over the
  // editor or thread underneath.
  const railDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onRailHandleDown = (e: React.MouseEvent) => {
    e.preventDefault();
    railDragRef.current = { startX: e.clientX, startW: railWidth };
    const onMove = (m: MouseEvent) => {
      const r = railDragRef.current; if (!r) return;
      const next = r.startW + (m.clientX - r.startX);
      setRailWidth(Math.max(RAIL_MIN, Math.min(RAIL_MAX, next)));
    };
    const onUp = () => {
      railDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return { railWidth, onRailHandleDown };
}
