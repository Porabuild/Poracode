import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import DexieDatabase, { type EntityTable } from "dexie";
import { isNativeApp } from "./pwaInstall";

/**
 * Secure at-rest storage for remote-desktop bearer tokens.
 *
 * On the native shells (iOS Keychain / Android Keystore, via
 * `@aparajita/capacitor-secure-storage`) the token lives here instead of the
 * plaintext Dexie/IndexedDB cache the rest of {@link import("./storage")} uses.
 *
 * On the web/PWA there is no OS keystore, so tokens are instead encrypted at
 * rest with WebCrypto AES-GCM. The AES key is a non-extractable `CryptoKey`
 * (`extractable: false` — the raw key bytes are never exposed to JS, only
 * usable via `crypto.subtle`); non-extractable `CryptoKey` objects still
 * survive a structured clone, so the key is generated once and persisted
 * alongside the per-desktop ciphertext in its own tiny Dexie database
 * (`lightcode-mobile-vault`). That database is intentionally separate from
 * {@link import("./storage")}'s `lightcode-mobile` database: storage.ts
 * already imports this module, so importing storage.ts back here would be a
 * cycle. Each encryption uses a fresh random 12-byte IV.
 *
 * Threat model: this defends against passive exfiltration of storage at
 * rest — a raw IndexedDB dump, a device/browser backup, or another OS user
 * profile reading the disk cannot recover the token, because the key is
 * non-extractable and only usable in-page via `crypto.subtle`. It does NOT
 * defend against an active same-origin XSS: injected script running in this
 * origin can call `getDesktopToken()` (or `crypto.subtle.decrypt` directly)
 * exactly like this module does. This is defense-in-depth against storage
 * exfiltration, not an XSS mitigation.
 *
 * All failures degrade gracefully on both paths: a read returns `null` (so
 * the caller falls back to whatever the Dexie row still holds) and a write
 * reports it did not persist (so the caller keeps the token in Dexie rather
 * than dropping it), rather than throwing and breaking pairing. On the web
 * path this also covers `crypto.subtle` being unavailable (e.g. a
 * non-secure context). The failure is logged once.
 */

const KEY_PREFIX = "remoteDesktopToken.";

function keyFor(desktopId: string): string {
  return `${KEY_PREFIX}${desktopId}`;
}

/**
 * In-memory cache of successfully-read/written tokens, keyed by desktopId.
 *
 * Both backends (native keystore, web WebCrypto vault) are hit on every
 * `listStoredDesktops()` (once per desktop), which `refresh()` calls on a ~1s
 * cadence during a live run. Caching the plaintext token in memory (it
 * already lives in memory on the hydrated desktop rows and the live client)
 * avoids those repeated round-trips. Only successful values are cached — a
 * transient backend failure returns `null` without pinning it, so a later
 * read still retries the backend.
 */
const tokenCache = new Map<string, string>();

/** Test-only: clear the in-memory token cache between cases. */
export function __resetTokenCacheForTests(): void {
  tokenCache.clear();
}

let warned = false;
function warnOnce(error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(
    "[tokenVault] secure storage unavailable; falling back to the local token cache",
    error,
  );
}

// ---------------------------------------------------------------------------
// Web/PWA path: WebCrypto AES-GCM over a dedicated Dexie database.
// ---------------------------------------------------------------------------

const VAULT_KEY_RECORD_KEY = "cryptoKey";
const VAULT_TOKEN_PREFIX = "token.";

function vaultKeyFor(desktopId: string): string {
  return `${VAULT_TOKEN_PREFIX}${desktopId}`;
}

/**
 * Single record shape covering both rows the table holds: the `cryptoKey`
 * row (keyed by {@link VAULT_KEY_RECORD_KEY}) and per-desktop ciphertext rows
 * (keyed by {@link vaultKeyFor}). Modeled as one interface with optional
 * fields rather than a union — Dexie's `InsertType` helper does not resolve
 * discriminated unions cleanly for `EntityTable`.
 */
interface VaultRecord {
  readonly key: string;
  readonly cryptoKey?: CryptoKey;
  readonly iv?: Uint8Array<ArrayBuffer>;
  readonly data?: ArrayBuffer;
}

class TokenVaultDatabase extends DexieDatabase {
  entries!: EntityTable<VaultRecord, "key">;

  constructor() {
    super("lightcode-mobile-vault");
    this.version(1).stores({
      entries: "key",
    });
  }
}

/** Exposed (like `storage.ts`'s `mobileDb`) so tests can reset it between cases. */
export const tokenVaultDb = new TokenVaultDatabase();

function subtleAvailable(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
}

async function loadOrCreateCryptoKey(): Promise<CryptoKey> {
  const existing = await tokenVaultDb.entries.get(VAULT_KEY_RECORD_KEY);
  if (existing?.cryptoKey) return existing.cryptoKey;
  // extractable: false — the key bytes never leave crypto.subtle, but the
  // CryptoKey object itself is still structured-cloneable into IndexedDB.
  const cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await tokenVaultDb.entries.put({ key: VAULT_KEY_RECORD_KEY, cryptoKey });
  return cryptoKey;
}

/**
 * Memoized in-flight promise so concurrent first-time callers (e.g. two
 * desktops paired back to back) share ONE generate-and-persist instead of
 * each minting a different key via a check-then-act race. Same pattern as
 * `storage.ts`'s `getOrCreateDeviceId`: `??=` runs synchronously (no await
 * between check and assign), so the race can't slip through, and the memo is
 * cleared on failure so a transient error doesn't wedge it.
 */
let cryptoKeyPromise: Promise<CryptoKey> | null = null;

function getOrCreateCryptoKey(): Promise<CryptoKey> {
  cryptoKeyPromise ??= loadOrCreateCryptoKey().catch((error: unknown) => {
    cryptoKeyPromise = null;
    throw error;
  });
  return cryptoKeyPromise;
}

/**
 * Test-only: clear the in-memory crypto-key memo (simulating a fresh page
 * load) without touching the persisted key/ciphertext in `tokenVaultDb`.
 */
export function __resetVaultKeyMemoForTests(): void {
  cryptoKeyPromise = null;
}

async function encryptAndStore(desktopId: string, token: string): Promise<boolean> {
  if (!subtleAvailable()) return false;
  try {
    const cryptoKey = await getOrCreateCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(token),
    );
    await tokenVaultDb.entries.put({ key: vaultKeyFor(desktopId), iv, data });
    return true;
  } catch (error) {
    warnOnce(error);
    return false;
  }
}

async function readAndDecrypt(desktopId: string): Promise<string | null> {
  if (!subtleAvailable()) return null;
  try {
    const record = await tokenVaultDb.entries.get(vaultKeyFor(desktopId));
    if (!record?.iv || !record.data) return null;
    const cryptoKey = await getOrCreateCryptoKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      cryptoKey,
      record.data,
    );
    return new TextDecoder().decode(plain);
  } catch (error) {
    warnOnce(error);
    return null;
  }
}

async function deleteEncrypted(desktopId: string): Promise<void> {
  try {
    await tokenVaultDb.entries.delete(vaultKeyFor(desktopId));
  } catch (error) {
    warnOnce(error);
  }
}

// ---------------------------------------------------------------------------
// Native path: OS keystore via SecureStorage.
// ---------------------------------------------------------------------------

async function readFromKeystore(desktopId: string): Promise<string | null> {
  try {
    const value = await SecureStorage.get(keyFor(desktopId));
    return typeof value === "string" ? value : null;
  } catch (error) {
    warnOnce(error);
    return null;
  }
}

async function writeToKeystore(desktopId: string, token: string): Promise<boolean> {
  try {
    await SecureStorage.set(keyFor(desktopId), token);
    return true;
  } catch (error) {
    warnOnce(error);
    return false;
  }
}

async function deleteFromKeystore(desktopId: string): Promise<void> {
  try {
    await SecureStorage.remove(keyFor(desktopId));
  } catch (error) {
    warnOnce(error);
  }
}

// ---------------------------------------------------------------------------
// Public API — dispatches to the native keystore or the web WebCrypto vault.
// ---------------------------------------------------------------------------

/**
 * Read a desktop's bearer token from secure storage (OS keystore on native,
 * the WebCrypto vault on web). Returns `null` on any backend failure —
 * including `crypto.subtle` being unavailable on web — letting the caller
 * fall back to the Dexie-cached value.
 */
export async function getDesktopToken(desktopId: string): Promise<string | null> {
  const cached = tokenCache.get(desktopId);
  if (cached !== undefined) return cached;
  const value = isNativeApp() ? await readFromKeystore(desktopId) : await readAndDecrypt(desktopId);
  if (value === null) return null;
  tokenCache.set(desktopId, value);
  return value;
}

/**
 * Persist a desktop's bearer token to secure storage (OS keystore on native,
 * the WebCrypto vault on web). Resolves `true` only when the token was
 * actually persisted; callers use that to decide whether the Dexie row can
 * be safely blanked. Resolves `false` on any backend failure — including
 * `crypto.subtle` being unavailable on web — so the token stays in Dexie.
 */
export async function setDesktopToken(desktopId: string, token: string): Promise<boolean> {
  const persisted = isNativeApp()
    ? await writeToKeystore(desktopId, token)
    : await encryptAndStore(desktopId, token);
  if (persisted) tokenCache.set(desktopId, token);
  return persisted;
}

/** Remove a desktop's bearer token from secure storage. Best-effort. */
export async function deleteDesktopToken(desktopId: string): Promise<void> {
  tokenCache.delete(desktopId);
  if (isNativeApp()) {
    await deleteFromKeystore(desktopId);
    return;
  }
  await deleteEncrypted(desktopId);
}
