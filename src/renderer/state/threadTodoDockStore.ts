import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDbStorage } from "./dbStorage";

export type ThreadTodoDockPlacement = "composer" | "right";

const DEFAULT_THREAD_TODO_DOCK_PLACEMENT: ThreadTodoDockPlacement = "composer";
const DEFAULT_THREAD_TODO_DOCK_COLLAPSED = false;

interface ThreadTodoDockUiState {
  placement: ThreadTodoDockPlacement;
  collapsed: boolean;
  retiredSourceItemId?: string;
}

interface ThreadTodoDockStore {
  defaultPlacement: ThreadTodoDockPlacement;
  defaultCollapsed: boolean;
  byThreadId: Record<string, ThreadTodoDockUiState>;
  setPlacement: (threadId: string, placement: ThreadTodoDockPlacement) => void;
  setCollapsed: (threadId: string, collapsed: boolean) => void;
  retire: (threadId: string, sourceItemId: string | undefined) => void;
}

type ThreadTodoDockPersistedState = Partial<
  Pick<ThreadTodoDockStore, "defaultPlacement" | "defaultCollapsed" | "byThreadId">
> & {
  placement?: ThreadTodoDockPlacement;
  collapsed?: boolean;
};

export const useThreadTodoDockStore = create<ThreadTodoDockStore>()(
  persist(
    (set) => ({
      defaultPlacement: DEFAULT_THREAD_TODO_DOCK_PLACEMENT,
      defaultCollapsed: DEFAULT_THREAD_TODO_DOCK_COLLAPSED,
      byThreadId: {},
      setPlacement: (threadId, placement) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          const currentPlacement = current?.placement ?? state.defaultPlacement;
          if (currentPlacement === placement) return state;
          const next: ThreadTodoDockUiState = {
            placement,
            collapsed: current?.collapsed ?? state.defaultCollapsed,
          };
          if (current?.retiredSourceItemId) next.retiredSourceItemId = current.retiredSourceItemId;
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: next,
            },
          };
        }),
      setCollapsed: (threadId, collapsed) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          const currentCollapsed = current?.collapsed ?? state.defaultCollapsed;
          if (currentCollapsed === collapsed) return state;
          const next: ThreadTodoDockUiState = {
            placement: current?.placement ?? state.defaultPlacement,
            collapsed,
          };
          if (current?.retiredSourceItemId) next.retiredSourceItemId = current.retiredSourceItemId;
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: next,
            },
          };
        }),
      retire: (threadId, sourceItemId) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          if (current?.retiredSourceItemId === sourceItemId) return state;
          const next: ThreadTodoDockUiState = {
            placement: current?.placement ?? state.defaultPlacement,
            collapsed: current?.collapsed ?? state.defaultCollapsed,
          };
          if (sourceItemId) next.retiredSourceItemId = sourceItemId;
          return {
            byThreadId: {
              ...state.byThreadId,
              [threadId]: next,
            },
          };
        }),
    }),
    {
      name: "poracode-thread-todo-dock-v1",
      version: 2,
      storage: createDbStorage(),
      migrate: (persistedState, version) => {
        const state = (persistedState as ThreadTodoDockPersistedState | undefined) ?? {};
        if (version < 2) {
          return {
            defaultPlacement:
              "placement" in state && state.placement
                ? state.placement
                : DEFAULT_THREAD_TODO_DOCK_PLACEMENT,
            defaultCollapsed:
              "collapsed" in state && typeof state.collapsed === "boolean"
                ? state.collapsed
                : DEFAULT_THREAD_TODO_DOCK_COLLAPSED,
            byThreadId: {},
          } satisfies Pick<
            ThreadTodoDockStore,
            "defaultPlacement" | "defaultCollapsed" | "byThreadId"
          >;
        }
        return {
          defaultPlacement: state.defaultPlacement ?? DEFAULT_THREAD_TODO_DOCK_PLACEMENT,
          defaultCollapsed: state.defaultCollapsed ?? DEFAULT_THREAD_TODO_DOCK_COLLAPSED,
          byThreadId: state.byThreadId ?? {},
        } satisfies Pick<
          ThreadTodoDockStore,
          "defaultPlacement" | "defaultCollapsed" | "byThreadId"
        >;
      },
      partialize: (state) => ({
        defaultPlacement: state.defaultPlacement,
        defaultCollapsed: state.defaultCollapsed,
        byThreadId: state.byThreadId,
      }),
    },
  ),
);
