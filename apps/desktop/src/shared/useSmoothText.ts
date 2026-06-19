import { useEffect, useRef, useState } from "react";

// Auto-close markdown syntax left open at the tail of an in-flight stream so
// nothing already on screen reflows when the closing marker arrives: an odd
// number of ``` fences gets a closing fence, and the last line's unbalanced
// `**` / `*` / backtick markers get their closers appended. Inline fixes are
// skipped while inside an open fence (the fence close handles it).
export function stabilizeMarkdown(src: string): string {
  const fences = (src.match(/^\s*```/gm) || []).length;
  if (fences % 2 === 1) return src + "\n```";
  // Fence delimiters (```) on the last line are not inline backticks.
  const tail = src.slice(src.lastIndexOf("\n") + 1).replace(/```/g, "");
  let out = src;
  if ((tail.match(/`/g) || []).length % 2 === 1) out += "`";
  if ((tail.match(/\*\*/g) || []).length % 2 === 1) out += "**";
  if ((tail.replace(/\*\*/g, "").match(/\*/g) || []).length % 2 === 1) out += "*";
  return out;
}

// Typewriter buffer for streamed text. ACP chunks arrive in irregular bursts
// (agent adapter + stdio buffering); revealing them as they land makes every
// transport hiccup visible. This decouples arrival from display: `target`
// accumulates on the wire, the rAF loop reveals it at a steady ~2 chars/frame,
// accelerating proportionally once the backlog passes ~120 chars so the
// display never trails the wire by more than roughly half a second.
//
// `active` false (turn finished) → reveal everything instantly. `resetKey`
// (the session id) changing → snap to the full text, so switching to a
// session mid-stream doesn't replay its answer from the top.
export function useSmoothText(target: string, active: boolean, resetKey: string): string {
  const [count, setCount] = useState(target.length);
  const countRef = useRef(count);
  countRef.current = count;

  // Session switch: show whatever is already in flight, no replay. Adjusting
  // state during render (instead of an effect) avoids a one-frame flash of
  // the previous session's reveal point.
  const keyRef = useRef(resetKey);
  if (keyRef.current !== resetKey) {
    keyRef.current = resetKey;
    countRef.current = target.length;
    setCount(target.length);
  }

  useEffect(() => {
    if (!active) {
      if (countRef.current !== target.length) setCount(target.length);
      return;
    }
    // New turn: the buffer was committed and reset to "" (or replaced by a
    // shorter text) — start revealing from the top.
    if (target.length < countRef.current) {
      countRef.current = 0;
      setCount(0);
    }
    if (target.length <= countRef.current) return;
    let raf = 0;
    const tick = () => {
      // Caught up — stop; the effect re-arms when the next chunk lands.
      if (countRef.current >= target.length) return;
      setCount((c) => {
        const backlog = target.length - c;
        const step = Math.max(2, Math.round((backlog - 120) * 0.06) + 2);
        return Math.min(target.length, c + step);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);

  return target.slice(0, Math.min(count, target.length));
}
