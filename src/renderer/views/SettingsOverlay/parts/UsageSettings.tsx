import { startTransition, useEffect, useState, type ReactNode } from "react";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { NumberField, Tooltip } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button, Select } from "@/renderer/components/common";
import { usageProvidersForAgentInstances } from "@/renderer/components/providers/usageProviders";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import {
  getStandaloneOwnerDesktopId,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useSettingsHostServer, useSettingsHostStore } from "@/renderer/state/settingsHostStore";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import { UsageDisplaySettings } from "./UsageDisplaySettings";
import { HostUsageSettings } from "./HostUsageSettings";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { UsageProviderRow } from "../../../components/providers/settings/UsageProviderRow";
import { clampRefreshMinutes, MAX_REFRESH_MINUTES } from "./usageRefreshBounds";

const CURRENT_HOST = "current";

export function UsageSettings() {
  const { t } = useLingui();
  const remote = isRemoteSession();
  const compactLayout = useCompactLayout();
  const servers = useRemoteServersStore((state) => state.servers);
  const settingsHost = useSettingsHostServer();
  const hostChosen = useSettingsHostStore((state) => state.desktopId !== null);
  const requestedId = useUsageScopeStore((state) => state.desktopId);
  const setRequestedId = useUsageScopeStore((state) => state.setDesktopId);
  // A remote client shows the host its settings are scoped to; the overlay's
  // host bar switches it. Until the user picks one, attached Electron starts
  // on the standalone host it attached to.
  if (remote) {
    const owner = hostChosen ? null : getStandaloneOwnerDesktopId();
    const ownerServer = servers.find((server) => remoteConnectionKey(server) === owner);
    const server = ownerServer ?? settingsHost;
    return (
      <HostUsageSettings connectionId={server ? remoteConnectionKey(server) : ""} selector={null} />
    );
  }
  // The wide layout docks the shared host bar over the page; the compact layout
  // has no room for it, so it keeps an inline row.
  const selector =
    compactLayout && (servers.length > 0 || requestedId !== null) ? (
      <SettingRow
        title={t`Usage host`}
        description={t`Choose the host or environment whose accounts you want to view.`}
      >
        <Select
          aria-label={t`Usage host`}
          className="w-[220px] shrink-0"
          // Connection ids are tuple-encoded so one named "current" stays
          // distinct from the current-host option.
          value={requestedId === null ? CURRENT_HOST : JSON.stringify(["connection", requestedId])}
          onChange={(id) =>
            setRequestedId(id === CURRENT_HOST ? null : (JSON.parse(id) as [string, string])[1])
          }
          options={[
            { id: CURRENT_HOST, label: t`This host` },
            ...servers.map((server) => ({
              id: JSON.stringify(["connection", remoteConnectionKey(server)]),
              label: server.label,
            })),
          ]}
        />
      </SettingRow>
    ) : null;
  if (requestedId !== null) {
    return <HostUsageSettings connectionId={requestedId} selector={selector} />;
  }
  return <CurrentHostUsageSettings selector={selector} />;
}

function CurrentHostUsageSettings(props: { selector: ReactNode }) {
  const { t } = useLingui();
  const autoRefresh = useSharedSettings((s) => s.usage.autoRefresh);
  const refreshIntervalMinutes = useSharedSettings((s) => s.usage.refreshIntervalMinutes);
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
      .refreshProviderUsage({ force: true })
      .then((res) => {
        for (const snapshot of res.snapshots)
          useProviderUsageStore.getState().mergeSnapshot(snapshot);
      })
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
      {props.selector}

      <SettingRow
        anchorId="usage.autoRefreshMinutes"
        title={t`Default auto-refresh (minutes)`}
        description={
          <Trans>
            The default background refresh cadence. Providers may use a slower default unless an
            interval is set below. Set to 0 to turn off (manual only). The minimum interval is 2
            minutes.
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

      <UsageDisplaySettings />

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
            <UsageProviderRow key={p.id} id={p.id} label={p.label} remote={false} />
          ))}
        </div>
      </div>
    </SettingsPage>
  );
}
