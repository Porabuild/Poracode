import { useEffect } from "react";
import { create } from "zustand";
import type { LoadedPlugin, ProjectLocation } from "@/shared/contracts";
import { getProjectFsPath } from "@/shared/wsl";
import { readBridge } from "@/renderer/bridge";

/**
 * Agent Plugins packages loaded by the supervisor.
 *
 * Packages live on disk, so unlike the old hardcoded catalog this list is read
 * over IPC and can change while the app is running — a user can drop a package
 * into the plugin folder and refresh.
 *
 * Discovery is scoped: the app-global roots (bundled + the user plugin folder)
 * are shared by every project, while a project's own `.poracode/plugins` root
 * is only visible to that project. Lists are therefore kept per scope, keyed by
 * the project path, with `""` for the app-global scope.
 */

/** Scope key for a project's plugin list; `""` is the app-global scope. */
export function pluginScopeKey(projectLocation?: ProjectLocation): string {
  return projectLocation ? getProjectFsPath(projectLocation) : "";
}

interface PluginsState {
  /** Loaded packages per scope key. Includes the app-global roots in every entry. */
  pluginsByScope: Record<string, LoadedPlugin[]>;
  userPluginsDir: string;
  loadedScopes: Record<string, true>;
  loading: Record<string, true>;
  revision: number;
  error: unknown;
  load: (options?: { projectLocation?: ProjectLocation; rescan?: boolean }) => Promise<void>;
}

export const usePlugins = create<PluginsState>()((set, get) => ({
  pluginsByScope: {},
  userPluginsDir: "",
  loadedScopes: {},
  loading: {},
  revision: 0,
  error: undefined,
  load: async (options = {}) => {
    const scope = pluginScopeKey(options.projectLocation);
    if (get().loading[scope]) return;
    set((state) => ({ loading: { ...state.loading, [scope]: true }, error: undefined }));
    try {
      const bridge = readBridge();
      const payload = options.projectLocation ? { projectLocation: options.projectLocation } : {};
      const result = options.rescan
        ? await bridge.refreshPlugins(payload)
        : await bridge.listPlugins(payload);
      set((state) => {
        const loading = { ...state.loading };
        delete loading[scope];
        return {
          // A rescan re-reads the shared roots too, so drop the other scopes
          // rather than serving a stale copy of a package that just changed.
          pluginsByScope: options.rescan
            ? { [scope]: result.plugins }
            : { ...state.pluginsByScope, [scope]: result.plugins },
          userPluginsDir: result.userPluginsDir,
          loadedScopes: options.rescan
            ? { [scope]: true as const }
            : { ...state.loadedScopes, [scope]: true as const },
          loading,
          revision: state.revision + 1,
        };
      });
    } catch (error) {
      set((state) => {
        const loading = { ...state.loading };
        delete loading[scope];
        return { error, loading, loadedScopes: { ...state.loadedScopes, [scope]: true as const } };
      });
    }
  },
}));

/**
 * Packages visible to a project. Falls back to the app-global list until the
 * project scope has loaded, so the composer never blanks out mid-scan.
 */
export function selectPluginsForScope(
  state: Pick<PluginsState, "pluginsByScope">,
  projectLocation?: ProjectLocation,
): LoadedPlugin[] {
  const scope = pluginScopeKey(projectLocation);
  return state.pluginsByScope[scope] ?? state.pluginsByScope[""] ?? EMPTY_PLUGINS;
}

/** Stable identity so a scope with no packages doesn't churn subscribers. */
const EMPTY_PLUGINS: LoadedPlugin[] = [];

/**
 * Loads the plugin scope a reader asks for, once, if it is not loaded yet. The
 * app-global scope is normally loaded during hydration, but a rescan drops
 * every other scope, so it is re-read on demand here too — otherwise a rescan
 * from a project workspace would leave home-scope threads with no packages for
 * the rest of the run.
 */
export function useProjectPluginScope(projectLocation?: ProjectLocation): void {
  const scope = pluginScopeKey(projectLocation);
  const load = usePlugins((state) => state.load);
  const loaded = usePlugins((state) => state.loadedScopes[scope] === true);
  useEffect(() => {
    if (loaded) return;
    void load({ ...(projectLocation ? { projectLocation } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by scope, not by location object identity.
  }, [scope, loaded, load]);
}
