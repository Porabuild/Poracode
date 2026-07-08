import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Thread } from "@/shared/contracts";
import { isFullscreenScreenPath, threadIdFromPath } from "./navHelpers";
import type { Chrome } from "./chrome";

const FULLSCREEN_HEADER_MIN_HOLD_MS = 360;
const FULLSCREEN_HEADER_MAX_HOLD_MS = 1_200;
const FULLSCREEN_HEADER_POLL_MS = 50;

interface HeldThreadHeader {
  readonly key: string;
  readonly thread: Thread;
  readonly threads: readonly Thread[];
}

/**
 * Drives the narrow shell's thread header across a fullscreen hand-off.
 *
 * `headerThread` is the thread header for the *current* route (only set while
 * `chromeLayout` is "thread" and the routed thread id matches the selected
 * thread). When the route then jumps straight from that thread into a
 * fullscreen route (workspace, PR review, terminal — these render their own
 * chrome and hide the shell's top bar), the outgoing thread's header is kept
 * mounted as `visibleHeldThreadHeader` for a short window so the shared
 * element view transition has a matching header to animate from/to, then
 * released once the transition has had time to settle.
 */
export function useHeldThreadHeader(params: {
  readonly pathname: string;
  readonly chromeLayout: Chrome["layout"];
  readonly selectedThread: Thread | null;
  readonly threads: readonly Thread[];
}): {
  readonly headerThread: Thread | null;
  readonly visibleHeldThreadHeader: HeldThreadHeader | null;
} {
  const { pathname, chromeLayout, selectedThread, threads } = params;
  const previousPathnameRef = useRef(pathname);
  const lastThreadHeaderRef = useRef<HeldThreadHeader | null>(null);
  const heldThreadHeaderRef = useRef<HeldThreadHeader | null>(null);
  const heldThreadHeaderTimerRef = useRef<number | null>(null);
  const [, rerenderHeldThreadHeader] = useState(0);

  const clearHeldThreadHeaderTimer = () => {
    if (!heldThreadHeaderTimerRef.current) return;
    window.clearTimeout(heldThreadHeaderTimerRef.current);
    heldThreadHeaderTimerRef.current = null;
  };
  useEffect(() => () => clearHeldThreadHeaderTimer(), []);
  const clearHeldThreadHeader = (snapshot: HeldThreadHeader) => {
    if (heldThreadHeaderRef.current?.key !== snapshot.key) return;
    heldThreadHeaderRef.current = null;
    rerenderHeldThreadHeader((version) => version + 1);
  };
  const isViewTransitionActive = () => {
    try {
      return document.documentElement.matches(":active-view-transition");
    } catch {
      return false;
    }
  };
  const scheduleHeldThreadHeaderRelease = (snapshot: HeldThreadHeader) => {
    clearHeldThreadHeaderTimer();
    const startedAt = performance.now();
    const check = () => {
      heldThreadHeaderTimerRef.current = null;
      if (heldThreadHeaderRef.current?.key !== snapshot.key) return;

      const elapsed = performance.now() - startedAt;
      if (
        (elapsed >= FULLSCREEN_HEADER_MIN_HOLD_MS && !isViewTransitionActive()) ||
        elapsed >= FULLSCREEN_HEADER_MAX_HOLD_MS
      ) {
        clearHeldThreadHeader(snapshot);
        return;
      }
      heldThreadHeaderTimerRef.current = window.setTimeout(check, FULLSCREEN_HEADER_POLL_MS);
    };
    heldThreadHeaderTimerRef.current = window.setTimeout(check, FULLSCREEN_HEADER_MIN_HOLD_MS);
  };

  // `selectedThread` falls back to the most-recent thread, so on a stale
  // /thread/:id deep link (thread deleted elsewhere) it points at the wrong
  // thread. Only trust it for thread chrome when it matches the routed id;
  // otherwise the header must not offer actions that would hit that other thread.
  const routedThreadId = threadIdFromPath(pathname);
  const headerThread =
    chromeLayout === "thread" && selectedThread && selectedThread.id === routedThreadId
      ? selectedThread
      : null;
  if (headerThread) {
    lastThreadHeaderRef.current = {
      key: headerThread.id,
      thread: headerThread,
      threads,
    };
  }
  const enteringFullscreenFromThread =
    chromeLayout === "fullscreen" &&
    previousPathnameRef.current !== pathname &&
    threadIdFromPath(previousPathnameRef.current) !== null &&
    isFullscreenScreenPath(pathname);
  const immediateHeldThreadHeader = enteringFullscreenFromThread
    ? lastThreadHeaderRef.current
    : null;
  if (immediateHeldThreadHeader) {
    heldThreadHeaderRef.current = immediateHeldThreadHeader;
  }
  const visibleHeldThreadHeader =
    chromeLayout === "fullscreen" ? heldThreadHeaderRef.current : null;

  useLayoutEffect(() => {
    const previousPathname = previousPathnameRef.current;
    if (previousPathname === pathname) return;
    previousPathnameRef.current = pathname;

    const shouldHoldThreadHeader =
      isFullscreenScreenPath(pathname) && threadIdFromPath(previousPathname) !== null;

    if (!shouldHoldThreadHeader) {
      clearHeldThreadHeaderTimer();
      heldThreadHeaderRef.current = null;
      rerenderHeldThreadHeader((version) => version + 1);
      return;
    }

    const snapshot = heldThreadHeaderRef.current ?? lastThreadHeaderRef.current;
    if (!snapshot) return;
    heldThreadHeaderRef.current = snapshot;
    scheduleHeldThreadHeaderRelease(snapshot);
  }, [pathname]);

  return { headerThread, visibleHeldThreadHeader };
}
