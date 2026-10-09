import { startTransition, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { RefreshCw } from "lucide-react";
import { Button } from "@/renderer/components/common";
import { UsageProviderCardView } from "@/renderer/components/providers/UsageProviderCardView";
import { HostUsageStatus, useHostUsageView } from "@/renderer/components/providers/HostUsageView";
import { HostUsageInfo } from "@/renderer/components/providers/HostUsageInfo";
import { fetchHostUsage } from "@/renderer/components/providers/hostUsage";
import { usageProvidersForAgentInstances } from "@/renderer/components/providers/usageProviders";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { SettingsPage } from "./SettingsForm";
import { UsageDisplaySettings } from "./UsageDisplaySettings";

/** Collection policy and credentials remain on the selected host. */
export function HostUsageSettings(props: { connectionId: string; selector: ReactNode }) {
  const { connectionId, selector } = props;
  const { t, i18n } = useLingui();
  const view = useHostUsageView(connectionId);
  const collapsed = useSharedSettings((state) => state.usage.collapsedProviders);
  const setUsageSetting = useSharedSettings((state) => state.setUsageSetting);
  const labels = new Map(usageProvidersForAgentInstances(undefined).map((p) => [p.id, p.label]));
  if (view.canRead) {
    for (const agent of view.agents?.windows ?? []) labels.set(agent.kind, agent.label);
    for (const snapshot of view.usage.snapshots)
      if (!labels.has(snapshot.providerId)) labels.set(snapshot.providerId, snapshot.providerId);
  }
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
      <UsageDisplaySettings showProviderVisibility />
      <HostUsageStatus view={view} />
      {view.canRead
        ? view.usage.snapshots.map((snapshot, index) => {
            const fetchedAt = i18n.date(snapshot.fetchedAt, {
              dateStyle: "short",
              timeStyle: "short",
            });
            return (
              <div key={snapshot.providerId} className="space-y-1 py-2">
                <UsageProviderCardView
                  id={snapshot.providerId}
                  label={labels.get(snapshot.providerId) ?? snapshot.providerId}
                  snapshot={snapshot}
                  showAccount
                  index={index}
                  compact={false}
                  collapsed={collapsed.includes(snapshot.providerId)}
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
                      providerIds: [snapshot.providerId],
                      force: true,
                    })
                  }
                />
                <p className="text-xs text-muted">
                  <Trans>Last updated: {fetchedAt}</Trans>
                </p>
              </div>
            );
          })
        : null}
    </SettingsPage>
  );
}
