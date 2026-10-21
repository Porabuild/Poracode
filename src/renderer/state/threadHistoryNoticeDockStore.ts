import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RemoteRuntimeHistoryNotice } from "@/shared/remote";
import { createDbStorage } from "./dbStorage";

/**
 * Per-thread dismissal of the acknowledged incomplete-history dock. Only an
 * acknowledged notice can be dismissed; the stored fingerprint identifies the
 * acknowledged episodes, so a later loss episode shows the dock again.
 */
interface ThreadHistoryNoticeDockStore {
  dismissedByThreadId: Record<string, string>;
  dismiss: (threadId: string, notice: RemoteRuntimeHistoryNotice) => void;
}

export function threadHistoryNoticeFingerprint(notice: RemoteRuntimeHistoryNotice): string {
  return `${notice.acknowledgedCount}:${notice.lastAcknowledgedAt}`;
}

export const useThreadHistoryNoticeDockStore = create<ThreadHistoryNoticeDockStore>()(
  persist(
    (set) => ({
      dismissedByThreadId: {},
      dismiss: (threadId, notice) =>
        set((state) => {
          const fingerprint = threadHistoryNoticeFingerprint(notice);
          if (state.dismissedByThreadId[threadId] === fingerprint) return state;
          return {
            dismissedByThreadId: { ...state.dismissedByThreadId, [threadId]: fingerprint },
          };
        }),
    }),
    {
      name: "poracode-thread-history-notice-dock-v1",
      version: 1,
      storage: createDbStorage(),
      partialize: (state) => ({ dismissedByThreadId: state.dismissedByThreadId }),
    },
  ),
);
