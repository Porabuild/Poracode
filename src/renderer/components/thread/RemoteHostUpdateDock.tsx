import { useEffect } from "react";
import { Button, Spinner, toast } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Download } from "lucide-react";
import { RemoteClientError } from "@/shared/remote/client";
import { useAsyncOperation } from "@/renderer/hooks/useAsyncOperation";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { ThreadDockHeader, ThreadDockSection } from "./ThreadDockUI";

export function RemoteHostUpdateDock({ desktopId }: { readonly desktopId: string }) {
  const { t } = useLingui();
  const update = useRemoteServersStore((state) => state.hostUpdates[desktopId]);
  const restartingVersion = useRemoteServersStore((state) => state.hostUpdateRestarts[desktopId]);
  const isOnline = useRemoteServersStore((state) => state.runtime[desktopId]?.status === "online");
  const installHostUpdate = useRemoteServersStore((state) => state.installHostUpdate);
  const getHostUpdateState = useRemoteServersStore((state) => state.getHostUpdateState);
  const { busy, error, run } = useAsyncOperation();
  const status = update?.status;
  const isUpdating =
    status?.type === "checking" ||
    status?.type === "update-available" ||
    status?.type === "downloading";
  const shouldRefresh =
    isOnline && !busy && !restartingVersion && (isUpdating || status?.type === "downloaded");

  useEffect(() => {
    if (!shouldRefresh) return;
    const refresh = () => {
      void getHostUpdateState(desktopId).catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, isUpdating ? 1_000 : 10_000);
    return () => clearInterval(timer);
  }, [desktopId, getHostUpdateState, isUpdating, shouldRefresh]);

  if (
    !restartingVersion &&
    (!status ||
      (status.type !== "update-available" &&
        status.type !== "downloading" &&
        status.type !== "downloaded"))
  ) {
    return null;
  }

  const isInstalling = busy || restartingVersion !== undefined;
  const title = isInstalling
    ? t`The host is restarting to install the update.`
    : status?.type === "update-available"
      ? t`Remote host update v${status.version} is downloading…`
      : status?.type === "downloading"
        ? t`Remote host update is downloading… ${Math.round(status.percent)}%`
        : status?.type === "downloaded"
          ? t`Remote host update v${status.version} is ready.`
          : "";

  const install = () =>
    run(async () => {
      try {
        await installHostUpdate(desktopId);
      } catch (caught) {
        // The store clears the stale offer when the host has no pending update.
        if (caught instanceof RemoteClientError && caught.code === "host_update_not_ready") return;
        throw caught;
      }
      toast.success(t`The host is restarting to install the update.`);
    });

  return (
    <ThreadDockSection placement="composer" collapsed={false} ariaLabel={title}>
      <ThreadDockHeader
        icon={Download}
        iconClassName="text-accent"
        title={title}
        actions={
          isInstalling ? (
            <Spinner size="sm" color="current" aria-label={title} />
          ) : status?.type === "downloaded" ? (
            <Button size="sm" variant="ghost" isDisabled={busy || !isOnline} onPress={install}>
              {t`Install and restart`}
            </Button>
          ) : null
        }
      >
        {error ? <span className="truncate text-danger">{error}</span> : null}
      </ThreadDockHeader>
    </ThreadDockSection>
  );
}
