import { create } from "zustand";
import type { RemoteGitSummaries, RemoteThreadGitSummary } from "@/shared/remote";

/**
 * Read-only per-thread git/PR summaries from the paired desktop. Hydrated
 * from the shell snapshot and kept live by `remote-git-summaries` events on
 * the WebSocket (see storeSync).
 */

interface GitSummariesStore {
  byThread: RemoteGitSummaries;
  localByThread: RemoteGitSummaries;
  remoteByThread: RemoteGitSummaries;
  setAll(byThread: RemoteGitSummaries): void;
  setThread(threadId: string, summary: RemoteThreadGitSummary): void;
  setThreadPr(threadId: string, pr: RemoteThreadGitSummary["pr"]): void;
  reset(): void;
}

function mergeSummaries(
  localByThread: RemoteGitSummaries,
  remoteByThread: RemoteGitSummaries,
): RemoteGitSummaries {
  return { ...localByThread, ...remoteByThread };
}

function summariesEqual(a: RemoteThreadGitSummary, b: RemoteThreadGitSummary): boolean {
  return (
    a.isRepo === b.isRepo &&
    a.branch === b.branch &&
    a.totalInsertions === b.totalInsertions &&
    a.totalDeletions === b.totalDeletions &&
    a.ahead === b.ahead &&
    a.behind === b.behind &&
    JSON.stringify(a.pr) === JSON.stringify(b.pr)
  );
}

function reuseSummaries(
  current: RemoteGitSummaries,
  incoming: RemoteGitSummaries,
): RemoteGitSummaries {
  const currentIds = Object.keys(current);
  const incomingIds = Object.keys(incoming);
  let changed = currentIds.length !== incomingIds.length;
  const next: RemoteGitSummaries = {};
  for (const threadId of incomingIds) {
    const existing = current[threadId];
    const summary =
      existing && summariesEqual(existing, incoming[threadId]!) ? existing : incoming[threadId]!;
    next[threadId] = summary;
    if (summary !== existing) changed = true;
  }
  return changed ? next : current;
}

export const useGitSummariesStore = create<GitSummariesStore>()((set) => ({
  byThread: {},
  localByThread: {},
  remoteByThread: {},
  setAll: (remoteByThread) =>
    set((state) => {
      const nextRemoteByThread = reuseSummaries(state.remoteByThread, remoteByThread);
      return nextRemoteByThread === state.remoteByThread
        ? state
        : {
            remoteByThread: nextRemoteByThread,
            byThread: mergeSummaries(state.localByThread, nextRemoteByThread),
          };
    }),
  setThread: (threadId, summary) =>
    set((state) => {
      const existing = state.localByThread[threadId];
      if (existing && summariesEqual(existing, summary)) return state;
      const localByThread = { ...state.localByThread, [threadId]: summary };
      return {
        localByThread,
        byThread: mergeSummaries(localByThread, state.remoteByThread),
      };
    }),
  setThreadPr: (threadId, pr) =>
    set((state) => {
      const remoteSummary = state.remoteByThread[threadId];
      if (remoteSummary) {
        if (JSON.stringify(remoteSummary.pr) === JSON.stringify(pr)) return state;
        const remoteByThread = {
          ...state.remoteByThread,
          [threadId]: { ...remoteSummary, pr },
        };
        return {
          remoteByThread,
          byThread: mergeSummaries(state.localByThread, remoteByThread),
        };
      }

      const localSummary = state.localByThread[threadId];
      if (!localSummary || JSON.stringify(localSummary.pr) === JSON.stringify(pr)) return state;
      const localByThread = {
        ...state.localByThread,
        [threadId]: { ...localSummary, pr },
      };
      return {
        localByThread,
        byThread: mergeSummaries(localByThread, state.remoteByThread),
      };
    }),
  reset: () => set({ byThread: {}, localByThread: {}, remoteByThread: {} }),
}));
