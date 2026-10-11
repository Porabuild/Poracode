import { TokenVaultDatabase } from "./tokenVaultDatabase";

const VAULT_KEY_RECORD_KEY = "cryptoKey";
const VAULT_TOKEN_PREFIX = "token.";

interface VaultRecord {
  readonly key: string;
  readonly cryptoKey?: CryptoKey;
  readonly iv?: Uint8Array<ArrayBuffer>;
  readonly data?: ArrayBuffer;
}

const tokenCache = new Map<string, string>();
let cryptoKeyPromise: Promise<CryptoKey> | null = null;
const database = new TokenVaultDatabase(() => {
  cryptoKeyPromise = null;
});
let warned = false;

// Retain a generation only while operations are pending, including reads that
// could otherwise repopulate the cache after a delete or a newer token write.
const tokenOperations = new Map<string, { generation: number; pending: number }>();

function beginTokenOperation(desktopId: string, mutation = false) {
  const entry = tokenOperations.get(desktopId) ?? { generation: 0, pending: 0 };
  tokenOperations.set(desktopId, entry);
  entry.pending += 1;
  if (mutation) entry.generation += 1;
  const generation = entry.generation;
  return {
    isCurrent: () => tokenOperations.get(desktopId) === entry && entry.generation === generation,
    finish: () => {
      entry.pending -= 1;
      if (entry.pending === 0 && tokenOperations.get(desktopId) === entry) {
        tokenOperations.delete(desktopId);
      }
    },
  };
}

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

async function readRecord(key: string): Promise<VaultRecord | undefined> {
  return database.request("readonly", "read", (store) => store.get(key));
}

async function writeRecord(record: VaultRecord, isCurrent?: () => boolean): Promise<void> {
  await database.request("readwrite", "write", (store) => store.put(record), isCurrent);
}

async function deleteRecord(key: string, isCurrent: () => boolean): Promise<void> {
  await database.request("readwrite", "update", (store) => store.delete(key), isCurrent);
}

async function loadOrCreateCryptoKey(isCurrent: () => boolean): Promise<CryptoKey> {
  const existing = await readRecord(VAULT_KEY_RECORD_KEY);
  if (existing?.cryptoKey) return existing.cryptoKey;
  const cryptoKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await writeRecord({ key: VAULT_KEY_RECORD_KEY, cryptoKey }, isCurrent);
  return cryptoKey;
}

function getOrCreateCryptoKey(): Promise<CryptoKey> {
  if (cryptoKeyPromise) return cryptoKeyPromise;
  const promise: Promise<CryptoKey> = loadOrCreateCryptoKey(() => cryptoKeyPromise === promise)
    .then((key) => {
      if (cryptoKeyPromise !== promise) throw new Error("Unable to read the token vault.");
      return key;
    })
    .catch((error: unknown) => {
      if (cryptoKeyPromise === promise) cryptoKeyPromise = null;
      throw error;
    });
  cryptoKeyPromise = promise;
  return promise;
}

async function writeWebToken(
  desktopId: string,
  token: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (!subtleAvailable() || typeof indexedDB === "undefined") return false;
  try {
    const keyPromise = getOrCreateCryptoKey();
    const cryptoKey = await keyPromise;
    const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(token),
    );
    await writeRecord(
      { key: vaultKey(desktopId), iv, data },
      () => isCurrent() && cryptoKeyPromise === keyPromise,
    );
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
    const keyPromise = getOrCreateCryptoKey();
    const cryptoKey = await keyPromise;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      cryptoKey,
      record.data,
    );
    if (cryptoKeyPromise !== keyPromise) throw new Error("Unable to read the token vault.");
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    warnOnce(error);
    return null;
  }
}

export async function getDesktopToken(desktopId: string): Promise<string | null> {
  const cached = tokenCache.get(desktopId);
  if (cached !== undefined) return cached;
  const operation = beginTokenOperation(desktopId);
  try {
    const token = await readWebToken(desktopId);
    if (!operation.isCurrent()) return tokenCache.get(desktopId) ?? null;
    if (typeof token !== "string" || token.length === 0) return null;
    tokenCache.set(desktopId, token);
    return token;
  } catch (error) {
    warnOnce(error);
    return null;
  } finally {
    operation.finish();
  }
}

export async function setDesktopToken(desktopId: string, token: string): Promise<boolean> {
  const operation = beginTokenOperation(desktopId, true);
  try {
    const persisted =
      (await writeWebToken(desktopId, token, operation.isCurrent)) && operation.isCurrent();
    if (persisted) tokenCache.set(desktopId, token);
    return persisted;
  } catch (error) {
    warnOnce(error);
    return false;
  } finally {
    operation.finish();
  }
}

export async function deleteDesktopToken(desktopId: string): Promise<void> {
  const operation = beginTokenOperation(desktopId, true);
  tokenCache.delete(desktopId);
  try {
    if (typeof indexedDB !== "undefined") {
      await deleteRecord(vaultKey(desktopId), operation.isCurrent);
    }
  } catch (error) {
    warnOnce(error);
  } finally {
    operation.finish();
  }
}

export function __resetTokenVaultForTest(): void {
  tokenCache.clear();
  tokenOperations.clear();
  database.close();
  cryptoKeyPromise = null;
  warned = false;
}
