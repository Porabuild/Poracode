import { describe, expect, it, vi } from "vitest";
import type { HostPort, UsageSnapshot } from "@poracode/agents-usage";
import { allUsageProviderDescriptors } from "@poracode/agents-usage";

const mocks = vi.hoisted(() => ({
  scanAntigravityUsage: vi.fn<
    (
      nowMs: number,
      wslDistros: readonly string[],
      deps?: {
        signal?: AbortSignal;
        getRuntime?: () => Promise<unknown>;
      },
    ) => Promise<UsageSnapshot>
  >(),
}));

vi.mock("../agents/antigravity/antigravityUsageScanner", () => ({
  scanAntigravityUsage: mocks.scanAntigravityUsage,
}));

import { createLocalUsageCollectors } from "./localUsageCollectors";

const NOW = 1_717_000_000_000;
const HOST = {} as HostPort;

function snapshot(): UsageSnapshot {
  return {
    providerId: "antigravity",
    status: "ok",
    windows: [{ id: "antigravity:gemini:weekly", label: "Gemini · Weekly", usedPercent: 20 }],
    fetchedAt: NOW,
  };
}

describe("local usage collectors", () => {
  it("gives Antigravity a 15-minute provider default cadence", () => {
    const descriptor = allUsageProviderDescriptors().find((entry) => entry.id === "antigravity");
    expect(descriptor?.refreshPolicy?.defaultIntervalMinutes).toBe(15);
  });

  it("coalesces overlapping Antigravity collections into one scan", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.scanAntigravityUsage.mockImplementation(async () => {
      await gate;
      return snapshot();
    });
    const collectors = createLocalUsageCollectors();
    const antigravity = collectors.find((collector) => collector.id === "antigravity")!;

    const first = antigravity.collect(NOW, HOST);
    const second = antigravity.collect(NOW + 1_000, HOST);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([snapshot(), snapshot()]);
    expect(mocks.scanAntigravityUsage).toHaveBeenCalledTimes(1);
  });

  it("passes the abort signal and active WSL scopes into the Antigravity scan", async () => {
    const controller = new AbortController();
    mocks.scanAntigravityUsage.mockResolvedValue(snapshot());
    const collectors = createLocalUsageCollectors({
      getActiveAntigravityWslDistros: () => ["Ubuntu"],
      getUsageRuntime: async () => undefined,
    });
    const antigravity = collectors.find((collector) => collector.id === "antigravity")!;

    await antigravity.collect(NOW, HOST, controller.signal);

    expect(mocks.scanAntigravityUsage).toHaveBeenCalledWith(
      NOW,
      ["Ubuntu"],
      expect.objectContaining({ signal: controller.signal }),
    );
    const deps = mocks.scanAntigravityUsage.mock.calls[0]?.[2];
    await expect(deps?.getRuntime?.()).resolves.toBeUndefined();
  });
});
