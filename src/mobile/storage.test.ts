import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ThreadStatus } from "@/shared/contracts";
import type { RemoteShellSnapshot } from "@/shared/remote";
import {
  markDesktopConnected,
  mobileDb,
  selectOrphanThreadSnapshotIds,
  shouldPersistThreadSnapshot,
  THREAD_SNAPSHOT_THROTTLE_MS,
} from "./storage";

beforeEach(async () => {
  await mobileDb.desktops.clear();
});

describe("markDesktopConnected", () => {
  it("only lowers the persisted cursor for an authoritative server reset", async () => {
    await mobileDb.desktops.put({
      desktopId: "desktop-1",
      label: "Desktop",
      endpoint: "http://127.0.0.1:38987",
      appVersion: "1.0.0",
      accessToken: "token",
      tokenExpiresAt: "2099-01-01T00:00:00.000Z",
      scopes: [],
      lastSeenSeq: 42,
      pairedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await markDesktopConnected("desktop-1", 0);
    expect((await mobileDb.desktops.get("desktop-1"))?.lastSeenSeq).toBe(42);

    await markDesktopConnected("desktop-1", 0, { resetLastSeenSeq: true });
    expect((await mobileDb.desktops.get("desktop-1"))?.lastSeenSeq).toBe(0);
  });
});

/**
 * The helper only reads `snapshot.threads[].id`, so a minimal shell snapshot
 * with just the thread ids is sufficient (and avoids building the full
 * project/summary graph the wire schema otherwise requires).
 */
function snapshotWithThreads(threadIds: string[]): RemoteShellSnapshot {
  return {
    threads: threadIds.map((id) => ({ id })),
  } as unknown as RemoteShellSnapshot;
}

function row(desktopId: string, threadId: string) {
  return { id: `${desktopId}:${threadId}`, threadId };
}

describe("selectOrphanThreadSnapshotIds", () => {
  it("prunes rows for threads absent from the fresh snapshot", () => {
    const rows = [row("d1", "keep"), row("d1", "gone-1"), row("d1", "gone-2")];
    const snapshot = snapshotWithThreads(["keep"]);

    expect(selectOrphanThreadSnapshotIds(rows, snapshot)).toEqual(["d1:gone-1", "d1:gone-2"]);
  });

  it("keeps rows for threads still present (including the open one)", () => {
    const rows = [row("d1", "open"), row("d1", "other")];
    const snapshot = snapshotWithThreads(["open", "other"]);

    // The currently-open thread is always in the snapshot's thread list, so it
    // is never pruned out from under an active read.
    expect(selectOrphanThreadSnapshotIds(rows, snapshot)).toEqual([]);
  });

  it("returns nothing when there are no cached rows", () => {
    expect(selectOrphanThreadSnapshotIds([], snapshotWithThreads(["a"]))).toEqual([]);
  });

  it("prunes every row when the snapshot has no threads", () => {
    const rows = [row("d1", "a"), row("d1", "b")];
    expect(selectOrphanThreadSnapshotIds(rows, snapshotWithThreads([]))).toEqual(["d1:a", "d1:b"]);
  });
});

describe("shouldPersistThreadSnapshot", () => {
  const NON_RUNNING: ThreadStatus[] = [
    "inactive",
    "launching",
    "idle",
    "finished",
    "needs_approval",
    "needs_reply",
    "error",
  ];

  it("always persists a non-running thread, regardless of last save time", () => {
    for (const status of NON_RUNNING) {
      // Even immediately after a save (now === lastSavedAt) a non-running status
      // persists, so the final post-run snapshot is never dropped.
      expect(shouldPersistThreadSnapshot(status, 1000, 1000)).toBe(true);
    }
  });

  it("persists the first save of an actively-running thread", () => {
    expect(shouldPersistThreadSnapshot("working", undefined, 5000)).toBe(true);
  });

  it("throttles a running thread within the window", () => {
    const lastSavedAt = 10_000;
    expect(
      shouldPersistThreadSnapshot(
        "working",
        lastSavedAt,
        lastSavedAt + THREAD_SNAPSHOT_THROTTLE_MS - 1,
      ),
    ).toBe(false);
  });

  it("persists a running thread once the throttle window elapses", () => {
    const lastSavedAt = 10_000;
    expect(
      shouldPersistThreadSnapshot(
        "working",
        lastSavedAt,
        lastSavedAt + THREAD_SNAPSHOT_THROTTLE_MS,
      ),
    ).toBe(true);
  });
});
