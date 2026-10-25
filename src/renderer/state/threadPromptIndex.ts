import type { PersistedPromptIndex } from "@/shared/ipc";
import { readBridge } from "../bridge";
import { getRemoteBridgeClient } from "../browser/remoteBridge";
import { readManagedLoopbackActivation } from "../hostTransport/loopbackHttpWsTransport";
import { useAppStore } from "./appStore";
import { getThreadMap } from "./useThread";
import { currentRemoteServerGeneration } from "./remoteServers/eventSocketRegistry";
import { cachedThreadPromptIndex, loadThreadPromptIndex } from "./threadPromptIndexCache";
import {
  isManagedRootHistoryThread,
  readManagedRootPromptIndex,
} from "./managedRootCatalog/rootHistory";

export function threadPromptIndexOwner(threadId: string): unknown {
  const thread = getThreadMap(useAppStore.getState().threads).get(threadId);
  if (thread?.remoteServerId)
    return JSON.stringify([
      thread.remoteServerId,
      currentRemoteServerGeneration(thread.remoteServerId),
    ]);
  return readManagedLoopbackActivation() ?? getRemoteBridgeClient() ?? readBridge();
}

export function readCachedThreadPromptIndex(threadId: string): PersistedPromptIndex | undefined {
  return cachedThreadPromptIndex(threadId, threadPromptIndexOwner(threadId));
}

/**
 * The thread's newest prompts without its transcript, from whichever host owns
 * the thread: the managed loopback host for this desktop's own threads, the
 * paired host for remote ones. Null when no index is available (a host that
 * predates the route, a refusal, a transport failure) - callers then work from
 * the transcript they have loaded, which is always correct, only shorter.
 */
export async function readThreadPromptIndex(
  threadId: string,
  signal?: AbortSignal,
): Promise<PersistedPromptIndex | null> {
  if (signal?.aborted) return null;
  const owner = threadPromptIndexOwner(threadId);
  const index = await loadThreadPromptIndex(
    threadId,
    owner,
    async () =>
      isManagedRootHistoryThread(threadId)
        ? readManagedRootPromptIndex(threadId)
        : readBridge().dbGetThreadPromptIndex({ threadId }),
    () => threadPromptIndexOwner(threadId) === owner,
  );
  return signal?.aborted ? null : index;
}
