import { runAfterTransition } from "react-aria/private/utils/runAfterTransition";

const CLEANUP_PROPERTY = "__poracode_transition_cleanup__";

function createSyntheticTransitionEvent(type: "transitionrun" | "transitionend"): Event {
  const event = new Event(type);
  Object.defineProperty(event, "propertyName", { value: CLEANUP_PROPERTY });
  return event;
}

const DRAIN_STRANDED_CALLBACKS = () => {
  if (typeof document === "undefined" || !document.body) {
    return;
  }
  document.body.dispatchEvent(createSyntheticTransitionEvent("transitionrun"));
  document.body.dispatchEvent(createSyntheticTransitionEvent("transitionend"));
};

let scheduledRaf: typeof requestAnimationFrame | null = null;

/**
 * Purges detached DOM subtrees retained by `react-aria`'s global `transitionsByElement` Map
 * and drains any `transitionCallbacks` stranded while those detached elements were animating.
 *
 * `react-aria` attaches a `{ once: true }` `transitioncancel` listener per element when tracking
 * `transitionrun` events on `document.body`. Elements that animate multiple CSS longhands at once
 * (such as `border-color` or `transition-colors`) and unmount mid-transition consume that listener
 * on the first canceled property, leaving remaining properties—and the detached element's ancestor
 * pane subtree—pinned in `transitionsByElement` until `runAfterTransition` runs its internal
 * `cleanupDetachedElements()` pass on the next animation frame. When `cleanupDetachedElements()`
 * empties `transitionsByElement`, `react-aria` invokes `DRAIN_STRANDED_CALLBACKS`, which dispatches
 * a balanced no-op transition pair on `document.body` so `onTransitionEnd` flushes `transitionCallbacks`
 * without leaving any listener or Map entry behind.
 */
export function scheduleDetachedTransitionCleanup(): void {
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf !== "function" || scheduledRaf === raf) {
    return;
  }
  scheduledRaf = raf;
  raf(() => {
    if (scheduledRaf === raf) {
      scheduledRaf = null;
    }
  });
  runAfterTransition(DRAIN_STRANDED_CALLBACKS);
}
