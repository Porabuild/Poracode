import DexieDatabase, { type EntityTable } from "dexie";
import type { ThreadStatus } from "@/shared/contracts";
import type {
  RemoteAccessScope,
  RemoteEnvironmentDescriptor,
  RemoteShellSnapshot,
  RemoteThreadSnapshot,
} from "@/shared/remote";
import type { SshConnectionConfig } from "@/shared/ssh";
import { deleteDesktopToken, getDesktopToken, setDesktopToken } from "./tokenVault";

export interface StoredDesktop {
  readonly desktopId: string;
  readonly label: string;
  readonly endpoint: string;
  readonly transport?:
    | { readonly kind: "direct" }
    | { readonly kind: "ssh"; readonly connection: SshConnectionConfig };
  readonly appVersion: string;
  /** Host OS of the paired desktop when the server advertises it. */
  readonly platform?: "win32" | "darwin" | "linux";
  readonly accessToken: string;
  readonly tokenExpiresAt: string;
  readonly scopes: RemoteAccessScope[];
  readonly lastSeenSeq: number;
  readonly pairedAt: string;
  readonly updatedAt: string;
  readonly lastConnectedAt?: string;
}

export interface StoredShellSnapshot {
  readonly desktopId: string;
  readonly snapshot: RemoteShellSnapshot;
  readonly updatedAt: string;
}

export interface StoredThreadSnapshot {
  readonly id: string;
  readonly desktopId: string;
  readonly threadId: string;
  readonly snapshot: RemoteThreadSnapshot;
  readonly updatedAt: string;
}

interface StoredPreference {
  readonly key: string;
  readonly value: string;
}

class PoracodeMobileDatabase extends DexieDatabase {
  desktops!: EntityTable<StoredDesktop, "desktopId">;
  shellSnapshots!: EntityTable<StoredShellSnapshot, "desktopId">;
  threadSnapshots!: EntityTable<StoredThreadSnapshot, "id">;
  preferences!: EntityTable<StoredPreference, "key">;

  constructor() {
    super("lightcode-mobile");
    this.version(1).stores({
      desktops: "desktopId, updatedAt, lastConnectedAt",
      shellSnapshots: "desktopId, updatedAt",
      threadSnapshots: "id, desktopId, threadId, updatedAt",
      preferences: "key",
    });
  }
}

export const mobileDb = new PoracodeMobileDatabase();

/**
 * Synchronous localStorage mirror of the active desktop's last shell snapshot.
 * IndexedDB has no sync API, so without this the first paint always renders
 * with empty threads/projects and the header controls pop in once the Dexie
 * read resolves. The mirror is a fast-path seed only — the Dexie row stays the
 * authoritative cache and overwrites the seed as soon as it loads.
 */
const SHELL_MIRROR_KEY = "lightcode-mobile.shellSnapshotMirror";

export function readShellSnapshotMirror(): StoredShellSnapshot | null {
  try {
    const raw = localStorage.getItem(SHELL_MIRROR_KEY);
    return raw ? (JSON.parse(raw) as StoredShellSnapshot) : null;
  } catch {
    return null;
  }
}

function writeShellSnapshotMirror(entry: StoredShellSnapshot): void {
  try {
    localStorage.setItem(SHELL_MIRROR_KEY, JSON.stringify(entry));
  } catch {
    // Quota or serialization failure only loses the fast-path seed.
  }
}

function clearShellSnapshotMirror(desktopId?: string): void {
  try {
    if (desktopId && readShellSnapshotMirror()?.desktopId !== desktopId) return;
    localStorage.removeItem(SHELL_MIRROR_KEY);
  } catch {
    // Ignore — same as write failures.
  }
}

const ACTIVE_DESKTOP_KEY = "activeDesktopId";
/** Stable per-install identity used as the push-registration upsert key. */
const DEVICE_ID_KEY = "pushDeviceId";
export async function getStoredPreference(key: string): Promise<string | null> {
  return (await mobileDb.preferences.get(key))?.value ?? null;
}

export async function setStoredPreference(key: string, value: string): Promise<void> {
  await mobileDb.preferences.put({ key, value });
}

/**
 * Stable identity for this app install, used as the push-registration upsert
 * key so rotating APNs tokens all merge into one desktop-side record. Generated
 * once (a random UUID, well over the protocol's 8-char minimum) and persisted;
 * every later call returns the same value.
 */
let deviceIdPromise: Promise<string> | null = null;

async function createOrReadDeviceId(): Promise<string> {
  const existing = await getStoredPreference(DEVICE_ID_KEY);
  if (existing) return existing;
  const deviceId = crypto.randomUUID();
  await setStoredPreference(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function getOrCreateDeviceId(): Promise<string> {
  // Memoize the in-flight promise so concurrent first-run callers (push
  // registration + a settings read) share ONE generate-and-persist instead of
  // each minting a different UUID via a check-then-act race. `??=` runs
  // synchronously (no await between check and assign), so the race can't slip
  // through. Cleared on failure so a transient error doesn't wedge it.
  deviceIdPromise ??= createOrReadDeviceId().catch((error: unknown) => {
    deviceIdPromise = null;
    throw error;
  });
  return deviceIdPromise;
}

/**
 * Return a desktop row with its `accessToken` populated for consumers.
 *
 * The token lives in {@link import("./tokenVault")} (the OS keystore on
 * native, a WebCrypto-encrypted Dexie vault on web) and the row here holds an
 * empty `accessToken` once it has been moved there, so it is rehydrated from
 * the vault on read. Two extra cases:
 *  - Lazy migration: a legacy row still carrying a plaintext token (paired
 *    before the vault existed for this platform) is moved into the vault and
 *    blanked on first read.
 *  - Graceful degradation: if the vault is unavailable or the read fails, the
 *    row is returned as-is (plaintext if it never migrated, empty if it did
 *    but the vault can't be reached) rather than throwing — the user re-pairs
 *    instead of the app breaking.
 */
async function hydrateDesktopToken(row: StoredDesktop): Promise<StoredDesktop> {
  if (row.accessToken) {
    // Legacy plaintext row: migrate it into the vault, then blank the row.
    const migrated = await setDesktopToken(row.desktopId, row.accessToken);
    if (migrated) await mobileDb.desktops.put({ ...row, accessToken: "" });
    return row;
  }
  const token = await getDesktopToken(row.desktopId);
  return token ? { ...row, accessToken: token } : row;
}

export async function listStoredDesktops(): Promise<StoredDesktop[]> {
  const rows = await mobileDb.desktops.orderBy("updatedAt").reverse().toArray();
  return await Promise.all(rows.map((row) => hydrateDesktopToken(row)));
}

export async function getActiveDesktopId(): Promise<string | null> {
  return (await mobileDb.preferences.get(ACTIVE_DESKTOP_KEY))?.value ?? null;
}

export async function setActiveDesktopId(desktopId: string): Promise<void> {
  // The mirror must only ever seed the active desktop's data; drop it when the
  // selection moves elsewhere so the next boot can't flash another desktop's
  // threads. The next saveShellSnapshot for the new desktop repopulates it.
  const mirror = readShellSnapshotMirror();
  if (mirror && mirror.desktopId !== desktopId) clearShellSnapshotMirror();
  await mobileDb.preferences.put({ key: ACTIVE_DESKTOP_KEY, value: desktopId });
}

export async function getStoredShellSnapshot(
  desktopId: string,
): Promise<StoredShellSnapshot | undefined> {
  return await mobileDb.shellSnapshots.get(desktopId);
}

export async function getStoredThreadSnapshot(
  desktopId: string,
  threadId: string,
): Promise<StoredThreadSnapshot | undefined> {
  return await mobileDb.threadSnapshots.get(threadSnapshotKey(desktopId, threadId));
}

export async function saveShellSnapshot(
  desktopId: string,
  snapshot: RemoteShellSnapshot,
): Promise<void> {
  const entry: StoredShellSnapshot = {
    desktopId,
    snapshot,
    updatedAt: new Date().toISOString(),
  };
  await mobileDb.shellSnapshots.put(entry);
  writeShellSnapshotMirror(entry);
  await pruneOrphanThreadSnapshots(desktopId, snapshot);
}

/**
 * Drop cached thread snapshots for threads that no longer exist on the desktop.
 * Without this, `threadSnapshots` rows for deleted threads accumulate forever
 * (only {@link forgetDesktop} ever deletes them), eventually hitting the mobile
 * IndexedDB quota and failing Dexie writes — which flips the PWA offline.
 *
 * Threads absent from the fresh shell snapshot are gone from the desktop, so
 * their cache is safe to prune. The currently-open thread is always in the
 * snapshot's thread list, so this never drops the row we're actively reading.
 */
/**
 * Pure selection of the cached-thread rows to prune: any row whose thread is
 * absent from the fresh shell snapshot. Extracted so the prune decision is unit
 * testable without an IndexedDB backend (Dexie is exercised by the wrapper).
 */
export function selectOrphanThreadSnapshotIds(
  rows: ReadonlyArray<{ readonly id: string; readonly threadId: string }>,
  snapshot: RemoteShellSnapshot,
): string[] {
  const liveThreadIds = new Set(snapshot.threads.map((thread) => thread.id));
  return rows.filter((row) => !liveThreadIds.has(row.threadId)).map((row) => row.id);
}

async function pruneOrphanThreadSnapshots(
  desktopId: string,
  snapshot: RemoteShellSnapshot,
): Promise<void> {
  // Only the primary keys are needed to decide what to prune, so avoid loading
  // every cached snapshot blob. The key is `${desktopId}:${threadId}`, so the
  // threadId is the suffix after the desktopId prefix.
  const ids = await mobileDb.threadSnapshots.where("desktopId").equals(desktopId).primaryKeys();
  const prefixLength = desktopId.length + 1;
  const rows = ids.map((id) => ({ id, threadId: id.slice(prefixLength) }));
  const orphanIds = selectOrphanThreadSnapshotIds(rows, snapshot);
  if (orphanIds.length > 0) {
    await mobileDb.threadSnapshots.bulkDelete(orphanIds);
  }
}

/**
 * Minimum spacing between full-transcript writes for a thread that is still
 * actively streaming ("working"). During a run the transcript blob is re-fetched
 * and rewritten on every ~1s debounced refresh; throttling those writes avoids
 * hammering Dexie/IndexedDB with near-duplicate blobs.
 */
export const THREAD_SNAPSHOT_THROTTLE_MS = 5000;

/**
 * Decide whether the open thread's transcript snapshot should be persisted now.
 *
 * Only an actively-streaming ("working") thread rewrites its full transcript on
 * every refresh, so those writes are throttled to at most once per
 * {@link THREAD_SNAPSHOT_THROTTLE_MS}. Every other status — including the
 * post-run settle states (`idle`, `finished`, `error`) and the paused
 * mid-turn states (`needs_approval`, `needs_reply`) — persists immediately, so
 * the final snapshot after a run ends and any paused state are always cached.
 *
 * `now` is injected so the predicate stays deterministic under test.
 */
export function shouldPersistThreadSnapshot(
  status: ThreadStatus,
  lastSavedAt: number | undefined,
  now: number,
): boolean {
  if (status !== "working") return true;
  if (lastSavedAt === undefined) return true;
  return now - lastSavedAt >= THREAD_SNAPSHOT_THROTTLE_MS;
}

export async function saveThreadSnapshot(
  desktopId: string,
  threadId: string,
  snapshot: RemoteThreadSnapshot,
): Promise<void> {
  await mobileDb.threadSnapshots.put({
    id: threadSnapshotKey(desktopId, threadId),
    desktopId,
    threadId,
    snapshot,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveDesktop(input: {
  readonly descriptor: RemoteEnvironmentDescriptor;
  /** Endpoint that actually succeeded during pairing. May be relay-mounted. */
  readonly endpoint: string;
  readonly accessToken: string;
  readonly tokenExpiresAt: string;
  readonly scopes: RemoteAccessScope[];
  readonly transport?: StoredDesktop["transport"];
}): Promise<StoredDesktop> {
  const now = new Date().toISOString();
  // Keep the bearer token in the secure vault (OS keystore on native,
  // WebCrypto-encrypted Dexie on web) and blank the Dexie row. If the vault
  // write fails, leave the token in the row so pairing is not silently
  // broken. The returned object always carries the live token so the caller
  // can connect immediately without a vault round-trip. Done BEFORE the Dexie
  // transaction so the row read-modify-write below is atomic (the vault is a
  // separate, non-Dexie store).
  const persistedToVault = await setDesktopToken(input.descriptor.desktopId, input.accessToken);
  let desktop!: StoredDesktop;
  // Read existing + write in one rw transaction so a concurrent
  // markDesktopConnected can't slip a lastSeenSeq/lastConnectedAt update between
  // our get and put and then be silently clobbered by the stale read.
  await mobileDb.transaction("rw", mobileDb.desktops, async () => {
    const existing = await mobileDb.desktops.get(input.descriptor.desktopId);
    desktop = {
      desktopId: input.descriptor.desktopId,
      label: input.descriptor.label,
      endpoint: input.endpoint,
      ...(input.transport
        ? { transport: input.transport }
        : { transport: { kind: "direct" } as const }),
      appVersion: input.descriptor.appVersion,
      ...(input.descriptor.platform ? { platform: input.descriptor.platform } : {}),
      accessToken: input.accessToken,
      tokenExpiresAt: input.tokenExpiresAt,
      scopes: input.scopes,
      lastSeenSeq: existing?.lastSeenSeq ?? 0,
      pairedAt: existing?.pairedAt ?? now,
      updatedAt: now,
      lastConnectedAt: now,
    };
    await mobileDb.desktops.put(persistedToVault ? { ...desktop, accessToken: "" } : desktop);
  });
  await setActiveDesktopId(desktop.desktopId);
  return desktop;
}

export async function updateDesktopEndpoint(desktopId: string, endpoint: string): Promise<void> {
  await mobileDb.transaction("rw", mobileDb.desktops, async () => {
    const existing = await mobileDb.desktops.get(desktopId);
    if (!existing || existing.endpoint === endpoint) return;
    await mobileDb.desktops.put({ ...existing, endpoint });
  });
}

/**
 * Give a paired desktop a local nickname. The label lives only on this device
 * (like {@link forgetDesktop}); it never touches the desktop's own identity.
 * `updatedAt` is left untouched so renaming doesn't reorder the desktop list.
 */
export async function renameDesktop(desktopId: string, label: string): Promise<void> {
  await mobileDb.transaction("rw", mobileDb.desktops, async () => {
    const existing = await mobileDb.desktops.get(desktopId);
    if (!existing) return;
    await mobileDb.desktops.put({ ...existing, label });
  });
}

/** Persist the host OS advertised by the paired desktop (for host-gated UI). */
export async function updateDesktopPlatform(
  desktopId: string,
  platform: "win32" | "darwin" | "linux",
): Promise<void> {
  await mobileDb.transaction("rw", mobileDb.desktops, async () => {
    const existing = await mobileDb.desktops.get(desktopId);
    if (!existing || existing.platform === platform) return;
    await mobileDb.desktops.put({ ...existing, platform });
  });
}

export async function markDesktopConnected(desktopId: string, seq?: number): Promise<void> {
  await mobileDb.transaction("rw", mobileDb.desktops, async () => {
    const existing = await mobileDb.desktops.get(desktopId);
    if (!existing) return;
    const now = new Date().toISOString();
    await mobileDb.desktops.put({
      ...existing,
      // Monotonic: an out-of-order/lagging seq (overlapping refreshes, replayed
      // catch-up) must never move the resume high-water mark backwards.
      ...(seq === undefined ? {} : { lastSeenSeq: Math.max(existing.lastSeenSeq, seq) }),
      lastConnectedAt: now,
      updatedAt: now,
    });
  });
}

export async function forgetDesktop(desktopId: string): Promise<void> {
  await mobileDb.transaction(
    "rw",
    mobileDb.desktops,
    mobileDb.shellSnapshots,
    mobileDb.threadSnapshots,
    mobileDb.preferences,
    async () => {
      await mobileDb.desktops.delete(desktopId);
      await mobileDb.shellSnapshots.delete(desktopId);
      clearShellSnapshotMirror(desktopId);
      const snapshotIds = await mobileDb.threadSnapshots
        .where("desktopId")
        .equals(desktopId)
        .primaryKeys();
      await mobileDb.threadSnapshots.bulkDelete(snapshotIds);
      const active = await getActiveDesktopId();
      if (active === desktopId) {
        await mobileDb.preferences.delete(ACTIVE_DESKTOP_KEY);
      }
    },
  );
  // Drop the vault entry too (best-effort). Done outside the Dexie transaction
  // since the vault is a separate, non-Dexie store.
  await deleteDesktopToken(desktopId);
}

function threadSnapshotKey(desktopId: string, threadId: string): string {
  return `${desktopId}:${threadId}`;
}
