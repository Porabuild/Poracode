import { runAfterTransition } from "react-aria/private/utils/runAfterTransition";

const CLEANUP_PROPERTY = "__poracode_transition_cleanup__";

function createSyntheticTransitionEvent(type: "transitionrun" | "transitionend"): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: CLEANUP_PROPERTY });
  return event;
}

let scheduledRaf: typeof requestAnimationFrame | null = null;
let drainingStrandedCallbacks = false;

/**
 * Purges detached DOM subtrees retained by `react-aria`'s global `transitionsByElement` Map
 * and drains any `transitionCallbacks` stranded while those detached elements were animating.
 *
 * `react-aria` attaches a `{ once: true }` `transitioncancel` listener per element when tracking
 * `transitionrun` events on `document.body`. Elements that animate multiple CSS longhands at once
 * (such as `border-color` or `transition-colors`) and unmount mid-transition consume that listener
 * on the first canceled property, leaving remaining properties and the detached element's ancestor
 * pane subtree pinned in `transitionsByElement` until `runAfterTransition` runs its internal
 * `cleanupDetachedElements()` pass on the next animation frame.
 *
 * Importantly, `runAfterTransition`'s `onTransitionEnd` handler iterates `transitionCallbacks`
 * BEFORE calling `transitionCallbacks.clear()`. Never dispatch synthetic transition events inside
 * a `runAfterTransition` callback, or a live connected transition ending later would invoke that
 * callback inside `onTransitionEnd` and re-enter `onTransitionEnd` recursively. Instead, probe
 * whether `cleanupDetachedElements()` emptied `transitionsByElement` via a pure boolean setter,
 * then drain stranded callbacks in the immediately following FIFO `requestAnimationFrame` callback
 * only when no live connected transitions remain.
 */
export function scheduleDetachedTransitionCleanup(): void {
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf !== "function" || scheduledRaf === raf) {
    return;
  }
  scheduledRaf = raf;
  let cleanedWithZeroActiveTransitions = false;
  runAfterTransition(() => {
    cleanedWithZeroActiveTransitions = true;
  });
  raf(() => {
    if (scheduledRaf === raf) {
      scheduledRaf = null;
    }
    if (
      !cleanedWithZeroActiveTransitions ||
      drainingStrandedCallbacks ||
      typeof document === "undefined" ||
      !document.body
    ) {
      return;
    }
    drainingStrandedCallbacks = true;
    try {
      document.body.dispatchEvent(createSyntheticTransitionEvent("transitionrun"));
      document.body.dispatchEvent(createSyntheticTransitionEvent("transitionend"));
    } finally {
      drainingStrandedCallbacks = false;
    }
  });
}
