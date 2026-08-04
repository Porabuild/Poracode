import { useLayoutEffect, useRef, type RefObject } from "react";
import {
  LIGHTWEIGHT_THREAD_LIST_POP_ANIMATION,
  LIGHTWEIGHT_THREAD_LIST_POP_CLASS,
  LIGHTWEIGHT_THREAD_LIST_POP_DURATION_MS,
  LIGHTWEIGHT_SUBAGENT_PUSH_ANIMATION,
  LIGHTWEIGHT_SUBAGENT_PUSH_CLASS,
  LIGHTWEIGHT_SUBAGENT_POP_ANIMATION,
  LIGHTWEIGHT_SUBAGENT_POP_CLASS,
  LIGHTWEIGHT_FULLSCREEN_PUSH_ANIMATION,
  LIGHTWEIGHT_FULLSCREEN_PUSH_CLASS,
  LIGHTWEIGHT_FULLSCREEN_POP_ANIMATION,
  LIGHTWEIGHT_FULLSCREEN_POP_CLASS,
  shouldUseLightweightFullscreenPop,
  shouldUseLightweightFullscreenPush,
  shouldUseLightweightSubAgentPop,
  shouldUseLightweightSubAgentPush,
  shouldUseLightweightThreadListPop,
} from "./lightweightThreadListPop";

/**
 * Starts iOS-web fallback animations during the route commit, before the new
 * route paints. Every supported path targets only a lightweight incoming layer
 * (the list/subagent shell, or a fullscreen overlay sliding over the page),
 * never a virtualized transcript or diff snapshot.
 */
export function useLightweightThreadListPop(
  shellRef: RefObject<HTMLDivElement | null>,
  pathname: string,
): void {
  const previousPathnameRef = useRef(pathname);

  useLayoutEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    const shell = shellRef.current;
    if (!shell) return;
    shell.classList.remove(LIGHTWEIGHT_THREAD_LIST_POP_CLASS);
    shell.classList.remove(LIGHTWEIGHT_SUBAGENT_PUSH_CLASS);
    shell.classList.remove(LIGHTWEIGHT_SUBAGENT_POP_CLASS);
    shell.classList.remove(LIGHTWEIGHT_FULLSCREEN_PUSH_CLASS);
    shell.classList.remove(LIGHTWEIGHT_FULLSCREEN_POP_CLASS);

    // Mutually exclusive: a navigation matches at most one lightweight path.
    const candidates = [
      {
        active: shouldUseLightweightThreadListPop(previousPathname, pathname),
        className: LIGHTWEIGHT_THREAD_LIST_POP_CLASS,
        animationName: LIGHTWEIGHT_THREAD_LIST_POP_ANIMATION,
      },
      {
        active: shouldUseLightweightSubAgentPush(previousPathname, pathname),
        className: LIGHTWEIGHT_SUBAGENT_PUSH_CLASS,
        animationName: LIGHTWEIGHT_SUBAGENT_PUSH_ANIMATION,
      },
      {
        active: shouldUseLightweightSubAgentPop(previousPathname, pathname),
        className: LIGHTWEIGHT_SUBAGENT_POP_CLASS,
        animationName: LIGHTWEIGHT_SUBAGENT_POP_ANIMATION,
      },
      {
        active: shouldUseLightweightFullscreenPush(previousPathname, pathname),
        className: LIGHTWEIGHT_FULLSCREEN_PUSH_CLASS,
        animationName: LIGHTWEIGHT_FULLSCREEN_PUSH_ANIMATION,
      },
      {
        active: shouldUseLightweightFullscreenPop(previousPathname, pathname),
        className: LIGHTWEIGHT_FULLSCREEN_POP_CLASS,
        animationName: LIGHTWEIGHT_FULLSCREEN_POP_ANIMATION,
      },
    ];
    const transition = candidates.find((candidate) => candidate.active);
    if (!transition) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const { className, animationName } = transition;
    shell.classList.add(className);
    const removeClass = () => shell.classList.remove(className);
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.animationName === animationName) removeClass();
    };
    shell.addEventListener("animationend", onAnimationEnd);
    const timeout = window.setTimeout(removeClass, LIGHTWEIGHT_THREAD_LIST_POP_DURATION_MS + 100);

    return () => {
      window.clearTimeout(timeout);
      shell.removeEventListener("animationend", onAnimationEnd);
      removeClass();
    };
  }, [pathname, shellRef]);
}
