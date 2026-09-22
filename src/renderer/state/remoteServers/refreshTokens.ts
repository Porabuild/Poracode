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

async function readRefreshVaultRecord(vaultKey: string): Promise<string | null> {
  try {
    if (typeof indexedDB === "undefined") return null;
    const cryptoKey = await refreshVaultCryptoKey();
    if (!cryptoKey) return null;
    const database = await openRefreshVaultDatabase();
    const record = await new Promise<
      { iv?: Uint8Array<ArrayBuffer>; data?: ArrayBuffer } | undefined
    >((resolve, reject) => {
      const transaction = database.transaction("entries", "readonly");
      const request = transaction.objectStore("entries").get(vaultKey);
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

async function encryptRefreshToken(
  token: string,
): Promise<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer } | null> {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") return null;
  const cryptoKey = await refreshVaultCryptoKey();
  if (!cryptoKey) return null;
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
}

async function deleteRefreshVaultRecord(vaultKey: string): Promise<void> {
  const database = await openRefreshVaultDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("entries", "readwrite");
    transaction.objectStore("entries").delete(vaultKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Vault delete failed."));
  });
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
