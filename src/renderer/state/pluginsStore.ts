import { create } from "zustand";
import type { LoadedPlugin } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";

/**
 * Agent Plugins packages loaded by the supervisor.
 *
 * Packages live on disk, so unlike the old hardcoded catalog this list is read
 * over IPC and can change while the app is running — a user can drop a package
 * into the plugin folder and refresh.
 */

interface PluginsState {
  plugins: LoadedPlugin[];
  userPluginsDir: string;
  loaded: boolean;
  loading: boolean;
  revision: number;
  error: unknown;
  load: (rescan?: boolean) => Promise<void>;
}

export const usePlugins = create<PluginsState>()((set, get) => ({
  plugins: [],
  userPluginsDir: "",
  loaded: false,
  loading: false,
  revision: 0,
  error: undefined,
  load: async (rescan = false) => {
    if (get().loading) return;
    set({ loading: true, error: undefined });
    try {
      const bridge = readBridge();
      const result = rescan ? await bridge.refreshPlugins() : await bridge.listPlugins();
      set((state) => ({
        plugins: result.plugins,
        userPluginsDir: result.userPluginsDir,
        loaded: true,
        loading: false,
        revision: state.revision + 1,
      }));
    } catch (error) {
      set({ error, loading: false, loaded: true });
    }
  },
}));
