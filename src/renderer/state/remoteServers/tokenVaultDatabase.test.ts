import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenVaultDatabase, TOKEN_VAULT_OPERATION_TIMEOUT_MS } from "./tokenVaultDatabase";

const DATABASE_NAME = "lightcode-mobile-vault";
let vault: TokenVaultDatabase;
let invalidated: ReturnType<typeof vi.fn<() => void>>;
const connections: IDBDatabase[] = [];

async function openNative(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME);
    request.onupgradeneeded = () => request.result.createObjectStore("entries", { keyPath: "key" });
    request.onsuccess = () => {
      connections.push(request.result);
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

function pendingOpen(database: IDBDatabase): IDBOpenDBRequest {
  return {
    result: database,
    error: null,
    transaction: null,
    onsuccess: null,
    onerror: null,
    onblocked: null,
    onupgradeneeded: null,
  } as unknown as IDBOpenDBRequest;
}

function readValue(key = "value") {
  return vault.request("readonly", "read", (store) => store.get(key));
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  invalidated = vi.fn<() => void>();
  vault = new TokenVaultDatabase(invalidated);
});

afterEach(() => {
  vault.close();
  for (const connection of connections.splice(0)) connection.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded token-vault database", () => {
  it("times out a stalled open, releases late success, and keeps a newer retry cached", async () => {
    const oldDatabase = await openNative();
    const newDatabase = await openNative();
    const closeOld = vi.spyOn(oldDatabase, "close");
    const oldRequest = pendingOpen(oldDatabase);
    const newRequest = pendingOpen(newDatabase);
    const open = vi
      .spyOn(indexedDB, "open")
      .mockReturnValueOnce(oldRequest)
      .mockReturnValueOnce(newRequest);
    const first = readValue().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(TOKEN_VAULT_OPERATION_TIMEOUT_MS);
    expect(await first).toMatchObject({ name: "TimeoutError" });
    expect(invalidated).toHaveBeenCalledTimes(1);

    const retry = readValue();
    oldRequest.onsuccess?.call(oldRequest, new Event("success"));
    oldRequest.onerror?.call(oldRequest, new Event("error"));
    expect(closeOld).toHaveBeenCalledTimes(1);
    const concurrent = readValue();
    expect(open).toHaveBeenCalledTimes(2);
    newRequest.onsuccess?.call(newRequest, new Event("success"));
    await expect(retry).resolves.toBeUndefined();
    await expect(concurrent).resolves.toBeUndefined();
    await expect(readValue()).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledTimes(2);
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects blocked opens promptly and closes their late connection", async () => {
    const database = await openNative();
    const close = vi.spyOn(database, "close");
    const request = pendingOpen(database);
    vi.spyOn(indexedDB, "open").mockReturnValueOnce(request);
    const result = readValue().catch((error: unknown) => error);
    request.onblocked?.call(request, {} as IDBVersionChangeEvent);
    expect(await result).toMatchObject({ message: "Unable to open the token vault." });
    request.onsuccess?.call(request, new Event("success"));
    expect(close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await expect(readValue()).resolves.toBeUndefined();
  });

  it("does not let a rejected superseded open clear a newer pending connection", async () => {
    const oldDatabase = await openNative();
    const newDatabase = await openNative();
    const oldRequest = pendingOpen(oldDatabase);
    const newRequest = pendingOpen(newDatabase);
    const open = vi
      .spyOn(indexedDB, "open")
      .mockReturnValueOnce(oldRequest)
      .mockReturnValueOnce(newRequest);
    const old = readValue().catch((error: unknown) => error);
    vault.close();
    const retry = readValue();
    oldRequest.onerror?.call(oldRequest, new Event("error"));
    expect(await old).toBeInstanceOf(Error);
    const concurrent = readValue();
    expect(open).toHaveBeenCalledTimes(2);
    newRequest.onsuccess?.call(newRequest, new Event("success"));
    await expect(retry).resolves.toBeUndefined();
    await expect(concurrent).resolves.toBeUndefined();
    expect(invalidated).toHaveBeenCalledTimes(1);
  });

  it("aborts a late upgrade instead of changing schema after an open timeout", async () => {
    const database = await openNative();
    const createStore = vi.spyOn(database, "createObjectStore");
    const abort = vi.fn<() => void>();
    const request = pendingOpen(database);
    Object.defineProperty(request, "transaction", { value: { abort } });
    vi.spyOn(indexedDB, "open").mockReturnValueOnce(request);
    const result = readValue().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(TOKEN_VAULT_OPERATION_TIMEOUT_MS);
    expect(await result).toMatchObject({ name: "TimeoutError" });
    request.onupgradeneeded?.call(request, {} as IDBVersionChangeEvent);
    expect(abort).toHaveBeenCalledTimes(2);
    expect(createStore).not.toHaveBeenCalled();
  });

  it("closes and invalidates on versionchange without letting an old event clear the retry", async () => {
    const database = await openNative();
    const request = pendingOpen(database);
    const close = vi.spyOn(database, "close");
    const open = vi.spyOn(indexedDB, "open").mockReturnValueOnce(request);
    const first = readValue();
    request.onsuccess?.call(request, new Event("success"));
    await first;
    const oldVersionChange = database.onversionchange;
    oldVersionChange?.call(database, {} as IDBVersionChangeEvent);
    expect(close).toHaveBeenCalledTimes(1);
    await expect(readValue()).resolves.toBeUndefined();
    oldVersionChange?.call(database, {} as IDBVersionChangeEvent);
    await expect(readValue()).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledTimes(2);
    expect(invalidated).toHaveBeenCalledTimes(1);
  });

  it.each(["read", "write", "update"] as const)(
    "aborts a stalled %s transaction, ignores late events, and retries without losing stored data",
    async (operation) => {
      await vault.request("readwrite", "write", (store) =>
        store.put({ key: "value", secret: "original" }),
      );
      const started = Promise.withResolvers<{
        transaction: IDBTransaction;
        request: IDBRequest<unknown>;
        abort: ReturnType<typeof vi.spyOn>;
        aborted: Promise<void>;
        succeeded: Promise<void>;
      }>();
      let settled = false;
      const pending = vault
        .request<unknown>(operation === "read" ? "readonly" : "readwrite", operation, (store) => {
          const transaction = store.transaction;
          // Keep a real fake-indexeddb transaction active past request success.
          // The production deadline must call its real abort(), rolling back writes.
          const hold = () => {
            const keepAlive = store.get("__keepalive__");
            keepAlive.onsuccess = hold;
          };
          hold();
          const request = (
            operation === "read"
              ? store.get("missing-key")
              : operation === "write"
                ? store.put({ key: "value", secret: "uncommitted" })
                : store.delete("value")
          ) as IDBRequest<unknown>;
          started.resolve({
            transaction,
            request,
            abort: vi.spyOn(transaction, "abort"),
            aborted: new Promise((resolve) => {
              transaction.addEventListener("abort", () => resolve(), { once: true });
            }),
            succeeded: new Promise((resolve) => {
              request.addEventListener("success", () => resolve(), { once: true });
            }),
          });
          return request;
        })
        .then(
          (value) => {
            settled = true;
            return value;
          },
          (error: unknown) => {
            settled = true;
            return error;
          },
        );
      const held = await started.promise;
      await held.succeeded;
      expect(settled).toBe(false);
      const lateComplete = held.transaction.oncomplete;
      const lateSuccess = held.request.onsuccess;
      await vi.advanceTimersByTimeAsync(TOKEN_VAULT_OPERATION_TIMEOUT_MS);
      expect(await pending).toMatchObject({ name: "TimeoutError" });
      await held.aborted;
      expect(held.abort).toHaveBeenCalledTimes(1);
      lateSuccess?.call(held.request, new Event("success"));
      lateComplete?.call(held.transaction, new Event("complete"));
      expect(await pending).toMatchObject({ name: "TimeoutError" });
      expect(await readValue()).toEqual({ key: "value", secret: "original" });
      await vault.request("readwrite", "write", (store) =>
        store.put({ key: "value", secret: "retry" }),
      );
      expect(await readValue()).toEqual({ key: "value", secret: "retry" });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("rejects a readonly transaction abort rather than returning a missing key", async () => {
    const result = vault.request("readonly", "read", (store) => {
      const request = store.get("cryptoKey");
      store.transaction.abort();
      return request;
    });
    await expect(result).rejects.toBeDefined();
    await expect(readValue("cryptoKey")).resolves.toBeUndefined();
  });

  it("does not acknowledge request success when the write subsequently aborts", async () => {
    const result = vault.request("readwrite", "write", (store) => {
      const request = store.put({ key: "value", secret: "uncommitted" });
      request.addEventListener("success", () => store.transaction.abort(), { once: true });
      return request;
    });
    await expect(result).rejects.toThrow("Unable to write the token vault.");
    await expect(readValue()).resolves.toBeUndefined();
  });
});
