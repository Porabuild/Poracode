import { create } from "zustand";

interface ThreadForkStore {
  sourceThreadId: string | null;
  throughItemId: string | undefined;
  request(threadId: string, throughItemId?: string): void;
  close(): void;
}

export const useThreadForkStore = create<ThreadForkStore>()((set) => ({
  sourceThreadId: null,
  throughItemId: undefined,
  request: (sourceThreadId, throughItemId) => set({ sourceThreadId, throughItemId }),
  close: () => set({ sourceThreadId: null, throughItemId: undefined }),
}));
