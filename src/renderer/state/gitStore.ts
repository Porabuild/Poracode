import { create } from "zustand";
import type { GitBranchListResult, GitStatusResult, GitWorktreeInfo } from "../../shared/contracts";

interface GitState {
  statuses: Record<string, GitStatusResult>;
  worktreeStatuses: Record<string, GitStatusResult>;
  worktrees: Record<string, GitWorktreeInfo[]>;
  branches: Record<string, GitBranchListResult>;
}

interface GitActions {
  setStatus: (projectId: string, status: GitStatusResult) => void;
  clearStatus: (projectId: string) => void;
  setWorktreeStatus: (worktreePath: string, status: GitStatusResult) => void;
  clearWorktreeStatus: (worktreePath: string) => void;
  setWorktrees: (projectId: string, worktrees: GitWorktreeInfo[]) => void;
  setBranches: (projectId: string, branches: GitBranchListResult) => void;
}

export const useGitStore = create<GitState & GitActions>()((set) => ({
  statuses: {},
  worktreeStatuses: {},
  worktrees: {},
  branches: {},

  setStatus: (projectId, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [projectId]: status },
    })),

  clearStatus: (projectId) =>
    set((state) => {
      const { [projectId]: _, ...rest } = state.statuses;
      return { statuses: rest };
    }),

  setWorktreeStatus: (worktreePath, status) =>
    set((state) => ({
      worktreeStatuses: { ...state.worktreeStatuses, [worktreePath]: status },
    })),

  clearWorktreeStatus: (worktreePath) =>
    set((state) => {
      const { [worktreePath]: _, ...rest } = state.worktreeStatuses;
      return { worktreeStatuses: rest };
    }),

  setWorktrees: (projectId, worktrees) =>
    set((state) => ({
      worktrees: { ...state.worktrees, [projectId]: worktrees },
    })),

  setBranches: (projectId, branches) =>
    set((state) => ({
      branches: { ...state.branches, [projectId]: branches },
    })),
}));
