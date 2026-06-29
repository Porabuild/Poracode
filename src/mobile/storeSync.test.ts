import { describe, expect, it } from "vitest";
import { shouldReplaceRuntimeItemsFromSnapshot } from "./storeSyncGuards";

describe("shouldReplaceRuntimeItemsFromSnapshot", () => {
  it("accepts a newer snapshot for an active thread", () => {
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 2,
        snapshotItemCount: 3,
        threadActive: true,
      }),
    ).toBe(true);
  });

  it("keeps equal-length active snapshots behind the live stream", () => {
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 2,
        snapshotItemCount: 2,
        threadActive: true,
      }),
    ).toBe(false);
  });

  it("replaces inactive snapshots when they are at least as complete as the cache", () => {
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 2,
        snapshotItemCount: 2,
        threadActive: false,
      }),
    ).toBe(true);
  });
});
