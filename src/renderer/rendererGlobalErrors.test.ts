import { describe, expect, it } from "vitest";
import {
  isIgnorableRejection,
  isIgnorableWindowError,
  isResizeObserverLoopError,
  isViewTransitionInvalidStateError,
  isViewTransitionSkippedError,
} from "./rendererGlobalErrors";

describe("rendererGlobalErrors", () => {
  it("recognizes browser ResizeObserver loop diagnostics", () => {
    expect(
      isResizeObserverLoopError(
        new Error("ResizeObserver loop completed with undelivered notifications."),
      ),
    ).toBe(true);
    expect(isResizeObserverLoopError("ResizeObserver loop limit exceeded")).toBe(true);
  });

  it("does not ignore normal errors", () => {
    expect(isResizeObserverLoopError(new Error("render failed"))).toBe(false);
  });

  it("ignores ResizeObserver loop window error events", () => {
    const event = new ErrorEvent("error", {
      message: "ResizeObserver loop completed with undelivered notifications.",
    });

    expect(isIgnorableWindowError(event)).toBe(true);
  });

  it("recognizes view-transition skipped AbortError rejections", () => {
    const abort = new DOMException("Transition was skipped", "AbortError");
    expect(isViewTransitionSkippedError(abort)).toBe(true);
    expect(isIgnorableRejection(abort)).toBe(true);
  });

  it("does not ignore unrelated AbortErrors", () => {
    const abort = new DOMException("Fetch aborted", "AbortError");
    expect(isViewTransitionSkippedError(abort)).toBe(false);
    expect(isIgnorableRejection(abort)).toBe(false);
  });

  it("does not ignore non-AbortError rejections with similar messages", () => {
    expect(isIgnorableRejection(new Error("Transition was skipped"))).toBe(false);
    expect(isIgnorableRejection("Transition was skipped")).toBe(false);
  });

  it("recognizes view-transition invalid-state InvalidStateError rejections", () => {
    const err = new DOMException(
      "Transition was aborted because of invalid state",
      "InvalidStateError",
    );
    expect(isViewTransitionInvalidStateError(err)).toBe(true);
    expect(isIgnorableRejection(err)).toBe(true);
  });

  it("does not ignore unrelated InvalidStateErrors", () => {
    const err = new DOMException("IndexedDB transaction inactive", "InvalidStateError");
    expect(isViewTransitionInvalidStateError(err)).toBe(false);
    expect(isIgnorableRejection(err)).toBe(false);
  });
});
