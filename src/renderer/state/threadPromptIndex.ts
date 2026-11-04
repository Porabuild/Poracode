import type { PersistedPromptIndex } from "@/shared/ipc";
import { readBridge } from "../bridge";
import { getRemoteBridgeClient } from "../browser/remoteBridge";
import { useAppStore } from "./appStore";
import { entityHost, type EntityHost } from "./entityHost";
import { getThreadMap } from "./useThread";
import {
  cachedThreadPromptIndex,
  loadThreadPromptIndex,
  threadPromptIndexNeedsRefresh,
} from "./threadPromptIndexCache";

function promptIndexHost(threadId: string): EntityHost | undefined {
  return entityHost(getThreadMap(useAppStore.getState().threads).get(threadId) ?? { id: threadId });
}

/** The connection a cached index was read through; a reconnect invalidates it. */
export function threadPromptIndexOwner(threadId: string): unknown {
  return promptIndexHost(threadId)?.sessionKey ?? getRemoteBridgeClient() ?? readBridge();
}

export function readCachedThreadPromptIndex(threadId: string): PersistedPromptIndex | undefined {
  return cachedThreadPromptIndex(threadId, threadPromptIndexOwner(threadId));
}

export function shouldRefreshThreadPromptIndex(threadId: string): boolean {
  return threadPromptIndexNeedsRefresh(threadId, threadPromptIndexOwner(threadId));
}

/**
 * The thread's newest prompts without its transcript, from whichever host owns
 * the thread, read through that host's client. Null when no index is available (a host that
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
    async () => {
      const host = promptIndexHost(threadId);
      return host
        ? host.withClient((client) => client.threadPromptIndex(host.hostId))
        : readBridge().dbGetThreadPromptIndex({ threadId });
    },
    () => threadPromptIndexOwner(threadId) === owner,
  );
  return signal?.aborted ? null : index;
}
