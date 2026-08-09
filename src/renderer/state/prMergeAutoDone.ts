import { isThreadTurnActive, type PrData, type Thread } from "@/shared/contracts";
import type { PrWatchMergedEvent } from "@/shared/ipc";
import { markThreadDone } from "@/renderer/actions/threadActions";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "./appStore";
import { buildBranchNamePrKey, buildBranchPrKey } from "./gitSelectors";
import { useGitStore } from "./gitStore";
import { syncMergedPrBase } from "./prMergeBaseSync";
import { useSharedSettings } from "./sharedSettingsStore";

/**
 * Marks worktree threads done when their pull request turns merged.
 *
 * Only observed transitions count: the previous PR snapshot must say the PR was
 * not merged yet. That snapshot survives restarts through the git store's
 * persisted `prData` cache, so a PR merged while Poracode was closed still
 * registers on the next refresh — but once a thread is marked done the snapshot
 * reads "merged" forever after, so un-marking it by hand sticks. Only a PR whose
 * very first snapshot is already merged (no cache, or one older than its TTL) is
 * skipped; the sidebar row keeps a one-click Done button for that case.
 *
 * Threads mid-turn are deferred instead of yanked away; they are marked once
 * the turn settles.
 */

/** Threads whose PR merged while a turn was still running. */
const pendingThreadIds = new Set<string>();

type PrDataMap = Record<string, PrData | null>;

/** PR keys that just went from a known non-merged state to merged. */
function collectFreshlyMerged(
  next: PrDataMap,
  prev: PrDataMap,
): Array<{
  key: string;
  pr: PrData;
}> {
  const merged: Array<{ key: string; pr: PrData }> = [];
  for (const [key, pr] of Object.entries(next)) {
    if (pr?.state !== "merged") continue;
    const before = prev[key];
    if (!before || before.state === "merged") continue;
    merged.push({ key, pr });
  }
  return merged;
}

function syncObservedBases(merged: ReadonlyArray<{ key: string; pr: PrData }>): void {
  const { projects, threads } = useAppStore.getState();
  for (const item of merged) {
    const thread = threads.find((candidate) => candidate.worktreePath === item.key);
    const projectId =
      thread?.projectId ??
      projects.find(
        (project) =>
          item.key === buildBranchPrKey(project.id) ||
          item.key.startsWith(`${buildBranchNamePrKey(project.id, "")}`),
      )?.id;
    if (projectId) void syncMergedPrBase(projectId, item.pr);
  }
}

function syncPrWatchBase(merged: PrWatchMergedEvent): void {
  if (!merged.worktreePath) return;
  const prData = useGitStore.getState().prData[merged.worktreePath];
  if (prData?.number === merged.prNumber) void syncMergedPrBase(merged.projectId, prData);
}

/**
 * The single "is this thread ready to be marked done" rule: skip what is
 * already settled, hold anything mid-turn for the next pass, mark the rest.
 */
function settleThread(thread: Thread | undefined): void {
  if (!thread || thread.done || thread.archived) {
    if (thread) pendingThreadIds.delete(thread.id);
    return;
  }
  if (isThreadTurnActive(thread.status)) {
    pendingThreadIds.add(thread.id);
    return;
  }
  // Drop before marking: `markThreadDone` writes to the app store, which
  // re-enters the thread listener below.
  pendingThreadIds.delete(thread.id);
  markThreadDone(thread.id);
}

function settleWorktreeThreads(prKeys: ReadonlySet<string>): void {
  for (const thread of useAppStore.getState().threads) {
    if (thread.worktreePath && prKeys.has(thread.worktreePath)) settleThread(thread);
  }
}

function settlePrWatchThreads(merged: PrWatchMergedEvent): void {
  for (const thread of useAppStore.getState().threads) {
    if (
      thread.worktreePath &&
      (thread.worktreePath === merged.worktreePath ||
        (thread.projectId === merged.projectId && thread.prNumber === merged.prNumber))
    ) {
      settleThread(thread);
    }
  }
}

function flushPendingThreads(): void {
  const threads = useAppStore.getState().threads;
  for (const threadId of [...pendingThreadIds]) {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) {
      pendingThreadIds.delete(threadId);
      continue;
    }
    settleThread(thread);
  }
}

/** Starts the watcher. Runtime-owner only, so a remote session never duplicates it. */
export function startPrMergeAutoDone(): () => void {
  const unsubscribePrWatchMerged = readBridge().onPrWatchMerged((merged) => {
    syncPrWatchBase(merged);
    if (!useSharedSettings.getState().autoMarkDoneOnPrMerge) return;
    settlePrWatchThreads(merged);
  });

  const unsubscribeGit = useGitStore.subscribe((state, prev) => {
    if (state.prData === prev.prData) return;
    const merged = collectFreshlyMerged(state.prData, prev.prData);
    if (merged.length === 0) return;
    syncObservedBases(merged);
    if (!useSharedSettings.getState().autoMarkDoneOnPrMerge) return;
    settleWorktreeThreads(new Set(merged.map((item) => item.key)));
  });

  const unsubscribeThreads = useAppStore.subscribe((state, prev) => {
    if (pendingThreadIds.size === 0 || state.threads === prev.threads) return;
    if (!useSharedSettings.getState().autoMarkDoneOnPrMerge) {
      pendingThreadIds.clear();
      return;
    }
    flushPendingThreads();
  });

  return () => {
    unsubscribePrWatchMerged();
    unsubscribeGit();
    unsubscribeThreads();
    pendingThreadIds.clear();
  };
}
