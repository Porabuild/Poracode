import { create } from "zustand";
import { readBridge } from "../bridge";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  type SharedSettings,
} from "../../shared/settings";
import type { TerminalPosition, ThemeMode } from "../../shared/contracts";

const STORAGE_KEY = "lightcode-shared-settings";

interface SharedSettingsState extends SharedSettings {
  setThemeMode: (mode: ThemeMode) => void;
  setTerminalPosition: (position: TerminalPosition) => void;
  setCommitGenConfig: (provider: string, model: string, effort: string) => void;
  setTitleGenConfig: (provider: string, model: string, effort: string) => void;
}

function hasBridge(): boolean {
  return typeof window !== "undefined" && window.lightcode !== undefined;
}

function loadFallbackSettings(): SharedSettings {
  if (typeof window === "undefined") {
    return { ...defaultSharedSettings };
  }

  try {
    return normalizeSharedSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return { ...defaultSharedSettings };
  }
}

function persistSettings(settings: SharedSettings): void {
  if (typeof window === "undefined") {
    return;
  }

  if (hasBridge()) {
    void readBridge().setSharedSettings(settings);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

const initialSettings = loadFallbackSettings();

export const useSharedSettings = create<SharedSettingsState>()((set, get) => ({
  ...initialSettings,
  setThemeMode: (themeMode) => {
    set({ themeMode });
    persistSettings(selectSharedSettings(get()));
  },
  setTerminalPosition: (terminalPosition) => {
    set({ terminalPosition });
    persistSettings(selectSharedSettings(get()));
  },
  setCommitGenConfig: (commitGenProvider, commitGenModel, commitGenEffort) => {
    set({ commitGenProvider, commitGenModel, commitGenEffort });
    persistSettings(selectSharedSettings(get()));
  },
  setTitleGenConfig: (titleGenProvider, titleGenModel, titleGenEffort) => {
    set({ titleGenProvider, titleGenModel, titleGenEffort });
    persistSettings(selectSharedSettings(get()));
  },
}));

function selectSharedSettings(state: SharedSettingsState): SharedSettings {
  return {
    themeMode: state.themeMode,
    terminalPosition: state.terminalPosition,
    commitGenProvider: state.commitGenProvider,
    commitGenModel: state.commitGenModel,
    commitGenEffort: state.commitGenEffort,
    titleGenProvider: state.titleGenProvider,
    titleGenModel: state.titleGenModel,
    titleGenEffort: state.titleGenEffort,
  };
}

if (hasBridge()) {
  void readBridge()
    .getSharedSettings()
    .then((settings) => {
      useSharedSettings.setState((state) => ({
        ...state,
        ...normalizeSharedSettings(settings),
      }));
    })
    .catch(() => undefined);
}
