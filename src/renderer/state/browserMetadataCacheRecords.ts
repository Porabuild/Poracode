/**
 * IndexedDB record layer for the browser metadata cache (B5).
 *
 * Owns the durable record shape and its transactions; queueing, migration, and
 * degradation live in `browserMetadataCache.ts`.
 *
 * Ordering: writers pass the revision they last observed. The commit compares
 * it with the stored record inside the same readwrite transaction, which
 * IndexedDB serializes across tabs/windows, so a delayed snapshot cannot
 * overwrite a newer commit. A record deleted meanwhile (record absent) is
 * written fresh: a removal is last-writer-wins, not a resurrection.
 *
 * Liveness: every database open and transaction has a deadline. A stalled
 * IndexedDB rejects instead of hanging hydration, and a connection that opens
 * after its caller gave up is closed rather than adopted.
 */

export const BROWSER_METADATA_CACHE_DB_NAME = "poracode-renderer-cache";
export const BROWSER_METADATA_CACHE_STORE_NAME = "records";
export const BROWSER_METADATA_RECORD_FORMAT_VERSION = 1;
const DATABASE_VERSION = 1;
/** Aggregate cap across every cached store, not just per record. */
export const MAX_BROWSER_METADATA_CACHE_TOTAL_BYTES = 32 * 1024 * 1024;
const DEFAULT_OPERATION_TIMEOUT_MS = 10_000;

let operationTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS;

/** Test hook: shorten the open/transaction deadline; null restores the default. */
export function __setBrowserMetadataCacheTimeoutForTest(timeoutMs: number | null): void {
  operationTimeoutMs = timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
}

/**
 * One persisted metadata record. `formatVersion` versions the record shape
 * independently of the Zustand store version, so the cache can be invalidated or
 * migrated without a store migration.
 */
export interface BrowserMetadataCacheRecord {
  readonly key: string;
  readonly formatVersion: number;
  readonly revision: number;
  readonly updatedAt: number;
  readonly bytes: number;
  readonly value: unknown;
  /** Set when this record is the committed form of a legacy localStorage entry. */
  readonly migratedFrom?: string;
  /** Fingerprint of the migrated legacy bytes; cleanup deletes only these bytes. */
  readonly migratedFingerprint?: string;
  readonly migratedAt?: number;
  /** Set when `value` is a bounded projection rather than the full snapshot. */
  readonly truncated?: boolean;
  readonly droppedThreadCount?: number;
}

export type BrowserMetadataCacheReadResult =
  | { readonly kind: "record"; readonly record: BrowserMetadataCacheRecord }
  | { readonly kind: "missing" }
  /** A record written by a NEWER app version: readable data of an unknown format. */
  | { readonly kind: "future"; readonly formatVersion: number };

export interface BrowserMetadataCacheWriteInput {
  readonly key: string;
  readonly value: unknown;
  readonly bytes: number;
  /** Revision this writer last observed; a moved revision rejects the commit. */
  readonly expectedRevision: number;
  readonly truncated?: boolean;
  readonly droppedThreadCount?: number;
  readonly migratedFrom?: string;
  readonly migratedFingerprint?: string;
  /** Override for tests; production uses {@link MAX_BROWSER_METADATA_CACHE_TOTAL_BYTES}. */
  readonly totalBudgetBytes?: number;
}

export type BrowserMetadataCacheWriteResult =
  | { readonly kind: "committed"; readonly revision: number }
  /** A future-format record already exists at this key; it was not overwritten. */
  | { readonly kind: "preserved"; readonly formatVersion: number }
  /** Another writer committed a different revision first; nothing was written. */
  | { readonly kind: "stale"; readonly revision: number }
  /** The commit would push the aggregate cache over its budget; nothing was written. */
  | { readonly kind: "over-budget"; readonly totalBytes: number };

export type BrowserMetadataCacheDeleteResult =
  | { readonly kind: "deleted" }
  | { readonly kind: "missing" }
  /** A future-format record is not ours to delete; it was preserved. */
  | { readonly kind: "preserved"; readonly formatVersion: number };

let databasePromise: Promise<IDBDatabase> | null = null;

export function browserMetadataIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BROWSER_METADATA_CACHE_DB_NAME, DATABASE_VERSION);
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(
        new Error(`Opening the browser metadata cache timed out after ${operationTimeoutMs} ms.`),
      );
    }, operationTimeoutMs);
    const claim = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      return true;
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BROWSER_METADATA_CACHE_STORE_NAME)) {
        request.result.createObjectStore(BROWSER_METADATA_CACHE_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (!claim()) {
        // The caller already degraded to memory: release the late connection.
        database.close();
        return;
      }
      // A newer app version (or a test reset) upgrading the database must be
      // able to proceed; stale connections close instead of blocking it.
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      if (!claim()) return;
      reject(request.error ?? new Error("Unable to open the browser metadata cache."));
    };
    request.onblocked = () => {
      if (!claim()) return;
      reject(new Error("Opening the browser metadata cache is blocked by another connection."));
    };
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

/**
 * Starts a transaction with a deadline. A stalled transaction is aborted and
 * rejects, so a caller can fall back to memory instead of hanging forever.
 */
function beginTransaction(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: string,
  reject: (error: unknown) => void,
): { transaction: IDBTransaction; clearDeadline: () => void } {
  const transaction = database.transaction(BROWSER_METADATA_CACHE_STORE_NAME, mode);
  const timer = setTimeout(() => {
    try {
      transaction.abort();
    } catch {
      // Already finished; the rejection below is still the caller's result.
    }
    reject(new Error(`${operation} timed out after ${operationTimeoutMs} ms.`));
  }, operationTimeoutMs);
  return { transaction, clearDeadline: () => clearTimeout(timer) };
}

export async function readBrowserMetadataRecord(
  key: string,
): Promise<BrowserMetadataCacheReadResult> {
  const database = await openDatabase();
  const record = await new Promise<BrowserMetadataCacheRecord | undefined>((resolve, reject) => {
    const { transaction, clearDeadline } = beginTransaction(
      database,
      "readonly",
      "Reading the browser metadata cache",
      reject,
    );
    const request = transaction.objectStore(BROWSER_METADATA_CACHE_STORE_NAME).get(key);
    request.onsuccess = () => {
      clearDeadline();
      resolve(request.result as BrowserMetadataCacheRecord | undefined);
    };
    request.onerror = () => {
      clearDeadline();
      reject(request.error ?? new Error("Unable to read the browser metadata cache."));
    };
    transaction.onabort = () => {
      clearDeadline();
      reject(transaction.error ?? new Error("Browser metadata cache read aborted."));
    };
  });
  if (!record) return { kind: "missing" };
  if (record.formatVersion !== BROWSER_METADATA_RECORD_FORMAT_VERSION) {
    return { kind: "future", formatVersion: record.formatVersion };
  }
  return { kind: "record", record };
}

/**
 * Commits one snapshot when `expectedRevision` still matches the stored record.
 * A mismatched revision means another writer committed first: the transaction
 * writes nothing and reports `stale` with the revision that won.
 */
export async function writeBrowserMetadataRecord(
  input: BrowserMetadataCacheWriteInput,
): Promise<BrowserMetadataCacheWriteResult> {
  const database = await openDatabase();
  const totalBudgetBytes = input.totalBudgetBytes ?? MAX_BROWSER_METADATA_CACHE_TOTAL_BYTES;
  return await new Promise<BrowserMetadataCacheWriteResult>((resolve, reject) => {
    const { transaction, clearDeadline } = beginTransaction(
      database,
      "readwrite",
      "Writing the browser metadata cache",
      reject,
    );
    const store = transaction.objectStore(BROWSER_METADATA_CACHE_STORE_NAME);
    let result: BrowserMetadataCacheWriteResult = {
      kind: "stale",
      revision: input.expectedRevision,
    };
    const fail = (error: unknown) => {
      try {
        transaction.abort();
      } catch {
        // Already finished; the rejection below is still the caller's result.
      }
      reject(error);
    };
    const read = store.get(input.key);
    read.onsuccess = () => {
      const existing = read.result as BrowserMetadataCacheRecord | undefined;
      if (
        existing !== undefined &&
        existing.formatVersion !== BROWSER_METADATA_RECORD_FORMAT_VERSION
      ) {
        // Unknown future format: commit nothing so the newer app's record
        // survives this (older) window.
        result = { kind: "preserved", formatVersion: existing.formatVersion };
        return;
      }
      if (existing !== undefined && existing.revision !== input.expectedRevision) {
        result = { kind: "stale", revision: existing.revision };
        return;
      }
      sumOtherRecordBytes(
        store,
        input.key,
        (otherBytes) => {
          const totalBytes = otherBytes + input.bytes;
          if (totalBytes > totalBudgetBytes) {
            result = { kind: "over-budget", totalBytes };
            return;
          }
          const revision = (existing?.revision ?? 0) + 1;
          const record: BrowserMetadataCacheRecord = {
            key: input.key,
            formatVersion: BROWSER_METADATA_RECORD_FORMAT_VERSION,
            revision,
            updatedAt: Date.now(),
            bytes: input.bytes,
            value: input.value,
            ...(input.truncated ? { truncated: true } : {}),
            ...(input.droppedThreadCount ? { droppedThreadCount: input.droppedThreadCount } : {}),
            ...(input.migratedFrom
              ? {
                  migratedFrom: input.migratedFrom,
                  migratedFingerprint: input.migratedFingerprint,
                  migratedAt: Date.now(),
                }
              : {}),
          };
          try {
            store.put(record);
          } catch (error) {
            // A synchronous structured-clone failure surfaces here, not on the
            // request: fail the promise so the caller degrades to memory.
            fail(error);
            return;
          }
          result = { kind: "committed", revision };
        },
        fail,
      );
    };
    read.onerror = () => fail(read.error ?? new Error("Unable to read the metadata record."));
    transaction.oncomplete = () => {
      clearDeadline();
      resolve(result);
    };
    transaction.onerror = () => {
      clearDeadline();
      reject(transaction.error ?? new Error("Unable to write the browser metadata cache."));
    };
    transaction.onabort = () => {
      clearDeadline();
      reject(transaction.error ?? new Error("Browser metadata cache write aborted."));
    };
  });
}

function sumOtherRecordBytes(
  store: IDBObjectStore,
  key: string,
  onDone: (bytes: number) => void,
  onError: (error: unknown) => void,
): void {
  let total = 0;
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor === null) {
      onDone(total);
      return;
    }
    const record = cursor.value as Partial<BrowserMetadataCacheRecord> | undefined;
    if (cursor.primaryKey !== key && typeof record?.bytes === "number") total += record.bytes;
    cursor.continue();
  };
  request.onerror = () =>
    onError(request.error ?? new Error("Unable to inspect the browser metadata cache."));
}

/**
 * Deletes a record only when its shape is known: a future-format record is
 * preserved, because the persist lifecycle's `removeItem` is not an explicit
 * user command to destroy a newer app's data.
 */
export async function deleteBrowserMetadataRecord(
  key: string,
): Promise<BrowserMetadataCacheDeleteResult> {
  const database = await openDatabase();
  return await new Promise<BrowserMetadataCacheDeleteResult>((resolve, reject) => {
    const { transaction, clearDeadline } = beginTransaction(
      database,
      "readwrite",
      "Deleting the browser metadata cache",
      reject,
    );
    const store = transaction.objectStore(BROWSER_METADATA_CACHE_STORE_NAME);
    let result: BrowserMetadataCacheDeleteResult = { kind: "missing" };
    const fail = (error: unknown) => {
      try {
        transaction.abort();
      } catch {
        // Already finished; the rejection below is still the caller's result.
      }
      reject(error);
    };
    const read = store.get(key);
    read.onsuccess = () => {
      const existing = read.result as BrowserMetadataCacheRecord | undefined;
      if (existing === undefined) {
        result = { kind: "missing" };
        return;
      }
      if (existing.formatVersion !== BROWSER_METADATA_RECORD_FORMAT_VERSION) {
        result = { kind: "preserved", formatVersion: existing.formatVersion };
        return;
      }
      store.delete(key);
      result = { kind: "deleted" };
    };
    read.onerror = () => fail(read.error ?? new Error("Unable to read the metadata record."));
    transaction.oncomplete = () => {
      clearDeadline();
      resolve(result);
    };
    transaction.onerror = () => {
      clearDeadline();
      reject(transaction.error ?? new Error("Unable to delete the browser metadata cache."));
    };
    transaction.onabort = () => {
      clearDeadline();
      reject(transaction.error ?? new Error("Browser metadata cache delete aborted."));
    };
  });
}

/** Close the shared connection without deleting data (simulates a reload). */
export function closeBrowserMetadataCacheForTest(): void {
  void databasePromise?.then((database) => database.close()).catch(() => undefined);
  databasePromise = null;
}

/** Close the shared connection and drop the database (test isolation). */
export async function __resetBrowserMetadataCacheRecordsForTest(): Promise<void> {
  const open = databasePromise;
  closeBrowserMetadataCacheForTest();
  await open?.catch(() => undefined);
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(BROWSER_METADATA_CACHE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Test-only raw read that bypasses the format-version gate. */
export async function readRawBrowserMetadataRecordForTest(
  key: string,
): Promise<BrowserMetadataCacheRecord | undefined> {
  const database = await openDatabase();
  return await new Promise<BrowserMetadataCacheRecord | undefined>((resolve, reject) => {
    const transaction = database.transaction(BROWSER_METADATA_CACHE_STORE_NAME, "readonly");
    const request = transaction.objectStore(BROWSER_METADATA_CACHE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as BrowserMetadataCacheRecord | undefined);
    request.onerror = () => reject(request.error);
  });
}

/** Test-only raw write used to seed future-format records. */
export async function writeRawBrowserMetadataRecordForTest(
  record: BrowserMetadataCacheRecord,
): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(BROWSER_METADATA_CACHE_STORE_NAME, "readwrite");
    transaction.objectStore(BROWSER_METADATA_CACHE_STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
