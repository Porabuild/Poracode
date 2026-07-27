import { startTransition, useEffect, useState } from "react";
import { NumberField, Tooltip } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button, ToggleSwitch } from "@/renderer/components/common";
import { usageProvidersForAgentInstances } from "@/renderer/components/providers/usageProviders";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { UsageProviderRow } from "./UsageProviderRow";
import { clampRefreshMinutes, MAX_REFRESH_MINUTES } from "./usageRefreshBounds";

export function UsageSettings() {
  const { t } = useLingui();
  const autoRefresh = useSharedSettings((s) => s.usage.autoRefresh);
  const refreshIntervalMinutes = useSharedSettings((s) => s.usage.refreshIntervalMinutes);
  const showInSidebar = useSharedSettings((s) => s.usage.showInSidebar);
  const showEstimatedCost = useSharedSettings((s) => s.usage.showEstimatedCost);
  const agentInstances = useSharedSettings((s) => s.agentInstances);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const usageProviders = usageProvidersForAgentInstances(agentInstances);

  // Hydrate the store from the supervisor cache on open (and let the cache's
  // staleness trigger a background refresh whose events update the rows live).
  useEffect(() => {
    let cancelled = false;
    void readBridge()
      .getProviderUsage({})
      .then((res) => {
        if (cancelled) return;
        const store = useProviderUsageStore.getState();
        for (const snapshot of res.snapshots) store.mergeSnapshot(snapshot);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshNow = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    void readBridge()
      .refreshProviderUsage({})
      .catch(() => undefined)
      .finally(() => setIsRefreshing(false));
  };

  return (
    <SettingsPage
      title={t`Provider Usage`}
      description={t`Track per-provider session, weekly, and monthly usage. Windows are reported by each provider; estimated cost is reconstructed from local logs.`}
      actions={
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label={t`Refresh`}
              className="text-muted"
              isDisabled={isRefreshing}
              onPress={refreshNow}
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <Trans comment="Button: re-fetch provider usage now">Refresh</Trans>
          </Tooltip.Content>
        </Tooltip>
      }
    >
      {/* The background refresher runs on the desktop; a remote session's
          interval is never read, so hide the row there. */}
      {!isRemoteSession() && (
        <SettingRow
          anchorId="usage.autoRefreshMinutes"
          title={t`Default auto-refresh (minutes)`}
          description={
            <Trans>
              The default background refresh cadence, used for any provider without its own interval
              set below. Set to 0 to turn off (manual only). The 2-minute floor respects provider
              rate limits.
            </Trans>
          }
        >
          <NumberField
            aria-label={t`Auto-refresh interval in minutes, 0 to turn off`}
            className="w-[140px] shrink-0"
            minValue={0}
            maxValue={MAX_REFRESH_MINUTES}
            step={1}
            value={autoRefresh ? refreshIntervalMinutes : 0}
            onChange={(value) => {
              if (value === undefined || Number.isNaN(value)) return;
              const minutes = Math.floor(value);
              startTransition(() => {
                if (minutes <= 0) {
                  setUsageSetting("autoRefresh", false);
                  return;
                }
                setUsageSetting("autoRefresh", true);
                setUsageSetting("refreshIntervalMinutes", clampRefreshMinutes(minutes));
              });
            }}
          >
            <NumberField.Group>
              <NumberField.DecrementButton />
              <NumberField.Input />
              <NumberField.IncrementButton />
            </NumberField.Group>
          </NumberField>
        </SettingRow>
      )}

      <SettingRow
        anchorId="usage.showInSidebar"
        title={t`Show circles in sidebar`}
        description={
          <Trans>
            Show compact per-provider usage rings in the sidebar. Hide individual providers&apos;
            circles in the list below.
          </Trans>
        }
      >
        <ToggleSwitch
          aria-label={t`Show circles in sidebar`}
          isSelected={showInSidebar}
          onChange={(selected) => {
            startTransition(() => {
              setUsageSetting("showInSidebar", selected);
            });
          }}
        />
      </SettingRow>

      <SettingRow
        anchorId="usage.showEstimatedCost"
        title={t`Show estimated cost`}
        description={
          <Trans>
            Reconstructed from local logs at public API rates — it does not reflect your real bill
            on subscription plans. Shown only in the usage panel.
          </Trans>
        }
      >
        <ToggleSwitch
          aria-label={t`Show estimated cost`}
          isSelected={showEstimatedCost}
          onChange={(selected) => {
            startTransition(() => {
              setUsageSetting("showEstimatedCost", selected);
            });
          }}
        />
      </SettingRow>

      <div className="pt-2">
        <p className="mb-1 text-sm font-medium text-foreground">
          <Trans>Providers</Trans>
        </p>
        <p className="mb-2 text-xs text-muted">
          <Trans>
            Turn tracking on or off per provider. Disabled providers are skipped by the
            auto-refresh.
          </Trans>
        </p>
        <div>
          {usageProviders.map((p) => (
            <UsageProviderRow key={p.id} id={p.id} label={p.label} />
          ))}
        </div>
      </div>
    </SettingsPage>
  );
}
