import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prewarmModule } = vi.hoisted(() => ({
  prewarmModule: { loaded: false },
}));

vi.mock("@/renderer/components/terminal/terminalPrewarm", () => {
  prewarmModule.loaded = true;
  return { prewarmTerminalSurface: vi.fn<() => Promise<void>>() };
});

describe("deferredFeatures", () => {
  const idleCallbacks: Array<() => void> = [];

  beforeEach(() => {
    idleCallbacks.length = 0;
    prewarmModule.loaded = false;
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
});
