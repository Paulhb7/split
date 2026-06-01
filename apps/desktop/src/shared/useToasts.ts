import { useCallback, useEffect, useRef, useState } from "react";

export interface Toast {
  id: string;
  text: string;
}

// Transient toast notifications with self-cleaning timers. Each pushed toast
// auto-dismisses after `ttl` ms; every pending timer is cleared on unmount so
// a toast pushed just before the window closes can't fire `setState` on a dead
// component (the orphaned-`setTimeout` smell the old inline version had).
export function useToasts(defaultTtl = 5000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const handle = timers.current[id];
    if (handle) {
      clearTimeout(handle);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback(
    (text: string, ttl = defaultTtl) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((t) => [...t, { id, text }]);
      timers.current[id] = setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [defaultTtl, dismiss]
  );

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
    },
    []
  );

  return { toasts, push };
}
