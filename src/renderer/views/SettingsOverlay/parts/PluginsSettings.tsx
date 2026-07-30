import { useEffect, useRef, useState } from "react";
import { PluginDetail } from "@/renderer/components/plugins/PluginDetail";
import { PluginMarketplace } from "@/renderer/components/plugins/PluginMarketplace";
import { useLocalizedPluginCatalog } from "@/renderer/components/plugins/pluginCopy";
import { readBridge } from "@/renderer/bridge";

export function PluginsSettings() {
  const plugins = useLocalizedPluginCatalog();
  const [selectedPluginId, setSelectedPluginId] = useState<string>();
  const returnFocusPluginId = useRef<string | undefined>(undefined);
  const selectedPlugin = plugins.find((plugin) => plugin.manifest.id === selectedPluginId);
  const hostPlatform = readBridge().platform;

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
