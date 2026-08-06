import { useEffect, useRef, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common";
import { PluginDetail } from "@/renderer/components/plugins/PluginDetail";
import { PluginMarketplace } from "@/renderer/components/plugins/PluginMarketplace";
import { useLocalizedPluginCatalog } from "@/renderer/components/plugins/pluginCopy";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { readBridge } from "@/renderer/bridge";

export function PluginsSettings() {
  const plugins = useLocalizedPluginCatalog();
  const loadPlugins = usePlugins((state) => state.load);
  const loaded = usePlugins((state) => state.loaded);
  const error = usePlugins((state) => state.error);
  const [selectedPluginId, setSelectedPluginId] = useState<string>();
  const returnFocusPluginId = useRef<string | undefined>(undefined);
  const selectedPlugin = plugins.find((entry) => entry.plugin.name === selectedPluginId);
  const hostPlatform = readBridge().platform;

  // Packages live on disk and can be added while the app runs, so rescan every
  // time the marketplace opens rather than trusting the first load.
  useEffect(() => {
    void loadPlugins(true);
  }, [loadPlugins]);

  useEffect(() => {
    const pluginId = returnFocusPluginId.current;
    if (selectedPluginId !== undefined || pluginId === undefined) return;
    const marketplace = document.querySelector<HTMLElement>(
      '[data-settings-anchor="plugins.marketplace"]',
    );
    const target = [...(marketplace?.querySelectorAll<HTMLElement>("[data-plugin-id]") ?? [])].find(
      (element) => element.dataset.pluginId === pluginId,
    );
    (
      target ?? marketplace?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    )?.focus();
    returnFocusPluginId.current = undefined;
  }, [selectedPluginId]);

  if (!loaded) {
    return (
      <div className="flex min-h-32 items-center justify-center text-sm text-muted" role="status">
        <Trans>Loading…</Trans>
      </div>
    );
  }

  if (error && plugins.length === 0) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-sm text-muted">
        <p role="alert">
          <Trans>Connection failed.</Trans>
        </p>
        <Button size="sm" variant="tertiary" onPress={() => void loadPlugins(true)}>
          <Trans>Retry</Trans>
        </Button>
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
