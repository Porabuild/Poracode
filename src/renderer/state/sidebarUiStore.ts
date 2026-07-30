import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { captureProductEvent } from "@/renderer/analytics/productAnalytics";
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
  editingThreadId: string | null;
  setProjectCollapsed: (projectId: string, collapsed: boolean) => void;
  toggleProjectCollapsed: (projectId: string) => void;
  togglePinnedGitHubWorkflow: (projectId: string, workflowId: number) => void;
  setWorktreeCollapsed: (key: string, collapsed: boolean) => void;
  toggleWorktreeCollapsed: (key: string) => void;
  revealMoreThreads: (projectId: string) => void;
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
      editingThreadId: null,

      setProjectCollapsed: (projectId, collapsed) =>
        set((state) => {
          if ((state.collapsedProjects[projectId] ?? false) === collapsed) return {};
          const collapsedProjects = { ...state.collapsedProjects, [projectId]: collapsed };
          captureProductEvent("ui.project_group_toggled", { collapsed });
          // Collapsing resets the revealed page count so reopening starts fresh.
          return collapsed
            ? { collapsedProjects, threadListLimits: withoutKey(state.threadListLimits, projectId) }
            : { collapsedProjects };
        }),
      toggleProjectCollapsed: (projectId) =>
        set((state) => {
          const collapsed = !(state.collapsedProjects[projectId] ?? false);
          const collapsedProjects = { ...state.collapsedProjects, [projectId]: collapsed };
          captureProductEvent("ui.project_group_toggled", { collapsed });
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
          captureProductEvent("ui.worktree_group_toggled", { collapsed });
          return { collapsedWorktrees: { ...state.collapsedWorktrees, [key]: collapsed } };
        }),
      toggleWorktreeCollapsed: (key) =>
        set((state) => {
          const collapsed = !isSidebarGroupCollapsed(state.collapsedWorktrees, key);
          captureProductEvent("ui.worktree_group_toggled", { collapsed });
          return {
            collapsedWorktrees: {
              ...state.collapsedWorktrees,
              [key]: collapsed,
            },
          };
        }),
      revealMoreThreads: (projectId) =>
        set((state) => {
          const current = state.threadListLimits[projectId] ?? SIDEBAR_THREAD_LIST_PAGE_SIZE;
          captureProductEvent("ui.thread_list_show_more");
          return {
            threadListLimits: {
              ...state.threadListLimits,
              [projectId]: current + SIDEBAR_THREAD_LIST_PAGE_SIZE,
            },
          };
        }),
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
      }),
    },
  ),
);

export function useIsProjectCollapsed(projectId: string): boolean {
  return useSidebarUiStore((s) => s.collapsedProjects[projectId] ?? false);
}

export function useThreadListLimit(projectId: string): number {
  return useSidebarUiStore((s) => s.threadListLimits[projectId] ?? SIDEBAR_THREAD_LIST_PAGE_SIZE);
}

export function useIsWorktreeCollapsed(key: string): boolean {
  return useSidebarUiStore((s) => isSidebarGroupCollapsed(s.collapsedWorktrees, key));
}
