import type { PersistedRuntimeItem } from "@/shared/ipc";
import { useAppStore } from "./appStore";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { boundedClientInvoker } from "./remoteServers/catalog/boundedHistoryRegistry";
import { currentRemoteServerGeneration } from "./remoteServers/eventSocketRegistry";
import { estimateCacheValueBytes } from "./browserMetadataCacheProjection";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import { getThreadMap } from "./useThread";

interface DetailRead {
  readonly source: RuntimeChatItem;
  readonly controller: AbortController;
  readonly promise: Promise<PersistedRuntimeItem>;
  readers: number;
}
const pending = new Map<string, DetailRead>();
const cache = new Map<
  string,
  { source: RuntimeChatItem; item: PersistedRuntimeItem; bytes: number }
>();
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
let cacheBytes = 0;

/** One connection-owned read shared by expanded instances of the same row. */
export function acquireHistoryItemDetails(threadId: string, source: RuntimeChatItem) {
  const owner = getThreadMap(useAppStore.getState().threads).get(threadId);
  const activation = readManagedLoopbackActivation();
  const generation = owner?.remoteServerId
    ? currentRemoteServerGeneration(owner.remoteServerId)
    : activation?.seq;
  const authority = owner?.remoteServerId ?? activation?.authority;
  const key = JSON.stringify([authority, generation, threadId, source.id]);
  const cached = cache.get(key);
  if (cached?.source === source) {
    cache.delete(key);
    cache.set(key, cached);
    return { promise: Promise.resolve(cached.item), release() {} };
  }
  let read = pending.get(key);
  if (!read || read.source !== source || read.controller.signal.aborted) {
    const controller = new AbortController();
    const promise = (async () => {
      let item: PersistedRuntimeItem;
      if (owner?.remoteServerId && owner.remoteId) {
        const invoke = boundedClientInvoker();
        if (!invoke) throw new Error("History detail connection is unavailable.");
        item = await invoke(owner.remoteServerId, (client) =>
          client.threadHistoryItem(owner.remoteId!, source.id, { signal: controller.signal }),
        );
        if (currentRemoteServerGeneration(owner.remoteServerId) !== generation)
          throw new Error("History detail connection changed.");
      } else {
        if (!activation || !owner) throw new Error("History detail owner is unavailable.");
        item = await activation.client.threadHistoryItem(threadId, source.id, {
          signal: controller.signal,
        });
        if (readManagedLoopbackActivation() !== activation)
          throw new Error("History detail connection changed.");
      }
      controller.signal.throwIfAborted();
      const bytes = estimateCacheValueBytes(item);
      if (bytes <= MAX_CACHE_BYTES && pending.get(key)?.source === source) {
        const old = cache.get(key);
        if (old) {
          cacheBytes -= old.bytes;
          cache.delete(key);
        }
        cache.set(key, { source, item, bytes });
        cacheBytes += bytes;
        while (cacheBytes > MAX_CACHE_BYTES || cache.size > 32) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          cacheBytes -= cache.get(oldest)!.bytes;
          cache.delete(oldest);
        }
      }
      return item;
    })().finally(() => {
      if (pending.get(key) === entry) pending.delete(key);
    });
    const entry: DetailRead = { source, controller, readers: 0, promise };
    pending.set(key, entry);
    read = entry;
  }
  read.readers++;
  const entry = read;
  let released = false;
  return {
    promise: entry.promise,
    release() {
      if (released) return;
      released = true;
      if (--entry.readers === 0) entry.controller.abort();
    },
  };
}
