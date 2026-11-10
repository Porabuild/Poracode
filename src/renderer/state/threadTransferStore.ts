import { create } from "zustand";

/** Which thread the "Move to another machine" dialog is open for; ephemeral. */
interface ThreadTransferStore {
  sourceThreadId: string | null;
  request(threadId: string): void;
  close(): void;
}

export const useThreadTransferStore = create<ThreadTransferStore>()((set) => ({
  sourceThreadId: null,
  request: (sourceThreadId) => set({ sourceThreadId }),
  close: () => set({ sourceThreadId: null }),
}));
