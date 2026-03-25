import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { EnvironmentMode, ThemeMode } from "../../shared/contracts";

interface SharedSettingsState {
  environmentMode: EnvironmentMode;
  themeMode: ThemeMode;
  setEnvironmentMode: (mode: EnvironmentMode) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useSharedSettings = create<SharedSettingsState>()(
  persist(
    (set) => ({
      environmentMode: "windows",
      themeMode: "system",
      setEnvironmentMode: (environmentMode) => set({ environmentMode }),
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: "lightcode-shared-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        environmentMode: state.environmentMode,
        themeMode: state.themeMode,
      }),
    },
  ),
);

/** Read environment mode synchronously before store hydration */
export function readEnvironmentMode(): EnvironmentMode {
  try {
    const raw = localStorage.getItem("lightcode-shared-settings");
    if (!raw) return "windows";
    const parsed = JSON.parse(raw);
    return parsed?.state?.environmentMode === "wsl" ? "wsl" : "windows";
  } catch {
    return "windows";
  }
}
