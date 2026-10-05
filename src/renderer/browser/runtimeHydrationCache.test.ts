import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { threadSchema } from "@/shared/contracts";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { __resetBrowserThreadCacheForTest } from "./offlineThreadCache";
import { readBrowserRuntimeHydrationCache } from "./runtimeHydrationCache";

afterEach(() => {
  __resetBrowserThreadCacheForTest();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("hydrates an unchanged valid v1 cache row through the existing v2 upgrade", async () => {
  const thread = threadSchema.parse({
    id: "remote:cache-host:thread:t",
    remoteServerId: "cache-host",
    remoteId: "t",
    projectId: "remote:cache-host:project:p",
    title: "Cached",
    agentKind: "fixture",
    config: { model: "fixture-model" },
    status: "idle",
    attention: "none",
    presentationMode: "gui",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
  const snapshot: RemoteThreadSnapshot = {
    snapshotSeq: 1,
    thread,
    runtimeItems: [
      {
        id: "old-message",
        type: "assistant_message",
        state: "completed",
        payload: { text: "cached before upgrade" },
        streams: { assistant_text: "cached before upgrade" },
      },
    ],
    runtimeNextCursor: 12,
    completedTurns: [],
    contextUsage: null,
    updatedAt: "2026-01-01",
  };
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("poracode-browser-cache", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("threadSnapshots", { keyPath: "threadId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("threadSnapshots", "readwrite");
    tx.objectStore("threadSnapshots").put({ threadId: thread.id, snapshot, updatedAt: 1 });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
  await expect(readBrowserRuntimeHydrationCache(thread)).resolves.toEqual(snapshot);
  const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("poracode-browser-cache");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  expect(upgraded.version).toBe(2);
  expect(
    upgraded
      .transaction("threadSnapshots")
      .objectStore("threadSnapshots")
      .indexNames.contains("updatedAt"),
  ).toBe(true);
  upgraded.close();
});

it("blocked upgrade falls back and closes a late opened connection", async () => {
  const request: any = {};
  vi.stubGlobal("indexedDB", { open: () => request });
  const { readCachedBrowserThreadSnapshot } = await import("./offlineThreadCache");
  const pending = readCachedBrowserThreadSnapshot("thread");
  request.onblocked();
  await expect(pending).resolves.toBeNull();
  const close = vi.fn<() => void>();
  request.result = { close };
  request.onsuccess();
  expect(close).toHaveBeenCalledTimes(1);
});
it("abandoned cache open is bounded and a late connection is closed", async () => {
  vi.useFakeTimers();
  const request: any = {};
  vi.stubGlobal("indexedDB", { open: () => request });
  const { readCachedBrowserThreadSnapshot } = await import("./offlineThreadCache");
  const pending = readCachedBrowserThreadSnapshot("thread");
  await vi.advanceTimersByTimeAsync(5000);
  await expect(pending).resolves.toBeNull();
  const close = vi.fn<() => void>();
  request.result = { close };
  request.onsuccess();
  expect(close).toHaveBeenCalledTimes(1);
});

it("a real older connection blocking v2 does not leave the reader pending", async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("poracode-browser-cache");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("poracode-browser-cache", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("threadSnapshots", { keyPath: "threadId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const { readCachedBrowserThreadSnapshot } = await import("./offlineThreadCache");
    await expect(readCachedBrowserThreadSnapshot("thread")).resolves.toBeNull();
  } finally {
    old.close();
  }
});
