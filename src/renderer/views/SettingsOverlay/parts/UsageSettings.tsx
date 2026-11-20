import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { startTransition, useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { Disclosure, NumberField, Tooltip } from "@heroui/react";
import { RefreshCw, Search, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { Button, Select, ToggleSwitch } from "@/renderer/components/common";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { refreshAndMergeProviderUsage } from "@/renderer/components/providers/refreshProviderUsageSnapshot";
import {
  resolveDisplayedProviders,
  usageProvidersForAgentInstances,
} from "@/renderer/components/providers/usageProviders";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import {
  getStandaloneOwnerDesktopId,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useSettingsHostServer, useSettingsHostStore } from "@/renderer/state/settingsHostStore";
import { useUsageLoginStateStore } from "@/renderer/state/usageLoginStateStore";
import { useUsageScopeStore } from "@/renderer/state/usageScopeStore";
import { UsageDisplaySettings } from "./UsageDisplaySettings";
import { HostUsageSettings } from "./HostUsageSettings";
import { SettingRow, SettingsPage } from "./SettingsForm";
import { UsageProviderRow } from "../../../components/providers/settings/UsageProviderRow";
import { clampRefreshMinutes, MAX_REFRESH_MINUTES } from "./usageRefreshBounds";

const CURRENT_HOST = "current";
const UNTRACKED_SEARCH_THRESHOLD = 6;

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
  const providerOrder = useSharedSettings((s) => s.usage.providerOrder);
  const disabledProviders = useSharedSettings((s) => s.usage.disabledProviders);
  const agentInstances = useSharedSettings((s) => s.agentInstances);
  const setUsageSetting = useSharedSettings((s) => s.setUsageSetting);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const allProviders = usageProvidersForAgentInstances(agentInstances);
  const disabledSet = new Set(disabledProviders);
  const trackedProviders = resolveDisplayedProviders(
    providerOrder,
    disabledProviders,
    agentInstances,
  );
  const untrackedProviders = allProviders.filter((p) => disabledSet.has(p.id));
  const [moreExpanded, setMoreExpanded] = useState(() => trackedProviders.length === 0);
  const [untrackedSearch, setUntrackedSearch] = useState("");
  const deferredSearch = useDeferredValue(untrackedSearch);
  const showUntrackedSearch = untrackedProviders.length > UNTRACKED_SEARCH_THRESHOLD;
  const query = deferredSearch.trim().toLowerCase();
  const filteredUntracked =
    showUntrackedSearch && query
      ? untrackedProviders.filter(
          (p) => p.label.toLowerCase().includes(query) || p.id.toLowerCase().includes(query),
        )
      : untrackedProviders;

  // Hydrate the store from the supervisor cache on open (and let the cache's
  // staleness trigger a background refresh whose events update the rows live).
  useEffect(() => {
    let cancelled = false;
    const bridge = readBridge();
    void bridge
      .getProviderUsage({})
      .then((res) => {
        if (cancelled) return;
        const store = useProviderUsageStore.getState();
        for (const snapshot of res.snapshots) store.mergeSnapshot(snapshot);
      })
      .catch(() => undefined);
    void bridge
      .getUsageLoginState?.({})
      .then((res) => {
        if (!cancelled) useUsageLoginStateStore.getState().setAll(res.stored);
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

      <UsageDisplaySettings />

      <section className="space-y-2 pt-1">
        <h3 className="text-xs font-semibold text-foreground/80">
          <Trans>Refresh</Trans>
        </h3>
        <ContentSurface>
          <SettingRow
            anchorId="usage.autoRefreshMinutes"
            className="px-4 py-3"
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
        </ContentSurface>
      </section>

      <section className="space-y-2 pt-1">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-foreground/80">
              <Trans>Tracked providers</Trans>
            </h3>
            <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[11px] leading-none tabular-nums text-muted">
              {trackedProviders.length}
            </span>
          </div>
          <p className="text-xs text-muted">
            <Trans>
              Turn tracking on or off per provider. Disabled providers are skipped by the
              auto-refresh.
            </Trans>
          </p>
        </div>

        {trackedProviders.length === 0 ? (
          <ContentSurface className="px-4 py-4 text-xs text-muted">
            <Trans>
              No providers are being tracked. Enable providers below to monitor quotas and cost.
            </Trans>
          </ContentSurface>
        ) : (
          <div className="space-y-2">
            {trackedProviders.map((p) => (
              <UsageProviderRow key={p.id} id={p.id} label={p.label} />
            ))}
          </div>
        )}

        {untrackedProviders.length > 0 ? (
          <Disclosure
            isExpanded={moreExpanded}
            onExpandedChange={setMoreExpanded}
            className="content-surface"
          >
            <Disclosure.Heading>
              <Disclosure.Trigger className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--row-hover)]">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    <Trans>More providers</Trans>
                  </span>
                  <span className="block text-xs text-muted">
                    <Trans>Turn on tracking to monitor quotas and cost.</Trans>
                  </span>
                </span>
                <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs tabular-nums text-muted">
                  {untrackedProviders.length}
                </span>
                <Disclosure.Indicator className="size-4 shrink-0 text-muted" />
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="border-t border-[var(--hairline-soft)] p-0">
                {showUntrackedSearch ? (
                  <div className="flex items-center gap-2 border-b border-[var(--hairline-soft)] px-4 py-2">
                    <Search className="size-3.5 shrink-0 text-muted" />
                    <input
                      aria-label={t`Search more providers`}
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
                      placeholder={t`Search providers…`}
                      value={untrackedSearch}
                      onChange={(event) => setUntrackedSearch(event.target.value)}
                    />
                    {untrackedSearch ? (
                      <button
                        type="button"
                        aria-label={t`Clear search`}
                        onClick={() => setUntrackedSearch("")}
                        className="flex size-5 shrink-0 items-center justify-center rounded text-muted hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {filteredUntracked.length === 0 ? (
                  <p className="px-4 py-4 text-center text-xs text-muted">
                    <Trans>No providers found</Trans>
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--hairline-soft)]">
                    {filteredUntracked.map((p) => {
                      const label = p.label;
                      return (
                        <div
                          key={p.id}
                          className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-2"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <span aria-hidden="true" className="inline-flex shrink-0">
                              <ProviderIcon
                                kind={p.id}
                                fallbackLabel={label}
                                className="size-4 text-foreground/80"
                              />
                            </span>
                            <span className="min-w-0 truncate text-sm text-foreground">
                              {label}
                            </span>
                          </div>
                          <ToggleSwitch
                            aria-label={t`Track ${label} usage`}
                            isSelected={false}
                            onChange={(selected) => {
                              if (!selected) return;
                              const next = disabledProviders.filter((x) => x !== p.id);
                              startTransition(() => {
                                setUsageSetting("disabledProviders", next);
                              });
                              void refreshAndMergeProviderUsage(p.id);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        ) : null}
      </section>
    </SettingsPage>
  );
}
