import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDbStorage } from "./dbStorage";

const DEFAULT_THREAD_TODO_DOCK_COLLAPSED = false;

interface ThreadTodoDockUiState {
  collapsed: boolean;
  retiredSourceItemId?: string;
}

/**
 * Per-thread Plan dock UI state (collapsed, dismissed plan). WHERE the dock
 * renders is not stored here: composer-vs-right-panel is one global mode for
 * every informational dock (`threadDocksPlacement` in shared settings).
 */
interface ThreadTodoDockStore {
  defaultCollapsed: boolean;
  byThreadId: Record<string, ThreadTodoDockUiState>;
  setCollapsed: (threadId: string, collapsed: boolean) => void;
  retire: (threadId: string, sourceItemId: string | undefined) => void;
}

type ThreadTodoDockPersistedState = Partial<
  Pick<ThreadTodoDockStore, "defaultCollapsed"> & {
    byThreadId: Record<string, ThreadTodoDockUiState & { placement?: unknown }>;
  }
> & {
  collapsed?: boolean;
};

function stripLegacyPlacement(
  byThreadId: ThreadTodoDockPersistedState["byThreadId"],
): Record<string, ThreadTodoDockUiState> {
  const next: Record<string, ThreadTodoDockUiState> = {};
  for (const [threadId, entry] of Object.entries(byThreadId ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    const cleaned: ThreadTodoDockUiState = {
      collapsed: typeof entry.collapsed === "boolean" ? entry.collapsed : false,
    };
    if (typeof entry.retiredSourceItemId === "string") {
      cleaned.retiredSourceItemId = entry.retiredSourceItemId;
    }
    next[threadId] = cleaned;
  }
  return next;
}

export const useThreadTodoDockStore = create<ThreadTodoDockStore>()(
  persist(
    (set) => ({
      defaultCollapsed: DEFAULT_THREAD_TODO_DOCK_COLLAPSED,
      byThreadId: {},
      setCollapsed: (threadId, collapsed) =>
        set((state) => {
          const current = state.byThreadId[threadId];
          const currentCollapsed = current?.collapsed ?? state.defaultCollapsed;
          if (currentCollapsed === collapsed) return state;
          const next: ThreadTodoDockUiState = { collapsed };
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
      // v3 dropped the per-thread `placement` field (and `defaultPlacement`):
      // composer-vs-right is now the global `threadDocksPlacement` setting.
      version: 3,
      storage: createDbStorage(),
      migrate: (persistedState, version) => {
        const state = (persistedState as ThreadTodoDockPersistedState | undefined) ?? {};
        if (version < 2) {
          return {
            defaultCollapsed:
              "collapsed" in state && typeof state.collapsed === "boolean"
                ? state.collapsed
                : DEFAULT_THREAD_TODO_DOCK_COLLAPSED,
            byThreadId: {},
          } satisfies Pick<ThreadTodoDockStore, "defaultCollapsed" | "byThreadId">;
        }
        return {
          defaultCollapsed: state.defaultCollapsed ?? DEFAULT_THREAD_TODO_DOCK_COLLAPSED,
          byThreadId: stripLegacyPlacement(state.byThreadId),
        } satisfies Pick<ThreadTodoDockStore, "defaultCollapsed" | "byThreadId">;
      },
      partialize: (state) => ({
        defaultCollapsed: state.defaultCollapsed,
        byThreadId: state.byThreadId,
      }),
    },
  ),
);
