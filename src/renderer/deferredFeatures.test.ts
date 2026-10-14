import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prewarmModule, runtimeMock, mobileModule } = vi.hoisted(() => ({
  prewarmModule: { loaded: false },
  runtimeMock: { browser: false },
  mobileModule: { loaded: false },
}));

vi.mock("@/renderer/clientRuntime", () => ({
  isBrowserClientRuntime: () => runtimeMock.browser,
}));
vi.mock("@/renderer/views/MainView/parts/MobileWorkspacePage", () => {
  mobileModule.loaded = true;
  return { MobileWorkspacePage: () => null };
});

vi.mock("@/renderer/components/terminal/terminalPrewarm", () => {
  prewarmModule.loaded = true;
  return { prewarmTerminalSurface: vi.fn<() => Promise<void>>() };
});

describe("deferredFeatures", () => {
  const idleCallbacks: Array<() => void> = [];

  beforeEach(() => {
    idleCallbacks.length = 0;
    prewarmModule.loaded = false;
    runtimeMock.browser = false;
    mobileModule.loaded = false;
    document.documentElement.dataset.windowKind = "quickComposer";
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    vi.stubGlobal("cancelIdleCallback", vi.fn());
  });

  afterEach(() => {
    delete document.documentElement.dataset.windowKind;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("does not import terminal prewarm in the quick composer window", async () => {
    const { startDeferredFeaturePrewarm } = await import("./deferredFeatures");
    const stop = startDeferredFeaturePrewarm();

    expect(idleCallbacks).toHaveLength(1);
    idleCallbacks[0]!();
    stop();
    await Promise.resolve();

    expect(prewarmModule.loaded).toBe(false);
  });

  it("defers offline browser compact imports and resumes through the online event", async () => {
    runtimeMock.browser = true;
    let online = false;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    const { startDeferredFeaturePrewarm } = await import("./deferredFeatures");
    const stop = startDeferredFeaturePrewarm("compact");
    try {
      expect(idleCallbacks).toHaveLength(0);
      expect(mobileModule.loaded).toBe(false);
      online = true;
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
      expect(idleCallbacks).toHaveLength(1);
      idleCallbacks[0]!();
      await vi.waitFor(() => expect(mobileModule.loaded).toBe(true));
    } finally {
      stop();
    }
  });

  it("does not restart a stopped offline browser prewarm", async () => {
    runtimeMock.browser = true;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { startDeferredFeaturePrewarm } = await import("./deferredFeatures");
    const stop = startDeferredFeaturePrewarm("compact");
    stop();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    expect(idleCallbacks).toHaveLength(0);
    expect(mobileModule.loaded).toBe(false);
  });
});
