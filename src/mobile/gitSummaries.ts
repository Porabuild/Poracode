import { create } from "zustand";
import type { RemoteGitSummaries } from "@/shared/remote";

/**
 * Read-only per-thread git/PR summaries from the paired desktop. Hydrated
 * from the shell snapshot and kept live by `remote-git-summaries` events on
 * the WebSocket (see storeSync).
 */

interface GitSummariesStore {
  byThread: RemoteGitSummaries;
  setAll(byThread: RemoteGitSummaries): void;
  reset(): void;
}

export const useGitSummariesStore = create<GitSummariesStore>()((set) => ({
  byThread: {},
  setAll: (byThread) => set({ byThread }),
  reset: () => set({ byThread: {} }),
}));
