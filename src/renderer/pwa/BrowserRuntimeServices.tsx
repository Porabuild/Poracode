import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import {
  selectBrowserBridgeServer,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { WebPushPermissionPrompt } from "./push/WebPushPermissionPrompt";
import { usePushLifecycle } from "./push/usePushLifecycle";

export function BrowserRuntimeServices() {
  return isBrowserClientRuntime() ? <ConnectedBrowserRuntimeServices /> : null;
}

function ConnectedBrowserRuntimeServices() {
  const server = useRemoteServersStore(selectBrowserBridgeServer);
  const connected = useRemoteServersStore(
    (state) =>
      server !== undefined && state.runtime[remoteConnectionKey(server)]?.status === "online",
  );

  usePushLifecycle({
    connected,
    activeDesktop: server
      ? {
          desktopId: remoteConnectionKey(server),
          endpoint: server.endpoint,
          accessToken: server.accessToken,
        }
      : null,
  });

  return <WebPushPermissionPrompt />;
}
