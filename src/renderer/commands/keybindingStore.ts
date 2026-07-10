import { create } from "zustand";
import type { KeybindingsConfig, KeybindingEntry } from "@/shared/keybindings";
import { DEFAULT_KEYBINDINGS } from "@/shared/keybindings";
import { readBridge } from "@/renderer/bridge";

interface KeybindingState {
  path: string | null;
  keybindings: KeybindingEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  /**
   * Replace the full keybinding list and persist it to keybindings.json. The
   * live shortcut hook reads `keybindings` from this store on every keydown, so
   * the new bindings take effect as soon as state updates.
   */
  save: (next: KeybindingEntry[]) => Promise<void>;
}

type KeybindingBridge = {
  getKeybindings?: () => Promise<KeybindingsConfig>;
  setKeybindings?: (file: {
    version: 1;
    keybindings: KeybindingEntry[];
  }) => Promise<KeybindingsConfig>;
};

export const useKeybindingStore = create<KeybindingState>((set, get) => ({
  path: null,
  keybindings: DEFAULT_KEYBINDINGS.keybindings,
  loaded: false,
  load: async () => {
    const bridge = readBridge() as KeybindingBridge;
    if (typeof bridge.getKeybindings !== "function") {
      set({
        path: "",
        keybindings: DEFAULT_KEYBINDINGS.keybindings,
        loaded: true,
      });
      return;
    }

    const config = await bridge.getKeybindings();
    set({
      path: config.path,
      keybindings: config.file.keybindings,
      loaded: true,
    });
  },
  save: async (next) => {
    // Optimistically apply so the UI and the keydown hook react immediately;
    // the persisted config (with its canonical path) reconciles on resolve.
    const previous = get().keybindings;
    set({ keybindings: next });
    const bridge = readBridge() as KeybindingBridge;
    if (typeof bridge.setKeybindings !== "function") return;
    try {
      const config = await bridge.setKeybindings({ version: 1, keybindings: next });
      set({ path: config.path, keybindings: config.file.keybindings });
    } catch (error) {
      set({ keybindings: previous });
      throw error;
    }
  },
}));
