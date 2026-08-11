import { useEffect, useRef, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { Button, PixelLoader } from "@/renderer/components/common";
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
              onPress={() => void loadPlugins(true)}
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
