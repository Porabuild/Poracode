import { create } from "zustand";

export interface PullFromSourceDialogState {
  projectId: string;
  worktreePath: string;
  sourceBranch: string;
  onComplete?: () => void;
}

interface PullFromSourceDialogStore {
  dialog: PullFromSourceDialogState | null;
  setDialog: (dialog: PullFromSourceDialogState) => void;
  closeDialog: () => void;
}

export const usePullFromSourceDialogStore = create<PullFromSourceDialogStore>()((set) => ({
  dialog: null,
  setDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));
