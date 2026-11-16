import { z } from "zod";
import {
  cachedThreadHistorySchema,
  type CachedThreadHistory,
} from "@/shared/remote/historyReadSchemas";
import {
  CATALOG_HOST_WIRE_MAX_BYTES,
  CATALOG_ROW_ENVELOPE_BYTES,
  HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES,
} from "@/shared/remote/historyReadContract";

/** v2 records invalidate unverified v1 tails. The larger row allowance keeps
 * existing records valid; older v2 readers treat larger groups as a miss. */
const DATABASE = "poracode-recent-history-v1";
const STORE = "tails";
/** Follows the host's tail budget; an older build reads a larger record as a miss. */
export const RECENT_HISTORY_MAX_BYTES = HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES;
const MAX_TOTAL_BYTES = 8 * RECENT_HISTORY_MAX_BYTES;
const MAX_ENTRIES = 20;
// Completed tool groups can exceed the requested page size. Match the host's
// materialization bound plus its sparse goal; the cache's byte cap still applies.
const MAX_ITEMS = Math.floor(CATALOG_HOST_WIRE_MAX_BYTES / CATALOG_ROW_ENVELOPE_BYTES) + 1;
const recordSchema = z.object({
  version: z.literal(2),
  key: z.string(),
  threadId: z.string(),
  updatedAt: z.number().finite(),
  bytes: z.number().int().nonnegative(),
  history: cachedThreadHistorySchema.extend({
    runtimeItems: cachedThreadHistorySchema.shape.runtimeItems.max(MAX_ITEMS),
  }),
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

/** Every connection's tails live under its own prefix, disjoint from `managed:` ones. */
function pairedAuthorityPrefix(connectionKey: string): string {
  return `paired:${encodeURIComponent(connectionKey)}:`;
}

/**
 * The cache authority of one paired authorization: its local connection key,
 * the per-pairing `recentHistoryCacheId` (minted fresh for every pairing, so a
 * tail whose cleanup failed is unreachable from a newer grant) and the host
 * identity verified at connect. Never a credential.
 */
export function pairedRecentHistoryAuthority(
  connectionKey: string,
  cacheId: string,
  hostDesktopId: string,
): string {
  return `${pairedAuthorityPrefix(connectionKey)}${encodeURIComponent(cacheId)}:${encodeURIComponent(hostDesktopId)}`;
}

/**
 * Drops every cached tail one paired connection authored (removal, or a fresh
 * pairing). Keys are `[authority, threadId]` JSON, so one key range covers the
 * connection and no other authority.
 */
export async function purgeRecentHistoryForConnection(connectionKey: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await database();
    const lower = JSON.stringify([pairedAuthorityPrefix(connectionKey)]).slice(0, -2);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(IDBKeyRange.bound(lower, `${lower}\uffff`));
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    /* Optional derived cache; the host stays authoritative. */
  }
}

/** Reading a candidate grants no display authority; the owning host must validate it. */
export async function readRecentHistory(
  authority: string,
  threadId: string,
): Promise<CachedThreadHistory | null> {
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
          const bytes = new TextEncoder().encode(JSON.stringify(parsed.data.history)).byteLength;
          resolve(
            bytes <= RECENT_HISTORY_MAX_BYTES && bytes === parsed.data.bytes
              ? parsed.data.history
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
  history: CachedThreadHistory,
  isCurrent: () => boolean,
): Promise<void> {
  if (typeof indexedDB === "undefined" || !isCurrent()) return;
  try {
    const bytes =
      history.runtimeItems.length > MAX_ITEMS
        ? RECENT_HISTORY_MAX_BYTES + 1
        : new TextEncoder().encode(JSON.stringify(history)).byteLength;
    const key = recentHistoryCacheKey(authority, threadId);
    const db = await database();
    if (!isCurrent()) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      if (bytes > RECENT_HISTORY_MAX_BYTES) store.delete(key);
      else store.put({ version: 2, key, threadId, history, bytes, updatedAt: Date.now() });
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
