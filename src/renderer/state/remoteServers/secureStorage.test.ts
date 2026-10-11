import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageValue } from "zustand/middleware";
import type { RemoteServerRecord } from "./types";

import { createSecureRemoteServersStorage } from "./secureStorage";
import {
  __resetTokenVaultForTest,
  deleteDesktopToken,
  getDesktopToken,
  setDesktopToken,
} from "./tokenVault";

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

function stateValue(servers: RemoteServerRecord[]): StorageValue<PersistedState> {
  return { state: { servers, marker: "kept" }, version: 2 };
}

/** A direct pairing of the child host: connection key === host identity. */
function directChild(accessToken: string): RemoteServerRecord {
  return {
    connectionId: "child-desktop",
    desktopId: "child-desktop",
    label: "Direct child",
    endpoint: "https://child.example",
    accessToken,
    scopes: [],
    transport: { kind: "direct" },
  };
}

/** The same child host reached through a parent-owned environment. */
function environmentChild(
  accessToken: string,
  overrides: { readonly connectionId?: string; readonly parentConnectionId?: string } = {},
): RemoteServerRecord {
  return {
    connectionId: overrides.connectionId ?? "conn-env",
    desktopId: "child-desktop",
    label: "Environment child",
    endpoint: "https://child.example/api/environments/e1/proxy/",
    accessToken,
    scopes: [],
    transport: {
      kind: "environment",
      parentConnectionId: overrides.parentConnectionId ?? "conn-parent",
      environmentId: "e1",
      childDesktopId: "child-desktop",
    },
  };
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
    deleteDesktopToken("child-desktop"),
    deleteDesktopToken("conn-env"),
    deleteDesktopToken("conn-env-a"),
    deleteDesktopToken("conn-env-b"),
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

  it("isolates the access token per connection for the same child host (C1 F7)", async () => {
    const storage = createSecureRemoteServersStorage<PersistedState>();
    await storage.setItem(
      "servers",
      stateValue([directChild("direct-token"), environmentChild("environment-token")]),
    );
    __resetTokenVaultForTest();

    const restored = await storage.getItem("servers");
    expect(restored?.state.servers.map((entry) => entry.accessToken)).toEqual([
      "direct-token",
      "environment-token",
    ]);
  });

  it("keeps two parents' environments of the same copied child identity isolated (C1 F7)", async () => {
    const storage = createSecureRemoteServersStorage<PersistedState>();
    await storage.setItem(
      "servers",
      stateValue([
        environmentChild("token-a", { connectionId: "conn-env-a", parentConnectionId: "parent-a" }),
        environmentChild("token-b", { connectionId: "conn-env-b", parentConnectionId: "parent-b" }),
      ]),
    );
    __resetTokenVaultForTest();

    const restored = await storage.getItem("servers");
    expect(restored?.state.servers.map((entry) => entry.accessToken)).toEqual([
      "token-a",
      "token-b",
    ]);
  });

  it("never copies a shared legacy slot into two connections of one child host (C1 F7)", async () => {
    await setDesktopToken("child-desktop", "shared-bearer");
    const storage = createSecureRemoteServersStorage<PersistedState>();
    await storage.setItem("servers", stateValue([directChild(""), environmentChild("")]));
    __resetTokenVaultForTest();

    const restored = await storage.getItem("servers");
    // The direct pairing owns the `token.<desktopId>` slot; the environment
    // connection must not inherit the shared bearer from it.
    expect(restored?.state.servers[0]?.accessToken).toBe("shared-bearer");
    expect(restored?.state.servers[1]?.accessToken).toBe("");
  });

  it("recovers a unique-claim legacy slot for an environment record (C1 F7)", async () => {
    await setDesktopToken("child-desktop", "legacy-child-bearer");
    localStorage.setItem("servers", JSON.stringify(stateValue([environmentChild("")])));
    const storage = createSecureRemoteServersStorage<PersistedState>();

    const restored = await storage.getItem("servers");
    expect(restored?.state.servers[0]?.accessToken).toBe("legacy-child-bearer");
  });

  it("purges vault slots by connection key, not host identity (C1 F7)", async () => {
    const storage = createSecureRemoteServersStorage<PersistedState>();
    await storage.setItem(
      "servers",
      stateValue([directChild("direct-token"), environmentChild("environment-token")]),
    );
    await storage.setItem("servers", stateValue([directChild("direct-token")]));
    __resetTokenVaultForTest();

    expect(await getDesktopToken("conn-env")).toBeNull();
    expect(await getDesktopToken("child-desktop")).toBe("direct-token");
  });

  it("purges a stale legacy shared slot once no record claims the child identity (C1 F7)", async () => {
    const storage = createSecureRemoteServersStorage<PersistedState>();
    await storage.setItem("servers", stateValue([environmentChild("environment-token")]));
    await setDesktopToken("child-desktop", "legacy-shared");
    await storage.setItem("servers", stateValue([]));
    __resetTokenVaultForTest();

    expect(await getDesktopToken("conn-env")).toBeNull();
    expect(await getDesktopToken("child-desktop")).toBeNull();
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
