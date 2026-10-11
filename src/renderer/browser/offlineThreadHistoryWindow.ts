import type { PersistedRuntimeItem } from "@/shared/ipc";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { estimateCacheValueBytes } from "@/renderer/state/browserMetadataCacheProjection";
import { MAX_INACTIVE_THREAD_ESTIMATED_BYTES } from "@/renderer/state/inactiveRuntimeRetention";

/** Preserve only an older prefix proved by the incoming tail's first raw row. */
export function mergeCachedThreadSnapshot(
  current: RemoteThreadSnapshot | null,
  incoming: RemoteThreadSnapshot,
): RemoteThreadSnapshot {
  if (!current || current.thread.id !== incoming.thread.id) return incoming;
  // Live sync rejects stale snapshots. Persisted sequence numbers cannot be
  // compared across host incarnations, which can restart their event counter.
  if (incoming.runtimeNextCursor == null || incoming.runtimeItems[0]?.type === "goal") {
    return incoming;
  }
  const first = incoming.runtimeItems[0];
  const overlap = first ? current.runtimeItems.findIndex((item) => item.id === first.id) : -1;
  if (overlap <= 0) return incoming;
  const incomingIds = new Set(incoming.runtimeItems.map((item) => item.id));
  const runtimeItems = [
    ...current.runtimeItems.slice(0, overlap).filter((item) => !incomingIds.has(item.id)),
    ...incoming.runtimeItems,
  ];
  if (estimateCacheValueBytes(runtimeItems) > MAX_INACTIVE_THREAD_ESTIMATED_BYTES) return incoming;
  return { ...incoming, runtimeItems, runtimeNextCursor: current.runtimeNextCursor ?? null };
}

/** Raw pages stay replayable offline; UI summary compaction is a separate projection. */
export function prependCachedRuntimePage(
  current: RemoteThreadSnapshot | null,
  page: {
    readonly beforePosition: number;
    readonly nextCursor: number | null;
    readonly items: readonly PersistedRuntimeItem[];
    /** Exact raw row located by a rebased reader; never a scan-cursor guess. */
    readonly boundaryItemId?: string;
  },
): RemoteThreadSnapshot | null {
  if (!current) return null;
  if (
    page.nextCursor !== null &&
    (!Number.isSafeInteger(page.nextCursor) ||
      page.nextCursor < 0 ||
      page.nextCursor >= page.beforePosition)
  )
    return null;
  const firstOrdinary = current.runtimeItems.findIndex((item) => item.type !== "goal");
  const leadingCount = firstOrdinary < 0 ? current.runtimeItems.length : firstOrdinary;
  let pageItems = page.items;
  if (page.boundaryItemId !== undefined) {
    const boundaryIndex = page.items.findIndex((item) => item.id === page.boundaryItemId);
    if (current.runtimeItems[firstOrdinary]?.id !== page.boundaryItemId || boundaryIndex < 0)
      return null;
    pageItems = page.items.slice(0, boundaryIndex);
  } else if (current.runtimeNextCursor !== page.beforePosition) {
    return null;
  }
  const pageIds = new Set(pageItems.map((item) => item.id));
  const detachedGoals = current.runtimeItems
    .slice(0, leadingCount)
    .filter((item) => !pageIds.has(item.id));
  const tail = current.runtimeItems.slice(leadingCount);
  const ids = new Set(tail.map((item) => item.id));
  const prefix = pageItems.filter((item) => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
  // A globally pinned goal stays detached until its canonical page locates it.
  const runtimeItems = [...detachedGoals, ...prefix, ...tail];
  if (estimateCacheValueBytes(runtimeItems) > MAX_INACTIVE_THREAD_ESTIMATED_BYTES) return null;
  return { ...current, runtimeItems, runtimeNextCursor: page.nextCursor };
}
