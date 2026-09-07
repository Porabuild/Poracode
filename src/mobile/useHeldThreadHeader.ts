import { useEffect, useState } from "react";
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
 *
 * Owned snapshots live in state and adjust during render (never as render-time
 * ref writes): the hold must already be in place on the first fullscreen paint
 * or the transition flashes a headerless frame. Only the release polling uses
 * an effect.
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
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [lastThreadHeader, setLastThreadHeader] = useState<HeldThreadHeader | null>(null);
  const [heldThreadHeader, setHeldThreadHeader] = useState<HeldThreadHeader | null>(null);

  // `selectedThread` falls back to the most-recent thread, so on a stale
  // /thread/:id deep link (thread deleted elsewhere) it points at the wrong
  // thread. Only trust it for thread chrome when it matches the routed id;
  // otherwise the header must not offer actions that would hit that other thread.
  const routedThreadId = threadIdFromPath(pathname);
  const headerThread =
    chromeLayout === "thread" && selectedThread && selectedThread.id === routedThreadId
      ? selectedThread
      : null;
  // Guarded on the thread identity so a fresh `threads` array alone never
  // re-triggers the update (the held header is inert; its list going briefly
  // stale is unobservable).
  if (headerThread && lastThreadHeader?.thread !== headerThread) {
    setLastThreadHeader({
      key: headerThread.id,
      thread: headerThread,
      threads,
    });
  }

  const enteringFullscreenFromThread =
    chromeLayout === "fullscreen" &&
    prevPathname !== pathname &&
    threadIdFromPath(prevPathname) !== null &&
    isFullscreenScreenPath(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (enteringFullscreenFromThread) {
      if (lastThreadHeader) setHeldThreadHeader(lastThreadHeader);
    } else {
      const shouldHoldThreadHeader =
        isFullscreenScreenPath(pathname) && threadIdFromPath(prevPathname) !== null;
      if (!shouldHoldThreadHeader) {
        if (heldThreadHeader !== null) setHeldThreadHeader(null);
      } else if (heldThreadHeader === null && lastThreadHeader) {
        setHeldThreadHeader(lastThreadHeader);
      }
    }
  }
  const visibleHeldThreadHeader = chromeLayout === "fullscreen" ? heldThreadHeader : null;

  // Release the hold once the hand-off transition has had time to settle:
  // at least MIN_HOLD ms and no active view transition, or MAX_HOLD ms come
  // what may. Keyed on the held snapshot and the pathname so every navigation
  // while held restarts the schedule (like the pathname effect it replaces);
  // cleanup covers unmount and early release.
  useEffect(() => {
    if (heldThreadHeader === null || !isFullscreenScreenPath(pathname)) return;
    const snapshot = heldThreadHeader;
    const startedAt = performance.now();
    const isViewTransitionActive = () => {
      try {
        return document.documentElement.matches(":active-view-transition");
      } catch {
        return false;
      }
    };
    let timer: number | null = window.setTimeout(check, FULLSCREEN_HEADER_MIN_HOLD_MS);
    function check() {
      timer = null;
      const elapsed = performance.now() - startedAt;
      if (
        (elapsed >= FULLSCREEN_HEADER_MIN_HOLD_MS && !isViewTransitionActive()) ||
        elapsed >= FULLSCREEN_HEADER_MAX_HOLD_MS
      ) {
        setHeldThreadHeader((current) => (current?.key === snapshot.key ? null : current));
        return;
      }
      timer = window.setTimeout(check, FULLSCREEN_HEADER_POLL_MS);
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [heldThreadHeader, pathname]);

  return { headerThread, visibleHeldThreadHeader };
}
