import { create } from "zustand";
import { captureProductEvent } from "@/renderer/analytics/posthog";
import { SIDEBAR_THREAD_LIST_PAGE_SIZE } from "@/renderer/views/MainView/parts/Sidebar/parts/sidebarProjectRows";

const COLLAPSED_PROJECTS_STORAGE_KEY = "lightcode-collapsed-projects";

interface SidebarUiState {
  collapsedProjects: Record<string, boolean>;
  collapsedWorktrees: Record<string, boolean>;
  /** Per-project count of thread-list items revealed via "See more" (ephemeral). */
  threadListLimits: Record<string, number>;
  editingThreadId: string | null;
  setProjectCollapsed: (projectId: string, collapsed: boolean) => void;
  toggleProjectCollapsed: (projectId: string) => void;
  setWorktreeCollapsed: (key: string, collapsed: boolean) => void;
  toggleWorktreeCollapsed: (key: string) => void;
  revealMoreThreads: (projectId: string) => void;
  setEditingThreadId: (id: string | null) => void;
}

function readCollapsedProjects(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_PROJECTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeCollapsedProjects(collapsedProjects: Record<string, boolean>): void {
  try {
    localStorage.setItem(COLLAPSED_PROJECTS_STORAGE_KEY, JSON.stringify(collapsedProjects));
  } catch {
    // ignored
  }
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

export const useSidebarUiStore = create<SidebarUiState>()((set) => ({
  collapsedProjects: readCollapsedProjects(),
  collapsedWorktrees: {},
  threadListLimits: {},
  editingThreadId: null,

  setProjectCollapsed: (projectId, collapsed) =>
    set((state) => {
      if ((state.collapsedProjects[projectId] ?? false) === collapsed) return {};
      const collapsedProjects = { ...state.collapsedProjects, [projectId]: collapsed };
      writeCollapsedProjects(collapsedProjects);
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
      writeCollapsedProjects(collapsedProjects);
      captureProductEvent("ui.project_group_toggled", { collapsed });
      return collapsed
        ? { collapsedProjects, threadListLimits: withoutKey(state.threadListLimits, projectId) }
        : { collapsedProjects };
    }),
  setWorktreeCollapsed: (key, collapsed) =>
    set((state) => {
      if ((state.collapsedWorktrees[key] ?? false) === collapsed) return {};
      captureProductEvent("ui.worktree_group_toggled", { collapsed });
      return { collapsedWorktrees: { ...state.collapsedWorktrees, [key]: collapsed } };
    }),
  toggleWorktreeCollapsed: (key) =>
    set((state) => {
      const collapsed = !(state.collapsedWorktrees[key] ?? false);
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
}));

export function useIsProjectCollapsed(projectId: string): boolean {
  return useSidebarUiStore((s) => s.collapsedProjects[projectId] ?? false);
}

export function useThreadListLimit(projectId: string): number {
  return useSidebarUiStore((s) => s.threadListLimits[projectId] ?? SIDEBAR_THREAD_LIST_PAGE_SIZE);
}

export function useIsWorktreeCollapsed(key: string): boolean {
  return useSidebarUiStore((s) => s.collapsedWorktrees[key] ?? false);
}
