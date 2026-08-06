import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { LightballTabs } from "@/renderer/components/common";
import { PluginDetail } from "@/renderer/components/plugins/PluginDetail";
import { PluginMarketplace } from "@/renderer/components/plugins/PluginMarketplace";
import { PluginsManager } from "@/renderer/components/plugins/PluginsManager";
import { useLocalizedPluginCatalog } from "@/renderer/components/plugins/pluginCopy";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { readBridge } from "@/renderer/bridge";

type PluginsTab = "marketplace" | "manage";

export function PluginsSettings() {
  const { t } = useLingui();
  const plugins = useLocalizedPluginCatalog();
  const loadPlugins = usePlugins((state) => state.load);
  const [tab, setTab] = useState<PluginsTab>("marketplace");
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

  const openPlugin = (pluginId: string) => {
    returnFocusPluginId.current = pluginId;
    setSelectedPluginId(pluginId);
  };

  const tabs = [
    { id: "marketplace" as const, label: t`Marketplace` },
    { id: "manage" as const, label: t`Manage` },
  ];

  return (
    <div data-settings-anchor="plugins.marketplace">
      <div hidden={selectedPlugin !== undefined}>
        <div className="mx-auto mb-4 flex max-w-[960px] justify-end">
          <LightballTabs
            tabs={tabs}
            active={tab}
            onChange={setTab}
            ariaLabel={t`Plugin settings views`}
          />
        </div>
        {tab === "marketplace" ? (
          <PluginMarketplace plugins={plugins} hostPlatform={hostPlatform} onOpen={openPlugin} />
        ) : (
          <PluginsManager plugins={plugins} hostPlatform={hostPlatform} onOpen={openPlugin} />
        )}
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
