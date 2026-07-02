import DexieDatabase, { type EntityTable } from "dexie";
import type {
  RemoteAccessScope,
  RemoteEnvironmentDescriptor,
  RemoteShellSnapshot,
  RemoteThreadSnapshot,
} from "@/shared/remote";

export interface StoredDesktop {
  readonly desktopId: string;
  readonly label: string;
  readonly endpoint: string;
  readonly appVersion: string;
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

class LightcodeMobileDatabase extends DexieDatabase {
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

export const mobileDb = new LightcodeMobileDatabase();

const ACTIVE_DESKTOP_KEY = "activeDesktopId";

export async function getStoredPreference(key: string): Promise<string | null> {
  return (await mobileDb.preferences.get(key))?.value ?? null;
}

export async function setStoredPreference(key: string, value: string): Promise<void> {
  await mobileDb.preferences.put({ key, value });
}

export async function listStoredDesktops(): Promise<StoredDesktop[]> {
  return await mobileDb.desktops.orderBy("updatedAt").reverse().toArray();
}

export async function getActiveDesktopId(): Promise<string | null> {
  return (await mobileDb.preferences.get(ACTIVE_DESKTOP_KEY))?.value ?? null;
}

export async function setActiveDesktopId(desktopId: string): Promise<void> {
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
  await mobileDb.shellSnapshots.put({
    desktopId,
    snapshot,
    updatedAt: new Date().toISOString(),
  });
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
  const rows = await mobileDb.threadSnapshots.where("desktopId").equals(desktopId).toArray();
  const orphanIds = selectOrphanThreadSnapshotIds(rows, snapshot);
  if (orphanIds.length > 0) {
    await mobileDb.threadSnapshots.bulkDelete(orphanIds);
  }
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
}): Promise<StoredDesktop> {
  const now = new Date().toISOString();
  const existing = await mobileDb.desktops.get(input.descriptor.desktopId);
  const desktop: StoredDesktop = {
    desktopId: input.descriptor.desktopId,
    label: input.descriptor.label,
    endpoint: input.endpoint,
    appVersion: input.descriptor.appVersion,
    accessToken: input.accessToken,
    tokenExpiresAt: input.tokenExpiresAt,
    scopes: input.scopes,
    lastSeenSeq: existing?.lastSeenSeq ?? 0,
    pairedAt: existing?.pairedAt ?? now,
    updatedAt: now,
    lastConnectedAt: now,
  };
  await mobileDb.desktops.put(desktop);
  await setActiveDesktopId(desktop.desktopId);
  return desktop;
}

/**
 * Give a paired desktop a local nickname. The label lives only on this device
 * (like {@link forgetDesktop}); it never touches the desktop's own identity.
 * `updatedAt` is left untouched so renaming doesn't reorder the desktop list.
 */
export async function renameDesktop(desktopId: string, label: string): Promise<void> {
  const existing = await mobileDb.desktops.get(desktopId);
  if (!existing) return;
  await mobileDb.desktops.put({ ...existing, label });
}

export async function markDesktopConnected(desktopId: string, seq?: number): Promise<void> {
  const existing = await mobileDb.desktops.get(desktopId);
  if (!existing) return;
  const now = new Date().toISOString();
  await mobileDb.desktops.put({
    ...existing,
    ...(seq === undefined ? {} : { lastSeenSeq: seq }),
    lastConnectedAt: now,
    updatedAt: now,
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
      const snapshots = await mobileDb.threadSnapshots
        .where("desktopId")
        .equals(desktopId)
        .toArray();
      await mobileDb.threadSnapshots.bulkDelete(snapshots.map((entry) => entry.id));
      const active = await getActiveDesktopId();
      if (active === desktopId) {
        await mobileDb.preferences.delete(ACTIVE_DESKTOP_KEY);
      }
    },
  );
}

function threadSnapshotKey(desktopId: string, threadId: string): string {
  return `${desktopId}:${threadId}`;
}
