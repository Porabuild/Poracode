import { useEffect, useState } from "react";
import { Trans } from "@lingui/react/macro";
import { fetchHostUsage } from "./hostUsage";
import { useHostUsage, useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";

/** Shared connection lifecycle for settings and panel; never touches device usage or credentials. */
export function useHostUsageView(connectionId: string, refreshVersion = 0, liveOnOpen = false) {
  const server = useRemoteServersStore((state) =>
    state.servers.find((candidate) => remoteConnectionKey(candidate) === connectionId),
  );
  const status = useRemoteServersStore((state) => state.runtime[connectionId]?.status);
  const agents = useRemoteServersStore((state) => state.runtime[connectionId]?.agentStatuses);
  const usage = useHostUsage(connectionId);
  const [now, setNow] = useState(() => Date.now());
  const canRead = server?.scopes.includes("session:read") === true;
  const canRefresh = canRead && server?.scopes.includes("session:operate") === true;
  const online = status === "online";

  useEffect(() => {
    if (canRefresh && (liveOnOpen || refreshVersion > 0))
      void fetchHostUsage(connectionId, true, { force: true });
  }, [connectionId, canRefresh, liveOnOpen, refreshVersion]);

  useEffect(() => {
    if (!server || !canRead || !online) return;
    const read = () => {
      if (!useHostUsageStore.getState().hosts[connectionId]?.pending)
        void fetchHostUsage(connectionId);
    };
    read();
    // Read on mount/reconnect. The clock updates labels only: repeatedly
    // reading a legacy host can otherwise trigger its old collection policy.
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => clearInterval(timer);
  }, [connectionId, server, canRead, online]);
  useEffect(() => {
    // A compact/live-open refresh can occupy the initial read slot. If the
    // host cannot collect remotely, load its cache once after that refusal.
    // Query current ownership state so two mounted views cannot duplicate it.
    if (!usage.updateRequired || usage.pending || usage.readSucceeded) return;
    const entry = useHostUsageStore.getState().hosts[connectionId];
    if (canRead && online && entry?.updateRequired && !entry.pending && !entry.readSucceeded)
      void fetchHostUsage(connectionId);
  }, [connectionId, canRead, online, usage.updateRequired, usage.pending, usage.readSucceeded]);
  useEffect(() => () => useHostUsageStore.getState().invalidate(connectionId), [connectionId]);

  const lastFetched = usage.snapshots.length
    ? Math.min(...usage.snapshots.map((snapshot) => snapshot.fetchedAt))
    : undefined;
  const stale =
    !online || usage.failed || (lastFetched !== undefined && now - lastFetched >= 120_000);
  return { server, status, agents, usage, canRead, canRefresh, online, stale, lastFetched };
}

export function HostUsageStatus({ view }: { view: ReturnType<typeof useHostUsageView> }) {
  const { server, status, usage, canRead, canRefresh, online, stale } = view;
  return (
    <div className="space-y-1 text-xs text-muted">
      <p>
        <Trans>
          Sign in and configure usage tracking on this host. Credentials stay on the host that
          collects usage.
        </Trans>
      </p>
      <p role="status">
        {!server ? (
          <Trans>This host is no longer configured.</Trans>
        ) : !canRead ? (
          <Trans>This connection does not have permission to read usage.</Trans>
        ) : status === "connecting" ? (
          <Trans>Connecting…</Trans>
        ) : (usage.failed && !usage.updateRequired) || status === "error" ? (
          <Trans>
            Could not load usage. Check the host connection and permissions, then try again.
          </Trans>
        ) : !online ? (
          usage.snapshots.length > 0 ? (
            <Trans>Host offline. Showing last known usage.</Trans>
          ) : (
            <Trans>Host offline. No cached usage is available.</Trans>
          )
        ) : usage.updateRequired ? (
          <Trans>Update this host to refresh usage remotely. Cached usage can still be read.</Trans>
        ) : (!usage.initialized && usage.snapshots.length === 0) ||
          (usage.pending && usage.snapshots.length === 0) ? (
          <Trans>Loading usage…</Trans>
        ) : stale ? (
          <Trans>Usage is stale. Refresh to collect the latest values.</Trans>
        ) : null}
      </p>
      {server && canRead && !canRefresh ? (
        <p>
          <Trans>This connection does not have permission to refresh usage.</Trans>
        </p>
      ) : null}
      {server &&
      canRead &&
      online &&
      usage.initialized &&
      !usage.pending &&
      !usage.failed &&
      usage.snapshots.length === 0 ? (
        <p>
          <Trans>No usage data yet.</Trans>
        </p>
      ) : null}
    </div>
  );
}
