import { webcrypto } from "node:crypto";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetTokenVaultForTest,
  deleteDesktopToken,
  getDesktopToken,
  setDesktopToken,
} from "./tokenVault";
import { TOKEN_VAULT_OPERATION_TIMEOUT_MS } from "./tokenVaultDatabase";

const DATABASE_NAME = "lightcode-mobile-vault";

async function openNative(version?: number): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, version);
    request.onupgradeneeded = () => request.result.createObjectStore("entries", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedLegacyVault(): Promise<void> {
  const cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode("original-secret"),
  );
  const database = await openNative(10);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("entries", "readwrite");
      const store = transaction.objectStore("entries");
      store.put({ key: "cryptoKey", cryptoKey });
      store.put({ key: "token.desktop", iv, data });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

function holdTransaction(store: IDBObjectStore): Promise<void> {
  const originalGet = IDBObjectStore.prototype.get;
  const hold = () => {
    const request = originalGet.call(store, "__keepalive__");
    request.onsuccess = hold;
  };
  hold();
  return new Promise((resolve) => {
    store.transaction.addEventListener("abort", () => resolve(), { once: true });
  });
}

beforeEach(() => {
  __resetTokenVaultForTest();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("crypto", webcrypto);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  __resetTokenVaultForTest();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("token vault liveness and credential preservation", () => {
  it("round-trips the retired native-v10 vault without schema change or key rotation", async () => {
    await seedLegacyVault();
    const generateKey = vi.spyOn(crypto.subtle, "generateKey");
    const open = vi.spyOn(indexedDB, "open");
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    expect(open).toHaveBeenCalledExactlyOnceWith(DATABASE_NAME);
    expect(await setDesktopToken("second", "second-secret")).toBe(true);
    __resetTokenVaultForTest();
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    expect(await getDesktopToken("second")).toBe("second-secret");
    expect(generateKey).not.toHaveBeenCalled();
    const database = await openNative();
    expect(database.version).toBe(10);
    expect([...database.objectStoreNames]).toEqual(["entries"]);
    expect(database.transaction("entries").objectStore("entries").keyPath).toBe("key");
    database.close();
    await deleteDesktopToken("second");
    __resetTokenVaultForTest();
    expect(await getDesktopToken("second")).toBeNull();
    expect(await getDesktopToken("desktop")).toBe("original-secret");
  });

  it("keeps the public null/false fallback on a stalled open and can retry", async () => {
    await seedLegacyVault();
    const request = {} as IDBOpenDBRequest;
    const open = vi.spyOn(indexedDB, "open").mockReturnValueOnce(request);
    const read = getDesktopToken("desktop");
    const write = setDesktopToken("other", "unsaved-secret");
    await vi.advanceTimersByTimeAsync(TOKEN_VAULT_OPERATION_TIMEOUT_MS);
    expect(await read).toBeNull();
    expect(await write).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    expect(await getDesktopToken("other")).toBeNull();
    expect(await setDesktopToken("other", "retry-secret")).toBe(true);
    __resetTokenVaultForTest();
    expect(await getDesktopToken("other")).toBe("retry-secret");
  });

  it("does not create or overwrite the encryption key after its read transaction stalls", async () => {
    await seedLegacyVault();
    const generateKey = vi.spyOn(crypto.subtle, "generateKey");
    const originalGet = IDBObjectStore.prototype.get;
    const started = Promise.withResolvers<{
      abort: ReturnType<typeof vi.spyOn>;
      aborted: Promise<void>;
    }>();
    const get = vi
      .spyOn(IDBObjectStore.prototype, "get")
      .mockImplementation(function (this: IDBObjectStore, key) {
        const request = originalGet.call(this, key);
        if (key === "cryptoKey") {
          started.resolve({
            abort: vi.spyOn(this.transaction, "abort"),
            aborted: holdTransaction(this),
          });
        }
        return request;
      });
    const write = setDesktopToken("other", "unsaved-secret");
    const held = await started.promise;
    await vi.advanceTimersByTimeAsync(TOKEN_VAULT_OPERATION_TIMEOUT_MS);
    expect(await write).toBe(false);
    await held.aborted;
    expect(held.abort).toHaveBeenCalledTimes(1);
    expect(generateKey).not.toHaveBeenCalled();
    get.mockRestore();
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    expect(await setDesktopToken("other", "retry-secret")).toBe(true);
    __resetTokenVaultForTest();
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    expect(await getDesktopToken("other")).toBe("retry-secret");
    expect(generateKey).not.toHaveBeenCalled();
  });

  it("treats an aborted key read as failure, never as a missing key", async () => {
    await seedLegacyVault();
    const generateKey = vi.spyOn(crypto.subtle, "generateKey");
    const originalGet = IDBObjectStore.prototype.get;
    const get = vi
      .spyOn(IDBObjectStore.prototype, "get")
      .mockImplementation(function (this: IDBObjectStore, key) {
        const request = originalGet.call(this, key);
        if (key === "cryptoKey") this.transaction.abort();
        return request;
      });
    expect(await setDesktopToken("other", "unsaved-secret")).toBe(false);
    expect(generateKey).not.toHaveBeenCalled();
    get.mockRestore();
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    expect(await getDesktopToken("other")).toBeNull();
  });

  it("does not acknowledge or cache a token whose write times out before commit", async () => {
    await seedLegacyVault();
    const originalPut = IDBObjectStore.prototype.put;
    const started = Promise.withResolvers<{ aborted: Promise<void> }>();
    const put = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        const request = originalPut.call(this, value, key);
        if ((value as { key: string }).key === "token.desktop") {
          started.resolve({ aborted: holdTransaction(this) });
        }
        return request;
      });
    const write = setDesktopToken("desktop", "uncommitted-secret");
    const held = await started.promise;
    await vi.advanceTimersByTimeAsync(TOKEN_VAULT_OPERATION_TIMEOUT_MS);
    expect(await write).toBe(false);
    await held.aborted;
    put.mockRestore();
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    expect(await setDesktopToken("desktop", "retry-secret")).toBe(true);
    __resetTokenVaultForTest();
    expect(await getDesktopToken("desktop")).toBe("retry-secret");
  });

  it("aborts a timed-out deletion and preserves the stored credential for retry", async () => {
    await seedLegacyVault();
    const originalDelete = IDBObjectStore.prototype.delete;
    const started = Promise.withResolvers<{ aborted: Promise<void> }>();
    const remove = vi
      .spyOn(IDBObjectStore.prototype, "delete")
      .mockImplementation(function (this: IDBObjectStore, key) {
        const request = originalDelete.call(this, key);
        started.resolve({ aborted: holdTransaction(this) });
        return request;
      });
    const deletion = deleteDesktopToken("desktop");
    const held = await started.promise;
    await vi.advanceTimersByTimeAsync(TOKEN_VAULT_OPERATION_TIMEOUT_MS);
    await deletion;
    await held.aborted;
    remove.mockRestore();
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    await deleteDesktopToken("desktop");
    expect(await getDesktopToken("desktop")).toBeNull();
  });

  it("does not let an old rejected key load clear a newer pending key load", async () => {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const firstKey = Promise.withResolvers<CryptoKey>();
    const nextKey = Promise.withResolvers<CryptoKey>();
    const firstStarted = Promise.withResolvers<void>();
    const nextStarted = Promise.withResolvers<void>();
    const generate = vi
      .spyOn(crypto.subtle, "generateKey")
      .mockImplementationOnce(() => {
        firstStarted.resolve();
        return firstKey.promise;
      })
      .mockImplementationOnce(() => {
        nextStarted.resolve();
        return nextKey.promise;
      });
    const first = setDesktopToken("old", "old-secret");
    await firstStarted.promise;
    __resetTokenVaultForTest();
    const next = setDesktopToken("new", "new-secret");
    await nextStarted.promise;
    firstKey.reject(new Error("Unable to read the token vault."));
    expect(await first).toBe(false);
    const sharedRetry = setDesktopToken("other", "other-secret");
    nextKey.resolve(key);
    expect(await next).toBe(true);
    expect(await sharedRetry).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    __resetTokenVaultForTest();
    expect(await getDesktopToken("new")).toBe("new-secret");
    expect(await getDesktopToken("other")).toBe("other-secret");
    expect(await getDesktopToken("old")).toBeNull();
  });

  it("refuses a superseded key creation after a newer key has committed", async () => {
    const oldKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const delayed = Promise.withResolvers<CryptoKey>();
    const started = Promise.withResolvers<void>();
    vi.spyOn(crypto.subtle, "generateKey").mockImplementationOnce(() => {
      started.resolve();
      return delayed.promise;
    });
    const oldWrite = setDesktopToken("old", "old-secret");
    await started.promise;
    __resetTokenVaultForTest();
    expect(await setDesktopToken("new", "new-secret")).toBe(true);
    delayed.resolve(oldKey);
    expect(await oldWrite).toBe(false);
    __resetTokenVaultForTest();
    expect(await getDesktopToken("new")).toBe("new-secret");
    expect(await getDesktopToken("old")).toBeNull();
  });

  it("does not resurrect a deleted token when an earlier decrypt finishes late", async () => {
    await seedLegacyVault();
    const delayed = Promise.withResolvers<ArrayBuffer>();
    const started = Promise.withResolvers<void>();
    vi.spyOn(crypto.subtle, "decrypt").mockImplementationOnce(() => {
      started.resolve();
      return delayed.promise;
    });
    const read = getDesktopToken("desktop");
    await started.promise;
    await deleteDesktopToken("desktop");
    delayed.resolve(new TextEncoder().encode("original-secret").buffer);
    expect(await read).toBeNull();
    expect(await getDesktopToken("desktop")).toBeNull();
  });

  it("does not write a token after a newer deletion while encryption was pending", async () => {
    await seedLegacyVault();
    const delayed = Promise.withResolvers<ArrayBuffer>();
    const started = Promise.withResolvers<void>();
    vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(() => {
      started.resolve();
      return delayed.promise;
    });
    const write = setDesktopToken("desktop", "stale-secret");
    await started.promise;
    await deleteDesktopToken("desktop");
    delayed.resolve(new ArrayBuffer(16));
    expect(await write).toBe(false);
    expect(await getDesktopToken("desktop")).toBeNull();
  });

  it("does not publish ciphertext from an invalidated connection's pending encryption", async () => {
    await seedLegacyVault();
    const originalOpen = indexedDB.open.bind(indexedDB);
    let connection: IDBDatabase | undefined;
    vi.spyOn(indexedDB, "open").mockImplementationOnce((name) => {
      const request = originalOpen(name);
      request.addEventListener(
        "success",
        () => {
          connection = request.result;
        },
        { once: true },
      );
      return request;
    });
    const delayed = Promise.withResolvers<ArrayBuffer>();
    const started = Promise.withResolvers<void>();
    vi.spyOn(crypto.subtle, "encrypt").mockImplementationOnce(() => {
      started.resolve();
      return delayed.promise;
    });
    const write = setDesktopToken("desktop", "stale-secret");
    await started.promise;
    expect(connection).toBeDefined();
    connection!.onversionchange?.call(connection!, {} as IDBVersionChangeEvent);
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    delayed.resolve(new ArrayBuffer(16));
    expect(await write).toBe(false);
    __resetTokenVaultForTest();
    expect(await getDesktopToken("desktop")).toBe("original-secret");
    expect(await setDesktopToken("desktop", "retry-secret")).toBe(true);
  });
});
