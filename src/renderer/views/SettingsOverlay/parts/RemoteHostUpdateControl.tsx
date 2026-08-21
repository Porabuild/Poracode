import { useEffect, useState } from "react";
import { Button, Spinner, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { RefreshCw } from "lucide-react";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";

export function RemoteHostUpdateControl({
  server,
  isOnline,
}: {
  readonly server: RemoteServerRecord;
  readonly isOnline: boolean;
}) {
  const { t } = useLingui();
  const getHostUpdateState = useRemoteServersStore((s) => s.getHostUpdateState);
  const checkHostUpdate = useRemoteServersStore((s) => s.checkHostUpdate);
  const installHostUpdate = useRemoteServersStore((s) => s.installHostUpdate);
  const updateState = useRemoteServersStore((s) => s.hostUpdates[server.desktopId]);
  const restarting = useRemoteServersStore(
    (s) => s.hostUpdateRestarts[server.desktopId] !== undefined,
  );
  const [checked, setChecked] = useState(false);
  const { busy, error, run } = useAsyncOperation();
  const updateStatus = updateState?.status;
  const isUpdating =
    updateStatus?.type === "checking" ||
    updateStatus?.type === "update-available" ||
    updateStatus?.type === "downloading";

  useEffect(() => {
    if (!isOnline) return;
    void getHostUpdateState(server.desktopId).catch(() => undefined);
  }, [getHostUpdateState, isOnline, server.desktopId]);

  useEffect(() => {
    if (!isUpdating) return;
    const timer = setInterval(() => {
      void getHostUpdateState(server.desktopId).catch(() => undefined);
    }, 1_000);
    return () => clearInterval(timer);
  }, [getHostUpdateState, isUpdating, server.desktopId]);

  const check = () =>
    run(async () => {
      setChecked(true);
      await checkHostUpdate(server.desktopId);
    });

  const install = () =>
    run(async () => {
      await installHostUpdate(server.desktopId);
      toast.success(t`The host is restarting to install the update.`);
    });

  const currentVersion = updateState?.currentVersion ?? server.appVersion;

  return (
    <div className="flex flex-wrap items-center gap-2 py-1 pl-5">
      {currentVersion ? (
        <span className="text-xs text-muted">
          <Trans>Host version: {currentVersion}</Trans>
        </span>
      ) : null}
      {restarting ? (
        <span role="status" className="flex items-center gap-1.5 text-xs text-muted">
          <Spinner size="sm" color="current" />
          <Trans>The host is restarting to install the update.</Trans>
        </span>
      ) : updateStatus?.type === "downloaded" ? (
        <Button variant="secondary" size="sm" isDisabled={busy || !isOnline} onPress={install}>
          <Trans>Install v{updateStatus.version}</Trans>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          isDisabled={busy || isUpdating || !isOnline}
          onPress={check}
        >
          <RefreshCw className={`size-3.5 ${busy || isUpdating ? "animate-spin" : ""}`} />
          {updateStatus?.type === "downloading" ? (
            <Trans>Downloading… {Math.round(updateStatus.percent)}%</Trans>
          ) : busy ||
            updateStatus?.type === "checking" ||
            updateStatus?.type === "update-available" ? (
            <Trans>Checking…</Trans>
          ) : (
            <Trans>Check for update</Trans>
          )}
        </Button>
      )}
      {checked && updateStatus?.type === "update-not-available" ? (
        <span className="text-xs text-muted">
          <Trans>Host is up to date.</Trans>
        </span>
      ) : null}
      {updateStatus?.type === "error" ? (
        <span className="text-xs text-danger">
          <Trans>Host update failed.</Trans>
        </span>
      ) : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
