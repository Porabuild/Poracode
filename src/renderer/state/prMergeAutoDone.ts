import { isThreadTurnActive, type PrData, type Thread } from "@/shared/contracts";
import { markThreadDone } from "@/renderer/actions/threadActions";
import { useAppStore } from "./appStore";
import { buildBranchNamePrKey, buildBranchPrKey } from "./gitSelectors";
import { useGitStore } from "./gitStore";
import { syncMergedPrBase } from "./prMergeBaseSync";
import { useSharedSettings } from "./sharedSettingsStore";

/**
 * Renderer-side fallback for legacy `gitStore` PR polls while a desktop window
 * is mounted. PR Watch merges and host `GitStateService` transitions are owned
 * by `PrMergeLifecycleService` on the host so zero-window tray and headless
 * hosts handle them identically; this listener only catches non-watched PRs
 * polled exclusively by the renderer's legacy `gitRefresh` loop.
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
    unsubscribeGit();
    unsubscribeThreads();
    pendingThreadIds.clear();
  };
}
