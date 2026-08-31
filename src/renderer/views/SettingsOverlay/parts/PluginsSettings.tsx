import { useEffect, useRef, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { Button, PixelLoader } from "@/renderer/components/common";
import { PluginDetail } from "@/renderer/components/plugins/PluginDetail";
import { PluginMarketplace } from "@/renderer/components/plugins/PluginMarketplace";
import { useLocalizedPluginCatalog } from "@/renderer/components/plugins/pluginCopy";
import { pluginScopeKey, usePlugins } from "@/renderer/state/pluginsStore";
import { resolveProjectIdForView } from "@/renderer/actions/currentProject";
import { useAppStore } from "@/renderer/state/appStore";
import { isHomeProject } from "@/shared/homeScope";
import { readBridge } from "@/renderer/bridge";

export function PluginsSettings() {
  // The open workspace decides which project packages are in scope; the home
  // scope has no repository of its own, so it sees the app-global roots only.
  const workspaceProject = useAppStore((state) => {
    const projectId = resolveProjectIdForView(state.view, state.threads, state.focusedPaneId);
    const project = state.projects.find((item) => item.id === projectId);
    return isHomeProject(project) ? undefined : project;
  });
  const projectLocation = workspaceProject?.location;
  const plugins = useLocalizedPluginCatalog(projectLocation);
  const loadPlugins = usePlugins((state) => state.load);
  const loaded = usePlugins(
    (state) => state.loadedScopes[pluginScopeKey(projectLocation)] === true,
  );
  const error = usePlugins((state) => state.error);
  const [selectedPluginId, setSelectedPluginId] = useState<string>();
  const returnFocusPluginId = useRef<string | undefined>(undefined);
  const selectedPlugin = plugins.find((entry) => entry.plugin.name === selectedPluginId);
  const hostPlatform = readBridge().platform;

  // Packages live on disk and can be added while the app runs, so rescan every
  // time the marketplace opens rather than trusting the first load.
  useEffect(() => {
    void loadPlugins({ rescan: true, ...(projectLocation ? { projectLocation } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rescan per project scope, not per location object identity.
  }, [loadPlugins, pluginScopeKey(projectLocation)]);

  useEffect(() => {
    const pluginId = returnFocusPluginId.current;
    if (selectedPluginId !== undefined || pluginId === undefined) return;
    const marketplace = document.querySelector<HTMLElement>(
      '[data-settings-anchor="plugins.marketplace"]',
    );
    const target = [...(marketplace?.querySelectorAll<HTMLElement>("[data-plugin-id]") ?? [])].find(
      (element) => element.dataset.pluginId === pluginId,
    );
    (target ?? marketplace?.querySelector<HTMLElement>('input[type="search"], input'))?.focus();
    returnFocusPluginId.current = undefined;
  }, [selectedPluginId]);

  if (!loaded) {
    return (
      <div
        className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted"
        role="status"
      >
        <PixelLoader size="xs" />
        <Trans>Loading plugins…</Trans>
      </div>
    );
  }

  const openPlugin = (pluginId: string) => {
    returnFocusPluginId.current = pluginId;
    setSelectedPluginId(pluginId);
  };

  return (
    <div data-settings-anchor="plugins.marketplace">
      <div hidden={selectedPlugin !== undefined}>
        {error ? (
          <div
            className="mx-auto mb-4 max-w-[960px] rounded-xl border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger"
            role="alert"
          >
            <p>
              <Trans>Couldn't load plugins.</Trans>
            </p>
            <Button
              className="mt-2"
              size="sm"
              variant="tertiary"
              onPress={() =>
                void loadPlugins({ rescan: true, ...(projectLocation ? { projectLocation } : {}) })
              }
            >
              <Trans>Retry</Trans>
            </Button>
          </div>
        ) : null}
        <PluginMarketplace plugins={plugins} hostPlatform={hostPlatform} onOpen={openPlugin} />
      </div>
      {selectedPlugin ? (
        <PluginDetail
          plugin={selectedPlugin}
          hostPlatform={hostPlatform}
          onBack={() => setSelectedPluginId(undefined)}
        />
      ) : null}
    </div>
  );
}
