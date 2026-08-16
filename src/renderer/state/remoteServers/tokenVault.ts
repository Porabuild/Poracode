const DATABASE_NAME = "lightcode-mobile-vault";
const STORE_NAME = "entries";
const VAULT_KEY_RECORD_KEY = "cryptoKey";
const VAULT_TOKEN_PREFIX = "token.";

interface VaultRecord {
  readonly key: string;
  readonly cryptoKey?: CryptoKey;
  readonly iv?: Uint8Array<ArrayBuffer>;
  readonly data?: ArrayBuffer;
}

const tokenCache = new Map<string, string>();
let databasePromise: Promise<IDBDatabase> | null = null;
let cryptoKeyPromise: Promise<CryptoKey> | null = null;
let warned = false;

function vaultKey(desktopId: string): string {
  return `${VAULT_TOKEN_PREFIX}${desktopId}`;
}

function warnOnce(error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn("[tokenVault] secure storage unavailable; retaining the local token", error);
}

function subtleAvailable(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
}

function openVaultDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    // The retired Dexie-backed PWA created its schema version 1 as native
    // IndexedDB version 10. Open the current database version so those vaults
    // remain readable instead of failing with a downgrade VersionError.
    const request = indexedDB.open(DATABASE_NAME);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the token vault."));
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function readRecord(key: string): Promise<VaultRecord | undefined> {
  const database = await openVaultDatabase();
  return await new Promise<VaultRecord | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as VaultRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("Unable to read the token vault."));
  });
}

async function writeRecord(record: VaultRecord): Promise<void> {
  const database = await openVaultDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Unable to write the token vault."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Token vault write aborted."));
  });
}

async function deleteRecord(key: string): Promise<void> {
  const database = await openVaultDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Unable to update the token vault."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Token vault update aborted."));
  });
}

async function loadOrCreateCryptoKey(): Promise<CryptoKey> {
  const existing = await readRecord(VAULT_KEY_RECORD_KEY);
  if (existing?.cryptoKey) return existing.cryptoKey;
  const cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await writeRecord({ key: VAULT_KEY_RECORD_KEY, cryptoKey });
  return cryptoKey;
}

function getOrCreateCryptoKey(): Promise<CryptoKey> {
  cryptoKeyPromise ??= loadOrCreateCryptoKey().catch((error: unknown) => {
    cryptoKeyPromise = null;
    throw error;
  });
  return cryptoKeyPromise;
}

async function writeWebToken(desktopId: string, token: string): Promise<boolean> {
  if (!subtleAvailable() || typeof indexedDB === "undefined") return false;
  try {
    const cryptoKey = await getOrCreateCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(token),
    );
    await writeRecord({ key: vaultKey(desktopId), iv, data });
    return true;
  } catch (error) {
    warnOnce(error);
    return false;
  }
}

async function readWebToken(desktopId: string): Promise<string | null> {
  if (!subtleAvailable() || typeof indexedDB === "undefined") return null;
  try {
    const record = await readRecord(vaultKey(desktopId));
    if (!record?.iv || !record.data) return null;
    const cryptoKey = await getOrCreateCryptoKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      cryptoKey,
      record.data,
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    warnOnce(error);
    return null;
  }
}

export async function getDesktopToken(desktopId: string): Promise<string | null> {
  const cached = tokenCache.get(desktopId);
  if (cached !== undefined) return cached;
  let token: string | null;
  try {
    token = await readWebToken(desktopId);
  } catch (error) {
    warnOnce(error);
    return null;
  }
  if (typeof token !== "string" || token.length === 0) return null;
  tokenCache.set(desktopId, token);
  return token;
}

export async function setDesktopToken(desktopId: string, token: string): Promise<boolean> {
  try {
    const persisted = await writeWebToken(desktopId, token);
    if (persisted) tokenCache.set(desktopId, token);
    return persisted;
  } catch (error) {
    warnOnce(error);
    return false;
  }
}

export async function deleteDesktopToken(desktopId: string): Promise<void> {
  tokenCache.delete(desktopId);
  try {
    if (typeof indexedDB !== "undefined") {
      await deleteRecord(vaultKey(desktopId));
    }
  } catch (error) {
    warnOnce(error);
  }
}

export function __resetTokenVaultForTest(): void {
  tokenCache.clear();
  void databasePromise?.then((database) => database.close()).catch(() => undefined);
  databasePromise = null;
  cryptoKeyPromise = null;
  warned = false;
}
