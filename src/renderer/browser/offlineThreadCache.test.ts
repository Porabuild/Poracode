import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionConfigOptions } from "@/shared/contracts/sessionConfigOptions";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import {
  __resetBrowserThreadCacheForTest,
  cacheBrowserThreadSnapshot,
  readCachedBrowserThreadSnapshot,
} from "./offlineThreadCache";

function snapshot(threadId: string): RemoteThreadSnapshot {
  return {
    snapshotSeq: 1,
    thread: {
      id: threadId,
      projectId: "project-1",
      title: "Cached transcript",
      agentKind: "codex",
      config: {},
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
