/**
 * Gate 6 item 4.6 (S6): refresh tokens are credential-grade, so they live in
 * the same encrypted WebCrypto vault the access tokens use — one AES-GCM key
 * record shared by the whole origin (owned by `remoteServers/tokenVault.ts`,
 * which this module must not edit; the helpers below deliberately reuse its
 * database and key record rather than forking the custody boundary). The
 * in-memory map is the synchronous read path the client lifecycle uses;
 * `hydrateRefreshTokens` fills it from the vault at startup.
 *
 * Refresh subjects are typed and disjoint at the vault root, so no two
 * authorities can ever share a slot and an arbitrary direct connection id can
 * never address an environment grant (managed-parent implementation decision):
 *
 * - `connection`            → `refresh.<connectionId>` (unchanged, v1 bytes);
 * - `remoteEnvironmentGrant`→ `environmentRefresh.<parentConnectionId>.<environmentId>`;
 * - `managedEnvironmentGrant`→ `managedEnvironment.<hostDesktopId>.<environmentId>`.
 *
 * The pre-correction remote-environment root `refresh.environment.<parent>.<envId>`
 * is retired: it is read only by the unambiguous legacy migration below and
 * deleted only after a strict successful write of the new slot. Ownership
 * fencing plus a per-key write queue keep a delayed response/encryption from
 * updating a newer client at the same key or resurrecting a removed grant.
 */

import { desktopTokenVaultKey, vaultCryptoKey } from "./tokenVault";

export interface ConnectionRefreshSubject {
  readonly kind: "connection";
  readonly connectionId: string;
}

export interface RemoteEnvironmentGrantSubject {
  readonly kind: "remoteEnvironmentGrant";
  readonly parentConnectionId: string;
  readonly environmentId: string;
}

export interface ManagedEnvironmentGrantSubject {
  readonly kind: "managedEnvironmentGrant";
  readonly hostDesktopId: string;
  readonly environmentId: string;
}

/** One typed custody identity; kind is part of the cache identity. */
export type RefreshSubject =
  | ConnectionRefreshSubject
  | RemoteEnvironmentGrantSubject
  | ManagedEnvironmentGrantSubject;

export function connectionRefreshSubject(connectionId: string): ConnectionRefreshSubject {
  return { kind: "connection", connectionId };
}

export function remoteEnvironmentRefreshSubject(
  parentConnectionId: string,
  environmentId: string,
): RemoteEnvironmentGrantSubject {
  return { kind: "remoteEnvironmentGrant", parentConnectionId, environmentId };
}

export function managedEnvironmentRefreshSubject(
  hostDesktopId: string,
  environmentId: string,
): ManagedEnvironmentGrantSubject {
  return { kind: "managedEnvironmentGrant", hostDesktopId, environmentId };
}

const REFRESH_VAULT_KEY_PREFIX = "refresh.";
/** The pre-correction remote-environment alias domain, never written again. */
const LEGACY_ENVIRONMENT_VAULT_KEY_PREFIX = "refresh.environment.";

/**
 * The vault slot for a subject. `connection` keeps the historical
 * `refresh.<connectionId>` bytes; both environment variants own roots outside
 * `refresh.`, so no direct id can address them and an older reader's
 * `refresh.` sweep cannot purge them.
 */
export function refreshSubjectVaultKey(subject: RefreshSubject): string {
  switch (subject.kind) {
    case "connection":
      return `${REFRESH_VAULT_KEY_PREFIX}${subject.connectionId}`;
    case "remoteEnvironmentGrant":
      return `environmentRefresh.${subject.parentConnectionId}.${subject.environmentId}`;
    case "managedEnvironmentGrant":
      return `managedEnvironment.${subject.hostDesktopId}.${subject.environmentId}`;
  }
}

/**
 * The direct-connection alias of the legacy remote-environment slot: direct ids
 * accept any nonempty string, so a direct `connectionId` equal to
 * `environment.<parent>.<environmentId>` addressed exactly this slot.
 */
export function legacyRemoteEnvironmentDirectAlias(subject: RemoteEnvironmentGrantSubject): string {
  return `environment.${subject.parentConnectionId}.${subject.environmentId}`;
}

function legacyRemoteEnvironmentVaultKey(subject: RemoteEnvironmentGrantSubject): string {
  return `${LEGACY_ENVIRONMENT_VAULT_KEY_PREFIX}${subject.parentConnectionId}.${subject.environmentId}`;
}

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

/**
 * Reads one vault record. A throwing `result` getter (WebKit, see
 * `TokenVaultDatabase.request`) rejects instead of escaping `onsuccess`.
 */
function readVaultRecord<T>(database: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction("entries", "readonly");
    const request = transaction.objectStore("entries").get(key);
    request.onsuccess = () => {
      try {
        resolve(request.result);
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to read the token vault."));
  });
}

async function refreshVaultCryptoKey(): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") return null;
  const database = await openRefreshVaultDatabase();
  const record = await readVaultRecord<{ cryptoKey?: CryptoKey }>(database, "cryptoKey");
  return record?.cryptoKey ?? null;
}

/**
 * The grant ciphertext this realm last read or wrote per slot (null = absent).
 * A shared copy that still matches it was not written by another realm since.
 */
const observedRefreshSlots = new Map<string, VaultSlotCiphertext | null>();

async function readRefreshVaultRecord(vaultKey: string): Promise<string | null> {
  try {
    if (typeof indexedDB === "undefined") return null;
    const cryptoKey = await refreshVaultCryptoKey();
    if (!cryptoKey) return null;
    const database = await openRefreshVaultDatabase();
    const record = await readVaultRecord<{ iv?: Uint8Array<ArrayBuffer>; data?: ArrayBuffer }>(
      database,
      vaultKey,
    );
    observedRefreshSlots.set(vaultKey, slotCiphertext(record));
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

async function encryptRefreshToken(
  token: string,
): Promise<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer } | null> {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") return null;
  const cryptoKey = await refreshVaultCryptoKey();
  if (!cryptoKey) return null;
  return encryptWithKey(cryptoKey, token);
}

async function encryptWithKey(cryptoKey: CryptoKey, token: string): Promise<VaultSlotCiphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(token),
  );
  return { iv, data };
}

async function putRefreshVaultRecord(
  vaultKey: string,
  encrypted: { iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer },
): Promise<void> {
  const database = await openRefreshVaultDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("entries", "readwrite");
    transaction
      .objectStore("entries")
      .put({ key: vaultKey, iv: encrypted.iv, data: encrypted.data });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Vault write failed."));
  });
  observedRefreshSlots.set(vaultKey, encrypted);
}

async function deleteRefreshVaultRecord(vaultKey: string): Promise<void> {
  const database = await openRefreshVaultDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("entries", "readwrite");
    transaction.objectStore("entries").delete(vaultKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Vault delete failed."));
  });
  observedRefreshSlots.set(vaultKey, null);
}

/** In-memory refresh tokens, the synchronous source for client lifecycles.
 * Keyed by the vault slot, so subject kind is part of the cache identity. */
const refreshTokensBySubject = new Map<string, string>();

export function refreshTokenForSubject(subject: RefreshSubject): string | undefined {
  return refreshTokensBySubject.get(refreshSubjectVaultKey(subject));
}

export function rememberRefreshTokenForSubject(subject: RefreshSubject, token: string): void {
  refreshTokensBySubject.set(refreshSubjectVaultKey(subject), token);
}

/** Connection-subject convenience for direct/ssh records (v1 slot bytes). */
export function refreshTokenForDesktop(connectionId: string): string | undefined {
  return refreshTokenForSubject(connectionRefreshSubject(connectionId));
}

export function rememberRefreshToken(connectionId: string, token: string): void {
  rememberRefreshTokenForSubject(connectionRefreshSubject(connectionId), token);
}

/** Drops the in-memory grant only; the vault slot and its ownership stay. */
export function forgetRefreshTokenForSubject(subject: RefreshSubject): void {
  refreshTokensBySubject.delete(refreshSubjectVaultKey(subject));
}

export function __peekRefreshTokenForTest(subject: RefreshSubject | string): string | undefined {
  return refreshTokensBySubject.get(
    typeof subject === "string"
      ? refreshSubjectVaultKey({ kind: "connection", connectionId: subject })
      : refreshSubjectVaultKey(subject),
  );
}

export function __forgetRefreshTokenForTest(subject: RefreshSubject): void {
  refreshTokensBySubject.delete(refreshSubjectVaultKey(subject));
}

/** Test seam: drop memory, ownership fences, queues, and the open database. */
export function __resetRefreshTokensForTest(): void {
  refreshTokensBySubject.clear();
  refreshSubjectOwners.clear();
  refreshWriteQueues.clear();
  observedRefreshSlots.clear();
  void refreshVaultDatabase?.then((database) => database.close()).catch(() => undefined);
  refreshVaultDatabase = null;
}

/**
 * Ownership fences one live writer per subject. Acquiring replaces the previous
 * owner, so a callback captured by a replaced/removed session can never write
 * again; releasing only clears the releasing owner's own claim.
 */
const refreshSubjectOwners = new Map<string, symbol>();

export function acquireRefreshSubjectOwnership(subject: RefreshSubject): symbol {
  const owner = Symbol("refresh-subject-owner");
  refreshSubjectOwners.set(refreshSubjectVaultKey(subject), owner);
  return owner;
}

export function releaseRefreshSubjectOwnership(subject: RefreshSubject, owner: symbol): void {
  const key = refreshSubjectVaultKey(subject);
  if (refreshSubjectOwners.get(key) === owner) refreshSubjectOwners.delete(key);
}

/** Revokes every claim, so a removed/rotated-out session's delayed callback is
 * inert until the next legitimate writer acquires ownership. */
export function revokeRefreshSubjectOwnership(subject: RefreshSubject): void {
  refreshSubjectOwners.delete(refreshSubjectVaultKey(subject));
}

export function ownsRefreshSubject(subject: RefreshSubject, owner: symbol): boolean {
  return refreshSubjectOwners.get(refreshSubjectVaultKey(subject)) === owner;
}

/**
 * One legitimate incarnation per connection refresh slot. The connection's
 * slot (`refresh.<connectionId>`) has several legitimate writers over one
 * record's life — the short-lived per-request clients and the long-lived
 * parent-authority session — so a claim per client would let one revoke the
 * other's valid rotation. Instead the pairing commit establishes the
 * incarnation, every writer captures the SAME current owner, and an explicit
 * re-pair replaces it: a delayed writer of the previous incarnation is refused
 * while the connection lives on. Removal revokes it outright (and
 * `deleteRefreshTokenFromVault` revokes it as part of the delete).
 */
export function acquireConnectionIncarnation(connectionId: string): symbol {
  return acquireRefreshSubjectOwnership(connectionRefreshSubject(connectionId));
}

/** The current connection incarnation, or `undefined` once revoked. */
export function connectionIncarnationOwner(connectionId: string): symbol | undefined {
  return refreshSubjectOwners.get(refreshSubjectVaultKey(connectionRefreshSubject(connectionId)));
}

/**
 * The current incarnation, created atomically on first use: concurrent callers
 * of one live connection share a single owner instead of competing claims.
 */
export function ensureConnectionIncarnation(connectionId: string): symbol {
  return connectionIncarnationOwner(connectionId) ?? acquireConnectionIncarnation(connectionId);
}

export function ownsConnectionIncarnation(connectionId: string, owner: symbol): boolean {
  return ownsRefreshSubject(connectionRefreshSubject(connectionId), owner);
}

/** Revokes the incarnation so no captured writer can touch the slot again. */
export function revokeConnectionIncarnation(connectionId: string): void {
  revokeRefreshSubjectOwnership(connectionRefreshSubject(connectionId));
}

/**
 * Per-slot write queue: encryption/storage for one slot never interleaves, so
 * the queue order plus the ownership check inside each queued write makes a
 * delayed writer unable to overwrite a newer grant.
 */
const refreshWriteQueues = new Map<string, Promise<unknown>>();

/** Resolves once every slot write this realm queued for the subject settled. */
export function refreshSlotWritesSettled(subject: RefreshSubject): Promise<void> {
  const pending = refreshWriteQueues.get(refreshSubjectVaultKey(subject));
  return pending ? pending.then(() => undefined) : Promise.resolve();
}

/**
 * Whether `slot` (a fresh read) is still the grant this realm last read or
 * wrote, so no other realm wrote it since. A slot this realm never observed is
 * untouched only while it is still empty.
 */
export function sharedGrantUntouched(
  subject: RefreshSubject,
  slot: VaultSlotCiphertext | null,
): boolean {
  const key = refreshSubjectVaultKey(subject);
  if (!observedRefreshSlots.has(key)) return slot === null;
  return sameCiphertext(observedRefreshSlots.get(key) ?? null, slot);
}

export function observeSharedGrant(
  subject: RefreshSubject,
  slot: VaultSlotCiphertext | null,
): void {
  observedRefreshSlots.set(refreshSubjectVaultKey(subject), slot);
}

function enqueueRefreshSlotWrite<Result>(
  subject: RefreshSubject,
  write: () => Promise<Result>,
): Promise<Result> {
  const key = refreshSubjectVaultKey(subject);
  const previous = refreshWriteQueues.get(key) ?? Promise.resolve();
  const result = previous.then(write, write);
  refreshWriteQueues.set(
    key,
    result.catch(() => undefined),
  );
  return result;
}

/**
 * Strict persist: resolves `true` only once the encrypted record is committed.
 * A missing IndexedDB/crypto key or a failed transaction resolves `false`
 * (existing best-effort callers `void` the result; migration counts only
 * `true` as persisted). With an owner, the write is refused when that owner no
 * longer owns the subject at call time; once accepted it is serialized in the
 * slot's queue, so a later removal/re-pair (which enqueues after it) always
 * wins and a delayed writer that fires after removal is rejected outright.
 */
export function writeRefreshTokenToVault(
  subject: RefreshSubject,
  token: string,
  owner?: symbol,
): Promise<boolean> {
  if (owner && !ownsRefreshSubject(subject, owner)) return Promise.resolve(false);
  return enqueueRefreshSlotWrite(subject, async () => {
    try {
      if (typeof indexedDB === "undefined") return false;
      const encrypted = await encryptRefreshToken(token);
      if (!encrypted) return false;
      await putRefreshVaultRecord(refreshSubjectVaultKey(subject), encrypted);
      return true;
    } catch (error) {
      console.warn("[remoteServers] unable to persist the refresh token", error);
      return false;
    }
  });
}

/**
 * Removes the in-memory value and revokes ownership immediately (a delayed
 * writer can no longer re-add it), then deletes the vault slot in the same
 * per-slot queue. The caller may pass the owner to release; when omitted the
 * removal still fences every existing claim.
 */
export async function deleteRefreshTokenFromVault(subject: RefreshSubject): Promise<void> {
  refreshTokensBySubject.delete(refreshSubjectVaultKey(subject));
  refreshSubjectOwners.delete(refreshSubjectVaultKey(subject));
  await enqueueRefreshSlotWrite(subject, async () => {
    try {
      if (typeof indexedDB === "undefined") return;
      await deleteRefreshVaultRecord(refreshSubjectVaultKey(subject));
    } catch (error) {
      console.warn("[remoteServers] unable to delete the persisted refresh token", error);
    }
  });
}

/** Connection-subject convenience for direct/ssh records. */
export function deleteRefreshTokenForDesktop(connectionId: string): Promise<void> {
  return deleteRefreshTokenFromVault(connectionRefreshSubject(connectionId));
}

/** Raw ciphertext of one vault slot; a commit compares it byte for byte. */
export interface VaultSlotCiphertext {
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly data: ArrayBuffer;
}

export type SharedCredentialRead =
  /** No IndexedDB/WebCrypto, or no vault key yet: nothing was ever shared. */
  | { readonly status: "unavailable" }
  /** The vault exists but could not be read; never mistaken for absence. */
  | { readonly status: "failed" }
  | {
      readonly status: "ok";
      readonly refreshToken: string | undefined;
      readonly accessToken: string | undefined;
      readonly refreshSlot: VaultSlotCiphertext | null;
    };

export type SharedCredentialCommit = "committed" | "conflict" | "unavailable" | "failed";

function vaultAvailable(): boolean {
  return (
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined"
  );
}

function slotCiphertext(record: unknown): VaultSlotCiphertext | null {
  const slot = record as Partial<VaultSlotCiphertext> | undefined;
  return slot?.iv && slot.data ? { iv: slot.iv, data: slot.data } : null;
}

function sameCiphertext(left: VaultSlotCiphertext | null, right: VaultSlotCiphertext | null) {
  if (!left || !right) return left === right;
  const bytes = (value: ArrayBufferLike | ArrayBufferView) =>
    ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : new Uint8Array(value);
  const equal = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((byte, index) => byte === b[index]);
  return equal(bytes(left.iv), bytes(right.iv)) && equal(bytes(left.data), bytes(right.data));
}

async function decryptSlot(cryptoKey: CryptoKey, slot: VaultSlotCiphertext): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: slot.iv },
    cryptoKey,
    slot.data,
  );
  return new TextDecoder().decode(plaintext);
}

/** Reads several slots in one transaction, so they come from one committed state. */
function readVaultRecords(database: IDBDatabase, keys: readonly string[]): Promise<unknown[]> {
  return new Promise<unknown[]>((resolve, reject) => {
    const transaction = database.transaction("entries", "readonly");
    const store = transaction.objectStore("entries");
    const results: unknown[] = [];
    keys.forEach((key, index) => {
      const request = store.get(key);
      request.onsuccess = () => {
        try {
          results[index] = request.result;
        } catch (error) {
          // A throwing WebKit result getter is a failed read, never a miss.
          reject(error);
          transaction.abort();
        }
      };
    });
    transaction.oncomplete = () => resolve(results);
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Unable to read the token vault."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Unable to read the token vault."));
  });
}

/**
 * Reads a subject's refresh grant, and the bearer committed with it, straight
 * from the shared vault, bypassing this realm's caches: another window or tab
 * may have rotated either since this realm loaded them.
 */
export async function readSharedCredential(
  subject: RefreshSubject,
  bearerConnectionKey?: string,
): Promise<SharedCredentialRead> {
  if (!vaultAvailable()) return { status: "unavailable" };
  try {
    const database = await openRefreshVaultDatabase();
    const [keyRecord, grantRecord, bearerRecord] = await readVaultRecords(database, [
      "cryptoKey",
      refreshSubjectVaultKey(subject),
      ...(bearerConnectionKey !== undefined ? [desktopTokenVaultKey(bearerConnectionKey)] : []),
    ]);
    const cryptoKey = (keyRecord as { cryptoKey?: CryptoKey } | undefined)?.cryptoKey;
    if (!cryptoKey) return { status: "unavailable" };
    const refreshSlot = slotCiphertext(grantRecord);
    const bearerSlot = slotCiphertext(bearerRecord);
    return {
      status: "ok",
      refreshToken: refreshSlot ? await decryptSlot(cryptoKey, refreshSlot) : undefined,
      accessToken: bearerSlot ? await decryptSlot(cryptoKey, bearerSlot) : undefined,
      refreshSlot,
    };
  } catch (error) {
    console.warn("[remoteServers] unable to read the shared credential", error);
    return { status: "failed" };
  }
}

/**
 * Compare-and-set for one subject: writes the rotated grant (or removes it)
 * and the bearer issued with it in ONE transaction, and only while the grant
 * slot still holds the exact ciphertext the caller read. A re-pair, a removal
 * or another realm's commit in between is a conflict that writes nothing.
 */
export function commitSharedCredential(input: {
  readonly subject: RefreshSubject;
  readonly expected: VaultSlotCiphertext | null;
  readonly refreshToken: string | undefined;
  readonly bearer?: { readonly connectionKey: string; readonly accessToken: string };
  readonly isCurrent: () => boolean;
}): Promise<SharedCredentialCommit> {
  return enqueueRefreshSlotWrite(input.subject, async (): Promise<SharedCredentialCommit> => {
    if (!input.isCurrent()) return "conflict";
    if (!vaultAvailable()) return "unavailable";
    try {
      const cryptoKey = await vaultCryptoKey();
      const grant =
        input.refreshToken === undefined
          ? null
          : await encryptWithKey(cryptoKey, input.refreshToken);
      const bearer = input.bearer
        ? await encryptWithKey(cryptoKey, input.bearer.accessToken)
        : null;
      const database = await openRefreshVaultDatabase();
      const grantKey = refreshSubjectVaultKey(input.subject);
      if (!input.isCurrent()) return "conflict";
      return await new Promise<SharedCredentialCommit>((resolve) => {
        const transaction = database.transaction("entries", "readwrite");
        const store = transaction.objectStore("entries");
        let conflict = false;
        const read = store.get(grantKey);
        read.onsuccess = () => {
          let stored: VaultSlotCiphertext | null;
          try {
            stored = slotCiphertext(read.result);
          } catch {
            transaction.abort();
            return;
          }
          if (!input.isCurrent() || !sameCiphertext(stored, input.expected)) {
            conflict = true;
            transaction.abort();
            return;
          }
          if (grant) store.put({ key: grantKey, iv: grant.iv, data: grant.data });
          else store.delete(grantKey);
          if (input.bearer && bearer) {
            store.put({
              key: desktopTokenVaultKey(input.bearer.connectionKey),
              iv: bearer.iv,
              data: bearer.data,
            });
          }
        };
        transaction.oncomplete = () => {
          observedRefreshSlots.set(grantKey, grant);
          resolve("committed");
        };
        transaction.onabort = () => resolve(conflict ? "conflict" : "failed");
      });
    } catch (error) {
      console.warn("[remoteServers] unable to commit the shared credential", error);
      return "failed";
    }
  });
}

/** Retire a legacy remote-environment slot after a strict successful write. */
async function deleteLegacyRemoteEnvironmentSlot(
  subject: RemoteEnvironmentGrantSubject,
): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    await deleteRefreshVaultRecord(legacyRemoteEnvironmentVaultKey(subject));
  } catch (error) {
    // Retryable: the next hydration retires it again; the new slot wins.
    console.warn("[remoteServers] unable to delete the legacy refresh grant", error);
  }
}

export interface RefreshHydrationPlan {
  /** New-root subjects to load into the synchronous map. */
  readonly subjects: readonly RefreshSubject[];
  /**
   * Persisted remote-environment subjects that may still hold a
   * pre-correction grant at `refresh.environment.<parent>.<envId>`.
   */
  readonly legacyRemoteEnvironmentSubjects?: readonly RemoteEnvironmentGrantSubject[];
  /**
   * Connection ids of every persisted direct/ssh record. A direct id equal to
   * `environment.<parent>.<envId>` shares the legacy slot, so migration must
   * preserve the direct grant and require environment repair instead of
   * copying one bearer into two authorities.
   */
  readonly directConnectionIds?: ReadonlySet<string>;
}

/** Loads persisted refresh tokens into the synchronous in-memory map. */
export async function hydrateRefreshTokens(plan: RefreshHydrationPlan): Promise<void> {
  const directConnectionIds = plan.directConnectionIds ?? new Set<string>();
  await Promise.all(
    plan.subjects.map(async (subject) => {
      if (refreshTokensBySubject.has(refreshSubjectVaultKey(subject))) return;
      const token = await readRefreshVaultRecord(refreshSubjectVaultKey(subject));
      if (token) refreshTokensBySubject.set(refreshSubjectVaultKey(subject), token);
    }),
  );
  await Promise.all(
    (plan.legacyRemoteEnvironmentSubjects ?? []).map(async (subject) => {
      if (directConnectionIds.has(legacyRemoteEnvironmentDirectAlias(subject))) {
        // The legacy slot may be a direct record's own grant: never copy it
        // into the environment authority and never delete the direct grant.
        return;
      }
      const currentKey = refreshSubjectVaultKey(subject);
      const existing =
        refreshTokensBySubject.get(currentKey) ?? (await readRefreshVaultRecord(currentKey));
      if (existing) {
        refreshTokensBySubject.set(currentKey, existing);
        await deleteLegacyRemoteEnvironmentSlot(subject);
        return;
      }
      const legacy = await readRefreshVaultRecord(legacyRemoteEnvironmentVaultKey(subject));
      if (!legacy) return;
      const migrated = await writeRefreshTokenToVault(subject, legacy);
      if (!migrated) return; // Retryable: legacy stays until a strict write lands.
      refreshTokensBySubject.set(currentKey, legacy);
      await deleteLegacyRemoteEnvironmentSlot(subject);
    }),
  );
}
