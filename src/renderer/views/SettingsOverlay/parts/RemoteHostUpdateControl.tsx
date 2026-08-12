import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { CircleAlert, RefreshCw, ServerCog } from "lucide-react";
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
    <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-default-50 px-3 py-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-default-100 text-muted">
        <ServerCog className="size-4" />
      </div>
      <div className="mr-auto min-w-0">
        {currentVersion ? (
          <span className="block truncate text-xs font-medium text-foreground/80">
            <Trans>Host version: {currentVersion}</Trans>
          </span>
        ) : null}
      </div>
      {updateStatus?.type === "downloaded" ? (
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
        <span className="flex items-center gap-1 text-xs text-danger">
          <CircleAlert className="size-3.5 shrink-0" />
          <Trans>Host update failed.</Trans>
        </span>
      ) : null}
      {error ? (
        <span className="flex items-center gap-1 text-xs text-danger">
          <CircleAlert className="size-3.5 shrink-0" />
          {error}
        </span>
      ) : null}
    </div>
  );
}
