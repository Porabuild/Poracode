import { isThreadTurnActive, type PrData, type Thread } from "@/shared/contracts";
import { markThreadDone } from "@/renderer/actions/threadActions";
import { useAppStore } from "./appStore";
import { useGitStore } from "./gitStore";
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
function collectFreshlyMergedKeys(next: PrDataMap, prev: PrDataMap): Set<string> {
  const keys = new Set<string>();
  for (const [key, pr] of Object.entries(next)) {
    if (pr?.state !== "merged") continue;
    const before = prev[key];
    if (!before || before.state === "merged") continue;
    keys.add(key);
  }
  return keys;
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
    if (!useSharedSettings.getState().autoMarkDoneOnPrMerge) return;
    const merged = collectFreshlyMergedKeys(state.prData, prev.prData);
    if (merged.size > 0) settleWorktreeThreads(merged);
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
