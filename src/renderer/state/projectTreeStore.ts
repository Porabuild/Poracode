import { create } from "zustand";
import type { ProjectTreeEntry } from "@/shared/contracts";

const EMPTY_ENTRIES: ProjectTreeEntry[] = [];

interface ProjectTreeState {
  /** Invalidates async directory loads when the active remote desktop changes. */
  generation: number;
  /** rootKey (projectId:worktreePath) of the currently-loaded tree. State resets when this changes. */
  rootKey: string;
  expandedPaths: Record<string, boolean>;
  loadingPaths: Record<string, boolean>;
  directoryEntries: Record<string, ProjectTreeEntry[]>;
  dropTargetPath: string | null;
  committedSearchQuery: string;

  resetForRoot: (rootKey: string) => void;
  setExpanded: (path: string, value: boolean) => void;
  toggleExpanded: (path: string) => void;
  expandMany: (paths: string[]) => void;
  setLoading: (path: string, value: boolean) => void;
  clearLoadingFor: (paths: string[]) => void;
  setDirectoryEntries: (updates: Record<string, ProjectTreeEntry[]>) => void;
  clearDirectoryEntries: () => void;
  collapseAll: () => void;
  setDropTargetPath: (path: string | null) => void;
  setCommittedSearchQuery: (query: string) => void;
}

export const useProjectTreeStore = create<ProjectTreeState>()((set) => ({
  generation: 0,
  rootKey: "",
  expandedPaths: { "": true },
  loadingPaths: {},
  directoryEntries: {},
  dropTargetPath: null,
  committedSearchQuery: "",

  resetForRoot: (rootKey) =>
    set((state) => {
      if (state.rootKey === rootKey) return {};
      return {
        rootKey,
        expandedPaths: { "": true },
        loadingPaths: {},
        directoryEntries: {},
        dropTargetPath: null,
        committedSearchQuery: "",
      };
    }),
  setExpanded: (path, value) =>
    set((state) => {
      if ((state.expandedPaths[path] ?? false) === value) return {};
      return { expandedPaths: { ...state.expandedPaths, [path]: value } };
    }),
  toggleExpanded: (path) =>
    set((state) => ({
      expandedPaths: { ...state.expandedPaths, [path]: !(state.expandedPaths[path] ?? false) },
    })),
  expandMany: (paths) =>
    set((state) => {
      const next = { ...state.expandedPaths };
      let changed = false;
      for (const p of paths) {
        if (!next[p]) {
          next[p] = true;
          changed = true;
        }
      }
      return changed ? { expandedPaths: next } : {};
    }),
  setLoading: (path, value) =>
    set((state) => {
      if ((state.loadingPaths[path] ?? false) === value) return {};
      return { loadingPaths: { ...state.loadingPaths, [path]: value } };
    }),
  clearLoadingFor: (paths) =>
    set((state) => {
      const next = { ...state.loadingPaths };
      let changed = false;
      for (const p of paths) {
        if (p in next) {
          delete next[p];
          changed = true;
        }
      }
      return changed ? { loadingPaths: next } : {};
    }),
  setDirectoryEntries: (updates) =>
    set((state) => ({ directoryEntries: { ...state.directoryEntries, ...updates } })),
  clearDirectoryEntries: () => set({ directoryEntries: {} }),
  collapseAll: () => set({ expandedPaths: { "": true } }),
  setDropTargetPath: (path) =>
    set((state) => (state.dropTargetPath === path ? {} : { dropTargetPath: path })),
  setCommittedSearchQuery: (committedSearchQuery) =>
    set((state) =>
      state.committedSearchQuery === committedSearchQuery ? {} : { committedSearchQuery },
    ),
}));

export function resetProjectTreeStore(): void {
  useProjectTreeStore.setState((state) => ({
    generation: state.generation + 1,
    rootKey: "",
    expandedPaths: { "": true },
    loadingPaths: {},
    directoryEntries: {},
    dropTargetPath: null,
    committedSearchQuery: "",
  }));
}

export function useIsPathExpanded(path: string): boolean {
  return useProjectTreeStore((s) => s.expandedPaths[path] ?? false);
}

export function useIsPathLoading(path: string): boolean {
  return useProjectTreeStore((s) => s.loadingPaths[path] ?? false);
}

export function useIsDropTarget(path: string): boolean {
  return useProjectTreeStore((s) => s.dropTargetPath === path);
}

/** Entries loaded for a specific directory. Returns a stable empty array when unloaded. */
export function useDirectoryEntries(parentPath: string): ProjectTreeEntry[] {
  return useProjectTreeStore((s) => s.directoryEntries[parentPath] ?? EMPTY_ENTRIES);
}
