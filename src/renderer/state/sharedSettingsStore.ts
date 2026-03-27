import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeMode } from "../../shared/contracts";
import { createDbStorage } from "./dbStorage";

interface SharedSettingsState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useSharedSettings = create<SharedSettingsState>()(
  persist(
    (set) => ({
      themeMode: "system",
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: "lightcode-shared-settings",
      version: 2,
      storage: createDbStorage(),
      partialize: (state) => ({
        themeMode: state.themeMode,
      }),
    },
  ),
);
