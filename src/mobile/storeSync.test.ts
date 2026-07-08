import { describe, expect, it } from "vitest";
import { shouldReplaceRuntimeItemsFromSnapshot } from "./storeSyncGuards";

describe("shouldReplaceRuntimeItemsFromSnapshot", () => {
  it("always replaces when the store has no items yet", () => {
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 0,
        existingHasObservedLiveItems: false,
        snapshotItemCount: 0,
        threadActive: true,
        fromServer: false,
      }),
    ).toBe(true);
  });

  it("accepts a newer snapshot for an active thread", () => {
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 2,
        existingHasObservedLiveItems: false,
        snapshotItemCount: 3,
        threadActive: true,
        fromServer: true,
      }),
    ).toBe(true);
  });

  it("keeps equal-length active snapshots behind the live stream", () => {
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 2,
        existingHasObservedLiveItems: false,
        snapshotItemCount: 2,
        threadActive: true,
        fromServer: true,
      }),
    ).toBe(false);
  });

  it("never lets a same/shorter snapshot clobber an active thread, even from the server", () => {
    // A live turn's WebSocket deltas are fresher than any debounced snapshot.
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 3,
        existingHasObservedLiveItems: false,
        snapshotItemCount: 1,
        threadActive: true,
        fromServer: true,
      }),
    ).toBe(false);
  });

  it("applies a shorter FRESH server snapshot to an inactive thread (clear/revert)", () => {
    // The transcript was legitimately cleared/reset/reverted on the desktop
    // while we were away; a fresh server fetch is authoritative for it.
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 5,
        existingHasObservedLiveItems: false,
        snapshotItemCount: 2,
        threadActive: false,
        fromServer: true,
      }),
    ).toBe(true);
  });

  it("applies an empty fresh server snapshot to older hydrated data", () => {
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 5,
        existingHasObservedLiveItems: false,
        snapshotItemCount: 0,
        threadActive: false,
        fromServer: true,
      }),
    ).toBe(true);
  });

  it("does not let an empty fresh server snapshot erase live-observed items", () => {
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 5,
        existingHasObservedLiveItems: true,
        snapshotItemCount: 0,
        threadActive: false,
        fromServer: true,
      }),
    ).toBe(false);
  });

  it("does NOT apply a shorter CACHED snapshot to an inactive thread", () => {
    // A cached preload is conservative: it must not shrink the transcript we
    // already show (which may reflect fresher live events).
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 5,
        existingHasObservedLiveItems: false,
        snapshotItemCount: 2,
        threadActive: false,
        fromServer: false,
      }),
    ).toBe(false);
  });

  it("applies an equal-length cached snapshot to an inactive thread", () => {
    expect(
      shouldReplaceRuntimeItemsFromSnapshot({
        existingCount: 2,
        existingHasObservedLiveItems: false,
        snapshotItemCount: 2,
        threadActive: false,
        fromServer: false,
      }),
    ).toBe(true);
  });
});
