// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockComposeScroll, unlockComposeScroll } from "./composeScrollLock";

describe("composeScrollLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn<() => void>() });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });

  afterEach(() => {
    unlockComposeScroll();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("resets stale root scroll before capturing the lock baseline", () => {
    document.documentElement.scrollTop = 96;
    document.body.scrollTop = 96;

    lockComposeScroll();

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });

  it("reasserts the captured baseline when locking while already locked", () => {
    lockComposeScroll();
    document.documentElement.scrollTop = 44;
    document.body.scrollTop = 44;

    lockComposeScroll();

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });

  it("keeps reasserting the baseline during the keyboard-open settle window", () => {
    lockComposeScroll();
    document.documentElement.scrollTop = 72;
    document.body.scrollTop = 72;

    vi.advanceTimersByTime(16);

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });

  it("ignores settle restores after the browser environment is torn down", () => {
    lockComposeScroll();
    unlockComposeScroll();
    vi.stubGlobal("window", undefined);

    try {
      expect(() => vi.runOnlyPendingTimers()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves scrollable ancestors around the composer root", () => {
    const scroller = document.createElement("div");
    const composer = document.createElement("div");
    scroller.style.overflowY = "auto";
    scroller.append(composer);
    document.body.append(scroller);
    scroller.scrollTop = 128;

    try {
      lockComposeScroll(composer);
      scroller.scrollTop = 32;

      vi.advanceTimersByTime(16);

      expect(scroller.scrollTop).toBe(128);
    } finally {
      scroller.remove();
    }
  });
});
