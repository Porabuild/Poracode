import { createCipheriv, createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserCredentialStore } from "./BrowserCredentialStore";
import { ChromiumImportService, type BrowserImportCookieDetails } from "./ChromiumImportService";
import { deriveChromiumCbcKey, type ChromiumKeyringIdentity } from "./chromiumImportCrypto";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "poracode-native-import-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("native Chromium import", () => {
  it("imports macOS passwords and schema-24 cookies from SQLite into encrypted storage", async () => {
    // Independent PBKDF2-HMAC-SHA1 vector for test-passphrase/saltysalt/1003.
    const key = Buffer.from("1520ca2d2c5dceeeebcd3a50818a46c7", "hex");
    expect(deriveChromiumCbcKey("test-passphrase", "darwin")).toEqual(key);
    await fixture(join(root, "Library", "Application Support", "Google", "Chrome"), key, "v10");
    const { service, keychainPassword, credentialStore, persisted, cookieSet } = services("darwin");
    const [source] = await service.listSources();
    expect(source).toMatchObject({
      browser: "chrome",
      profileLabel: "Work",
      supportsCookies: true,
      supportsPasswords: true,
    });
    expect(keychainPassword).not.toHaveBeenCalled();
    const result = await service.importData({
      sourceId: source!.id,
      passwords: true,
      cookies: true,
    });
    expect(result).toMatchObject({ passwordsImported: 1, cookiesImported: 1, errors: [] });
    expect(keychainPassword).toHaveBeenCalledExactlyOnceWith("Chrome Safe Storage");
    const credential = credentialStore.list()[0]!;
    expect(credentialStore.get(credential.id)?.password).toBe("fixture-password");
    expect([...persisted.values()].join("\n")).not.toContain("fixture-password");
    expect(cookieSet).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "session",
        value: "fixture-cookie",
        domain: ".example.test",
        secure: true,
      }),
    );
  });

  it("discovers the four macOS browsers without reading secrets", async () => {
    for (const browser of [
      "Google/Chrome",
      "Microsoft Edge",
      "BraveSoftware/Brave-Browser",
      "Chromium",
    ]) {
      await fixture(
        join(root, "Library", "Application Support", browser),
        Buffer.alloc(16, 1),
        "v10",
      );
    }
    const { service, keychainPassword } = services("darwin");
    expect((await service.listSources()).map((source) => source.browser).sort()).toEqual([
      "brave",
      "chrome",
      "chromium",
      "edge",
    ]);
    expect(keychainPassword).not.toHaveBeenCalled();
  });

  it("reports denied Keychain access without importing or persisting credentials", async () => {
    await fixture(
      join(root, "Library", "Application Support", "Google", "Chrome"),
      Buffer.alloc(16, 1),
      "v10",
    );
    const { service, keychainPassword, persisted, cookieSet } = services("darwin");
    keychainPassword.mockRejectedValue(new Error("Access denied"));
    const [source] = await service.listSources();
    expect(
      await service.importData({ sourceId: source!.id, passwords: true, cookies: true }),
    ).toMatchObject({
      passwordsImported: 0,
      cookiesImported: 0,
      passwordsSkipped: 1,
      cookiesSkipped: 1,
      errors: ["legacy-key-decryption-failed"],
    });
    expect(persisted.size).toBe(0);
    expect(cookieSet).not.toHaveBeenCalled();
    expect(keychainPassword).toHaveBeenCalledOnce();
  });

  it("discovers Ubuntu Snap and Flatpak Chromium profiles", async () => {
    const key = deriveChromiumCbcKey("peanuts", "linux");
    await fixture(join(root, "snap", "chromium", "common", "chromium"), key, "v10");
    await fixture(
      join(root, ".var", "app", "org.chromium.Chromium", "config", "chromium"),
      key,
      "v10",
    );
    const { service } = services("linux");
    const sources = await service.listSources();
    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.browser)).toEqual(["chromium", "chromium"]);
    expect(new Set(sources.map((source) => source.id)).size).toBe(2);
  });

  it.each(["v10", "v11"] as const)(
    "imports Linux %s without treating CBC data as Windows GCM",
    async (version) => {
      const key = deriveChromiumCbcKey(version === "v10" ? "peanuts" : "test-passphrase", "linux");
      await fixture(join(root, ".config", "google-chrome"), key, version);
      const { service, cookieSet, keyringPassword } = services("linux");
      const [source] = await service.listSources();
      expect(
        await service.importData({ sourceId: source!.id, passwords: true, cookies: true }),
      ).toMatchObject({ passwordsImported: 1, cookiesImported: 1, errors: [] });
      expect(cookieSet).toHaveBeenCalledWith(expect.objectContaining({ value: "fixture-cookie" }));
      expect(keyringPassword.mock.calls).toEqual(
        version === "v10"
          ? []
          : [
              [
                {
                  application: "chrome",
                  walletFolder: "Chrome Keys",
                  walletKey: "Chrome Safe Storage",
                },
              ],
            ],
      );
    },
  );
});

function services(platform: "darwin" | "linux") {
  const persisted = new Map<string, string>();
  const credentialStore = new BrowserCredentialStore({
    get: (key) => persisted.get(key) ?? null,
    set: (key, value) => {
      persisted.set(key, value);
    },
  });
  const cookieSet = vi
    .fn<(details: BrowserImportCookieDetails) => Promise<void>>()
    .mockResolvedValue(undefined);
  const keychainPassword = vi
    .fn<(identity: string) => Promise<string>>()
    .mockResolvedValue("test-passphrase");
  const keyringPassword = vi
    .fn<(identity: ChromiumKeyringIdentity) => Promise<string>>()
    .mockResolvedValue("test-passphrase");
  const service = new ChromiumImportService(
    { cookies: { set: cookieSet, flushStore: async () => {} } },
    credentialStore,
    {
      platform,
      homeDirectory: root,
      configDirectory: join(root, ".config"),
      tempRoot: root,
      keychainPassword,
      keyringPassword,
    },
  );
  return { service, credentialStore, persisted, cookieSet, keychainPassword, keyringPassword };
}

async function fixture(browserRoot: string, key: Buffer, version: "v10" | "v11") {
  const profile = join(browserRoot, "Default");
  await mkdir(profile, { recursive: true });
  await writeFile(
    join(browserRoot, "Local State"),
    JSON.stringify({ profile: { info_cache: { Default: { name: "Work" } } } }),
  );
  const logins = new Database(join(profile, "Login Data"));
  try {
    logins.exec(
      "CREATE TABLE logins (origin_url TEXT, action_url TEXT, signon_realm TEXT, username_value TEXT, password_value BLOB, blacklisted_by_user INTEGER)",
    );
    logins
      .prepare("INSERT INTO logins VALUES (?, ?, ?, ?, ?, 0)")
      .run(
        "https://example.test/login",
        "",
        "",
        "fixture-user",
        seal(Buffer.from("fixture-password"), key, version),
      );
  } finally {
    logins.close();
  }
  const cookies = new Database(join(profile, "Cookies"));
  try {
    cookies.exec(
      "CREATE TABLE meta (key TEXT, value TEXT); INSERT INTO meta VALUES ('version', '24'); CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, expires_utc INTEGER, is_secure INTEGER, is_httponly INTEGER, samesite INTEGER, top_frame_site_key TEXT)",
    );
    const value = Buffer.concat([
      createHash("sha256").update(".example.test").digest(),
      Buffer.from("fixture-cookie"),
    ]);
    cookies
      .prepare("INSERT INTO cookies VALUES (?, 'session', '', ?, '/', ?, 1, 1, 1, '')")
      .run(
        ".example.test",
        seal(value, key, version),
        11_644_473_600_000_000 + (Date.now() + 86_400_000) * 1000,
      );
  } finally {
    cookies.close();
  }
}

function seal(value: Buffer, key: Buffer, version: string) {
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  return Buffer.concat([Buffer.from(version), cipher.update(value), cipher.final()]);
}
