import { remoteThreadId } from "@/renderer/state/remoteProjection";
import type { Thread } from "@/shared/contracts";
import { remoteThreadSnapshotSchema, type RemoteThreadSnapshot } from "@/shared/remote";
import { readCachedBrowserThreadSnapshot } from "./offlineThreadCache";

/** A provisional browser tail; the live host remains authoritative on reconnect. */
export async function readBrowserRuntimeHydrationCache(
  owner: Thread | undefined,
): Promise<RemoteThreadSnapshot | null> {
  if (
    !owner?.remoteServerId ||
    !owner.remoteId ||
    remoteThreadId(owner.remoteServerId, owner.remoteId) !== owner.id
  )
    return null;
  const cached = await readCachedBrowserThreadSnapshot(owner.id);
  const parsed = remoteThreadSnapshotSchema.safeParse(cached);
  if (!parsed.success) return null;
  const snapshot = parsed.data;
  if (
    snapshot.thread.id !== owner.id ||
    (snapshot.thread.remoteServerId !== undefined &&
      snapshot.thread.remoteServerId !== owner.remoteServerId) ||
    (snapshot.thread.remoteId !== undefined && snapshot.thread.remoteId !== owner.remoteId)
  )
    return null;
  // Older valid rows may omit projection metadata; the exact view key already owns it.
  return {
    ...snapshot,
    thread: { ...snapshot.thread, remoteServerId: owner.remoteServerId, remoteId: owner.remoteId },
  };
}

/** Cached metadata is provisional and never requires an offline host round trip. */
export function browserRuntimeHydrationResults(snapshot: RemoteThreadSnapshot) {
  return [
    {
      status: "fulfilled",
      value: { items: snapshot.runtimeItems, nextCursor: snapshot.runtimeNextCursor ?? null },
    },
    { status: "fulfilled", value: snapshot.completedTurns },
    { status: "fulfilled", value: snapshot.contextUsage },
    {
      status: "fulfilled",
      value: snapshot.runtimeItems.findLast((item) => item.type === "goal") ?? null,
    },
  ] as const;
}
