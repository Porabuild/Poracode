import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type TransitionEvent,
} from "react";

const DEFAULT_FALLBACK_MS = 260;

export type KeepHeavyDisclosureOptions = {
  fallbackMs?: number;
};

/**
 * Keeps expensive disclosure body content mounted briefly after `isExpanded` becomes
 * false so HeroUI / RAC panel close animations can finish before unmounting.
 *
 * Pass `onCollapseTransitionEnd` to `Disclosure.Content` (the animating panel).
 * A timeout fallback runs if no transition event fires (e.g. `display` skips paint).
 *
 * Render expensive panel body with `(isExpanded || keepHeavy)` (not `keepHeavy` alone) so
 * the first open frame includes content; React Aria measures `scrollHeight` on that frame.
 *
 * Set `fallbackMs: 0` when the panel has **no** closing transition (e.g. height/opacity
 * snap). That drops heavy content in the same layout pass as close and avoids a
 * second measure / virtualizer notify cycle after the default timeout.
 */
export function useKeepHeavyMountedForDisclosure(
  isExpanded: boolean,
  options?: KeepHeavyDisclosureOptions,
) {
  const fallbackMs = options?.fallbackMs ?? DEFAULT_FALLBACK_MS;
  const [keepHeavy, setKeepHeavy] = useState(isExpanded);
  const [prevCollapse, setPrevCollapse] = useState({ isExpanded, fallbackMs });
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount/expand state derives from `isExpanded` (plus the immediate-collapse
  // fast path), so adjust during render. Timer arming/clearing stays in the
  // effects below, which run in the same commit before paint.
  if (prevCollapse.isExpanded !== isExpanded || prevCollapse.fallbackMs !== fallbackMs) {
    setPrevCollapse({ isExpanded, fallbackMs });
    if (isExpanded) {
      setKeepHeavy(true);
    } else if (
      fallbackMs <= 0 ||
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      setKeepHeavy(false);
    }
  }

  // A re-expand cancels a pending collapse timer before paint so the panel
  // never unmounts mid-open. Collapse-path clearing is owned by the arming
  // effect below (its cleanup runs before every re-arm).
  useLayoutEffect(() => {
    if (!isExpanded) return;
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [isExpanded]);

  useEffect(() => {
    if (isExpanded) {
      return;
    }

    if (fallbackMs <= 0) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setKeepHeavy(false);
    }, fallbackMs);

    return () => {
      if (closeTimerRef.current != null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isExpanded, fallbackMs]);

  const onCollapseTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLElement>) => {
      if (isExpanded) return;
      if (e.target !== e.currentTarget) return;
      if (closeTimerRef.current != null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setKeepHeavy(false);
    },
    [isExpanded],
  );

  return { keepHeavy, onCollapseTransitionEnd };
}
