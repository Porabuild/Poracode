import type { PersistedPromptIndex } from "@/shared/ipc";
import { estimateCacheValueBytes } from "./browserMetadataCacheProjection";

interface Entry {
  readonly owner: unknown;
  readonly promise: Promise<PersistedPromptIndex | null>;
  index?: PersistedPromptIndex;
  bytes: number;
  stale: boolean;
  refreshing: boolean;
}

// Document-local projections only: no persisted format or protocol changes.
// Pane unmounts retain successful reads and let an in-flight read finish.
const entries = new Map<string, Entry>();
const MAX_ENTRIES = 32;
const MAX_BYTES = 4 * 1024 * 1024;

export function cachedThreadPromptIndex(threadId: string, owner: unknown) {
  const entry = entries.get(threadId);
  if (!entry || entry.owner !== owner) return undefined;
  entries.delete(threadId);
  entries.set(threadId, entry);
  return entry.index;
}

export function forgetThreadPromptIndex(threadId: string): void {
  entries.delete(threadId);
}

/**
 * Soft invalidation: the transcript's coverage changed but the host's history
 * did not (a baseline install or a reset that keeps the transcript). A hard
 * reset, rollback or eviction calls `forgetThreadPromptIndex` instead.
 */
export function invalidateThreadPromptIndex(threadId: string): void {
  const entry = entries.get(threadId);
  // A first read still in flight has no outline to go stale, and its result
  // stays valid: loaded rows are authoritative and the index only fills the
  // older unloaded prefix. Discarding it would only cost the pane a retry.
  if (!entry?.index) return;
  // Retire an in-flight refresh while retaining the outline for its re-read.
  entries.set(threadId, { ...entry, stale: true, refreshing: false });
}

export function threadPromptIndexNeedsRefresh(threadId: string, owner: unknown): boolean {
  const entry = entries.get(threadId);
  return entry !== undefined && entry.owner === owner && entry.stale;
}

export function loadThreadPromptIndex(
  threadId: string,
  owner: unknown,
  read: () => Promise<PersistedPromptIndex | null>,
  isCurrent: () => boolean,
): Promise<PersistedPromptIndex | null> {
  const existing = entries.get(threadId);
  if (existing && existing.owner === owner && (!existing.stale || existing.refreshing)) {
    entries.delete(threadId);
    entries.set(threadId, existing);
    return existing.promise;
  }
  const retained = existing?.owner === owner ? existing : undefined;
  const entry: Entry = {
    owner,
    ...(retained?.index ? { index: retained.index } : {}),
    bytes: retained?.bytes ?? 0,
    stale: retained?.stale ?? false,
    refreshing: true,
    promise: Promise.resolve()
      .then(read)
      .then((index) => {
        if (entries.get(threadId) !== entry) return null;
        if (!isCurrent()) {
          entries.delete(threadId);
          return null;
        }
        if (index) {
          entry.index = index;
          entry.bytes = estimateCacheValueBytes(index);
          entry.stale = false;
          boundCache();
        } else if (entry.index) entry.stale = true;
        else entries.delete(threadId);
        entry.refreshing = false;
        return index;
      })
      .catch(() => {
        if (entries.get(threadId) === entry) {
          if (entry.index) {
            entry.stale = true;
            entry.refreshing = false;
          } else entries.delete(threadId);
        }
        return null;
      }),
  };
  entries.set(threadId, entry);
  boundCache();
  return entry.promise;
}

function boundCache(): void {
  let bytes = 0;
  for (const entry of entries.values()) bytes += entry.bytes;
  for (const [threadId, entry] of entries) {
    if (entries.size <= MAX_ENTRIES && bytes <= MAX_BYTES) break;
    entries.delete(threadId);
    bytes -= entry.bytes;
  }
}
