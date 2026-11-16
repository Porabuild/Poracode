/** Private device database. New namespace; no host or native client format changes. */
export const CLIENT_DRAFT_DATABASE = "poracode-client-drafts-v1";
const DATABASE_VERSION = 1;
export const CLIENT_DRAFT_FORMAT_VERSION = 1;
const DEADLINE_MS = 10_000;
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Client draft storage is unavailable."));
      return;
    }
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error("Client draft storage timed out."));
    }, DEADLINE_MS);
    const request = indexedDB.open(CLIENT_DRAFT_DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("assets", { keyPath: "path" });
      const submissions = request.result.createObjectStore("submissions", { keyPath: "id" });
      submissions.createIndex("draftRevision", ["draftId", "revision", "target"]);
      submissions.createIndex("scope", "scope");
      submissions.createIndex("draftId", "draftId");
      submissions.createIndex("state", "state");
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onblocked = () => {
      clearTimeout(timer);
      expired = true;
      reject(new Error("Client draft storage is blocked."));
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  }));
}

export async function transact<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let value: T;
    const timer = setTimeout(() => {
      try {
        tx.abort();
      } catch {
        /* already completed */
      }
      reject(new Error("Client draft storage timed out."));
    }, DEADLINE_MS);
    tx.oncomplete = () => {
      clearTimeout(timer);
      resolve(value);
    };
    tx.onabort = tx.onerror = () => {
      clearTimeout(timer);
      reject(tx.error ?? new Error("Client draft transaction failed."));
    };
    try {
      run(tx, (next) => {
        value = next;
      });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

export async function closeDraftDatabaseForTest() {
  await database?.then(
    (db) => db.close(),
    () => undefined,
  );
  database = undefined;
}
