import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { copyFile, lstat, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import Database from "better-sqlite3";
import type { BrowserImportResult, BrowserImportSourceInfo } from "@/shared/ipc";
import type { BrowserCredentialInput, BrowserCredentialStore } from "./BrowserCredentialStore";

import {
  CHROMIUM_IMPORT_BROWSERS,
  chromiumProfileRoots,
  type ChromiumImportBrowser,
} from "./chromiumImportSources";
import {
  decryptChromiumCbc,
  decryptChromiumLinuxCbc,
  decryptChromiumGcm,
  deriveChromiumCbcKey,
  readChromiumKeychainPassword,
  readChromiumKeyringPassword,
  type ChromiumSecretReader,
  type ChromiumKeyringReader,
} from "./chromiumImportCrypto";

const TEMP_PREFIX = "poracode-browser-import-";
const DPAPI_PREFIX = Buffer.from("DPAPI");
const WINDOWS_EPOCH_OFFSET_MICROSECONDS = 11_644_473_600_000_000;
const DPAPI_TIMEOUT_MS = 15_000;
const MAX_DPAPI_OUTPUT_BYTES = 1024 * 1024;

type ChromiumBrowserId = BrowserImportSourceInfo["browser"];

export interface BrowserImportRequest {
  sourceId: string;
  passwords: boolean;
  cookies: boolean;
}

export const BROWSER_IMPORT_ERROR_CODES = {
  sourceNotFound: "source-not-found",
  sourceUnavailable: "source-unavailable",
  passwordsUnavailable: "passwords-unavailable",
  cookiesUnavailable: "cookies-unavailable",
  passwordDatabaseFailed: "password-database-failed",
  cookieDatabaseFailed: "cookie-database-failed",
  cookieIntegrityFailed: "cookie-integrity-check-failed",
  partitionedCookieSkipped: "partitioned-cookie-skipped",
  legacyKeyFailed: "legacy-key-decryption-failed",
  legacyValueFailed: "legacy-value-decryption-failed",
  appBoundSkipped: "app-bound-data-skipped",
  passwordWriteFailed: "password-write-failed",
  cookieWriteFailed: "cookie-write-failed",
} as const;

export interface BrowserImportCookieDetails {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
  expirationDate?: number;
}

export interface BrowserImportCookieSession {
  cookies: {
    set(details: BrowserImportCookieDetails): Promise<void>;
    flushStore(): Promise<void>;
  };
}

export interface BrowserImportDatabase {
  prepare(sql: string): { all(): unknown[] };
  close(): void;
}

export type BrowserImportDatabaseFactory = (
  path: string,
  options: { readonly: true; fileMustExist: true },
) => BrowserImportDatabase;

export type DpapiDecryptor = (encrypted: Buffer) => Promise<Buffer>;

export interface ChromiumImportServiceOptions {
  localAppData?: string;
  homeDirectory?: string;
  configDirectory?: string;
  keychainPassword?: ChromiumSecretReader;
  keyringPassword?: ChromiumKeyringReader;
  tempRoot?: string;
  platform?: NodeJS.Platform;
  dpapiDecrypt?: DpapiDecryptor;
  databaseFactory?: BrowserImportDatabaseFactory;
}

interface DiscoveredSource {
  info: BrowserImportSourceInfo;
  browser: ChromiumImportBrowser;
  userDataPath: string;
  profilePath: string;
  localStatePath: string;
  loginDataPath: string;
  cookiesPath: string;
}

interface ChromiumLocalState {
  profile?: { info_cache?: Record<string, { name?: string }> };
  os_crypt?: { encrypted_key?: string; app_bound_encrypted_key?: string };
}

interface ChromiumLoginRow {
  origin_url?: unknown;
  action_url?: unknown;
  signon_realm?: unknown;
  username_value?: unknown;
  password_value?: unknown;
  blacklisted_by_user?: unknown;
}

interface ChromiumCookieRow {
  host_key?: unknown;
  name?: unknown;
  value?: unknown;
  encrypted_value?: unknown;
  path?: unknown;
  expires_utc?: unknown;
  is_secure?: unknown;
  is_httponly?: unknown;
  samesite?: unknown;
  top_frame_site_key?: unknown;
}

interface ImportContext {
  result: BrowserImportResult;
  legacyKey: Promise<Buffer | null> | null;
}

/**
 * Imports native Chromium browser data without accepting filesystem
 * paths from IPC callers. App-Bound (v20) values are counted and skipped.
 */
export class ChromiumImportService {
  private readonly sources = new Map<string, DiscoveredSource>();
  private readonly localAppData: string | undefined;
  private readonly homeDirectory: string;
  private readonly configDirectory: string;
  private readonly keychainPassword: ChromiumSecretReader;
  private readonly keyringPassword: ChromiumKeyringReader;
  private readonly tempRoot: string;
  private readonly platform: NodeJS.Platform;
  private readonly dpapiDecrypt: DpapiDecryptor;
  private readonly databaseFactory: BrowserImportDatabaseFactory;

  constructor(
    private readonly session: BrowserImportCookieSession,
    private readonly credentialStore: Pick<BrowserCredentialStore, "upsertMany">,
    options: ChromiumImportServiceOptions = {},
  ) {
    this.localAppData = options.localAppData ?? process.env.LOCALAPPDATA;
    this.homeDirectory = options.homeDirectory ?? homedir();
    this.configDirectory =
      options.configDirectory ?? process.env.XDG_CONFIG_HOME ?? join(this.homeDirectory, ".config");
    this.keychainPassword = options.keychainPassword ?? readChromiumKeychainPassword;
    this.keyringPassword = options.keyringPassword ?? readChromiumKeyringPassword;
    this.tempRoot = resolve(options.tempRoot ?? tmpdir());
    this.platform = options.platform ?? process.platform;
    this.dpapiDecrypt = options.dpapiDecrypt ?? decryptDpapiWithPowerShell;
    this.databaseFactory = options.databaseFactory ?? defaultDatabaseFactory;
  }

  async listSources(): Promise<BrowserImportSourceInfo[]> {
    await this.discover();
    return [...this.sources.values()]
      .map((source) => ({ ...source.info }))
      .sort(
        (a, b) =>
          a.browserLabel.localeCompare(b.browserLabel) ||
          a.profileLabel.localeCompare(b.profileLabel),
      );
  }

  async importData(request: BrowserImportRequest): Promise<BrowserImportResult> {
    const context: ImportContext = {
      result: emptyResult(),
      legacyKey: null,
    };
    if (this.sources.size === 0) await this.discover();
    const source = this.sources.get(request.sourceId);
    if (!source) {
      addError(context, BROWSER_IMPORT_ERROR_CODES.sourceNotFound);
      return context.result;
    }
    if (!(await this.isSourceStillValid(source))) {
      this.sources.delete(request.sourceId);
      addError(context, BROWSER_IMPORT_ERROR_CODES.sourceUnavailable);
      return context.result;
    }

    const tempDirectory = await mkdtemp(join(this.tempRoot, TEMP_PREFIX));
    try {
      const localState = await readLocalState(source.localStatePath);
      const getLegacyKey = (): Promise<Buffer | null> => {
        context.legacyKey ??= this.readLegacyKey(source, localState, context);
        return context.legacyKey;
      };

      if (request.passwords) {
        if (!source.info.supportsPasswords) {
          addError(context, BROWSER_IMPORT_ERROR_CODES.passwordsUnavailable);
        } else {
          await this.importPasswords(source, tempDirectory, getLegacyKey, context);
        }
      }
      if (request.cookies) {
        if (!source.info.supportsCookies) {
          addError(context, BROWSER_IMPORT_ERROR_CODES.cookiesUnavailable);
        } else {
          await this.importCookies(source, tempDirectory, getLegacyKey, context);
        }
      }
      if (context.result.cookiesImported > 0) {
        try {
          await this.session.cookies.flushStore();
        } catch {
          context.result.cookiesSkipped += context.result.cookiesImported;
          context.result.cookiesImported = 0;
          addError(context, BROWSER_IMPORT_ERROR_CODES.cookieWriteFailed);
        }
      }
      return context.result;
    } finally {
      await removeImportTempDirectory(this.tempRoot, tempDirectory);
    }
  }

  private async discover(): Promise<void> {
    this.sources.clear();
    for (const browser of CHROMIUM_IMPORT_BROWSERS) {
      for (const root of chromiumProfileRoots(
        browser,
        this.platform,
        this.homeDirectory,
        this.localAppData,
        this.configDirectory,
      )) {
        const userDataPath = resolve(root);
        const localStatePath = join(userDataPath, "Local State");
        const localState = await readLocalState(localStatePath);
        let entries: Dirent[];
        try {
          entries = await readdir(userDataPath, { withFileTypes: true, encoding: "utf8" });
        } catch {
          continue;
        }
        let realUserDataPath: string;
        try {
          realUserDataPath = await realpath(userDataPath);
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!entry.isDirectory() || !isChromiumProfileDirectory(entry.name)) continue;
          const profilePath = join(userDataPath, entry.name);
          if (!(await isSafeDiscoveredDirectory(realUserDataPath, profilePath))) continue;
          const loginDataPath = join(profilePath, "Login Data");
          const networkCookiesPath = join(profilePath, "Network", "Cookies");
          const legacyCookiesPath = join(profilePath, "Cookies");
          const supportsPasswords = await isSafeDiscoveredFile(profilePath, loginDataPath);
          const cookiesPath = (await isSafeDiscoveredFile(profilePath, networkCookiesPath))
            ? networkCookiesPath
            : legacyCookiesPath;
          const supportsCookies = await isSafeDiscoveredFile(profilePath, cookiesPath);
          if (!supportsPasswords && !supportsCookies) continue;
          const id = sourceId(browser.id, await realpath(profilePath));
          if (this.sources.has(id)) continue;
          const info: BrowserImportSourceInfo = {
            id,
            browser: browser.id,
            browserLabel: browser.label,
            profileLabel: localState.profile?.info_cache?.[entry.name]?.name || entry.name,
            supportsPasswords,
            supportsCookies,
            hasAppBoundData: !!localState.os_crypt?.app_bound_encrypted_key,
          };
          this.sources.set(id, {
            info,
            browser,
            userDataPath,
            profilePath,
            localStatePath,
            loginDataPath,
            cookiesPath,
          });
        }
      }
    }
  }

  private async isSourceStillValid(source: DiscoveredSource): Promise<boolean> {
    try {
      const realUserDataPath = await realpath(source.userDataPath);
      return (
        (await isSafeDiscoveredDirectory(realUserDataPath, source.profilePath)) &&
        (!source.info.supportsPasswords ||
          (await isSafeDiscoveredFile(source.profilePath, source.loginDataPath))) &&
        (!source.info.supportsCookies ||
          (await isSafeDiscoveredFile(source.profilePath, source.cookiesPath)))
      );
    } catch {
      return false;
    }
  }

  private async readLegacyKey(
    source: DiscoveredSource,
    localState: ChromiumLocalState,
    context: ImportContext,
  ): Promise<Buffer | null> {
    if (this.platform === "darwin" || this.platform === "linux") {
      try {
        const password =
          this.platform === "darwin"
            ? await this.keychainPassword(source.browser.keychainService)
            : await this.keyringPassword({
                application: source.browser.keyringApplication,
                walletFolder: source.browser.walletFolder,
                walletKey: source.browser.walletKey,
              });
        if (!password) throw new Error("Empty safe-storage password");
        return deriveChromiumCbcKey(password, this.platform);
      } catch {
        addError(context, BROWSER_IMPORT_ERROR_CODES.legacyKeyFailed);
        return null;
      }
    }
    const encoded = localState.os_crypt?.encrypted_key;
    if (!encoded) {
      addError(context, BROWSER_IMPORT_ERROR_CODES.legacyKeyFailed);
      return null;
    }
    try {
      const wrapped = Buffer.from(encoded, "base64");
      if (!wrapped.subarray(0, DPAPI_PREFIX.length).equals(DPAPI_PREFIX)) {
        throw new Error("Unexpected Chromium encrypted-key format");
      }
      return await this.dpapiDecrypt(wrapped.subarray(DPAPI_PREFIX.length));
    } catch {
      addError(context, BROWSER_IMPORT_ERROR_CODES.legacyKeyFailed);
      return null;
    }
  }

  private async importPasswords(
    source: DiscoveredSource,
    tempDirectory: string,
    getLegacyKey: () => Promise<Buffer | null>,
    context: ImportContext,
  ): Promise<void> {
    const snapshotPath = join(tempDirectory, "Login Data");
    try {
      await snapshotDatabase(source.loginDataPath, snapshotPath);
      await withReadOnlyDatabase(this.databaseFactory, snapshotPath, async (database) => {
        const rows = database
          .prepare(
            "SELECT origin_url, action_url, signon_realm, username_value, password_value, blacklisted_by_user FROM logins",
          )
          .all() as ChromiumLoginRow[];
        const credentials: BrowserCredentialInput[] = [];
        for (const row of rows) {
          if (toBoolean(row.blacklisted_by_user)) continue;
          const encrypted = toBuffer(row.password_value);
          const decrypted = await this.decryptValue(encrypted, getLegacyKey, context);
          if (decrypted.kind === "protected") {
            context.result.passwordsSkipped += 1;
            context.result.protectedItemsSkipped += 1;
            continue;
          }
          if (decrypted.kind === "failed" || decrypted.value.length === 0) {
            context.result.passwordsSkipped += 1;
            continue;
          }
          const origin = firstString(row.origin_url, row.action_url, row.signon_realm);
          if (!origin) {
            context.result.passwordsSkipped += 1;
            continue;
          }
          credentials.push({
            origin,
            username: stringValue(row.username_value),
            password: decrypted.value.toString("utf8"),
            source: `${source.info.browserLabel} — ${source.info.profileLabel}`,
          });
        }
        if (credentials.length === 0) return;
        try {
          const batch = await this.credentialStore.upsertMany(credentials);
          context.result.passwordsImported += batch.saved.length;
          context.result.passwordsSkipped += batch.failed;
          if (batch.failed > 0) {
            addError(context, BROWSER_IMPORT_ERROR_CODES.passwordWriteFailed);
          }
        } catch {
          context.result.passwordsSkipped += credentials.length;
          addError(context, BROWSER_IMPORT_ERROR_CODES.passwordWriteFailed);
        }
      });
    } catch {
      addError(context, BROWSER_IMPORT_ERROR_CODES.passwordDatabaseFailed);
    }
  }

  private async importCookies(
    source: DiscoveredSource,
    tempDirectory: string,
    getLegacyKey: () => Promise<Buffer | null>,
    context: ImportContext,
  ): Promise<void> {
    const snapshotPath = join(tempDirectory, "Cookies");
    try {
      await snapshotDatabase(source.cookiesPath, snapshotPath);
      await withReadOnlyDatabase(this.databaseFactory, snapshotPath, async (database) => {
        const databaseVersion = readCookieDatabaseVersion(database);
        const partitionKeyColumn = databaseVersion >= 15 ? ", top_frame_site_key" : "";
        const rows = database
          .prepare(
            `SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite${partitionKeyColumn} FROM cookies`,
          )
          .all() as ChromiumCookieRow[];
        for (const row of rows) {
          if (stringValue(row.top_frame_site_key)) {
            context.result.cookiesSkipped += 1;
            addError(context, BROWSER_IMPORT_ERROR_CODES.partitionedCookieSkipped);
            continue;
          }
          const hostKey = stringValue(row.host_key);
          const host = hostKey.replace(/^\./u, "");
          if (!host || !isValidCookieHost(host)) {
            context.result.cookiesSkipped += 1;
            continue;
          }
          const plaintext = stringValue(row.value);
          let value = plaintext;
          if (!plaintext) {
            const decrypted = await this.decryptValue(
              toBuffer(row.encrypted_value),
              getLegacyKey,
              context,
            );
            if (decrypted.kind === "protected") {
              context.result.cookiesSkipped += 1;
              context.result.protectedItemsSkipped += 1;
              continue;
            }
            if (decrypted.kind === "failed") {
              context.result.cookiesSkipped += 1;
              continue;
            }
            const cookieValue = decodeCookieValue(decrypted.value, hostKey, databaseVersion);
            if (!cookieValue) {
              context.result.cookiesSkipped += 1;
              addError(context, BROWSER_IMPORT_ERROR_CODES.cookieIntegrityFailed);
              continue;
            }
            value = cookieValue.toString("utf8");
          }
          const secure = toBoolean(row.is_secure);
          const path = normalizeCookiePath(stringValue(row.path));
          const expirationDate = chromiumTimeToUnixSeconds(row.expires_utc);
          if (expirationDate !== undefined && expirationDate <= Date.now() / 1000) {
            context.result.cookiesSkipped += 1;
            continue;
          }
          const details: BrowserImportCookieDetails = {
            url: `${secure ? "https" : "http"}://${host}${path}`,
            name: stringValue(row.name),
            value,
            ...(hostKey.startsWith(".") ? { domain: hostKey } : {}),
            path,
            secure,
            httpOnly: toBoolean(row.is_httponly),
            sameSite: chromiumSameSite(row.samesite),
            ...(expirationDate !== undefined ? { expirationDate } : {}),
          };
          try {
            await this.session.cookies.set(details);
            context.result.cookiesImported += 1;
          } catch {
            context.result.cookiesSkipped += 1;
            addError(context, BROWSER_IMPORT_ERROR_CODES.cookieWriteFailed);
          }
        }
      });
    } catch {
      addError(context, BROWSER_IMPORT_ERROR_CODES.cookieDatabaseFailed);
    }
  }

  private async decryptValue(
    encrypted: Buffer,
    getLegacyKey: () => Promise<Buffer | null>,
    context: ImportContext,
  ): Promise<{ kind: "ok"; value: Buffer } | { kind: "protected" } | { kind: "failed" }> {
    if (encrypted.subarray(0, 3).toString("ascii") === "v20") {
      addError(context, BROWSER_IMPORT_ERROR_CODES.appBoundSkipped);
      return { kind: "protected" };
    }
    const version = encrypted.subarray(0, 3).toString("ascii");
    try {
      if (version === "v10" || version === "v11") {
        const key =
          this.platform === "linux" && version === "v10"
            ? deriveChromiumCbcKey("peanuts", "linux")
            : await getLegacyKey();
        if (this.platform === "linux")
          return { kind: "ok", value: decryptChromiumLinuxCbc(encrypted.subarray(3), key) };
        if (!key) return { kind: "failed" };
        return {
          kind: "ok",
          value:
            this.platform === "win32"
              ? decryptChromiumGcm(encrypted.subarray(3), key)
              : decryptChromiumCbc(encrypted.subarray(3), key),
        };
      }
      if (encrypted.length === 0) return { kind: "ok", value: Buffer.alloc(0) };
      if (/^v\d{2}$/u.test(version)) throw new Error("Unsupported Chromium encryption version");
      return {
        kind: "ok",
        value: this.platform === "win32" ? await this.dpapiDecrypt(encrypted) : encrypted,
      };
    } catch {
      addError(context, BROWSER_IMPORT_ERROR_CODES.legacyValueFailed);
      return { kind: "failed" };
    }
  }
}

/** Current-user DPAPI only. It deliberately does not elevate or unwrap v20 data. */
export function decryptDpapiWithPowerShell(encrypted: Buffer): Promise<Buffer> {
  if (process.platform !== "win32") {
    return Promise.reject(new Error(BROWSER_IMPORT_ERROR_CODES.legacyValueFailed));
  }
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Security",
    "$encoded = [Console]::In.ReadToEnd().Trim()",
    "$encrypted = [Convert]::FromBase64String($encoded)",
    "$plain = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Console]::Out.Write([Convert]::ToBase64String($plain))",
  ].join("; ");
  return new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (error?: Error, value?: Buffer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise(value ?? Buffer.alloc(0));
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(BROWSER_IMPORT_ERROR_CODES.legacyValueFailed));
    }, DPAPI_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_DPAPI_OUTPUT_BYTES) {
        child.kill();
        finish(new Error(BROWSER_IMPORT_ERROR_CODES.legacyValueFailed));
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", () => finish(new Error(BROWSER_IMPORT_ERROR_CODES.legacyValueFailed)));
    child.once("close", (code) => {
      if (code !== 0) {
        finish(new Error(BROWSER_IMPORT_ERROR_CODES.legacyValueFailed));
        return;
      }
      const encoded = Buffer.concat(chunks).toString("ascii").trim();
      if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) {
        finish(new Error(BROWSER_IMPORT_ERROR_CODES.legacyValueFailed));
        return;
      }
      finish(undefined, Buffer.from(encoded, "base64"));
    });
    child.stdin.once("error", () =>
      finish(new Error(BROWSER_IMPORT_ERROR_CODES.legacyValueFailed)),
    );
    child.stdin.end(encrypted.toString("base64"));
  });
}

const defaultDatabaseFactory: BrowserImportDatabaseFactory = (path, options) =>
  new Database(path, options) as unknown as BrowserImportDatabase;

async function withReadOnlyDatabase(
  factory: BrowserImportDatabaseFactory,
  path: string,
  operation: (database: BrowserImportDatabase) => Promise<void>,
): Promise<void> {
  const database = factory(path, { readonly: true, fileMustExist: true });
  try {
    await operation(database);
  } finally {
    database.close();
  }
}

async function snapshotDatabase(source: string, target: string): Promise<void> {
  await copyFile(source, target);
  await copyIfPresent(`${source}-wal`, `${target}-wal`);
  await copyIfPresent(`${source}-shm`, `${target}-shm`);
}

async function copyIfPresent(source: string, target: string): Promise<void> {
  try {
    await copyFile(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function removeImportTempDirectory(tempRoot: string, directory: string): Promise<void> {
  const resolvedRoot = resolve(tempRoot);
  const resolvedDirectory = resolve(directory);
  if (
    dirname(resolvedDirectory) !== resolvedRoot ||
    !basename(resolvedDirectory).startsWith(TEMP_PREFIX)
  ) {
    throw new Error("Refusing to remove an unexpected browser-import directory");
  }
  await rm(resolvedDirectory, { recursive: true, force: true });
}

async function readLocalState(path: string): Promise<ChromiumLocalState> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ChromiumLocalState;
  } catch {
    return {};
  }
}

async function isSafeDiscoveredFile(profilePath: string, filePath: string): Promise<boolean> {
  try {
    const stats = await lstat(filePath);
    return (
      stats.isFile() &&
      !stats.isSymbolicLink() &&
      isPathInside(await realpath(profilePath), await realpath(filePath))
    );
  } catch {
    return false;
  }
}

async function isSafeDiscoveredDirectory(
  realUserDataPath: string,
  profilePath: string,
): Promise<boolean> {
  try {
    const stats = await lstat(profilePath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
    const realProfilePath = await realpath(profilePath);
    return isPathInside(realUserDataPath, realProfilePath);
  } catch {
    return false;
  }
}

function isPathInside(parent: string, child: string): boolean {
  const childRelative = relative(resolve(parent), resolve(child));
  return childRelative !== "" && childRelative !== ".." && !childRelative.startsWith(`..${sep}`);
}

function isChromiumProfileDirectory(name: string): boolean {
  return name === "Default" || /^Profile \d+$/u.test(name);
}

function sourceId(browser: ChromiumBrowserId, profilePath: string): string {
  const digest = createHash("sha256").update(resolve(profilePath)).digest("hex");
  return `chromium-${browser}-${digest.slice(0, 20)}`;
}

function readCookieDatabaseVersion(database: BrowserImportDatabase): number {
  try {
    const [row] = database
      .prepare("SELECT value FROM meta WHERE key = 'version' LIMIT 1")
      .all() as Array<{
      value?: unknown;
    }>;
    const version = Number(row?.value);
    return Number.isInteger(version) && version >= 0 ? version : 0;
  } catch {
    return 0;
  }
}

function decodeCookieValue(value: Buffer, hostKey: string, databaseVersion: number): Buffer | null {
  const hostDigest = createHash("sha256").update(hostKey).digest();
  const hasHostDigest =
    value.length >= hostDigest.length && value.subarray(0, hostDigest.length).equals(hostDigest);
  if (hasHostDigest) return value.subarray(hostDigest.length);
  return databaseVersion >= 24 ? null : value;
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.alloc(0);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1;
}

function normalizeCookiePath(value: string): string {
  return value.startsWith("/") ? value : "/";
}

function isValidCookieHost(value: string): boolean {
  if (value.includes("/") || value.includes("\\") || value.includes("://")) return false;
  try {
    return new URL(`https://${value}/`).hostname === value;
  } catch {
    return false;
  }
}

function chromiumSameSite(value: unknown): BrowserImportCookieDetails["sameSite"] {
  if (value === 0) return "no_restriction";
  if (value === 1) return "lax";
  if (value === 2) return "strict";
  return "unspecified";
}

function chromiumTimeToUnixSeconds(value: unknown): number | undefined {
  const microseconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(microseconds) || microseconds <= 0) {
    return undefined;
  }
  return (microseconds - WINDOWS_EPOCH_OFFSET_MICROSECONDS) / 1_000_000;
}

function emptyResult(): BrowserImportResult {
  return {
    passwordsImported: 0,
    cookiesImported: 0,
    passwordsSkipped: 0,
    cookiesSkipped: 0,
    protectedItemsSkipped: 0,
    errors: [],
  };
}

function addError(context: ImportContext, code: string): void {
  if (!context.result.errors.includes(code)) context.result.errors.push(code);
}
