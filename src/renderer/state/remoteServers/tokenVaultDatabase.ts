const DATABASE_NAME = "lightcode-mobile-vault";
const STORE_NAME = "entries";

/** Runtime liveness policy only; the vault schema, key and ciphertext stay unchanged. */
export const TOKEN_VAULT_OPERATION_TIMEOUT_MS = 10_000;

type VaultOperation = "read" | "write" | "update";

/** Owns bounded IDB operations; failures never masquerade as a missing record. */
export class TokenVaultDatabase {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly onInvalidate: () => void) {}

  private invalidate(promise: Promise<IDBDatabase>): void {
    if (this.databasePromise !== promise) return;
    this.databasePromise = null;
    this.onInvalidate();
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    const promise = new Promise<IDBDatabase>((resolve, reject) => {
      // Retired Dexie schema 1 used native version 10. Never request a version
      // or reset an installed vault; only a genuinely new database creates entries.
      const request = indexedDB.open(DATABASE_NAME);
      let settled = false;
      const timer = setTimeout(() => {
        fail(new DOMException("Unable to open the token vault.", "TimeoutError"));
      }, TOKEN_VAULT_OPERATION_TIMEOUT_MS);
      const claim = (): boolean => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        return true;
      };
      const fail = (error: unknown): void => {
        if (!claim()) return;
        abortUpgrade();
        reject(error);
      };
      const abortUpgrade = (): void => {
        try {
          request.transaction?.abort();
        } catch {
          // The upgrade may already have finished; a late open is closed below.
        }
      };
      request.onupgradeneeded = () => {
        if (settled || this.databasePromise !== promise) {
          abortUpgrade();
          return;
        }
        try {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
          }
        } catch (error) {
          fail(error);
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        if (settled || this.databasePromise !== promise) {
          database.close();
          fail(new Error("Unable to open the token vault."));
          return;
        }
        claim();
        database.onversionchange = () => {
          database.close();
          this.invalidate(promise);
        };
        database.onclose = () => this.invalidate(promise);
        resolve(database);
      };
      request.onerror = () => fail(request.error ?? new Error("Unable to open the token vault."));
      request.onblocked = () => fail(new Error("Unable to open the token vault."));
    }).catch((error: unknown) => {
      // A timed-out open can report a late error after a replacement has begun.
      this.invalidate(promise);
      throw error;
    });
    this.databasePromise = promise;
    return promise;
  }

  async request<T>(
    mode: IDBTransactionMode,
    operation: VaultOperation,
    issue: (store: IDBObjectStore) => IDBRequest<T>,
    isCurrent: () => boolean = () => true,
  ): Promise<T> {
    const message = `Unable to ${operation} the token vault.`;
    if (!isCurrent()) throw new Error(message);
    const opening = this.open();
    const database = await opening;
    if (this.databasePromise !== opening || !isCurrent()) throw new Error(message);

    return await new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(STORE_NAME, mode);
      } catch (error) {
        database.close();
        this.invalidate(opening);
        reject(error);
        return;
      }
      let settled = false;
      let result: T;
      let requestSucceeded = false;
      const timer = setTimeout(() => {
        fail(new DOMException(message, "TimeoutError"));
      }, TOKEN_VAULT_OPERATION_TIMEOUT_MS);
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          transaction.abort();
        } catch {
          // Already finished; never turn a late completion into an acknowledgement.
        }
        database.close();
        this.invalidate(opening);
        reject(error);
      };
      transaction.oncomplete = () => {
        if (settled) return;
        if (!requestSucceeded) {
          fail(new Error(message));
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error ?? new Error(message));
      transaction.onabort = () => fail(transaction.error ?? new Error(message));
      try {
        const request = issue(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => {
          if (settled) return;
          result = request.result;
          requestSucceeded = true;
        };
        request.onerror = () => fail(request.error ?? new Error(message));
      } catch (error) {
        fail(error);
      }
    });
  }

  close(): void {
    const opening = this.databasePromise;
    if (!opening) return;
    this.invalidate(opening);
    void opening.then((database) => database.close()).catch(() => undefined);
  }
}
