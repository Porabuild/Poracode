import { IDBObjectStore } from "fake-indexeddb";
import { vi } from "vitest";

/** What WebKit throws from `IDBRequest.result` when a stored CryptoKey cannot be restored. */
export function webKitKeyRestoreError(): DOMException {
  return new DOMException("Cannot inject key into script value", "UnknownError");
}

/**
 * Makes reading `request.result` throw, as WebKit does. fake-indexeddb assigns
 * the outcome itself, so the setter keeps that working. A browser reports any
 * exception an `onsuccess` handler lets escape as an uncaught error, so those
 * are collected in `escaped`.
 */
export function throwFromResult(request: IDBRequest, error: unknown, escaped: unknown[]): void {
  Object.defineProperty(request, "result", {
    get() {
      throw error;
    },
    set() {
      // The engine stores the outcome here; only application reads throw.
    },
  });
  let handler: IDBRequest["onsuccess"] = null;
  Object.defineProperty(request, "onsuccess", {
    get: () => handler,
    set(next: IDBRequest["onsuccess"]) {
      handler =
        next &&
        function (this: IDBRequest, event: Event) {
          try {
            return next.call(this, event);
          } catch (caught) {
            escaped.push(caught);
            throw caught;
          }
        };
    },
  });
}

/** Fails every read of the vault's stored CryptoKey record like WebKit does. */
export function failVaultKeyReads(error: unknown, escaped: unknown[]) {
  const originalGet = IDBObjectStore.prototype.get;
  return vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function (
    this: IDBObjectStore,
    key,
  ) {
    const request = originalGet.call(this, key);
    if (key === "cryptoKey") throwFromResult(request, error, escaped);
    return request;
  });
}
