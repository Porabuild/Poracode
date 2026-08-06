import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  isSidebarGroupCollapsed,
  SIDEBAR_THREAD_LIST_PAGE_SIZE,
} from "@/renderer/views/MainView/parts/Sidebar/parts/sidebarProjectRows";

/**
 * Legacy hand-rolled key, read once as the initial seed so existing installs
 * keep their collapsed projects; the `persist` envelope (PERSIST_KEY) takes
 * over on the first write.
 */
const LEGACY_COLLAPSED_PROJECTS_KEY = "poracode-collapsed-projects";
const PERSIST_KEY = "poracode-sidebar-ui";

interface SidebarUiState {
  collapsedProjects: Record<string, boolean>;
  pinnedGitHubWorkflows: Record<string, number[]>;
  collapsedWorktrees: Record<string, boolean>;
  /** Per-project count of thread-list items revealed via "See more" (ephemeral). */
  threadListLimits: Record<string, number>;
  /**
   * Flat thread list's project filter: the project ids to show, or null for
   * all projects. Persisted; additive to the v1 envelope — payloads written by
   * older builds lack the key and rehydrate to the default (null = all, the
   * pre-filter behavior), and older builds ignore the extra key, so the store
   * version stays 1.
   */
  flatListProjectFilter: string[] | null;
  /**
   * Footer nav (workspace switcher, shortcuts, Settings, Hide sidebar) shown
   * as a compact icon row instead of labeled rows. Persisted; additive to the
   * v1 envelope like `flatListProjectFilter` — older payloads lack the key and
   * rehydrate to the default (false = labeled rows), older builds ignore the
   * extra key, so the store version stays 1.
   */
  footerCollapsed: boolean;
  editingThreadId: string | null;
  setProjectCollapsed: (projectId: string, collapsed: boolean) => void;
  toggleProjectCollapsed: (projectId: string) => void;
  togglePinnedGitHubWorkflow: (projectId: string, workflowId: number) => void;
  setWorktreeCollapsed: (key: string, collapsed: boolean) => void;
  toggleWorktreeCollapsed: (key: string) => void;
  revealMoreThreads: (projectId: string, pageSize?: number) => void;
  setFlatListProjectFilter: (projectIds: string[] | null) => void;
  toggleFooterCollapsed: () => void;
  setEditingThreadId: (id: string | null) => void;
}

function readCollapsedProjects(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LEGACY_COLLAPSED_PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

export const useSidebarUiStore = create<SidebarUiState>()(
  persist(
    (set) => ({
      collapsedProjects: readCollapsedProjects(),
      pinnedGitHubWorkflows: {},
      collapsedWorktrees: {},
      threadListLimits: {},
      flatListProjectFilter: null,
      footerCollapsed: false,
      editingThreadId: null,

      setProjectCollapsed: (projectId, collapsed) =>
        set((state) => {
          if ((state.collapsedProjects[projectId] ?? false) === collapsed) return {};
          const collapsedProjects = { ...state.collapsedProjects, [projectId]: collapsed };
          // Collapsing resets the revealed page count so reopening starts fresh.
          return collapsed
            ? { collapsedProjects, threadListLimits: withoutKey(state.threadListLimits, projectId) }
            : { collapsedProjects };
        }),
      toggleProjectCollapsed: (projectId) =>
        set((state) => {
          const collapsed = !(state.collapsedProjects[projectId] ?? false);
          const collapsedProjects = { ...state.collapsedProjects, [projectId]: collapsed };
          return collapsed
            ? { collapsedProjects, threadListLimits: withoutKey(state.threadListLimits, projectId) }
            : { collapsedProjects };
        }),
      togglePinnedGitHubWorkflow: (projectId, workflowId) =>
        set((state) => {
          const current = state.pinnedGitHubWorkflows[projectId] ?? [];
          const pinned = current.includes(workflowId)
            ? current.filter((id) => id !== workflowId)
            : [...current, workflowId];
          return {
            pinnedGitHubWorkflows: {
              ...state.pinnedGitHubWorkflows,
              [projectId]: pinned,
            },
          };
        }),
      setWorktreeCollapsed: (key, collapsed) =>
        set((state) => {
          if (isSidebarGroupCollapsed(state.collapsedWorktrees, key) === collapsed) return {};
          return { collapsedWorktrees: { ...state.collapsedWorktrees, [key]: collapsed } };
        }),
      toggleWorktreeCollapsed: (key) =>
        set((state) => {
          const collapsed = !isSidebarGroupCollapsed(state.collapsedWorktrees, key);
          return {
            collapsedWorktrees: {
              ...state.collapsedWorktrees,
              [key]: collapsed,
            },
          };
        }),
      revealMoreThreads: (projectId, pageSize = SIDEBAR_THREAD_LIST_PAGE_SIZE) =>
        set((state) => {
          const current = state.threadListLimits[projectId] ?? pageSize;
          return {
            threadListLimits: {
              ...state.threadListLimits,
              [projectId]: current + pageSize,
            },
          };
        }),
      setFlatListProjectFilter: (projectIds) =>
        set((state) => {
          // An empty selection reads the same as no filter — normalize to
          // null; dedup so a stale or hand-edited payload can't double-count
          // an id and trip the complete-selection collapse downstream.
          const next = projectIds && projectIds.length > 0 ? [...new Set(projectIds)] : null;
          const current = state.flatListProjectFilter;
          if (current === next) return {};
          if (
            current !== null &&
            next !== null &&
            current.length === next.length &&
            current.every((id, index) => id === next[index])
          ) {
            return {};
          }
          return { flatListProjectFilter: next };
        }),
      toggleFooterCollapsed: () => set((state) => ({ footerCollapsed: !state.footerCollapsed })),
      setEditingThreadId: (editingThreadId) => set({ editingThreadId }),
    }),
    {
      name: PERSIST_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Worktree collapse, "See more" limits, and inline rename are
      // session-scoped by design.
      partialize: (state) => ({
        collapsedProjects: state.collapsedProjects,
        pinnedGitHubWorkflows: state.pinnedGitHubWorkflows,
        flatListProjectFilter: state.flatListProjectFilter,
        footerCollapsed: state.footerCollapsed,
      }),
    },
  ),
);

export function useIsProjectCollapsed(projectId: string): boolean {
  return useSidebarUiStore((s) => s.collapsedProjects[projectId] ?? false);
}

export function useThreadListLimit(
  projectId: string,
  pageSize: number = SIDEBAR_THREAD_LIST_PAGE_SIZE,
): number {
  return useSidebarUiStore((s) => s.threadListLimits[projectId] ?? pageSize);
}

export function useIsWorktreeCollapsed(key: string): boolean {
  return useSidebarUiStore((s) => isSidebarGroupCollapsed(s.collapsedWorktrees, key));
}
