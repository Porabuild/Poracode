import { startTransition, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChevronsDownUp, ChevronsUpDown, RefreshCw } from "lucide-react";
import { Button } from "@/renderer/components/common";
import { UsageProviderCardView } from "@/renderer/components/providers/UsageProviderCardView";
import { HostUsageStatus, useHostUsageView } from "@/renderer/components/providers/HostUsageView";
import { HostUsageInfo } from "@/renderer/components/providers/HostUsageInfo";
import { fetchHostUsage } from "@/renderer/components/providers/hostUsage";
import { resolveHostUsageProviders } from "@/renderer/components/providers/usageProviders";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SettingsPage } from "./SettingsForm";
import { UsageDisplaySettings } from "./UsageDisplaySettings";

/** Collection policy and credentials remain on the selected host. */
export function HostUsageSettings(props: { connectionId: string; selector: ReactNode }) {
  const { connectionId, selector } = props;
  const { t, i18n } = useLingui();
  const view = useHostUsageView(connectionId);
  const collapsed = useSharedSettings((state) => state.usage.collapsedProviders);
  const providerOrder = useSharedSettings((state) => state.usage.providerOrder);
  const setUsageSetting = useSharedSettings((state) => state.setUsageSetting);

  const orderedProviders = view.canRead
    ? resolveHostUsageProviders(view.usage.snapshots, providerOrder, view.agents)
    : [];
  const snapshotById = new Map(
    view.usage.snapshots.map((snapshot) => [snapshot.providerId, snapshot]),
  );
  const allCollapsed =
    orderedProviders.length > 0 && orderedProviders.every((p) => collapsed.includes(p.id));

  const toggleCollapseAll = () => {
    const visibleIds = new Set(orderedProviders.map((p) => p.id));
    const next = allCollapsed
      ? collapsed.filter((id) => !visibleIds.has(id))
      : [...new Set([...collapsed, ...visibleIds])];
    startTransition(() => setUsageSetting("collapsedProviders", next));
  };

  return (
    <SettingsPage
      title={t`Provider Usage`}
      description={t`Usage is collected on the selected host. Accounts and quotas are shown separately for each host.`}
      actions={
        <div className="flex items-center gap-1">
          <HostUsageInfo />
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={t`Refresh`}
            isDisabled={!view.canRefresh || view.usage.refreshing}
            onPress={() => void fetchHostUsage(connectionId, true, { force: true })}
          >
            <RefreshCw className={`size-4 ${view.usage.refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      }
    >
      {selector}
      <UsageDisplaySettings showHostNote />

      <section className="space-y-2 pt-1">
        {view.canRead && orderedProviders.length > 0 ? (
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-foreground/80">
              <Trans>Quotas</Trans>
            </h3>
            {orderedProviders.length > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label={allCollapsed ? t`Expand all` : t`Collapse all`}
                className="h-6 min-h-6 gap-1 px-2 text-xs text-muted hover:text-foreground"
                onPress={toggleCollapseAll}
              >
                {allCollapsed ? (
                  <>
                    <ChevronsUpDown className="size-3.5" />
                    <Trans>Expand all</Trans>
                  </>
                ) : (
                  <>
                    <ChevronsDownUp className="size-3.5" />
                    <Trans>Collapse all</Trans>
                  </>
                )}
              </Button>
            ) : null}
          </div>
        ) : null}

        <HostUsageStatus view={view} />

        {view.canRead && orderedProviders.length > 0 ? (
          <div className="space-y-2.5">
            {orderedProviders.map((provider, index) => {
              const snapshot = snapshotById.get(provider.id);
              if (!snapshot) return null;
              const fetchedAt = i18n.date(snapshot.fetchedAt, {
                dateStyle: "short",
                timeStyle: "short",
              });
              return (
                <UsageProviderCardView
                  key={provider.id}
                  id={provider.id}
                  label={provider.label}
                  snapshot={snapshot}
                  showAccount
                  index={index}
                  compact={false}
                  collapsed={collapsed.includes(provider.id)}
                  draggable={false}
                  onToggleCollapse={(id) =>
                    startTransition(() =>
                      setUsageSetting(
                        "collapsedProviders",
                        collapsed.includes(id)
                          ? collapsed.filter((p) => p !== id)
                          : [...collapsed, id],
                      ),
                    )
                  }
                  refreshing={view.usage.refreshing}
                  refreshDisabled={!view.canRefresh}
                  onRefresh={() =>
                    void fetchHostUsage(connectionId, true, {
                      providerIds: [provider.id],
                      force: true,
                    })
                  }
                  footer={<Trans>Last updated: {fetchedAt}</Trans>}
                />
              );
            })}
          </div>
        ) : null}
      </section>
    </SettingsPage>
  );
}
