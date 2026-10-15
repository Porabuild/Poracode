import type { UsageSnapshot } from "@poracode/agents-usage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { refreshAndMergeProviderUsage } from "./refreshProviderUsageSnapshot";

const refreshProviderUsage = vi.hoisted(() =>
  vi.fn<() => Promise<{ snapshots: UsageSnapshot[]; fromCache: boolean }>>(),
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    refreshProviderUsage,
  }),
}));

function okSnapshot(providerId: string): UsageSnapshot {
  return {
    providerId,
    status: "ok",
    plan: "Pro",
    windows: [{ id: "session-5h", label: "Session", usedPercent: 12, resetsAt: 2 }],
    fetchedAt: 2,
  } as UsageSnapshot;
}

describe("refreshAndMergeProviderUsage", () => {
  beforeEach(() => {
    refreshProviderUsage.mockReset();
    useProviderUsageStore.setState({ snapshots: {} });
  });

  it("merges the refreshed provider snapshot into the store", async () => {
    refreshProviderUsage.mockResolvedValue({
      snapshots: [okSnapshot("claude")],
      fromCache: false,
    });

    await refreshAndMergeProviderUsage("claude");

    expect(refreshProviderUsage).toHaveBeenCalledWith({
      providerIds: ["claude"],
      force: true,
    });
    expect(useProviderUsageStore.getState().snapshots.claude?.plan).toBe("Pro");
  });

  it("swallows refresh failures so callers can fire-and-forget", async () => {
    refreshProviderUsage.mockRejectedValue(new Error("offline"));

    await expect(refreshAndMergeProviderUsage("codex")).resolves.toBeUndefined();
  });

  it("updates failure details when the last successful reading is unchanged", () => {
    const snapshot: UsageSnapshot = {
      ...okSnapshot("fixture"),
      status: "error",
      error: "HTTP 502",
    };
    useProviderUsageStore.getState().mergeSnapshot(snapshot);

    useProviderUsageStore.getState().mergeSnapshot({ ...snapshot, error: "HTTP 503" });

    expect(useProviderUsageStore.getState().snapshots.fixture?.error).toBe("HTTP 503");
  });

  it("updates retry deadlines when receiving the same retained usage in a batch", () => {
    const snapshot: UsageSnapshot = {
      ...okSnapshot("fixture"),
      status: "rate-limited",
      rateLimitedUntil: 10,
    };
    useProviderUsageStore.getState().setSnapshots([snapshot]);

    useProviderUsageStore.getState().setSnapshots([{ ...snapshot, rateLimitedUntil: 20 }]);

    expect(useProviderUsageStore.getState().snapshots.fixture?.rateLimitedUntil).toBe(20);
  });
});
