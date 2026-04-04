import { create } from "zustand";
import type { GitBranchListResult, GitStatusResult, GitWorktreeInfo, PrData } from "../../shared/contracts";

interface GitState {
  statuses: Record<string, GitStatusResult>;
  worktreeStatuses: Record<string, GitStatusResult>;
  worktrees: Record<string, GitWorktreeInfo[]>;
  branches: Record<string, GitBranchListResult>;
  ghAvailable: Record<string, boolean>;
  prData: Record<string, PrData | null>;
}

interface GitActions {
  setStatus: (projectId: string, status: GitStatusResult) => void;
  clearStatus: (projectId: string) => void;
  setWorktreeStatus: (worktreePath: string, status: GitStatusResult) => void;
  clearWorktreeStatus: (worktreePath: string) => void;
  setWorktrees: (projectId: string, worktrees: GitWorktreeInfo[]) => void;
  setBranches: (projectId: string, branches: GitBranchListResult) => void;
  setGhAvailable: (projectId: string, available: boolean) => void;
  setPrData: (worktreePath: string, pr: PrData | null) => void;
}

function shallowJsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export const useGitStore = create<GitState & GitActions>()((set, get) => ({
  statuses: {},
  worktreeStatuses: {},
  worktrees: {},
  branches: {},
  ghAvailable: {},
  prData: {},

  setStatus: (projectId, status) => {
    if (shallowJsonEqual(get().statuses[projectId], status)) return;
    set((state) => ({
      statuses: { ...state.statuses, [projectId]: status },
    }));
  },

  clearStatus: (projectId) =>
    set((state) => {
      const { [projectId]: _, ...rest } = state.statuses;
      return { statuses: rest };
    }),

  setWorktreeStatus: (worktreePath, status) => {
    if (shallowJsonEqual(get().worktreeStatuses[worktreePath], status)) return;
    set((state) => ({
      worktreeStatuses: { ...state.worktreeStatuses, [worktreePath]: status },
    }));
  },

  clearWorktreeStatus: (worktreePath) =>
    set((state) => {
      const { [worktreePath]: _, ...rest } = state.worktreeStatuses;
      return { worktreeStatuses: rest };
    }),

  setWorktrees: (projectId, worktrees) => {
    if (shallowJsonEqual(get().worktrees[projectId], worktrees)) return;
    set((state) => ({
      worktrees: { ...state.worktrees, [projectId]: worktrees },
    }));
  },

  setBranches: (projectId, branches) => {
    if (shallowJsonEqual(get().branches[projectId], branches)) return;
    set((state) => ({
      branches: { ...state.branches, [projectId]: branches },
    }));
  },

  setGhAvailable: (projectId, available) => {
    if (get().ghAvailable[projectId] === available) return;
    set((state) => ({
      ghAvailable: { ...state.ghAvailable, [projectId]: available },
    }));
  },

  setPrData: (worktreePath, pr) => {
    if (shallowJsonEqual(get().prData[worktreePath], pr)) return;
    set((state) => ({
      prData: { ...state.prData, [worktreePath]: pr },
    }));
  },
}));
