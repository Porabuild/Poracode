const RESIZE_OBSERVER_LOOP_MESSAGES = new Set([
  "ResizeObserver loop completed with undelivered notifications.",
  "ResizeObserver loop limit exceeded",
]);

function readErrorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

function readErrorName(error: unknown): string | null {
  if (error instanceof Error) return error.name;
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

export function isResizeObserverLoopError(error: unknown): boolean {
  const message = readErrorMessage(error);
  return message !== null && RESIZE_OBSERVER_LOOP_MESSAGES.has(message);
}

/**
 * Safari reports failures from scripts whose details it cannot expose as an
 * opaque `Script error.` event: no Error object, source URL, or line/column.
 * This can be emitted by browser-injected or otherwise cross-origin scripts and
 * gives the renderer nothing actionable to recover from. Do not replace a
 * healthy app with the fatal crash screen for that diagnostic. A real
 * same-origin exception still carries an Error or source location and remains
 * fatal even if its message happens to match.
 */
export function isOpaqueScriptError(event: ErrorEvent): boolean {
  return (
    (event.message === "Script error." || event.message === "Script error") &&
    event.error == null &&
    !event.filename &&
    event.lineno === 0 &&
    event.colno === 0
  );
}

// HeroUI/react-aria-components wraps toast queue updates in
// document.startViewTransition(). The ViewTransition's finished/ready/
// updateCallbackDone promises reject with AbortError "Transition was skipped"
// when a new transition supersedes the previous one (e.g. closing a toast
// while another is animating). HeroUI does not attach handlers, so the
// rejection bubbles to window. It is benign — the DOM update still ran via
// flushSync — and must not be treated as a renderer crash.
export function isViewTransitionSkippedError(error: unknown): boolean {
  const name = readErrorName(error);
  if (name !== "AbortError") return false;
  const message = readErrorMessage(error);
  return message === "Transition was skipped";
}

// Sibling of `isViewTransitionSkippedError`: when the document state changes
// in a way that invalidates the snapshot mid-transition (e.g. the Settings
// overlay closes while a button-press transition is mid-flight, or the
// terminal panel opens and reflows the tree), Chromium rejects the
// ViewTransition promises with InvalidStateError "Transition was aborted
// because of invalid state" instead of the AbortError variant. Same root
// cause, same benign treatment — the DOM update still completed.
export function isViewTransitionInvalidStateError(error: unknown): boolean {
  const name = readErrorName(error);
  if (name !== "InvalidStateError") return false;
  const message = readErrorMessage(error);
  return message === "Transition was aborted because of invalid state";
}

export function isIgnorableWindowError(event: ErrorEvent): boolean {
  return (
    isOpaqueScriptError(event) ||
    isResizeObserverLoopError(event.error) ||
    isResizeObserverLoopError(event.message)
  );
}

export function isIgnorableRejection(reason: unknown): boolean {
  return isViewTransitionSkippedError(reason) || isViewTransitionInvalidStateError(reason);
}
