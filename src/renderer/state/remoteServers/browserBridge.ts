import { setRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import { setBrowserSocketSender } from "@/renderer/browser/browserMirror";
import { applyDesktopSettings, resetDesktopSettings } from "@/renderer/browser/remoteSettingsSync";
import {
  applyNegotiatedHostCapabilities,
  UNKNOWN_HOST_CAPABILITIES,
  hasAnyClientBridge,
  readClientRuntime,
} from "@/renderer/clientRuntime";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { getRemoteServerEventSocketEntry } from "./eventSocketRegistry";
import { environmentSessionForServer } from "./environmentSessions";
import {
  remoteConnectionKey,
  type RemoteServerRecord,
  type RemoteServersState,
  type RemoteSocketLike,
} from "./types";

let desktopBrowserBridgeServerId: string | null = null;
let desktopBrowserBridgeClientKey: string | null = null;
let desktopBrowserMirrorSocket: RemoteSocketLike | null = null;

export function getDesktopBrowserMirrorSocket(): RemoteSocketLike | null {
  return desktopBrowserMirrorSocket;
}

export function selectBrowserBridgeServer(
  state: RemoteServersState,
): RemoteServerRecord | undefined {
  const onlineServers = state.servers.filter(
    (server) => state.runtime[remoteConnectionKey(server)]?.status === "online",
  );
  const sameOriginServer = onlineServers.find((server) => {
    try {
      return new URL(server.endpoint).origin === window.location.origin;
    } catch {
      return false;
    }
  });
  const currentServer = onlineServers.find(
    (server) => remoteConnectionKey(server) === desktopBrowserBridgeServerId,
  );
  return currentServer ?? sameOriginServer ?? onlineServers[0];
}

/** Explicitly scope browser-backed machine settings and shared remote RPCs. */
export function selectBrowserBridgeDesktop(desktopId: string): void {
  desktopBrowserBridgeServerId = desktopId;
  desktopBrowserBridgeClientKey = null;
  syncDesktopBrowserBridgeClient(useRemoteServersStore.getState());
}

function selectBrowserBridgeClientServer(
  state: RemoteServersState,
): RemoteServerRecord | undefined {
  return (
    selectBrowserBridgeServer(state) ??
    state.servers.find((server) => remoteConnectionKey(server) === desktopBrowserBridgeServerId)
  );
}

/** Browser webContents are available locally in Electron and remotely only
 * when the selected browser transport terminates at an Electron desktop host. */
export function selectBrowserPanelAvailable(state: RemoteServersState): boolean {
  if (typeof window === "undefined") return false;
  if (!hasAnyClientBridge()) return true;
  const runtime = readClientRuntime();
  if (runtime.host === "electron") return runtime.capabilities.nativeBrowserWebContents;
  const selected = selectBrowserBridgeServer(state);
  return selected?.hostCapabilities?.browserPanel === true;
}

export function syncDesktopBrowserBridgeClient(state: RemoteServersState): void {
  if (!hasAnyClientBridge()) return;
  const runtime = readClientRuntime();
  // Browser PWA and attached Electron both run the remote-http-websocket
  // transport against a paired owner; managed Electron (electron-backend-host)
  // owns its settings locally and must not enter this path.
  if (runtime.transport !== "remote-http-websocket") return;

  const server = selectBrowserBridgeClientServer(state);
  applyNegotiatedHostCapabilities(server?.hostCapabilities ?? UNKNOWN_HOST_CAPABILITIES);
  const socket = server
    ? (getRemoteServerEventSocketEntry(remoteConnectionKey(server))?.socket ?? null)
    : null;
  if (desktopBrowserMirrorSocket !== socket) {
    desktopBrowserMirrorSocket = socket;
    setBrowserSocketSender(
      socket?.send
        ? (message) => {
            if (
              getRemoteServerEventSocketEntry(server ? remoteConnectionKey(server) : "")?.socket !==
              socket
            ) {
              return false;
            }
            try {
              socket.send?.(JSON.stringify(message));
              return true;
            } catch {
              return false;
            }
          }
        : null,
    );
  }
  if (!server) {
    desktopBrowserBridgeServerId = null;
    desktopBrowserBridgeClientKey = null;
    setRemoteBridgeClient(null);
    resetDesktopSettings();
    useAgentStatusesStore.getState().setAgentStatuses([]);
    useAgentStatusesStore.getState().setWslAgentStatuses([]);
    return;
  }
  const connectionKey = remoteConnectionKey(server);
  const agentStatuses = state.runtime[connectionKey]?.agentStatuses;
  if (agentStatuses) {
    useAgentStatusesStore.getState().setAgentStatuses(agentStatuses.windows);
    useAgentStatusesStore.getState().setWslAgentStatuses(agentStatuses.wsl);
  }
  const clientKey = `${connectionKey}\0${server.endpoint}\0${server.accessToken}\0${server.platform ?? ""}`;
  if (desktopBrowserBridgeClientKey === clientKey) return;
  desktopBrowserBridgeServerId = connectionKey;
  desktopBrowserBridgeClientKey = clientKey;
  const environmentSession =
    server.transport?.kind === "environment" ? environmentSessionForServer(server) : undefined;
  if (server.transport?.kind === "environment" && !environmentSession) {
    setRemoteBridgeClient(null);
    resetDesktopSettings();
    return;
  }
  const client =
    environmentSession?.client ?? state.clientFactory(server.endpoint, server.accessToken);
  setRemoteBridgeClient(client, server.platform ?? null);
  resetDesktopSettings();
  void client
    .settings()
    .then((settings) => {
      if (desktopBrowserBridgeClientKey === clientKey) applyDesktopSettings(settings);
    })
    .catch(() => {
      if (desktopBrowserBridgeClientKey === clientKey) resetDesktopSettings();
    });
}

export function __resetBrowserBridgeForTest(): void {
  desktopBrowserBridgeServerId = null;
  desktopBrowserBridgeClientKey = null;
  desktopBrowserMirrorSocket = null;
  setBrowserSocketSender(null);
  if (hasAnyClientBridge() && readClientRuntime().host === "browser") {
    setRemoteBridgeClient(null);
  }
}
