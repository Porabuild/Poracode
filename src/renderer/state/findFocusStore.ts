import { create } from "zustand";

/**
 * Focus requests for Find surfaces that already own a search input — the project
 * tree (full-project search box) and the Settings sidebar (section filter). The
 * Find command bumps a token; the surface focuses/selects its input in response.
 * Token-based (not a boolean) so repeated Ctrl+F refocuses even when already
 * focused.
 */
interface FindFocusState {
  treeFocusToken: number;
  settingsFocusToken: number;
  requestTreeFocus: () => void;
  requestSettingsFocus: () => void;
}

export const useFindFocusStore = create<FindFocusState>((set) => ({
  treeFocusToken: 0,
  settingsFocusToken: 0,
  requestTreeFocus: () => set((state) => ({ treeFocusToken: state.treeFocusToken + 1 })),
  requestSettingsFocus: () =>
    set((state) => ({ settingsFocusToken: state.settingsFocusToken + 1 })),
}));
