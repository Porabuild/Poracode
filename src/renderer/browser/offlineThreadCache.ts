import type { RemoteThreadSnapshot } from "@/shared/remote";

const DATABASE_NAME = "poracode-browser-cache";
const STORE_NAME = "threadSnapshots";
const MAX_CACHED_THREAD_SNAPSHOTS = 20;

interface CachedThreadSnapshot {
  readonly threadId: string;
  readonly snapshot: RemoteThreadSnapshot;
  readonly updatedAt: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "threadId" });
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

async function readAll(database: IDBDatabase): Promise<CachedThreadSnapshot[]> {
  return await new Promise<CachedThreadSnapshot[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as CachedThreadSnapshot[]);
    request.onerror = () => reject(request.error ?? new Error("Unable to read browser cache."));
  });
}

export async function cacheBrowserThreadSnapshot(snapshot: RemoteThreadSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({
        threadId: snapshot.thread.id,
        snapshot,
        updatedAt: Date.now(),
      } satisfies CachedThreadSnapshot);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Unable to write browser cache."));
    });
    const rows = await readAll(database);
    const stale = rows
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(MAX_CACHED_THREAD_SNAPSHOTS);
    if (stale.length > 0) {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        for (const row of stale) store.delete(row.threadId);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Unable to prune browser cache."));
      });
    }
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
