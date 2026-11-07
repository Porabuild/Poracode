import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { Fragment } from "react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  selectBrowserBridgeClientServer,
  selectBrowserBridgeServer,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";

export function BrowserRemoteConnectionGate(props: {
  children: React.ReactNode;
  allowOffline?: boolean;
  checkingConnection?: boolean;
  fallback?: React.ReactNode;
  onPair?: () => void;
}) {
  const onlineServer = useRemoteServersStore(selectBrowserBridgeServer);
  // The host the bridge client is bound to (the user's selection, kept while
  // it reconnects). Keying the remount on it, not on whichever host is online
  // this instant, stops a transient "connecting" on one host from remounting
  // the whole app onto another.
  const boundServer = useRemoteServersStore(selectBrowserBridgeClientServer);
  const savedServer = useRemoteServersStore((state) => state.servers[0]);
  const connecting = useRemoteServersStore((state) =>
    state.servers.some(
      (server) => state.runtime[remoteConnectionKey(server)]?.status === "connecting",
    ),
  );

  if (!isBrowserClientRuntime()) return props.children;
  if (props.checkingConnection || (!props.allowOffline && !onlineServer && connecting)) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background text-foreground">
        <PixelLoader size="lg" />
      </div>
    );
  }
  const server = onlineServer
    ? (boundServer ?? onlineServer)
    : props.allowOffline
      ? (boundServer ?? savedServer)
      : undefined;
  if (server) return <Fragment key={remoteConnectionKey(server)}>{props.children}</Fragment>;
  if (props.fallback) return props.fallback;

  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted">
          <Trans>No remote environments connected yet.</Trans>
        </p>
        <Button
          size="sm"
          variant="secondary"
          onPress={
            props.onPair ??
            (() => {
              usePanelStore.getState().openSettingsSection("remoteServers");
            })
          }
        >
          <Trans>Pair with Poracode</Trans>
        </Button>
      </div>
    </div>
  );
}
