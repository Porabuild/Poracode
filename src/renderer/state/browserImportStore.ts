import { create } from "zustand";

interface BrowserImportState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useBrowserImportStore = create<BrowserImportState>((set) => ({
  open: false,
  setOpen: (open) => set((state) => (state.open === open ? {} : { open })),
}));
