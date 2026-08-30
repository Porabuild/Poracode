import { create } from "zustand";

export type WorktreeDeleteDialogState =
  | {
      kind: "single-thread";
      threadId: string;
      projectId?: string;
      // Set only when deleting this thread also removes the worktree directory,
      // so the confirmation never promises a removal that will not happen.
      worktreePath?: string;
      worktreeBranch?: string;
      anchorPosition: { x: number; y: number };
      returnFocusElement?: HTMLElement;
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
