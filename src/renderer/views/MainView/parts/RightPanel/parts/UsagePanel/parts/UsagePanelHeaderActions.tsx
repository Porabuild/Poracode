import { startTransition, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, RefreshCw, Settings2 } from "lucide-react";
import { openUsageSettings } from "@/renderer/actions/panelActions";
import { readBridge } from "@/renderer/bridge";
import { panelHeaderIconButtonClass } from "@/renderer/components/layout/sidebarChrome";
import { resolveDisplayedProviders } from "@/renderer/components/providers/usageProviders";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

/**
 * Usage-tab actions rendered in the shared right-panel header (so the panel
 * body needs no second header of its own). Reads the same settings the body
 * does, so collapse/order state stays in sync across the two.
 */
export function UsagePanelHeaderActions(props: { dragControlClass: string }) {
  const { dragControlClass } = props;
  const providerOrder = useSharedSettings((s) => s.usage.providerOrder);
  const disabledProviders = useSharedSettings((s) => s.usage.disabledProviders);
  const collapsedProviders = useSharedSettings((s) => s.usage.collapsedProviders);
  const agentInstances = useSharedSettings((s) => s.agentInstances);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const displayed = resolveDisplayedProviders(providerOrder, disabledProviders, agentInstances);
  const allCollapsed =
    displayed.length > 0 && displayed.every((p) => collapsedProviders.includes(p.id));

  const refreshNow = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    void readBridge()
      .refreshProviderUsage({})
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  };

  const toggleCollapseAll = () => {
    const displayedIds = new Set(displayed.map((p) => p.id));
    const next = allCollapsed
      ? collapsedProviders.filter((id) => !displayedIds.has(id))
      : [...new Set([...collapsedProviders, ...displayedIds])];
    startTransition(() => setUsageSetting("collapsedProviders", next));
  };

  const buttonClass = `${dragControlClass} ${panelHeaderIconButtonClass}`;

  return (
    <>
      {displayed.length > 0 ? (
        <button
          type="button"
          className={buttonClass}
          title={allCollapsed ? "Expand all" : "Collapse all"}
          onClick={toggleCollapseAll}
        >
          {allCollapsed ? (
            <ChevronsUpDown className="size-3.5" />
          ) : (
            <ChevronsDownUp className="size-3.5" />
          )}
        </button>
      ) : null}
      <button
        type="button"
        className={buttonClass}
        title="Usage settings"
        onClick={openUsageSettings}
      >
        <Settings2 className="size-3.5" />
      </button>
      <button
        type="button"
        className={buttonClass}
        title="Refresh"
        disabled={isRefreshing}
        onClick={refreshNow}
      >
        <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
      </button>
    </>
  );
}
