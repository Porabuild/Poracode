import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cacheRecentHistory,
  readRecentHistory,
  recentHistoryCacheKey,
  RECENT_HISTORY_MAX_BYTES,
  __closeRecentHistoryCacheForTest,
} from "./recentHistoryCache";
import type { HistoryRuntimeItem } from "@/shared/remote/historyPresentation";

const databaseName = "poracode-recent-history-v1";
const items: HistoryRuntimeItem[] = [
  {
    id: "reply",
    type: "assistant_message",
    state: "completed",
    streams: { assistant_text: "Cached tail" },
  },
];
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

async function rawRecords(write?: unknown): Promise<unknown[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("tails", write === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("tails");
      if (write !== undefined) store.put(write);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  await __closeRecentHistoryCacheForTest();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await __closeRecentHistoryCacheForTest();
});

it("survives a connection restart and binds rows to the verified host and thread", async () => {
  await cacheRecentHistory("host-a", "thread", items, () => true);
  await __closeRecentHistoryCacheForTest();
  expect(await readRecentHistory("host-a", "thread")).toEqual(items);
  expect(await readRecentHistory("host-b", "thread")).toBeNull();
  expect(await readRecentHistory("host-a", "other")).toBeNull();
});

it.each([
  { version: 0 },
  { version: 2 },
  { threadId: "wrong" },
  { bytes: 0 },
  { items: [{ id: "invalid" }] },
])("ignores pre-upgrade or invalid derived records: %j", async (patch) => {
  await cacheRecentHistory("host", "thread", items, () => true);
  await rawRecords({
    version: 1,
    key: recentHistoryCacheKey("host", "thread"),
    threadId: "thread",
    updatedAt: 1,
    bytes: bytes(items),
    items,
    ...patch,
  });
  expect(await readRecentHistory("host", "thread")).toBeNull();
});

it("removes an old tail when the new initial response exceeds the entry or byte budget", async () => {
  await cacheRecentHistory("host", "thread", items, () => true);
  await cacheRecentHistory(
    "host",
    "thread",
    [{ ...items[0]!, streams: { assistant_text: "x".repeat(RECENT_HISTORY_MAX_BYTES) } }],
    () => true,
  );
  expect(await readRecentHistory("host", "thread")).toBeNull();
  await cacheRecentHistory("host", "thread", items, () => true);
  await cacheRecentHistory(
    "host",
    "thread",
    Array.from({ length: 501 }, (_, i) => ({ ...items[0]!, id: String(i) })),
    () => true,
  );
  expect(await readRecentHistory("host", "thread")).toBeNull();
});

it("reads a tail record written under the former 1 MiB cap", async () => {
  const written = [{ ...items[0]!, streams: { assistant_text: "x".repeat(900_000) } }];
  await cacheRecentHistory("host", "seed", items, () => true);
  await rawRecords({
    version: 1,
    key: recentHistoryCacheKey("host", "old"),
    threadId: "old",
    updatedAt: 1,
    bytes: bytes(written),
    items: written,
  });
  expect(await readRecentHistory("host", "old")).toEqual(written);
});

it("keeps an initial tail above the former 1 MiB cap", async () => {
  const large = [{ ...items[0]!, streams: { assistant_text: "x".repeat(1_500_000) } }];
  await cacheRecentHistory("host", "thread", large, () => true);
  expect(await readRecentHistory("host", "thread")).toEqual(large);
});

it("keeps twenty equal-time records without double-charging the current index entry", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1);
  for (let i = 0; i < 20; i++) await cacheRecentHistory("host", String(i), items, () => true);
  expect(await rawRecords()).toHaveLength(20);
  await cacheRecentHistory("host", "newest", items, () => true);
  expect(await rawRecords()).toHaveLength(20);
  expect(await readRecentHistory("host", "newest")).toEqual(items);
});

it("prunes aggregate bytes while retaining the newly accepted tail", async () => {
  const large = [
    { ...items[0]!, streams: { assistant_text: "x".repeat(RECENT_HISTORY_MAX_BYTES - 50_000) } },
  ];
  for (let i = 0; i < 10; i++) await cacheRecentHistory("host", String(i), large, () => true);
  const rows = (await rawRecords()) as { bytes: number }[];
  expect(rows.length).toBeLessThan(10);
  expect(rows.reduce((sum, row) => sum + row.bytes, 0)).toBeLessThanOrEqual(
    8 * RECENT_HISTORY_MAX_BYTES,
  );
  expect(await readRecentHistory("host", "9")).toEqual(large);
});

it("does not admit a retired owner's write", async () => {
  let checks = 0;
  await cacheRecentHistory("host", "thread", items, () => ++checks === 1);
  expect(await readRecentHistory("host", "thread")).toBeNull();
});
