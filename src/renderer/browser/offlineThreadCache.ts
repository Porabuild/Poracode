import type { RemoteThreadSnapshot } from "@/shared/remote";

const DATABASE_NAME = "poracode-browser-cache";
const STORE_NAME = "threadSnapshots";
const MAX_CACHED_THREAD_SNAPSHOTS = 20;

interface CachedThreadSnapshot {
  readonly threadId: string;
  readonly snapshot: RemoteThreadSnapshot;
  readonly updatedAt: number;
}

const UPDATED_AT_INDEX = "updatedAt";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    // v2 adds the updatedAt prune index; a v1 store upgrades in place and
    // its cached rows keep working (WS6 P1-11b).
    const request = indexedDB.open(DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: "threadId" });
      if (!store.indexNames.contains(UPDATED_AT_INDEX)) {
        store.createIndex(UPDATED_AT_INDEX, "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open browser cache."));
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

export async function cacheBrowserThreadSnapshot(snapshot: RemoteThreadSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put({
        threadId: snapshot.thread.id,
        snapshot,
        updatedAt: Date.now(),
      } satisfies CachedThreadSnapshot);
      // Prune over the updatedAt index newest-first in the SAME transaction —
      // no full-table read or in-memory sort. The row just written has the
      // newest timestamp, so the retention window always keeps it.
      let kept = 0;
      const cursorRequest = store.index(UPDATED_AT_INDEX).openCursor(null, "prev");
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if (kept < MAX_CACHED_THREAD_SNAPSHOTS) {
          kept += 1;
        } else {
          cursor.delete();
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Unable to write browser cache."));
    });
  } catch (error) {
    console.warn("[browser-cache] unable to cache thread snapshot", error);
  }
}

export async function readCachedBrowserThreadSnapshot(
  threadId: string,
): Promise<RemoteThreadSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const database = await openDatabase();
    return await new Promise<RemoteThreadSnapshot | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(threadId);
      request.onsuccess = () =>
        resolve((request.result as CachedThreadSnapshot | undefined)?.snapshot ?? null);
      request.onerror = () => reject(request.error ?? new Error("Unable to read browser cache."));
    });
  } catch (error) {
    console.warn("[browser-cache] unable to read thread snapshot", error);
    return null;
  }
}

export function __resetBrowserThreadCacheForTest(): void {
  void databasePromise?.then((database) => database.close()).catch(() => undefined);
  databasePromise = null;
}
