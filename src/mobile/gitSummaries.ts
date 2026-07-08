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
  reset(): void;
}

function mergeSummaries(
  localByThread: RemoteGitSummaries,
  remoteByThread: RemoteGitSummaries,
): RemoteGitSummaries {
  return { ...localByThread, ...remoteByThread };
}

export const useGitSummariesStore = create<GitSummariesStore>()((set) => ({
  byThread: {},
  localByThread: {},
  remoteByThread: {},
  setAll: (remoteByThread) =>
    set((state) => ({
      remoteByThread,
      byThread: mergeSummaries(state.localByThread, remoteByThread),
    })),
  setThread: (threadId, summary) =>
    set((state) => {
      const localByThread = { ...state.localByThread, [threadId]: summary };
      return {
        localByThread,
        byThread: mergeSummaries(localByThread, state.remoteByThread),
      };
    }),
  reset: () => set({ byThread: {}, localByThread: {}, remoteByThread: {} }),
}));
