import { startTransition, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { NumberField, Switch } from "@heroui/react";
import { readBridge } from "@/renderer/bridge";
import { Button } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import {
  formatMoney,
  formatTokens,
  usageStatusText,
} from "@/renderer/components/providers/usageFormat";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import { USAGE_PROVIDERS } from "@/renderer/components/providers/usageProviders";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProviderUsage, useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { SettingRow, SettingsPage } from "./SettingsForm";

function UsageProviderRow(props: { id: string; label: string }) {
  const { id, label } = props;
  const snapshot = useProviderUsage(id);
  const disabledProviders = useSharedSettings((s) => s.usage.disabledProviders);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const enabled = !disabledProviders.includes(id);
  const showBars = enabled && snapshot?.status === "ok" && snapshot.windows.length > 0;
  const reserveBars = !enabled && snapshot?.status === "ok" && snapshot.windows.length > 0;
  const message = enabled ? usageStatusText(snapshot, label) : "Tracking off";

  return (
    <div className="flex items-start justify-between gap-4 border-t border-[color:var(--separator)] py-3 first:border-t-0">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <ProviderIcon kind={id} fallbackLabel={label} className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{label}</p>
            {snapshot?.plan ? (
              <span className="truncate text-xs text-muted">{snapshot.plan}</span>
            ) : null}
          </div>
          {showBars && snapshot ? (
            <UsageWindowBars windows={snapshot.windows} className="mt-1.5 max-w-[360px]" />
          ) : reserveBars && snapshot ? (
            <div className="relative mt-1.5 max-w-[360px]">
              <div className="invisible" aria-hidden="true">
                <UsageWindowBars windows={snapshot.windows} />
              </div>
              <p className="absolute inset-0 text-xs text-muted">{message}</p>
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-muted">{message}</p>
          )}
          {snapshot?.cost ? (
            <p className="mt-1.5 text-xs text-muted">
              ~{formatMoney(snapshot.cost.amount, snapshot.cost.currency)}
              {snapshot.tokens?.total ? ` · ${formatTokens(snapshot.tokens.total)} tokens` : ""}
              {` · ${snapshot.cost.period} · est.`}
            </p>
          ) : null}
          {snapshot?.credits && !snapshot.credits.unlimited ? (
            <p className="mt-1.5 text-xs text-muted">
              {snapshot.credits.label ?? "Credits"}:{" "}
              {formatMoney(snapshot.credits.balance, snapshot.credits.currency)}
            </p>
          ) : null}
        </div>
      </div>
      <Switch
        aria-label={`Track ${label} usage`}
        isSelected={enabled}
        onChange={(selected) => {
          const next = selected
            ? disabledProviders.filter((x) => x !== id)
            : [...new Set([...disabledProviders, id])];
          startTransition(() => {
            setUsageSetting("disabledProviders", next);
          });
        }}
      >
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch>
    </div>
  );
}

export function UsageSettings() {
  const autoRefresh = useSharedSettings((s) => s.usage.autoRefresh);
  const refreshIntervalMinutes = useSharedSettings((s) => s.usage.refreshIntervalMinutes);
  const showInSidebar = useSharedSettings((s) => s.usage.showInSidebar);
  const showEstimatedCost = useSharedSettings((s) => s.usage.showEstimatedCost);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      title="Usage"
      description="Track per-provider session, weekly, and monthly usage. Windows are reported by each provider; estimated cost is reconstructed from local logs."
      actions={
        <Button size="sm" variant="secondary" isDisabled={isRefreshing} onPress={refreshNow}>
          <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      <SettingRow
        title="Auto-refresh (minutes)"
        description="Refresh usage in the background every N minutes. Set to 0 to turn off (manual only). The 2-minute floor respects provider rate limits."
      >
        <NumberField
          aria-label="Auto-refresh interval in minutes, 0 to turn off"
          className="w-[140px] shrink-0"
          minValue={0}
          maxValue={120}
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
              setUsageSetting("refreshIntervalMinutes", Math.min(120, Math.max(2, minutes)));
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

      <SettingRow
        title="Show circles in sidebar"
        description="Show a compact per-provider usage ring in the sidebar."
      >
        <Switch
          isSelected={showInSidebar}
          onChange={(selected) => {
            startTransition(() => {
              setUsageSetting("showInSidebar", selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <SettingRow
        title="Show estimated cost"
        description="Reconstructed from local logs at public API rates — it does not reflect your real bill on subscription plans. Shown only in the usage panel."
      >
        <Switch
          isSelected={showEstimatedCost}
          onChange={(selected) => {
            startTransition(() => {
              setUsageSetting("showEstimatedCost", selected);
            });
          }}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </SettingRow>

      <div className="pt-2">
        <p className="mb-1 text-sm font-medium text-foreground">Providers</p>
        <p className="mb-2 text-xs text-muted">
          Turn tracking on or off per provider. Disabled providers are skipped by the auto-refresh.
        </p>
        <div>
          {USAGE_PROVIDERS.map((p) => (
            <UsageProviderRow key={p.id} id={p.id} label={p.label} />
          ))}
        </div>
      </div>
    </SettingsPage>
  );
}
