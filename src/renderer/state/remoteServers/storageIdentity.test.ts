import { webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteServerRecord } from "./types";

const closeRealms: (() => void)[] = [];
const browserWindow = window;
const nightlyHost = "app-nightly.poracode.com";
const oldServer: RemoteServerRecord = {
  desktopId: "desktop-1",
  connectionId: "desktop-1",
  label: "Saved desktop",
  endpoint: "https://desktop.example",
  accessToken: "old-bearer",
  scopes: [],
};

async function realm(hostname: string, electron = false) {
  vi.stubGlobal(
    "window",
    new Proxy(browserWindow, {
      get(target, key) {
        if (key === "location") return { hostname };
        if (key === "poracodeHost") return electron ? {} : undefined;
        return Reflect.get(target, key);
      },
    }),
  );
  vi.resetModules();
  const { remotePairingStorage: identity } = await import("./storageIdentity");
  const { createSecureRemoteServersStorage } = await import("./secureStorage");
  const vault = await import("./tokenVault");
  const refresh = await import("./refreshTokens");
  closeRealms.push(vault.__resetTokenVaultForTest, refresh.__resetRefreshTokensForTest);
  const storage = createSecureRemoteServersStorage<{ servers: RemoteServerRecord[] }>(
    (servers) => ({ servers }),
  );
  return { identity, storage, vault, refresh };
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("crypto", webcrypto);
});

afterEach(() => {
  for (const close of closeRealms.splice(0)) close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("hosted Nightly pairing recovery", () => {
  it.each([
    ["app.poracode.com", false],
    ["localhost", false],
    ["192.168.1.10", false],
    ["app-nightly.poracode.com.example", false],
    [nightlyHost, true],
  ])("preserves existing storage for %s (Electron: %s)", async (hostname, electron) => {
    const { identity } = await realm(hostname, electron);
    expect(identity).toEqual({
      name: "poracode-remote-servers",
      vaultDatabase: "lightcode-mobile-vault",
      importLegacy: true,
    });
  });

  it.each([1, 2])(
    "retires v%s pairings and an unreadable vault before hydration",
    async (version) => {
      localStorage.setItem(
        "poracode-remote-servers",
        JSON.stringify({ state: { servers: [oldServer] }, version }),
      );
      localStorage.setItem("poracode-shared-settings", '{"themeMode":"light"}');
      const oldDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("lightcode-mobile-vault", 10);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("entries", { keyPath: "key" });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = oldDatabase.transaction("entries", "readwrite");
        transaction.objectStore("entries").put({ key: "cryptoKey", cryptoKey: "unreadable-key" });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      // Keep the old database open, as an already-running installed tab would.
      const open = vi.spyOn(indexedDB, "open");
      try {
        const recovered = await realm(nightlyHost);
        expect(await recovered.storage.getItem(recovered.identity.name)).toBeNull();
        expect(await recovered.vault.getDesktopToken(oldServer.connectionId!)).toBeNull();
        expect(open.mock.calls.every(([name]) => name === recovered.identity.vaultDatabase)).toBe(
          true,
        );
        expect(localStorage.getItem("poracode-shared-settings")).toBe('{"themeMode":"light"}');

        const fresh = { ...oldServer, accessToken: "fresh-bearer" };
        await recovered.storage.setItem(recovered.identity.name, {
          state: { servers: [fresh] },
          version: 2,
        });
        const subject = recovered.refresh.connectionRefreshSubject(fresh.connectionId!);
        expect(await recovered.refresh.writeRefreshTokenToVault(subject, "fresh-refresh")).toBe(
          true,
        );

        // An older tab may still write its namespace while the new build is running.
        localStorage.setItem(
          "poracode-remote-servers",
          JSON.stringify({ state: { servers: [] }, version }),
        );
        const reopened = await realm(nightlyHost);
        expect((await reopened.storage.getItem(reopened.identity.name))?.state.servers).toEqual([
          fresh,
        ]);
        await reopened.refresh.hydrateRefreshTokens({ subjects: [subject] });
        expect(reopened.refresh.refreshTokenForSubject(subject)).toBe("fresh-refresh");
        expect(
          await reopened.refresh.readSharedCredential(subject, fresh.connectionId),
        ).toMatchObject({
          status: "ok",
          accessToken: "fresh-bearer",
          refreshToken: "fresh-refresh",
        });
        expect(localStorage.getItem(reopened.identity.name)).not.toContain("fresh-bearer");
        expect(open.mock.calls.some(([name]) => name === "lightcode-mobile")).toBe(false);
      } finally {
        oldDatabase.close();
      }
    },
  );
});
