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
import { TokenVaultDatabase } from "./tokenVaultDatabase";

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

const refreshVaultDatabase = new TokenVaultDatabase(() => {});

/**
 * Reads one vault record. A throwing `result` getter (WebKit, see
 * `TokenVaultDatabase.request`) rejects instead of escaping `onsuccess`.
 */
function readVaultRecord<T>(key: string): Promise<T | undefined> {
  return refreshVaultDatabase.request("readonly", "read", (store) => store.get(key));
}

async function refreshVaultCryptoKey(): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") return null;
  const record = await readVaultRecord<{ cryptoKey?: CryptoKey }>("cryptoKey");
  return record?.cryptoKey ?? null;
}

/**
 * The grant ciphertext this realm last read or wrote per slot (null = absent).
 * A shared copy that still matches it was not written by another realm since.
 */
const observedRefreshSlots = new Map<string, VaultSlotCiphertext | null>();
/** Failed reads are retryable even when the separate bearer slot restored. */
const failedRefreshReads = new Set<string>();

export function refreshTokenHydrationFailed(subject: RefreshSubject): boolean {
  return failedRefreshReads.has(refreshSubjectVaultKey(subject));
}

async function readRefreshVaultRecord(vaultKey: string): Promise<string | null> {
  try {
    if (typeof indexedDB === "undefined") return null;
    const cryptoKey = await refreshVaultCryptoKey();
    if (!cryptoKey) return null;
    const record = await readVaultRecord<{ iv?: Uint8Array<ArrayBuffer>; data?: ArrayBuffer }>(
      vaultKey,
    );
    observedRefreshSlots.set(vaultKey, slotCiphertext(record));
    if (!record?.iv || !record.data) {
      failedRefreshReads.delete(vaultKey);
      return null;
    }
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: record.iv },
      cryptoKey,
      record.data,
    );
    failedRefreshReads.delete(vaultKey);
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    failedRefreshReads.add(vaultKey);
    console.warn("[remoteServers] unable to read the persisted refresh token", error);
    return null;
  }
}

async function encryptRefreshToken(
  token: string,
): Promise<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer } | null> {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") return null;
  // A grant may be the first vault write; key creation stays owned by
  // tokenVault. Existing key/ciphertext records and slot names remain valid.
  const cryptoKey = (await refreshVaultCryptoKey()) ?? (await vaultCryptoKey());
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

async function updateRefreshVaultRecord(
  vaultKey: string,
  encrypted: VaultSlotCiphertext | null,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const written = await refreshVaultDatabase.transact<boolean>(
    "readwrite",
    "Unable to update the token vault.",
    () => true,
    (store, succeed, fail) => {
      // Recheck once the transaction is active, after older transactions
      // (including a superseding pairing) have committed.
      const read = store.get(vaultKey);
      read.onsuccess = () => {
        if (!isCurrent()) {
          succeed(false);
          return;
        }
        try {
          if (encrypted) store.put({ key: vaultKey, iv: encrypted.iv, data: encrypted.data });
          else store.delete(vaultKey);
          succeed(true);
        } catch (error) {
          fail(error);
        }
      };
    },
  );
  if (written) {
    observedRefreshSlots.set(vaultKey, encrypted);
    failedRefreshReads.delete(vaultKey);
  }
  return written;
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
  refreshWriteEpochs.clear();
  observedRefreshSlots.clear();
  failedRefreshReads.clear();
  refreshVaultDatabase.close();
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
/** A committed re-pair retires every queued mutation from the previous grant. */
const refreshWriteEpochs = new Map<string, symbol>();

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
 * longer owns the subject, including after encryption. Writes are serialized,
 * and a re-pair may supersede a retired incarnation's pending writes.
 */
export function writeRefreshTokenToVault(
  subject: RefreshSubject,
  token: string,
  owner?: symbol,
): Promise<boolean> {
  if (owner && !ownsRefreshSubject(subject, owner)) return Promise.resolve(false);
  const key = refreshSubjectVaultKey(subject);
  const epoch = refreshWriteEpochs.get(key);
  const isCurrent = () =>
    refreshWriteEpochs.get(key) === epoch && (!owner || ownsRefreshSubject(subject, owner));
  return enqueueRefreshSlotWrite(subject, async () => {
    try {
      if (!isCurrent()) return false;
      if (typeof indexedDB === "undefined") return false;
      const encrypted = await encryptRefreshToken(token);
      if (!encrypted) return false;
      return await updateRefreshVaultRecord(key, encrypted, isCurrent);
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
  const key = refreshSubjectVaultKey(subject);
  const epoch = refreshWriteEpochs.get(key);
  refreshTokensBySubject.delete(refreshSubjectVaultKey(subject));
  refreshSubjectOwners.delete(refreshSubjectVaultKey(subject));
  await enqueueRefreshSlotWrite(subject, async () => {
    try {
      if (typeof indexedDB === "undefined") return;
      await updateRefreshVaultRecord(key, null, () => refreshWriteEpochs.get(key) === epoch);
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
function readVaultRecords(keys: readonly string[]): Promise<unknown[]> {
  return refreshVaultDatabase.transact(
    "readonly",
    "Unable to read the token vault.",
    () => true,
    (store, succeed, fail) => {
      const results: unknown[] = [];
      let remaining = keys.length;
      for (const [index, key] of keys.entries()) {
        const request = store.get(key);
        request.onsuccess = () => {
          try {
            results[index] = request.result;
          } catch (error) {
            fail(error);
            return;
          }
          remaining -= 1;
          if (remaining === 0) succeed(results);
        };
      }
    },
  );
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
    const [keyRecord, grantRecord, bearerRecord] = await readVaultRecords([
      "cryptoKey",
      refreshSubjectVaultKey(subject),
      ...(bearerConnectionKey !== undefined ? [desktopTokenVaultKey(bearerConnectionKey)] : []),
    ]);
    const cryptoKey = (keyRecord as { cryptoKey?: CryptoKey } | undefined)?.cryptoKey;
    if (!cryptoKey) return { status: "unavailable" };
    const refreshSlot = slotCiphertext(grantRecord);
    const bearerSlot = slotCiphertext(bearerRecord);
    const credential: SharedCredentialRead = {
      status: "ok",
      refreshToken: refreshSlot ? await decryptSlot(cryptoKey, refreshSlot) : undefined,
      accessToken: bearerSlot ? await decryptSlot(cryptoKey, bearerSlot) : undefined,
      refreshSlot,
    };
    failedRefreshReads.delete(refreshSubjectVaultKey(subject));
    return credential;
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
  /** Only pairing, after retiring the old incarnation: do not wait for its
   * suspended encryption. Its ownership/CAS fences still refuse late writes. */
  readonly supersedePendingWrites?: true;
}): Promise<SharedCredentialCommit> {
  const commit = async (): Promise<SharedCredentialCommit> => {
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
      const grantKey = refreshSubjectVaultKey(input.subject);
      if (!input.isCurrent()) return "conflict";
      const outcome = await refreshVaultDatabase.transact<SharedCredentialCommit>(
        "readwrite",
        "Unable to write the token vault.",
        () => true,
        (store, succeed, fail) => {
          const read = store.get(grantKey);
          read.onsuccess = () => {
            try {
              const stored = slotCiphertext(read.result);
              if (!input.isCurrent() || !sameCiphertext(stored, input.expected)) {
                succeed("conflict");
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
              succeed("committed");
            } catch (error) {
              fail(error);
            }
          };
        },
      );
      if (outcome === "committed") {
        observedRefreshSlots.set(grantKey, grant);
        if (input.supersedePendingWrites) refreshWriteEpochs.set(grantKey, Symbol("pairing"));
      }
      return outcome;
    } catch (error) {
      console.warn("[remoteServers] unable to commit the shared credential", error);
      return "failed";
    }
  };
  if (input.supersedePendingWrites) {
    const result = commit();
    refreshWriteQueues.set(
      refreshSubjectVaultKey(input.subject),
      result.catch(() => undefined),
    );
    return result;
  }
  return enqueueRefreshSlotWrite(input.subject, commit);
}

/** Retire a legacy remote-environment slot after a strict successful write. */
async function deleteLegacyRemoteEnvironmentSlot(
  subject: RemoteEnvironmentGrantSubject,
): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    await updateRefreshVaultRecord(legacyRemoteEnvironmentVaultKey(subject), null);
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
