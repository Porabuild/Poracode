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

export function isIgnorableWindowError(event: ErrorEvent): boolean {
  return isResizeObserverLoopError(event.error) || isResizeObserverLoopError(event.message);
}

export function isIgnorableRejection(reason: unknown): boolean {
  return isViewTransitionSkippedError(reason);
}
