import { create } from "zustand";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";

export interface ThreadGoalDockDismissal {
  sourceItemId: string;
  fingerprint: string;
}

interface ThreadGoalDockStore {
  dismissedByThread: Record<string, ThreadGoalDockDismissal>;
  dismiss: (threadId: string, item: RuntimeChatItem) => void;
}

export function threadGoalDockFingerprint(item: RuntimeChatItem): string {
  return JSON.stringify([item.state, item.payload]);
}

export const useThreadGoalDockStore = create<ThreadGoalDockStore>((set) => ({
  dismissedByThread: {},
  dismiss: (threadId, item) =>
    set((state) => ({
      dismissedByThread: {
        ...state.dismissedByThread,
        [threadId]: { sourceItemId: item.id, fingerprint: threadGoalDockFingerprint(item) },
      },
    })),
}));
