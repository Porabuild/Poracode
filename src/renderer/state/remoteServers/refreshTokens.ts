/**
 * Gate 6 item 4.6 (S6): refresh tokens are credential-grade, so they live in
 * the same encrypted WebCrypto vault the access tokens use — one AES-GCM key
 * record shared by the whole origin (owned by `remoteServers/tokenVault.ts`,
 * which this module must not edit; the helpers below deliberately reuse its
 * database and key record rather than forking the custody boundary). The
 * in-memory map is the synchronous read path the client lifecycle uses;
 * `hydrateRefreshTokens` fills it from the vault at startup.
 */
const REFRESH_VAULT_KEY_PREFIX = "refresh.";
let refreshVaultDatabase: Promise<IDBDatabase> | null = null;

function openRefreshVaultDatabase(): Promise<IDBDatabase> {
  refreshVaultDatabase ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lightcode-mobile-vault");
    request.onupgradeneeded = () => {
      // Matches the token vault's store; upgrades stay owned by that module.
      if (!request.result.objectStoreNames.contains("entries")) {
        request.result.createObjectStore("entries", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the token vault."));
  }).catch((error: unknown) => {
    refreshVaultDatabase = null;
    throw error;
  });
  return refreshVaultDatabase;
}

async function refreshVaultCryptoKey(): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") return null;
  const database = await openRefreshVaultDatabase();
  const record = await new Promise<{ cryptoKey?: CryptoKey } | undefined>((resolve, reject) => {
    const transaction = database.transaction("entries", "readonly");
    const request = transaction.objectStore("entries").get("cryptoKey");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to read the token vault."));
  });
  return record?.cryptoKey ?? null;
}

/** In-memory refresh tokens, the synchronous source for client lifecycles. */
const refreshTokensByDesktopId = new Map<string, string>();

export function refreshTokenForDesktop(desktopId: string): string | undefined {
  return refreshTokensByDesktopId.get(desktopId);
}

export function rememberRefreshToken(desktopId: string, token: string): void {
  refreshTokensByDesktopId.set(desktopId, token);
}

export function __peekRefreshTokenForTest(desktopId: string): string | undefined {
  return refreshTokensByDesktopId.get(desktopId);
}

async function loadRefreshTokenFromVault(desktopId: string): Promise<string | null> {
  try {
    if (typeof indexedDB === "undefined") return null;
    const cryptoKey = await refreshVaultCryptoKey();
    if (!cryptoKey) return null;
    const database = await openRefreshVaultDatabase();
    const record = await new Promise<
      { iv?: Uint8Array<ArrayBuffer>; data?: ArrayBuffer } | undefined
    >((resolve, reject) => {
      const transaction = database.transaction("entries", "readonly");
      const request = transaction
        .objectStore("entries")
        .get(`${REFRESH_VAULT_KEY_PREFIX}${desktopId}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to read the token vault."));
    });
    if (!record?.iv || !record.data) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      cryptoKey,
      record.data,
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    console.warn("[remoteServers] unable to read the persisted refresh token", error);
    return null;
  }
}

export async function writeRefreshTokenToVault(desktopId: string, token: string): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    const cryptoKey = await refreshVaultCryptoKey();
    if (!cryptoKey) return;
    const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(token),
    );
    const database = await openRefreshVaultDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("entries", "readwrite");
      transaction
        .objectStore("entries")
        .put({ key: `${REFRESH_VAULT_KEY_PREFIX}${desktopId}`, iv, data });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Vault write failed."));
    });
  } catch (error) {
    console.warn("[remoteServers] unable to persist the refresh token", error);
  }
}

export async function deleteRefreshTokenFromVault(desktopId: string): Promise<void> {
  refreshTokensByDesktopId.delete(desktopId);
  try {
    if (typeof indexedDB === "undefined") return;
    const database = await openRefreshVaultDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("entries", "readwrite");
      transaction.objectStore("entries").delete(`${REFRESH_VAULT_KEY_PREFIX}${desktopId}`);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Vault delete failed."));
    });
  } catch (error) {
    console.warn("[remoteServers] unable to delete the persisted refresh token", error);
  }
}

/** Loads persisted refresh tokens into the synchronous in-memory map. */
export async function hydrateRefreshTokens(desktopIds: readonly string[]): Promise<void> {
  await Promise.all(
    desktopIds.map(async (desktopId) => {
      if (refreshTokensByDesktopId.has(desktopId)) return;
      const token = await loadRefreshTokenFromVault(desktopId);
      if (token) refreshTokensByDesktopId.set(desktopId, token);
    }),
  );
}
