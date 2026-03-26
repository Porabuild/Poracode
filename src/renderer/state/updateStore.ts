import { create } from "zustand";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

interface UpdateState {
  phase: UpdatePhase;
  version: string | null;
  downloadPercent: number;
  errorMessage: string | null;
}

interface UpdateActions {
  setChecking: () => void;
  setAvailable: (version: string) => void;
  setNotAvailable: () => void;
  setDownloading: (percent: number) => void;
  setDownloaded: (version: string) => void;
  setError: (message: string) => void;
}

export const useUpdateStore = create<UpdateState & UpdateActions>()((set) => ({
  phase: "idle",
  version: null,
  downloadPercent: 0,
  errorMessage: null,

  setChecking: () => set({ phase: "checking", errorMessage: null }),
  setAvailable: (version) => set({ phase: "available", version, errorMessage: null }),
  setNotAvailable: () => set({ phase: "idle", errorMessage: null }),
  setDownloading: (percent) => set({ phase: "downloading", downloadPercent: percent }),
  setDownloaded: (version) => set({ phase: "downloaded", version, downloadPercent: 100 }),
  setError: (message) => set({ phase: "error", errorMessage: message }),
}));
