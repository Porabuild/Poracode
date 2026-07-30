import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserCredentialInput } from "./BrowserCredentialStore";
import {
  BROWSER_IMPORT_ERROR_CODES,
  WindowsChromiumImportService,
  type BrowserImportCookieDetails,
  type BrowserImportDatabase,
  type BrowserImportDatabaseFactory,
} from "./WindowsChromiumImportService";

const browserRoots = {
  chrome: join("Google", "Chrome", "User Data"),
  edge: join("Microsoft", "Edge", "User Data"),
  brave: join("BraveSoftware", "Brave-Browser", "User Data"),
  chromium: join("Chromium", "User Data"),
} as const;

interface FixtureProfileOptions {
  browser: keyof typeof browserRoots;
  profile?: string;
  profileLabel?: string;
  passwords?: boolean;
  cookies?: boolean;
  encryptedKey?: Buffer;
  appBound?: boolean;
  wal?: boolean;
}

let fixtureRoot: string;

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "poracode-chromium-import-test-"));
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("WindowsChromiumImportService", () => {
  it("discovers Chrome, Edge, Brave, and Chromium profiles without exposing paths", async () => {
    await Promise.all(
      (Object.keys(browserRoots) as Array<keyof typeof browserRoots>).map((browser, index) =>
        createProfile({
          browser,
          profile: index === 0 ? "Default" : `Profile ${index}`,
          profileLabel: `${browser} profile`,
          passwords: true,
          cookies: true,
          appBound: browser === "chrome",
        }),
      ),
    );
    const { service } = createService({ databaseFactory: emptyDatabaseFactory() });

    const sources = await service.listSources();

    expect(sources.map((source) => source.browser).sort()).toEqual([
      "brave",
      "chrome",
      "chromium",
      "edge",
    ]);
    expect(sources.find((source) => source.browser === "chrome")).toMatchObject({
      profileLabel: "chrome profile",
      supportsPasswords: true,
      supportsCookies: true,
      hasAppBoundData: true,
    });
    for (const source of sources) {
      expect(source.id).toMatch(/^chromium-(brave|chrome|chromium|edge)-[a-f0-9]{20}$/u);
      expect(source.id).not.toContain("Default");
      expect(source).not.toHaveProperty("profilePath");
    }
  });

  it("imports v10/v11 passwords and cookies from read-only WAL snapshots", async () => {
    const key = randomBytes(32);
    const wrappedKey = Buffer.from("wrapped-chromium-key");
    await createProfile({
      browser: "chrome",
      passwords: true,
      cookies: true,
      encryptedKey: Buffer.concat([Buffer.from("DPAPI"), wrappedKey]),
      wal: true,
    });
    const loginRows = [
      {
        origin_url: "https://example.test/login",
        action_url: "https://example.test/session",
        signon_realm: "https://example.test/",
        username_value: "alice",
        password_value: encryptChromiumValue("v10", key, Buffer.from("correct horse")),
        blacklisted_by_user: 0,
      },
    ];
    const cookieRows = [
      {
        host_key: ".example.test",
        name: "session",
        value: "",
        encrypted_value: encryptChromiumValue(
          "v11",
          key,
          Buffer.concat([
            createHash("sha256").update(".example.test").digest(),
            Buffer.from("cookie-value"),
          ]),
        ),
        path: "/account",
        expires_utc: 11_644_473_600_000_000 + 3_600_000_000,
        is_secure: 1,
        is_httponly: 1,
        samesite: 1,
      },
    ];
    const snapshotChecks: boolean[] = [];
    const databaseFactory = vi.fn<BrowserImportDatabaseFactory>((path, options) => {
      expect(options).toEqual({ readonly: true, fileMustExist: true });
      snapshotChecks.push(fileExistsSyncForTest(`${path}-wal`));
      return databaseFor(
        basename(path) === "Login Data" ? loginRows : cookieRows,
        basename(path) === "Cookies" ? 24 : undefined,
      );
    });
    const dpapiDecrypt = vi.fn<(encrypted: Buffer) => Promise<Buffer>>(async (encrypted) => {
      expect(encrypted).toEqual(wrappedKey);
      return key;
    });
    const { service, cookieSet, credentialUpsertMany } = createService({
      databaseFactory,
      dpapiDecrypt,
    });
    const [source] = await service.listSources();

    const result = await service.importData({
      sourceId: source!.id,
      passwords: true,
      cookies: true,
    });

    expect(result).toEqual({
      passwordsImported: 1,
      cookiesImported: 1,
      passwordsSkipped: 0,
      cookiesSkipped: 0,
      protectedItemsSkipped: 0,
      errors: [],
    });
    expect(dpapiDecrypt).toHaveBeenCalledOnce();
    expect(credentialUpsertMany).toHaveBeenCalledWith([
      {
        origin: "https://example.test/login",
        username: "alice",
        password: "correct horse",
        source: "Google Chrome — Default",
      },
    ]);
    expect(cookieSet).toHaveBeenCalledWith({
      url: "https://example.test/account",
      name: "session",
      value: "cookie-value",
      domain: ".example.test",
      path: "/account",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      expirationDate: 3600,
    });
    expect(snapshotChecks).toEqual([true, true]);
    const snapshotParents = new Set(databaseFactory.mock.calls.map(([path]) => dirname(path)));
    expect(snapshotParents.size).toBe(1);
    for (const directory of snapshotParents) await expectPathMissing(directory);
  });

  it("preserves host-only Chromium cookies without broadening them to subdomains", async () => {
    await createProfile({ browser: "chromium", cookies: true });
    const databaseFactory: BrowserImportDatabaseFactory = () =>
      databaseFor([
        {
          host_key: "example.test",
          name: "host-only",
          value: "cookie-value",
          encrypted_value: Buffer.alloc(0),
          path: "/",
          expires_utc: 0,
          is_secure: 1,
          is_httponly: 0,
          samesite: 1,
        },
      ]);
    const { service, cookieSet } = createService({ databaseFactory });
    const [source] = await service.listSources();

    const result = await service.importData({
      sourceId: source!.id,
      passwords: false,
      cookies: true,
    });

    expect(result.cookiesImported).toBe(1);
    expect(cookieSet).toHaveBeenCalledWith({
      url: "https://example.test/",
      name: "host-only",
      value: "cookie-value",
      path: "/",
      secure: true,
      httpOnly: false,
      sameSite: "lax",
    });
  });

  it("skips partitioned Chromium cookies that Electron cannot preserve", async () => {
    await createProfile({ browser: "chrome", cookies: true });
    const databaseFactory: BrowserImportDatabaseFactory = (_path, _options) =>
      databaseFor(
        [
          {
            host_key: ".example.test",
            name: "partitioned",
            value: "cookie-value",
            encrypted_value: Buffer.alloc(0),
            path: "/",
            expires_utc: 0,
            is_secure: 1,
            is_httponly: 0,
            samesite: 0,
            top_frame_site_key: "https://top-level.test",
          },
        ],
        24,
      );
    const { service, cookieSet } = createService({ databaseFactory });
    const [source] = await service.listSources();

    const result = await service.importData({
      sourceId: source!.id,
      passwords: false,
      cookies: true,
    });

    expect(result.cookiesImported).toBe(0);
    expect(result.cookiesSkipped).toBe(1);
    expect(result.errors).toEqual([BROWSER_IMPORT_ERROR_CODES.partitionedCookieSkipped]);
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("counts v20 App-Bound values as protected without invoking DPAPI", async () => {
    await createProfile({
      browser: "edge",
      passwords: true,
      cookies: true,
      appBound: true,
    });
    const databaseFactory: BrowserImportDatabaseFactory = (path) =>
      databaseFor(
        basename(path) === "Login Data"
          ? [
              {
                origin_url: "https://protected.test/",
                username_value: "user",
                password_value: Buffer.concat([Buffer.from("v20"), Buffer.alloc(32, 1)]),
                blacklisted_by_user: 0,
              },
            ]
          : [
              {
                host_key: ".protected.test",
                name: "session",
                value: "",
                encrypted_value: Buffer.concat([Buffer.from("v20"), Buffer.alloc(32, 2)]),
                path: "/",
                expires_utc: 0,
                is_secure: 1,
                is_httponly: 1,
                samesite: -1,
              },
            ],
      );
    const dpapiDecrypt = vi.fn<(encrypted: Buffer) => Promise<Buffer>>();
    const { service, cookieSet, credentialUpsertMany } = createService({
      databaseFactory,
      dpapiDecrypt,
    });
    const [source] = await service.listSources();

    const result = await service.importData({
      sourceId: source!.id,
      passwords: true,
      cookies: true,
    });

    expect(result).toEqual({
      passwordsImported: 0,
      cookiesImported: 0,
      passwordsSkipped: 1,
      cookiesSkipped: 1,
      protectedItemsSkipped: 2,
      errors: [BROWSER_IMPORT_ERROR_CODES.appBoundSkipped],
    });
    expect(dpapiDecrypt).not.toHaveBeenCalled();
    expect(credentialUpsertMany).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("rejects path-like source IDs instead of resolving caller-controlled paths", async () => {
    await createProfile({ browser: "brave", passwords: true, cookies: true });
    const databaseFactory = vi.fn<BrowserImportDatabaseFactory>();
    const { service, cookieSet, credentialUpsertMany } = createService({ databaseFactory });

    const result = await service.importData({
      sourceId: "../../Google/Chrome/User Data/Default",
      passwords: true,
      cookies: true,
    });

    expect(result.errors).toEqual([BROWSER_IMPORT_ERROR_CODES.sourceNotFound]);
    expect(databaseFactory).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
    expect(credentialUpsertMany).not.toHaveBeenCalled();
  });
});

async function createProfile(options: FixtureProfileOptions): Promise<void> {
  const profile = options.profile ?? "Default";
  const userDataPath = join(fixtureRoot, browserRoots[options.browser]);
  const profilePath = join(userDataPath, profile);
  await mkdir(join(profilePath, "Network"), { recursive: true });
  const localState = {
    profile: { info_cache: { [profile]: { name: options.profileLabel ?? profile } } },
    os_crypt: {
      ...(options.encryptedKey ? { encrypted_key: options.encryptedKey.toString("base64") } : {}),
      ...(options.appBound
        ? { app_bound_encrypted_key: Buffer.from("APPBprotected").toString("base64") }
        : {}),
    },
  };
  await writeFile(join(userDataPath, "Local State"), JSON.stringify(localState));
  if (options.passwords) {
    const path = join(profilePath, "Login Data");
    await writeFile(path, "fixture");
    if (options.wal) await writeFile(`${path}-wal`, "wal");
  }
  if (options.cookies) {
    const path = join(profilePath, "Network", "Cookies");
    await writeFile(path, "fixture");
    if (options.wal) await writeFile(`${path}-wal`, "wal");
  }
}

function createService(options: {
  databaseFactory: BrowserImportDatabaseFactory;
  dpapiDecrypt?: (encrypted: Buffer) => Promise<Buffer>;
}) {
  const cookieSet = vi.fn<(details: BrowserImportCookieDetails) => Promise<void>>(async () => {});
  const credentialUpsertMany = vi.fn<(inputs: readonly BrowserCredentialInput[]) => unknown>(
    (inputs) => ({ saved: inputs.map(() => ({ id: "credential-id" })), failed: 0 }),
  );
  const service = new WindowsChromiumImportService(
    { cookies: { set: cookieSet } },
    { upsertMany: credentialUpsertMany } as never,
    {
      localAppData: fixtureRoot,
      tempRoot: fixtureRoot,
      platform: "win32",
      databaseFactory: options.databaseFactory,
      ...(options.dpapiDecrypt ? { dpapiDecrypt: options.dpapiDecrypt } : {}),
    },
  );
  return { service, cookieSet, credentialUpsertMany };
}

function emptyDatabaseFactory(): BrowserImportDatabaseFactory {
  return () => databaseFor([]);
}

function databaseFor(rows: unknown[], version?: number): BrowserImportDatabase {
  return {
    prepare: (sql) => ({
      all: () => (sql.includes("FROM meta") && version !== undefined ? [{ value: version }] : rows),
    }),
    close: vi.fn<() => void>(),
  };
}

function encryptChromiumValue(version: "v10" | "v11", key: Buffer, plaintext: Buffer): Buffer {
  const nonce = Buffer.alloc(12, version === "v10" ? 10 : 11);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from(version), nonce, ciphertext, cipher.getAuthTag()]);
}

function fileExistsSyncForTest(path: string): boolean {
  return existsSync(path);
}

async function expectPathMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
}
