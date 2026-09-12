import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageValue } from "zustand/middleware";
import type { RemoteServerRecord } from "./types";

import { createSecureRemoteServersStorage } from "./secureStorage";
import { __resetTokenVaultForTest, deleteDesktopToken } from "./tokenVault";

interface PersistedState {
  servers: RemoteServerRecord[];
  marker: string;
}

function server(desktopId: string, accessToken: string): RemoteServerRecord {
  return {
    desktopId,
    label: desktopId,
    endpoint: "https://desktop.example",
    accessToken,
    scopes: [],
  };
}

function value(record: RemoteServerRecord): StorageValue<PersistedState> {
  return { state: { servers: [record], marker: "kept" }, version: 1 };
}

async function createLegacyDexieVault(): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lightcode-mobile-vault", 10);
    request.onupgradeneeded = () => request.result.createObjectStore("entries", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
}

async function writeLegacyDesktop(record: RemoteServerRecord): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lightcode-mobile", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("desktops", { keyPath: "desktopId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("desktops", "readwrite");
    transaction.objectStore("desktops").put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  __resetTokenVaultForTest();
});

afterEach(async () => {
  await Promise.all([
    deleteDesktopToken("web-1"),
    deleteDesktopToken("legacy-1"),
    deleteDesktopToken("legacy-db-1"),
  ]);
  vi.restoreAllMocks();
});

describe("secure remote-server persistence", () => {
  it("opens a vault created by the retired Dexie schema", async () => {
    await createLegacyDexieVault();
    const storage = createSecureRemoteServersStorage<PersistedState>();

    await storage.setItem("servers", value(server("web-1", "browser-secret")));
    __resetTokenVaultForTest();

    expect((await storage.getItem("servers"))?.state.servers[0]?.accessToken).toBe(
      "browser-secret",
    );
  });

  it("encrypts browser bearer tokens outside localStorage and restores them", async () => {
    const storage = createSecureRemoteServersStorage<PersistedState>();
    await storage.setItem("servers", value(server("web-1", "browser-secret")));

    expect(localStorage.getItem("servers")).not.toContain("browser-secret");
    __resetTokenVaultForTest();

    const restored = await storage.getItem("servers");
    expect(restored?.state.servers[0]?.accessToken).toBe("browser-secret");
    expect(restored?.state.marker).toBe("kept");
  });

  it("migrates an existing plaintext localStorage token into the vault", async () => {
    const storage = createSecureRemoteServersStorage<PersistedState>();
    localStorage.setItem("servers", JSON.stringify(value(server("legacy-1", "legacy-secret"))));

    const restored = await storage.getItem("servers");

    expect(restored?.state.servers[0]?.accessToken).toBe("legacy-secret");
    expect(localStorage.getItem("servers")).not.toContain("legacy-secret");
  });

  it("retries plaintext migration after the secure vault becomes available", async () => {
    const indexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    __resetTokenVaultForTest();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = createSecureRemoteServersStorage<PersistedState>();
    localStorage.setItem("servers", JSON.stringify(value(server("legacy-1", "legacy-secret"))));

    // Vault unavailable: the token still resolves for this session, but the
    // plaintext copy must stay put rather than being dropped on the floor.
    expect((await storage.getItem("servers"))?.state.servers[0]?.accessToken).toBe("legacy-secret");
    expect(localStorage.getItem("servers")).toContain("legacy-secret");

    if (indexedDbDescriptor) {
      Object.defineProperty(globalThis, "indexedDB", indexedDbDescriptor);
    }
    __resetTokenVaultForTest();

    expect((await storage.getItem("servers"))?.state.servers[0]?.accessToken).toBe("legacy-secret");
    expect(localStorage.getItem("servers")).not.toContain("legacy-secret");

    // The retry actually landed in the vault, not just in the live snapshot.
    __resetTokenVaultForTest();
    expect((await storage.getItem("servers"))?.state.servers[0]?.accessToken).toBe("legacy-secret");
  });

  it("imports pairings from the retired mobile IndexedDB on first launch", async () => {
    await writeLegacyDesktop(server("legacy-db-1", "legacy-database-secret"));
    const storage = createSecureRemoteServersStorage<PersistedState>((servers) => ({
      servers,
      marker: "migrated",
    }));

    const restored = await storage.getItem("servers");

    expect(restored?.state.servers[0]?.desktopId).toBe("legacy-db-1");
    expect(restored?.state.servers[0]?.accessToken).toBe("legacy-database-secret");
    expect(restored?.state.marker).toBe("migrated");
    expect(localStorage.getItem("servers")).not.toContain("legacy-database-secret");
  });

  it("never falls back to plaintext localStorage when the secure vault is unavailable", async () => {
    const indexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: undefined });
    __resetTokenVaultForTest();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const storage = createSecureRemoteServersStorage<PersistedState>();
      await storage.setItem("servers", value(server("web-1", "must-not-leak")));

      expect(localStorage.getItem("servers")).not.toContain("must-not-leak");
      expect((await storage.getItem("servers"))?.state.servers[0]?.accessToken).toBe("");
    } finally {
      if (indexedDbDescriptor) {
        Object.defineProperty(globalThis, "indexedDB", indexedDbDescriptor);
      }
      __resetTokenVaultForTest();
      vi.restoreAllMocks();
    }
  });
});
