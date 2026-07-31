import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lockMobileSheetViewport } from "./mobileSheetViewportLock";

describe("lockMobileSheetViewport", () => {
  const viewport = new EventTarget();

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn<(x: number, y: number) => void>(),
    });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("reasserts the opening offset when viewport focus pans the document", () => {
    const unlock = lockMobileSheetViewport();

    document.documentElement.scrollTop = 92;
    document.body.scrollTop = 92;
    viewport.dispatchEvent(new Event("scroll"));

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
    unlock();
  });

  it("keeps restoring after release while the keyboard dismissal settles", () => {
    const unlock = lockMobileSheetViewport();
    unlock();

    document.documentElement.scrollTop = 74;
    document.body.scrollTop = 74;
    vi.advanceTimersByTime(500);

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });

  it("ignores deferred restores after the document is torn down", () => {
    const unlock = lockMobileSheetViewport();
    unlock();
    vi.stubGlobal("document", undefined);

    expect(() => vi.runOnlyPendingTimers()).not.toThrow();

    vi.unstubAllGlobals();
  });
});
