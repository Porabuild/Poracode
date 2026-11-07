import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TokenVaultModule = typeof import("./tokenVault");
type RefreshTokensModule = typeof import("./refreshTokens");

/** One renderer realm: a fresh module graph over the shared IndexedDB. */
async function realm(): Promise<{ vault: TokenVaultModule; refresh: RefreshTokensModule }> {
  vi.resetModules();
  return {
    vault: await import("./tokenVault"),
    refresh: await import("./refreshTokens"),
  };
}

/** Holds every key generation until `count` realms have read a missing key. */
function holdKeyGeneration(count: number): void {
  const generateKey = webcrypto.subtle.generateKey.bind(webcrypto.subtle);
  let waiting = 0;
  const released = Promise.withResolvers<void>();
  vi.spyOn(crypto.subtle, "generateKey").mockImplementation(async (...args: unknown[]) => {
    waiting += 1;
    if (waiting >= count) released.resolve();
    await released.promise;
    return (generateKey as (...input: unknown[]) => Promise<CryptoKey>)(...args);
  });
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("token vault key creation across renderer realms", () => {
  it("keeps one shared key when two realms first write different connections at once", async () => {
    holdKeyGeneration(2);
    const main = await realm();
    const sideChat = await realm();

    expect(
      await Promise.all([
        main.vault.setDesktopToken("connection-a", "secret-a"),
        sideChat.vault.setDesktopToken("connection-b", "secret-b"),
      ]),
    ).toEqual([true, true]);

    const reloaded = await realm();
    expect(await reloaded.vault.getDesktopToken("connection-a")).toBe("secret-a");
    expect(await reloaded.vault.getDesktopToken("connection-b")).toBe("secret-b");
  });

  it("keeps a refresh grant written beside another realm's first bearer readable", async () => {
    holdKeyGeneration(2);
    const main = await realm();
    const sideChat = await realm();
    const subject = main.refresh.connectionRefreshSubject("connection-a");

    // Both realms create the key on first use; the refresh write in the first
    // realm encrypts with whichever key its own realm resolved.
    const [mainBearer, sideBearer] = await Promise.all([
      main.vault.setDesktopToken("connection-a", "secret-a"),
      sideChat.vault.setDesktopToken("connection-b", "secret-b"),
    ]);
    expect([mainBearer, sideBearer]).toEqual([true, true]);
    expect(await main.refresh.writeRefreshTokenToVault(subject, "refresh-a")).toBe(true);

    const reloaded = await realm();
    await reloaded.refresh.hydrateRefreshTokens({ subjects: [subject] });
    expect(reloaded.refresh.refreshTokenForSubject(subject)).toBe("refresh-a");
    expect(await reloaded.vault.getDesktopToken("connection-a")).toBe("secret-a");
    expect(await reloaded.vault.getDesktopToken("connection-b")).toBe("secret-b");
  });
});
