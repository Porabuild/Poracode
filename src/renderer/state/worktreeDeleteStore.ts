import { create } from "zustand";

export type WorktreeDeleteDialogState =
  | {
      kind: "single-thread";
      threadId: string;
      projectId: string;
      worktreePath: string;
      worktreeBranch: string;
    }
  | {
      kind: "branch-unmerged";
      projectId: string;
      worktreeBranch: string;
      error: string;
    }
  | null;

interface WorktreeDeleteStore {
  dialog: WorktreeDeleteDialogState;
  setDialog: (dialog: WorktreeDeleteDialogState) => void;
  closeDialog: () => void;
}

export const useWorktreeDeleteStore = create<WorktreeDeleteStore>()((set) => ({
  dialog: null,
  setDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));
