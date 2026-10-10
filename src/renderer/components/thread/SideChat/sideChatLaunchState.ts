import { create } from "zustand";

/** Launch ownership outlives a panel component hidden by the shell. */
export const useSideChatLaunchState = create<{ threadIds: ReadonlySet<string> }>(() => ({
  threadIds: new Set(),
}));

export function isSideChatLaunching(threadId: string | undefined): boolean {
  return threadId !== undefined && useSideChatLaunchState.getState().threadIds.has(threadId);
}

export function claimSideChatLaunch(threadId: string): () => void {
  useSideChatLaunchState.setState((state) => ({
    threadIds: new Set([...state.threadIds, threadId]),
  }));
  return () => {
    useSideChatLaunchState.setState((state) => {
      const threadIds = new Set(state.threadIds);
      threadIds.delete(threadId);
      return { threadIds };
    });
  };
}
