import { afterEach, describe, expect, it, vi } from "vitest";

import { dispatchTool, OBSERVATION_SETTLE_MS } from "./dispatch";
import type { ComputerUseDriver } from "./types";

const window = { app: "Brave Browser", id: 7 };

function createDriver() {
  return {
    getWindowState: vi.fn<() => Promise<unknown>>(async () => ({
      accessibility: null,
      mode: "passive" as const,
      notes: [],
      screenshots: [],
      window,
    })),
    invokeElement: vi.fn<() => Promise<unknown>>(async () => ({
      ok: true as const,
      mode: "interactive" as const,
      window,
      delivery: {
        delivered: "background" as const,
        route: "accessibility" as const,
        verified: "confirmed" as const,
      },
    })),
  } as unknown as ComputerUseDriver & {
    getWindowState: ReturnType<typeof vi.fn>;
    invokeElement: ReturnType<typeof vi.fn>;
  };
}

describe("observation settle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // An accessibility tree answers with pre-action values for a few hundred
  // milliseconds after a semantic action (measured 350-460 ms on Chromium), so
  // capturing immediately would show the agent the state it already had and
  // read as a failed background action.
  it("waits before capturing an observation", async () => {
    vi.useFakeTimers();
    const driver = createDriver();

    const pending = dispatchTool(
      "invoke_element",
      { window, element_id: "s1:4", action: "invoke", observe: "text" },
      { driver },
    );

    await vi.advanceTimersByTimeAsync(OBSERVATION_SETTLE_MS - 1);
    expect(driver.getWindowState).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(driver.getWindowState).toHaveBeenCalledOnce();
  });

  it("skips the wait when no observation was requested", async () => {
    const driver = createDriver();

    await dispatchTool(
      "invoke_element",
      { window, element_id: "s1:4", action: "invoke" },
      { driver },
    );

    expect(driver.getWindowState).not.toHaveBeenCalled();
  });

  it("lets a caller override the wait", async () => {
    const driver = createDriver();

    await dispatchTool(
      "invoke_element",
      { window, element_id: "s1:4", action: "invoke", observe: "text" },
      { driver, observationSettleMs: 0 },
    );

    expect(driver.getWindowState).toHaveBeenCalledOnce();
  });
});
