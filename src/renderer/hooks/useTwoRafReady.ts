import { useEffect, useState } from "react";

/**
 * Returns `true` two animation frames after `active` flips to `true`, and
 * `false` synchronously when `active` flips to `false`. Two frames so the
 * browser has committed the mounted-but-off-screen state before the CSS
 * transition runs — otherwise the element slides in from its final position
 * (i.e. doesn't appear to animate at all).
 */
export function useTwoRafReady(active: boolean): boolean {
  const [ready, setReady] = useState(false);
  if (!active && ready) setReady(false);
  useEffect(() => {
    if (!active) return;
    let r1: number | null = requestAnimationFrame(() => {
      r1 = null;
      r2 = requestAnimationFrame(() => {
        r2 = null;
        setReady(true);
      });
    });
    let r2: number | null = null;
    return () => {
      if (r1 !== null) cancelAnimationFrame(r1);
      if (r2 !== null) cancelAnimationFrame(r2);
    };
  }, [active]);
  return ready;
}
