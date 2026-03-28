import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeMode } from "../../shared/contracts";
import { createDbStorage } from "./dbStorage";

interface SharedSettingsState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  commitGenProvider: string; // "auto" | AgentKind
  commitGenModel: string;
  commitGenEffort: string;
  setCommitGenConfig: (provider: string, model: string, effort: string) => void;
}

export const useSharedSettings = create<SharedSettingsState>()(
  persist(
    (set) => ({
      themeMode: "system",
      setThemeMode: (themeMode) => set({ themeMode }),
      commitGenProvider: "auto",
      commitGenModel: "",
      commitGenEffort: "",
      setCommitGenConfig: (commitGenProvider, commitGenModel, commitGenEffort) =>
        set({ commitGenProvider, commitGenModel, commitGenEffort }),
    }),
    {
      name: "lightcode-shared-settings",
      version: 3,
      storage: createDbStorage(),
      partialize: (state) => ({
        themeMode: state.themeMode,
        commitGenProvider: state.commitGenProvider,
        commitGenModel: state.commitGenModel,
        commitGenEffort: state.commitGenEffort,
      }),
      migrate: (persisted, version) => {
        if (version < 3) {
          return {
            ...(persisted as Record<string, unknown>),
            commitGenProvider: "auto",
            commitGenModel: "",
            commitGenEffort: "",
          };
        }
        return persisted as SharedSettingsState;
      },
    },
  ),
);
