import type { PersistedPromptIndex } from "@/shared/ipc";
import { estimateCacheValueBytes } from "./browserMetadataCacheProjection";

interface Entry {
  readonly owner: unknown;
  readonly promise: Promise<PersistedPromptIndex | null>;
  index?: PersistedPromptIndex;
  bytes: number;
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

export function loadThreadPromptIndex(
  threadId: string,
  owner: unknown,
  read: () => Promise<PersistedPromptIndex | null>,
  isCurrent: () => boolean,
): Promise<PersistedPromptIndex | null> {
  const existing = entries.get(threadId);
  if (existing && existing.owner === owner) {
    entries.delete(threadId);
    entries.set(threadId, existing);
    return existing.promise;
  }
  const entry: Entry = {
    owner,
    bytes: 0,
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
          boundCache();
        } else entries.delete(threadId);
        return index;
      })
      .catch(() => {
        if (entries.get(threadId) === entry) entries.delete(threadId);
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
