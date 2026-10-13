import { create } from "zustand";
import type { BrowserCredentialInfo } from "@/shared/ipc";
import { createArrayKeyedMap } from "./derivations";

export const browserCredentialById = createArrayKeyedMap(
  (credentials: BrowserCredentialInfo[]) =>
    new Map(credentials.map((credential) => [credential.id, credential])),
);

interface BrowserCredentialsState {
  credentials: BrowserCredentialInfo[];
  revision: number;
  deletingId: string | null;
  setCredentials: (credentials: BrowserCredentialInfo[]) => void;
  invalidate: () => void;
  setDeletingId: (id: string | null) => void;
}

export const useBrowserCredentialsStore = create<BrowserCredentialsState>((set) => ({
  credentials: [],
  revision: 0,
  deletingId: null,
  setCredentials: (credentials) => set({ credentials }),
  invalidate: () => set((state) => ({ revision: state.revision + 1 })),
  setDeletingId: (deletingId) =>
    set((state) => (state.deletingId === deletingId ? {} : { deletingId })),
}));
