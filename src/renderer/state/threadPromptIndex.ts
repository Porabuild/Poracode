import type { PersistedPromptIndex } from "@/shared/ipc";
import { readBridge } from "../bridge";
import {
  isManagedRootHistoryThread,
  readManagedRootPromptIndex,
} from "./managedRootCatalog/rootHistory";

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
  try {
    const index = isManagedRootHistoryThread(threadId)
      ? await readManagedRootPromptIndex(threadId, signal)
      : await readBridge().dbGetThreadPromptIndex({ threadId });
    return signal?.aborted ? null : index;
  } catch {
    return null;
  }
}
