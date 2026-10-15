import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BackgroundTask } from "@/shared/contracts";
import { createDbStorage } from "./dbStorage";

interface ThreadBackgroundTasksDockStore {
  /** Global (not per thread): the dock's collapsed state, like the Plan dock default. */
  collapsed: boolean;
  /** Session-only: dismissed task-list fingerprint per thread. */
  dismissedTasksKeyByThread: Record<string, string>;
  setCollapsed: (collapsed: boolean) => void;
  dismiss: (threadId: string, tasks: readonly BackgroundTask[]) => void;
  show: (threadId: string) => void;
}

export function backgroundTasksKey(tasks: readonly BackgroundTask[]): string {
  return JSON.stringify(
    tasks.map((task) => [task.taskId, task.kind, task.description, task.startedAt ?? null]),
  );
}

export const useThreadBackgroundTasksDockStore = create<ThreadBackgroundTasksDockStore>()(
  persist(
    (set) => ({
      collapsed: false,
      dismissedTasksKeyByThread: {},
      setCollapsed: (collapsed) =>
        set((state) => (state.collapsed === collapsed ? state : { collapsed })),
      dismiss: (threadId, tasks) =>
        set((state) => ({
          dismissedTasksKeyByThread: {
            ...state.dismissedTasksKeyByThread,
            [threadId]: backgroundTasksKey(tasks),
          },
        })),
      show: (threadId) =>
        set((state) => {
          if (!state.dismissedTasksKeyByThread[threadId]) return state;
          const { [threadId]: _dismissed, ...dismissedTasksKeyByThread } =
            state.dismissedTasksKeyByThread;
          return { dismissedTasksKeyByThread };
        }),
    }),
    {
      name: "poracode-thread-background-tasks-dock-v1",
      version: 1,
      storage: createDbStorage(),
      partialize: (state) => ({ collapsed: state.collapsed }),
    },
  ),
);
