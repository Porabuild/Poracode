import { useEffect, useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { RefreshCw } from "lucide-react";
import { Button } from "@/renderer/components/common";
import { UsageWindowBars } from "@/renderer/components/providers/UsageWindowBars";
import { ProviderUsageCircle } from "@/renderer/components/providers/ProviderUsageCircle";
import { fetchHostUsage } from "@/renderer/components/providers/hostUsage";
import { usageStatusText } from "@/renderer/components/providers/usageFormat";
import { usageProvidersForAgentInstances } from "@/renderer/components/providers/usageProviders";
import { useHostUsage, useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { SettingsPage } from "./SettingsForm";

const HOST_USAGE_READ_INTERVAL_MS = 30_000;
const STALE_USAGE_MS = 2 * 60_000;

/** Read-only host settings view: credentials and collection policy belong to this host. */
export function HostUsageSettings(props: {
  connectionId: string;
  selector: ReactNode;
  embedded?: boolean;
  refreshVersion?: number;
  liveOnOpen?: boolean;
}) {
  const {
    connectionId,
    selector,
    embedded = false,
    refreshVersion = 0,
    liveOnOpen = false,
  } = props;
  const { t, i18n } = useLingui();
  const server = useRemoteServersStore((state) =>
    state.servers.find((candidate) => remoteConnectionKey(candidate) === connectionId),
  );
  const status = useRemoteServersStore((state) => state.runtime[connectionId]?.status);
  const agentStatuses = useRemoteServersStore(
    (state) => state.runtime[connectionId]?.agentStatuses,
  );
  const usage = useHostUsage(connectionId);
  const [now, setNow] = useState(() => Date.now());
  const canRead = server?.scopes.includes("session:read") === true;
  const canRefresh = server?.scopes.includes("session:operate") === true;
  const online = status === "online";

  // Explicit collection must remain available while offline; success is the reconnect probe.
  useEffect(() => {
    if (canRead && canRefresh && (liveOnOpen || refreshVersion > 0)) {
      void fetchHostUsage(connectionId, true, { force: true });
    }
  }, [connectionId, canRead, canRefresh, liveOnOpen, refreshVersion]);

  useEffect(() => {
    if (!server || !canRead || !online) return;
    if (!useHostUsageStore.getState().hosts[connectionId]?.pending)
      void fetchHostUsage(connectionId);
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!useHostUsageStore.getState().hosts[connectionId]?.pending)
        void fetchHostUsage(connectionId);
    }, HOST_USAGE_READ_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connectionId, server, canRead, online]);

  // Retire requests on every scope exit, including offline views without a poller.
  useEffect(() => () => useHostUsageStore.getState().invalidate(connectionId), [connectionId]);

  const lastFetched = usage.snapshots.length
    ? Math.min(...usage.snapshots.map((snapshot) => snapshot.fetchedAt))
    : undefined;
  const stale =
    !online || usage.failed || (lastFetched !== undefined && now - lastFetched >= STALE_USAGE_MS);
  const providerLabels = new Map(
    usageProvidersForAgentInstances(undefined).map((provider) => [provider.id, provider.label]),
  );
  for (const agent of agentStatuses?.windows ?? []) providerLabels.set(agent.kind, agent.label);

  const refreshButton = (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      aria-label={t`Refresh`}
      isDisabled={!server || !canRead || !canRefresh || usage.pending}
      onPress={() => void fetchHostUsage(connectionId, true, { force: true })}
    >
      <RefreshCw className={`size-4 ${usage.pending ? "animate-spin" : ""}`} />
    </Button>
  );
  const content = (
    <>
      {selector}
      <p className="text-xs text-muted">
        <Trans>
          Sign in and configure usage tracking on this host. Credentials stay on the host that
          collects usage.
        </Trans>
      </p>
      {!server ? (
        <p role="status">
          <Trans>This host is no longer configured.</Trans>
        </p>
      ) : !canRead ? (
        <p role="status">
          <Trans>This connection does not have permission to read usage.</Trans>
        </p>
      ) : (
        <>
          <p role="status" className="text-xs text-muted">
            {status === "connecting" ? (
              <Trans>Connecting…</Trans>
            ) : usage.failed || status === "error" ? (
              <Trans>
                Could not load usage. Check the host connection and permissions, then try again.
              </Trans>
            ) : !online ? (
              <Trans>Host offline. Showing last known usage.</Trans>
            ) : usage.pending && usage.snapshots.length === 0 ? (
              <Trans>Loading usage…</Trans>
            ) : stale ? (
              <Trans>Usage is stale. Refresh to collect the latest values.</Trans>
            ) : null}
          </p>
          {!canRefresh ? (
            <p className="text-xs text-muted">
              <Trans>This connection does not have permission to refresh usage.</Trans>
            </p>
          ) : null}
          {usage.snapshots.length === 0 && !usage.pending ? (
            <p className="text-sm text-muted">
              <Trans>No usage data yet.</Trans>
            </p>
          ) : null}
          {usage.snapshots.map((snapshot) => {
            const label = providerLabels.get(snapshot.providerId) ?? snapshot.providerId;
            const fetchedAt = i18n.date(snapshot.fetchedAt, {
              dateStyle: "short",
              timeStyle: "short",
            });
            return (
              <div
                key={snapshot.providerId}
                className="settings-row flex min-h-[44px] flex-wrap items-center gap-2 border-t border-[color:var(--separator)] py-2 first:border-t-0"
              >
                <ProviderUsageCircle
                  kind={snapshot.providerId}
                  windows={snapshot.windows}
                  size={22}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {label}
                    {snapshot.plan ? ` · ${snapshot.plan}` : ""}
                  </p>
                  {snapshot.authenticatedAs ? (
                    <p className="truncate text-xs text-muted">{snapshot.authenticatedAs}</p>
                  ) : null}
                  {snapshot.status === "ok" && snapshot.windows.length > 0 ? (
                    <UsageWindowBars windows={snapshot.windows} showPace={false} />
                  ) : (
                    <p className="text-xs text-muted">
                      {usageStatusText(snapshot, label, snapshot.providerId)}
                    </p>
                  )}
                  <p className="text-xs text-muted">
                    <Trans>Last updated: {fetchedAt}</Trans>
                  </p>
                </div>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`Refresh ${label} usage`}
                  isDisabled={!canRefresh || usage.pending}
                  onPress={() =>
                    void fetchHostUsage(connectionId, true, {
                      providerIds: [snapshot.providerId],
                      force: true,
                    })
                  }
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </>
      )}
    </>
  );
  return embedded ? (
    <div>{content}</div>
  ) : (
    <SettingsPage
      title={t`Provider Usage`}
      description={t`Usage is collected on the selected host. Accounts and quotas are shown separately for each host.`}
      actions={refreshButton}
    >
      {content}
    </SettingsPage>
  );
}
