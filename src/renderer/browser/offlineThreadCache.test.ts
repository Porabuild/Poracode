import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionConfigOptions } from "@/shared/contracts/sessionConfigOptions";
import { remoteThreadSnapshotSchema, type RemoteThreadSnapshot } from "@/shared/remote";
import {
  __resetBrowserThreadCacheForTest,
  cacheBrowserThreadSnapshot,
  cacheBrowserThreadRuntimePage,
  readCachedBrowserThreadSnapshot,
} from "./offlineThreadCache";

describe("loaded older browser history", () => {
  it("keeps an admitted page when an overlapping refresh renews its UI generation before the cache read", async () => {
    const tail = { ...snapshot("refresh-during-cache-read"), runtimeNextCursor: 20 };
    await cacheBrowserThreadSnapshot(tail);
    const older = { ...tail.runtimeItems[0]!, id: "older", streams: {} };
    let current = true;
    const pageWrite = cacheBrowserThreadRuntimePage(
      tail.thread.id,
      { beforePosition: 20, nextCursor: 10, items: [older] },
      () => current,
    );
    // Neither transaction has read its row yet. Live sync accepts the newer
    // tail, retains the UI prefix, and invalidates the earlier page request.
    current = false;
    const refreshWrite = cacheBrowserThreadSnapshot({ ...tail, snapshotSeq: 2 });
    await Promise.all([pageWrite, refreshWrite]);
    await cacheBrowserThreadRuntimePage(
      tail.thread.id,
      { beforePosition: 10, nextCursor: null, items: [{ ...older, id: "oldest" }] },
      () => true,
    );
    const cached = await readCachedBrowserThreadSnapshot(tail.thread.id);
    expect(cached?.runtimeNextCursor).toBeNull();
    expect(cached?.runtimeItems.map((row) => row.id)).toEqual(["oldest", "older", "message-1"]);
  });

  it("lets a queued history reset replace an already admitted page", async () => {
    const tail = { ...snapshot("reset-during-cache-read"), runtimeNextCursor: 20 };
    await cacheBrowserThreadSnapshot(tail);
    const pageWrite = cacheBrowserThreadRuntimePage(
      tail.thread.id,
      { beforePosition: 20, nextCursor: null, items: [{ ...tail.runtimeItems[0]!, id: "older" }] },
      () => true,
    );
    const resetWrite = cacheBrowserThreadSnapshot({
      ...tail,
      snapshotSeq: 0,
      runtimeNextCursor: null,
    });
    await Promise.all([pageWrite, resetWrite]);
    expect(
      (await readCachedBrowserThreadSnapshot(tail.thread.id))?.runtimeItems.map((row) => row.id),
    ).toEqual(["message-1"]);
  });

  it("settles an aborted cache write while preserving the previous tail", async () => {
    const tail = { ...snapshot("aborted-page"), runtimeNextCursor: 20 };
    await cacheBrowserThreadSnapshot(tail);
    const original = IDBDatabase.prototype.transaction;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transaction = vi
      .spyOn(IDBDatabase.prototype, "transaction")
      .mockImplementationOnce(function (this: IDBDatabase, ...args) {
        const value = original.apply(this, args);
        queueMicrotask(() => value.abort());
        return value;
      });
    try {
      await cacheBrowserThreadRuntimePage(
        tail.thread.id,
        { beforePosition: 20, nextCursor: null, items: [] },
        () => true,
      );
      expect(warning).toHaveBeenCalled();
      expect((await readCachedBrowserThreadSnapshot(tail.thread.id))?.runtimeNextCursor).toBe(20);
    } finally {
      transaction.mockRestore();
      warning.mockRestore();
    }
  });

  it("extends a pre-existing v2 tail and preserves its raw pages across a newer overlapping tail", async () => {
    const tail = { ...snapshot("cached-prefix"), runtimeNextCursor: 20 };
    remoteThreadSnapshotSchema.parse(tail);
    await cacheBrowserThreadSnapshot(tail);
    const older = { ...tail.runtimeItems[0]!, id: "older-message", streams: {} };
    await cacheBrowserThreadRuntimePage(
      tail.thread.id,
      { beforePosition: 20, nextCursor: 10, items: [older] },
      () => true,
    );
    expect(
      (await readCachedBrowserThreadSnapshot(tail.thread.id))?.runtimeItems.map((i) => i.id),
    ).toEqual(["older-message", "message-1"]);
    await cacheBrowserThreadSnapshot({ ...tail, snapshotSeq: 2 });
    const cached = await readCachedBrowserThreadSnapshot(tail.thread.id);
    expect(cached?.runtimeNextCursor).toBe(10);
    expect(cached?.runtimeItems.map((i) => i.id)).toEqual(["older-message", "message-1"]);
  });

  it("refuses a stale page or a page that no longer matches the cached cursor", async () => {
    const tail = { ...snapshot("cursor-fenced"), runtimeNextCursor: 20 };
    await cacheBrowserThreadSnapshot(tail);
    const item = { ...tail.runtimeItems[0]!, id: "older", streams: {} };
    await cacheBrowserThreadRuntimePage(
      tail.thread.id,
      { beforePosition: 20, nextCursor: null, items: [item] },
      () => false,
    );
    await cacheBrowserThreadRuntimePage(
      tail.thread.id,
      { beforePosition: 10, nextCursor: null, items: [item] },
      () => true,
    );
    expect((await readCachedBrowserThreadSnapshot(tail.thread.id))?.runtimeNextCursor).toBe(20);
    expect(
      (await readCachedBrowserThreadSnapshot(tail.thread.id))?.runtimeItems.map((i) => i.id),
    ).toEqual(["message-1"]);
  });

  it("lets an authoritative complete snapshot replace the previously loaded prefix", async () => {
    const tail = { ...snapshot("reset-prefix"), runtimeNextCursor: 20 };
    await cacheBrowserThreadSnapshot(tail);
    await cacheBrowserThreadRuntimePage(
      tail.thread.id,
      {
        beforePosition: 20,
        nextCursor: null,
        items: [{ ...tail.runtimeItems[0]!, id: "old", streams: {} }],
      },
      () => true,
    );
    await cacheBrowserThreadSnapshot({ ...tail, snapshotSeq: 2, runtimeNextCursor: null });
    expect(
      (await readCachedBrowserThreadSnapshot(tail.thread.id))?.runtimeItems.map((i) => i.id),
    ).toEqual(["message-1"]);
  });
});

function snapshot(threadId: string): RemoteThreadSnapshot {
  return {
    snapshotSeq: 1,
    thread: {
      id: threadId,
      projectId: "project-1",
      title: "Cached transcript",
      agentKind: "codex",
      config: { model: "test-model" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    runtimeItems: [
      {
        id: "message-1",
        threadId,
        type: "assistant_message",
        state: "completed",
        payload: { text: "available offline" },
        streams: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    completedTurns: [],
    contextUsage: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as RemoteThreadSnapshot;
}

const inventory: SessionConfigOptions = [
  {
    id: "reasoning",
    type: "select",
    role: "effort",
    currentValue: "high",
    values: [{ value: "high" }, { value: "low" }],
    groups: [],
  },
];

/** Writes a raw pre-strip row directly, bypassing the module's write side. */
async function writeLegacyRawRow(
  cached: RemoteThreadSnapshot,
  threadId = cached.thread.id,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("poracode-browser-cache", 2);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains("threadSnapshots")
        ? request.transaction!.objectStore("threadSnapshots")
        : request.result.createObjectStore("threadSnapshots", { keyPath: "threadId" });
      if (!store.indexNames.contains("updatedAt")) {
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("threadSnapshots", "readwrite");
      transaction
        .objectStore("threadSnapshots")
        .put({ threadId, snapshot: cached, updatedAt: Date.now() });
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

afterEach(() => {
  __resetBrowserThreadCacheForTest();
});

describe("browser offline thread cache", () => {
  it("restores the last remote transcript without a host connection", async () => {
    const cached = snapshot("desktop-1:thread-1");

    await cacheBrowserThreadSnapshot(cached);
    __resetBrowserThreadCacheForTest();

    await expect(readCachedBrowserThreadSnapshot(cached.thread.id)).resolves.toEqual(cached);
  });

  it("never persists the volatile session-config inventory and leaves the live snapshot untouched", async () => {
    const live: RemoteThreadSnapshot = {
      ...snapshot("desktop-1:thread-1"),
      thread: { ...snapshot("desktop-1:thread-1").thread, sessionConfigOptions: inventory },
    };

    await cacheBrowserThreadSnapshot(live);
    __resetBrowserThreadCacheForTest();

    const restored = await readCachedBrowserThreadSnapshot(live.thread.id);
    expect(restored).not.toBeNull();
    expect("sessionConfigOptions" in restored!.thread).toBe(false);
    // The stripped row keeps everything the offline hydrate needs.
    expect(restored!.runtimeItems).toEqual(live.runtimeItems);
    expect(restored!.thread.config).toEqual(live.thread.config);
    expect(restored!.thread.title).toBe(live.thread.title);
    // The strip clones: the caller's live snapshot keeps its inventory.
    expect(live.thread.sessionConfigOptions).toEqual(inventory);
  });

  it("normalizes the volatile inventory away from legacy contaminated rows on read", async () => {
    const contaminated: RemoteThreadSnapshot = {
      ...snapshot("desktop-1:thread-1"),
      thread: { ...snapshot("desktop-1:thread-1").thread, sessionConfigOptions: inventory },
    };
    // A row written before the write-side strip still carries the key.
    await writeLegacyRawRow(contaminated);

    const restored = await readCachedBrowserThreadSnapshot(contaminated.thread.id);
    expect(restored).not.toBeNull();
    expect("sessionConfigOptions" in restored!.thread).toBe(false);
    expect(restored!.runtimeItems).toEqual(contaminated.runtimeItems);
  });
  it("lets hydration validate malformed cached envelopes without delaying the read", async () => {
    const malformed = { snapshotSeq: 1 } as RemoteThreadSnapshot;
    await writeLegacyRawRow(malformed, "malformed-envelope");
    await expect(readCachedBrowserThreadSnapshot("malformed-envelope")).resolves.toEqual(malformed);
  });
});
