import { describe, expect, it } from "vitest";
import {
  isAnonymousEvaluationError,
  isIgnorableRejection,
  isIgnorableWindowError,
  isOpaqueScriptError,
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

  it("ignores Safari's opaque script error diagnostic", () => {
    const event = new ErrorEvent("error", { message: "Script error." });

    expect(isOpaqueScriptError(event)).toBe(true);
    expect(isIgnorableWindowError(event)).toBe(true);
  });

  it("keeps script errors with actionable exception details fatal", () => {
    const error = new Error("Script error.");
    const event = new ErrorEvent("error", {
      message: "Script error.",
      error,
      filename: "http://localhost/app.js",
      lineno: 42,
      colno: 7,
    });

    expect(isOpaqueScriptError(event)).toBe(false);
    expect(isIgnorableWindowError(event)).toBe(false);
  });

  it.each([
    [
      "file:///C:/Poracode/resources/app.asar/dist/renderer/index.html",
      "file:///C:/Poracode/resources/app.asar/dist/renderer/index.html",
    ],
    ["https://app.poracode.com/", "https://app.poracode.com/"],
    ["", "http://localhost:3100/"],
  ])("recognizes anonymous diagnostic evaluations with source %j", (filename, documentUrl) => {
    const error = new Error("Cannot instrument shimmer writes");
    error.stack =
      "Error: Cannot instrument shimmer writes\n    at <anonymous>:4:67\n    at <anonymous>:10:7";
    const event = new ErrorEvent("error", {
      message: error.message,
      error,
      filename,
      lineno: 4,
      colno: 61,
    });

    expect(isAnonymousEvaluationError(event, documentUrl)).toBe(true);
    // Nonfatal evaluation errors must still reach the console and diagnostics.
    expect(isIgnorableWindowError(event)).toBe(false);
    expect(isIgnorableRejection(error)).toBe(false);
  });

  it.each([
    "Error: probe failed\n    at <anonymous>:4:67\n    at run (https://app.poracode.com/assets/app.js:10:7)",
    "Error: probe failed\n    at https://app.poracode.com/:4:67",
    "Error: probe failed\n    at eval (eval at run (https://app.poracode.com/assets/app.js:10:7), <anonymous>:4:67)",
    "Error: probe failed",
    undefined,
  ])("keeps sourced or missing stacks fatal: %s", (stack) => {
    const error = new Error("probe failed");
    if (stack === undefined) delete error.stack;
    else error.stack = stack;
    const documentUrl = "https://app.poracode.com/";
    const event = new ErrorEvent("error", {
      error,
      filename: documentUrl,
      lineno: 4,
      colno: 67,
    });

    expect(isAnonymousEvaluationError(event, documentUrl)).toBe(false);
    expect(isAnonymousEvaluationError(new ErrorEvent("error", { error }), documentUrl)).toBe(false);
  });

  it.each(["https://app.poracode.com/assets/app.js", "chrome-extension://probe/script.js"])(
    "keeps errors attributed to a different source fatal: %s",
    (filename) => {
      const error = new Error("probe failed");
      error.stack = "Error: probe failed\n    at <anonymous>:4:67";
      const event = new ErrorEvent("error", { error, filename });

      expect(isAnonymousEvaluationError(event, "https://app.poracode.com/")).toBe(false);
    },
  );

  it("keeps window errors without an exception fatal", () => {
    const documentUrl = "https://app.poracode.com/";
    const event = new ErrorEvent("error", {
      message: "probe failed",
      filename: documentUrl,
      lineno: 4,
      colno: 67,
    });

    expect(isAnonymousEvaluationError(event, documentUrl)).toBe(false);
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
