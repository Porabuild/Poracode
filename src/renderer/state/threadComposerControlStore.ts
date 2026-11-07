import { create } from "zustand";

export type ThreadComposerControlTarget = "model" | "effort" | "crew";

export interface ThreadComposerControlRequest {
  target: ThreadComposerControlTarget;
  nonce: number;
}

interface ThreadComposerControlStore {
  requestsByThreadId: Record<string, ThreadComposerControlRequest>;
  nextNonce: number;
  requestOpenControl: (threadId: string, target: ThreadComposerControlTarget) => number;
  consumeOpenControlRequest: (threadId: string, nonce: number) => void;
}

export const useThreadComposerControlStore = create<ThreadComposerControlStore>((set, get) => ({
  requestsByThreadId: {},
  nextNonce: 0,
  requestOpenControl: (threadId, target) => {
    const nonce = get().nextNonce + 1;
    set((state) => ({
      nextNonce: nonce,
      requestsByThreadId: { ...state.requestsByThreadId, [threadId]: { target, nonce } },
    }));
    return nonce;
  },
  consumeOpenControlRequest: (threadId, nonce) =>
    set((state) => {
      if (state.requestsByThreadId[threadId]?.nonce !== nonce) return state;
      const requestsByThreadId = { ...state.requestsByThreadId };
      delete requestsByThreadId[threadId];
      return { requestsByThreadId };
    }),
}));
