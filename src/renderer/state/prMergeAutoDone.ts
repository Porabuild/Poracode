import { isThreadTurnActive, type PrData, type Thread } from "@/shared/contracts";
import { markThreadDone } from "@/renderer/actions/threadActions";
import { useAppStore } from "./appStore";
import { buildBranchNamePrKey, buildBranchPrKey } from "./gitSelectors";
import { useGitReadModelStore } from "./gitReadModelStore";
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

/**
 * True when the host's git read model tracks this PR. The host merge lifecycle
 * owns auto-done and base sync for it, so the renderer fallback must not repeat
 * them when the same merge reaches the legacy `gitStore` through the host
 * projection or the PR-watch status sync.
 */
function hostOwnsPr(projectId: string, prNumber: number): boolean {
  for (const entry of Object.values(useGitReadModelStore.getState().pullRequests)) {
    if (entry.ref.projectId === projectId && entry.ref.prNumber === prNumber) return true;
  }
  return false;
}

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
    if (projectId && !hostOwnsPr(projectId, item.pr.number))
      void syncMergedPrBase(projectId, item.pr);
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

function settleWorktreeThreads(merged: ReadonlyArray<{ key: string; pr: PrData }>): void {
  const prByKey = new Map(merged.map((item) => [item.key, item.pr]));
  for (const thread of useAppStore.getState().threads) {
    const pr = thread.worktreePath ? prByKey.get(thread.worktreePath) : undefined;
    if (!pr || hostOwnsPr(thread.projectId, pr.number)) continue;
    settleThread(thread);
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
    settleWorktreeThreads(merged);
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
