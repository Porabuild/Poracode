import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteAccessScope, RemoteEnvironmentDescriptor } from "@/shared/remote";

// In-memory stand-in for the native OS keystore. Exposed through vi.hoisted so
// both the module mock and the assertions below share the same instance.
const vault = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn<(key: string) => Promise<string | null>>(async (key) => store.get(key) ?? null),
    set: vi.fn<(key: string, value: unknown) => Promise<void>>(async (key, value) => {
      store.set(key, String(value));
    }),
    remove: vi.fn<(key: string) => Promise<boolean>>(async (key) => store.delete(key)),
  };
});

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  SecureStorage: { get: vault.get, set: vault.set, remove: vault.remove },
}));

const globalWithCapacitor = globalThis as typeof globalThis & {
  Capacitor?: { isNativePlatform: () => boolean };
};

function setNative(native: boolean): void {
  globalWithCapacitor.Capacitor = { isNativePlatform: () => native };
}

// Real Dexie against fake-indexeddb; storage.ts and tokenVault.ts are imported
// after the mocks/globals so their module-load sees this environment.
import { forgetDesktop, listStoredDesktops, mobileDb, saveDesktop } from "./storage";
import {
  __resetTokenCacheForTests,
  __resetVaultKeyMemoForTests,
  deleteDesktopToken,
  getDesktopToken,
  setDesktopToken,
  tokenVaultDb,
} from "./tokenVault";

/**
 * Replace the global `crypto` with a stub that has no `.subtle`, forcing the
 * web vault's availability gate to fail closed — mirrors a non-secure
 * context where WebCrypto's `subtle` is undefined. Callers must
 * `vi.unstubAllGlobals()` afterwards (the shared `afterEach` below does).
 */
function stubSubtleUnavailable(): void {
  vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
}

function descriptor(desktopId: string): RemoteEnvironmentDescriptor {
  return {
    desktopId,
    label: `Desktop ${desktopId}`,
    appVersion: "1.0.0",
  } as RemoteEnvironmentDescriptor;
}

function saveInput(desktopId: string, token: string) {
  return {
    descriptor: descriptor(desktopId),
    endpoint: "http://192.168.1.20:38987/",
    accessToken: token,
    tokenExpiresAt: "2099-01-01T00:00:00.000Z",
    scopes: [] as RemoteAccessScope[],
  };
}

beforeEach(async () => {
  vault.store.clear();
  vault.get.mockClear();
  vault.set.mockClear();
  vault.remove.mockClear();
  __resetTokenCacheForTests();
  __resetVaultKeyMemoForTests();
  await mobileDb.desktops.clear();
  await mobileDb.preferences.clear();
  await tokenVaultDb.entries.clear();
});

afterEach(() => {
  delete globalWithCapacitor.Capacitor;
  vi.unstubAllGlobals();
});

describe("tokenVault", () => {
  it("stores, reads, and deletes through secure storage on native", async () => {
    setNative(true);
    expect(await setDesktopToken("d1", "secret")).toBe(true);
    expect(vault.store.get("remoteDesktopToken.d1")).toBe("secret");
    expect(await getDesktopToken("d1")).toBe("secret");
    await deleteDesktopToken("d1");
    expect(await getDesktopToken("d1")).toBeNull();
  });

  it("degrades gracefully when the plugin throws", async () => {
    setNative(true);
    vault.set.mockRejectedValueOnce(new Error("keystore locked"));
    expect(await setDesktopToken("d1", "secret")).toBe(false);
    vault.get.mockRejectedValueOnce(new Error("keystore locked"));
    expect(await getDesktopToken("d1")).toBeNull();
  });

  it("serves repeat reads from the in-memory cache without re-hitting the keystore", async () => {
    setNative(true);
    await setDesktopToken("d1", "secret");
    vault.get.mockClear();

    // First read populates the cache from the keystore only if needed; a set
    // already primed it, so no keystore read happens at all.
    expect(await getDesktopToken("d1")).toBe("secret");
    expect(await getDesktopToken("d1")).toBe("secret");
    expect(vault.get).not.toHaveBeenCalled();
  });

  it("reads the keystore once, then caches for subsequent reads", async () => {
    setNative(true);
    // Seed the keystore directly (no setDesktopToken), so the cache starts cold.
    vault.store.set("remoteDesktopToken.d1", "secret");

    expect(await getDesktopToken("d1")).toBe("secret");
    expect(await getDesktopToken("d1")).toBe("secret");
    // Only the first read touched the keystore; the rest are cache hits.
    expect(vault.get).toHaveBeenCalledTimes(1);
  });

  it("does not cache (pin) a transient plugin failure", async () => {
    setNative(true);
    vault.store.set("remoteDesktopToken.d1", "secret");
    vault.get.mockRejectedValueOnce(new Error("keystore locked"));

    // Transient failure returns null but must not be cached...
    expect(await getDesktopToken("d1")).toBeNull();
    // ...so the next read retries the keystore and succeeds.
    expect(await getDesktopToken("d1")).toBe("secret");
  });

  it("evicts the cache on delete so a later read reflects removal", async () => {
    setNative(true);
    await setDesktopToken("d1", "secret");
    expect(await getDesktopToken("d1")).toBe("secret");

    await deleteDesktopToken("d1");
    // The keystore entry is gone and the cache was evicted, so the read misses.
    expect(await getDesktopToken("d1")).toBeNull();
  });

  it("refreshes the cache when a token is overwritten", async () => {
    setNative(true);
    await setDesktopToken("d1", "old");
    expect(await getDesktopToken("d1")).toBe("old");

    await setDesktopToken("d1", "new");
    expect(await getDesktopToken("d1")).toBe("new");
  });
});

describe("tokenVault — web (WebCrypto vault)", () => {
  beforeEach(() => setNative(false));

  it("encrypts a token at rest and round-trips it back through set -> get", async () => {
    expect(await setDesktopToken("d1", "secret")).toBe(true);
    // The web path never touches the native keystore mock.
    expect(vault.set).not.toHaveBeenCalled();

    const record = await tokenVaultDb.entries.get("token.d1");
    expect(record).toBeDefined();
    // The vault stores ciphertext, never the plaintext token.
    const plaintextLeaked =
      record && "data" in record && new TextDecoder().decode(record.data) === "secret";
    expect(plaintextLeaked).toBe(false);

    expect(await getDesktopToken("d1")).toBe("secret");
    expect(vault.get).not.toHaveBeenCalled();
  });

  it("deletes a stored token", async () => {
    await setDesktopToken("d1", "secret");
    expect(await getDesktopToken("d1")).toBe("secret");

    await deleteDesktopToken("d1");
    expect(vault.remove).not.toHaveBeenCalled();
    expect(await tokenVaultDb.entries.get("token.d1")).toBeUndefined();
    expect(await getDesktopToken("d1")).toBeNull();
  });

  it("degrades gracefully when crypto.subtle is unavailable", async () => {
    stubSubtleUnavailable();

    expect(await setDesktopToken("d1", "secret")).toBe(false);
    expect(await getDesktopToken("d1")).toBeNull();
  });

  it("serializes concurrent first-time key creation into a single generateKey call", async () => {
    const generateKeySpy = vi.spyOn(crypto.subtle, "generateKey");
    try {
      const [firstOk, secondOk] = await Promise.all([
        setDesktopToken("d1", "secret-1"),
        setDesktopToken("d2", "secret-2"),
      ]);

      expect(firstOk).toBe(true);
      expect(secondOk).toBe(true);
      // Both first-time writes raced to create the AES key; only one
      // generateKey call should have gone through.
      expect(generateKeySpy).toHaveBeenCalledTimes(1);
      expect(await getDesktopToken("d1")).toBe("secret-1");
      expect(await getDesktopToken("d2")).toBe("secret-2");
    } finally {
      generateKeySpy.mockRestore();
    }
  });

  it("decrypts via the persisted key after a fresh session (in-memory caches reset)", async () => {
    await setDesktopToken("d1", "secret");

    // Simulate a reload: only the in-memory caches are cleared, not the
    // persisted key/ciphertext in tokenVaultDb.
    __resetTokenCacheForTests();
    __resetVaultKeyMemoForTests();

    expect(await getDesktopToken("d1")).toBe("secret");
  });
});

describe("storage token persistence (native)", () => {
  beforeEach(() => setNative(true));

  it("keeps the token in the keystore and blanks the Dexie row", async () => {
    const saved = await saveDesktop(saveInput("d1", "secret-token"));

    // Caller gets the live token to connect immediately.
    expect(saved.accessToken).toBe("secret-token");
    // The persisted Dexie row carries no token.
    expect((await mobileDb.desktops.get("d1"))?.accessToken).toBe("");
    // The token lives in the keystore.
    expect(vault.store.get("remoteDesktopToken.d1")).toBe("secret-token");
  });

  it("rehydrates the token from the keystore on read", async () => {
    await saveDesktop(saveInput("d1", "secret-token"));
    const [desktop] = await listStoredDesktops();
    expect(desktop?.accessToken).toBe("secret-token");
  });

  it("lazily migrates a legacy plaintext row into the keystore", async () => {
    // A row written before secure storage existed still holds a plaintext token.
    await mobileDb.desktops.put({
      desktopId: "legacy",
      label: "Legacy",
      endpoint: "http://192.168.1.20:38987/",
      appVersion: "1.0.0",
      accessToken: "legacy-token",
      tokenExpiresAt: "2099-01-01T00:00:00.000Z",
      scopes: [],
      lastSeenSeq: 0,
      pairedAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });

    const [desktop] = await listStoredDesktops();
    // Consumer still sees the token...
    expect(desktop?.accessToken).toBe("legacy-token");
    // ...it moved into the keystore...
    expect(vault.store.get("remoteDesktopToken.legacy")).toBe("legacy-token");
    // ...and the Dexie row was blanked.
    expect((await mobileDb.desktops.get("legacy"))?.accessToken).toBe("");
  });

  it("deletes the keystore entry when the desktop is forgotten", async () => {
    await saveDesktop(saveInput("d1", "secret-token"));
    await mobileDb.threadSnapshots.put({
      id: "d1:t1",
      desktopId: "d1",
      threadId: "t1",
      snapshot: { thread: { id: "t1" } },
      updatedAt: "2026-07-01T00:00:00.000Z",
    } as never);
    expect(vault.store.get("remoteDesktopToken.d1")).toBe("secret-token");

    await forgetDesktop("d1");
    expect(vault.store.has("remoteDesktopToken.d1")).toBe(false);
    expect(await mobileDb.desktops.get("d1")).toBeUndefined();
    expect(await mobileDb.threadSnapshots.get("d1:t1")).toBeUndefined();
  });

  it("keeps the token in Dexie when the keystore write fails", async () => {
    vault.set.mockRejectedValueOnce(new Error("keystore locked"));
    await saveDesktop(saveInput("d1", "secret-token"));
    // Falls back to Dexie so pairing is not silently broken.
    expect((await mobileDb.desktops.get("d1"))?.accessToken).toBe("secret-token");
  });
});

describe("storage token persistence (web, vault unavailable)", () => {
  // Predates the WebCrypto vault; asserts the graceful-degradation behavior
  // (token stays plaintext in Dexie, neither backend touched) by forcing the
  // vault inert. The encrypted happy path is covered by
  // "storage token persistence (web, encrypted)" below.
  beforeEach(() => {
    setNative(false);
    stubSubtleUnavailable();
  });

  it("leaves the token in the Dexie row untouched", async () => {
    const saved = await saveDesktop(saveInput("d1", "secret-token"));
    expect(saved.accessToken).toBe("secret-token");
    expect((await mobileDb.desktops.get("d1"))?.accessToken).toBe("secret-token");
    expect(vault.set).not.toHaveBeenCalled();

    const [desktop] = await listStoredDesktops();
    expect(desktop?.accessToken).toBe("secret-token");
    expect(vault.get).not.toHaveBeenCalled();
  });
});

describe("storage token persistence (web, encrypted)", () => {
  beforeEach(() => setNative(false));

  it("keeps the token in the vault and blanks the Dexie row", async () => {
    const saved = await saveDesktop(saveInput("d1", "secret-token"));

    // Caller gets the live token to connect immediately.
    expect(saved.accessToken).toBe("secret-token");
    // The persisted Dexie row carries no token.
    expect((await mobileDb.desktops.get("d1"))?.accessToken).toBe("");
    // The token lives in the encrypted vault.
    expect(await tokenVaultDb.entries.get("token.d1")).toBeDefined();
    expect(vault.set).not.toHaveBeenCalled();
  });

  it("rehydrates the token from the vault on read", async () => {
    await saveDesktop(saveInput("d1", "secret-token"));
    // Force a real vault read instead of an in-memory cache hit.
    __resetTokenCacheForTests();

    const [desktop] = await listStoredDesktops();
    expect(desktop?.accessToken).toBe("secret-token");
    expect(vault.get).not.toHaveBeenCalled();
  });

  it("lazily migrates a legacy plaintext row into the vault", async () => {
    // A row written before the web vault existed still holds a plaintext token.
    await mobileDb.desktops.put({
      desktopId: "legacy",
      label: "Legacy",
      endpoint: "http://192.168.1.20:38987/",
      appVersion: "1.0.0",
      accessToken: "legacy-token",
      tokenExpiresAt: "2099-01-01T00:00:00.000Z",
      scopes: [],
      lastSeenSeq: 0,
      pairedAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });

    const [desktop] = await listStoredDesktops();
    // Consumer still sees the token...
    expect(desktop?.accessToken).toBe("legacy-token");
    // ...it moved into the vault...
    expect(await tokenVaultDb.entries.get("token.legacy")).toBeDefined();
    // ...and the Dexie row was blanked.
    expect((await mobileDb.desktops.get("legacy"))?.accessToken).toBe("");
  });
});
