import { create } from "zustand";
import type { BrowserCredentialInfo } from "@/shared/ipc";

interface BrowserCredentialsState {
  credentials: BrowserCredentialInfo[];
  revision: number;
  setCredentials: (credentials: BrowserCredentialInfo[]) => void;
  invalidate: () => void;
}

export const useBrowserCredentialsStore = create<BrowserCredentialsState>((set) => ({
  credentials: [],
  revision: 0,
  setCredentials: (credentials) => set({ credentials }),
  invalidate: () => set((state) => ({ revision: state.revision + 1 })),
}));
