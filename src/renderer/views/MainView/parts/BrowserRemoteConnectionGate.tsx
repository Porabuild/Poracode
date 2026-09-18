import { Fragment } from "react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { PixelLoader } from "@/renderer/components/common/PixelLoader";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
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
  const selectedServer = useRemoteServersStore(selectBrowserBridgeServer);
  const savedServer = useRemoteServersStore((state) => state.servers[0]);
  const connecting = useRemoteServersStore((state) =>
    state.servers.some((server) => state.runtime[server.desktopId]?.status === "connecting"),
  );

  if (!isBrowserClientRuntime()) return props.children;
  if (props.checkingConnection || (!props.allowOffline && !selectedServer && connecting)) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-background text-foreground">
        <PixelLoader size="lg" />
      </div>
    );
  }
  const server = selectedServer ?? (props.allowOffline ? savedServer : undefined);
  if (server) return <Fragment key={server.desktopId}>{props.children}</Fragment>;
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
