import { isRemoteThreadNotFoundError } from "@/shared/remote/client";
import { useAppStore } from "./appStore";

/**
 * Whether a thread's first history read failed only because its host has not
 * created the thread yet. A launch registers the thread under its final id
 * while the host is still starting it (or provisioning its worktree), so the
 * pane's first read can reach the host before the start does and answer
 * `thread_not_found`. That is an empty history, not a load
 * failure. Any other refusal, or a thread that is no longer launching, is a
 * real failure.
 */
export function isHistoryReadBeforeHostCreation(
  threadId: string,
  results: readonly PromiseSettledResult<unknown>[],
): boolean {
  const rejected = results.filter((result) => result.status === "rejected");
  if (rejected.length === 0) return false;
  if (!rejected.every((result) => isRemoteThreadNotFoundError(result.reason))) return false;
  const state = useAppStore.getState();
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  if (!thread) return false;
  return thread.status === "launching" || state.provisioningWorktreeThreadIds[threadId] === true;
}
