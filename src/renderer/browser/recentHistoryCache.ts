import { z } from "zod";
import {
  historyRuntimeItemSchema,
  type HistoryRuntimeItem,
} from "@/shared/remote/historyPresentation";
import { HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES } from "@/shared/remote/historyReadContract";

/** A separate v1 derived cache: never imports expanded/offline history records. */
const DATABASE = "poracode-recent-history-v1";
const STORE = "tails";
/** Follows the host's tail budget; an older build reads a larger record as a miss. */
export const RECENT_HISTORY_MAX_BYTES = HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES;
const MAX_TOTAL_BYTES = 8 * RECENT_HISTORY_MAX_BYTES;
const MAX_ENTRIES = 20;
const recordSchema = z.object({
  version: z.literal(1),
  key: z.string(),
  threadId: z.string(),
  updatedAt: z.number().finite(),
  bytes: z.number().int().nonnegative(),
  items: z.array(historyRuntimeItemSchema).max(500),
});
let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };
    const timeout = setTimeout(() => fail(new Error("Recent history cache timed out.")), 5_000);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "key" });
      store.createIndex("updatedAt", "updatedAt");
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timeout);
      request.result.onversionchange = () => {
        request.result.close();
        opening = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error("Recent history cache is blocked."));
  }).catch((error) => {
    opening = undefined;
    throw error;
  });
  return opening;
}

export function recentHistoryCacheKey(authority: string, threadId: string): string {
  return JSON.stringify([authority, threadId]);
}

/** Cache I/O runs alongside HTTP; it never gates a host read or installs a cursor. */
export async function readRecentHistory(
  authority: string,
  threadId: string,
): Promise<HistoryRuntimeItem[] | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await database();
    return await new Promise((resolve) => {
      const request = db
        .transaction(STORE)
        .objectStore(STORE)
        .get(recentHistoryCacheKey(authority, threadId));
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        try {
          const parsed = recordSchema.safeParse(request.result);
          if (
            !parsed.success ||
            parsed.data.threadId !== threadId ||
            parsed.data.key !== recentHistoryCacheKey(authority, threadId)
          )
            return resolve(null);
          const bytes = new TextEncoder().encode(JSON.stringify(parsed.data.items)).byteLength;
          resolve(
            bytes <= RECENT_HISTORY_MAX_BYTES && bytes === parsed.data.bytes
              ? parsed.data.items
              : null,
          );
        } catch {
          resolve(null);
        }
      };
    });
  } catch {
    return null;
  }
}

/** Only the accepted initial tail is written; older pages and detail bodies are excluded. */
export async function cacheRecentHistory(
  authority: string,
  threadId: string,
  items: readonly HistoryRuntimeItem[],
  isCurrent: () => boolean,
): Promise<void> {
  if (typeof indexedDB === "undefined" || !isCurrent()) return;
  try {
    const bytes =
      items.length > 500
        ? RECENT_HISTORY_MAX_BYTES + 1
        : new TextEncoder().encode(JSON.stringify(items)).byteLength;
    const key = recentHistoryCacheKey(authority, threadId);
    const db = await database();
    if (!isCurrent()) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      if (bytes > RECENT_HISTORY_MAX_BYTES) store.delete(key);
      else store.put({ version: 1, key, threadId, items, bytes, updatedAt: Date.now() });
      let retainedBytes = bytes <= RECENT_HISTORY_MAX_BYTES ? bytes : 0;
      let retainedCount = bytes <= RECENT_HISTORY_MAX_BYTES ? 1 : 0;
      const request = store.index("updatedAt").openCursor(null, "prev");
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.primaryKey === key) {
          cursor.continue();
          return;
        }
        const row = recordSchema.safeParse(cursor.value);
        if (
          !row.success ||
          retainedCount >= MAX_ENTRIES ||
          retainedBytes + row.data.bytes > MAX_TOTAL_BYTES
        )
          cursor.delete();
        else {
          retainedBytes += row.data.bytes;
          retainedCount++;
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    /* Optional derived cache; the authoritative read already succeeded. */
  }
}

export async function __closeRecentHistoryCacheForTest(): Promise<void> {
  const current = opening;
  opening = undefined;
  (await current)?.close();
}
