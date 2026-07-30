import { create } from "zustand";
import { resolveFocusElement } from "./focusedSurface";

interface CommandPaletteState {
  isOpen: boolean;
  originTarget: Element | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  originTarget: null,
  open: () =>
    set((state) => (state.isOpen ? {} : { isOpen: true, originTarget: resolveFocusElement() })),
  close: () => set({ isOpen: false }),
  toggle: () =>
    set((state) =>
      state.isOpen ? { isOpen: false } : { isOpen: true, originTarget: resolveFocusElement() },
    ),
}));
