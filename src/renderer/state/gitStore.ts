import { create } from "zustand";
import type { GitStatusResult } from "../../shared/contracts";

interface GitState {
  statuses: Record<string, GitStatusResult>;
}

interface GitActions {
  setStatus: (projectId: string, status: GitStatusResult) => void;
  clearStatus: (projectId: string) => void;
}

export const useGitStore = create<GitState & GitActions>()((set) => ({
  statuses: {},

  setStatus: (projectId, status) =>
    set((state) => ({
      statuses: { ...state.statuses, [projectId]: status },
    })),

  clearStatus: (projectId) =>
    set((state) => {
      const { [projectId]: _, ...rest } = state.statuses;
      return { statuses: rest };
    }),
}));
