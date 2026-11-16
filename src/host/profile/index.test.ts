import { afterEach, describe, expect, it, vi } from "vitest";
import { readDatabaseAsync } from "../db/asyncReads";
import { buildCoreRollupSnapshot, computeProfileCoreStats } from "./coreStats";
import { buildTokenRollupSnapshot, computeProfileTokenStats } from "./tokenStats";
import { getProfileCoreStats, getProfileTokenStats } from "./index";

vi.mock("../db/asyncReads", () => ({ readDatabaseAsync: vi.fn<typeof readDatabaseAsync>() }));
vi.mock("../db/connection", () => ({ getProfileUsageResetGeneration: () => 0 }));
vi.mock("./identity", () => ({ recordCurrentDevice: () => ({ id: "local" }) }));
vi.mock("./coreStats", () => ({
  getCachedProfileCoreStats: () => undefined,
  hasWarmCoreRollup: () => false,
  buildCoreRollupSnapshot: vi.fn<typeof import("./coreStats").buildCoreRollupSnapshot>(),
  installCoreRollupSnapshotIfCold:
    vi.fn<typeof import("./coreStats").installCoreRollupSnapshotIfCold>(),
  computeProfileCoreStats: vi.fn<typeof import("./coreStats").computeProfileCoreStats>(),
}));
vi.mock("./tokenStats", () => ({
  getCachedProfileTokenStats: () => undefined,
  hasWarmTokenRollup: () => false,
  buildTokenRollupSnapshot: vi.fn<typeof import("./tokenStats").buildTokenRollupSnapshot>(),
  installTokenRollupSnapshotIfCold:
    vi.fn<typeof import("./tokenStats").installTokenRollupSnapshotIfCold>(),
  computeProfileTokenStats: vi.fn<typeof import("./tokenStats").computeProfileTokenStats>(),
}));

afterEach(() => vi.clearAllMocks());

describe.each([
  {
    name: "core",
    load: getProfileCoreStats,
    build: buildCoreRollupSnapshot,
    compute: computeProfileCoreStats,
    snapshot: { offset: 0, firstRowId: 0, lastRowId: 0, accountStats: [], buckets: [] },
  },
  {
    name: "tokens",
    load: getProfileTokenStats,
    build: buildTokenRollupSnapshot,
    compute: computeProfileTokenStats,
    snapshot: {
      offset: 0,
      scanTodayIndex: 0,
      firstRowId: 0,
      lastRowId: 0,
      firstExactTs: undefined,
      activityFirstTs: [],
      exactTokenProviders: [],
      historicalBuckets: [],
      recentSamples: [],
    },
  },
])("profile $name worker failures", ({ load, build, compute, snapshot }) => {
  it("shares a refusal without scanning on the owner and permits a later retry", async () => {
    const pending = Promise.withResolvers<never>();
    vi.mocked(readDatabaseAsync).mockReturnValueOnce(pending.promise);
    const requests = [load({ utcOffsetMinutes: 0 }), load({ utcOffsetMinutes: 0 })];
    const error = new Error("database read deadline exceeded");
    const results = Promise.allSettled(requests);
    pending.reject(error);
    expect(await results).toEqual([
      { status: "rejected", reason: error },
      { status: "rejected", reason: error },
    ]);
    expect(readDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(build).not.toHaveBeenCalled();
    expect(compute).not.toHaveBeenCalled();

    vi.mocked(readDatabaseAsync).mockResolvedValueOnce(snapshot);
    await load({ utcOffsetMinutes: 0 });
    expect(readDatabaseAsync).toHaveBeenCalledTimes(2);
    expect(compute).toHaveBeenCalledTimes(1);
  });
});
