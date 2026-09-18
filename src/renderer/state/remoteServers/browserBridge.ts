import { setRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import { setBrowserSocketSender } from "@/renderer/browser/browserMirror";
import { applyDesktopSettings, resetDesktopSettings } from "@/renderer/browser/remoteSettingsSync";
import { readClientRuntime } from "@/renderer/clientRuntime";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { getRemoteServerEventSocketEntry } from "./eventSocketRegistry";
import type { RemoteServerRecord, RemoteServersState, RemoteSocketLike } from "./types";

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
    (server) => state.runtime[server.desktopId]?.status === "online",
  );
  const sameOriginServer = onlineServers.find((server) => {
    try {
      return new URL(server.endpoint).origin === window.location.origin;
    } catch {
      return false;
    }
  });
  const currentServer = onlineServers.find(
    (server) => server.desktopId === desktopBrowserBridgeServerId,
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
    state.servers.find((server) => server.desktopId === desktopBrowserBridgeServerId)
  );
}

/** Browser webContents are available locally in Electron and remotely only
 * when the selected browser transport terminates at an Electron desktop host. */
export function selectBrowserPanelAvailable(state: RemoteServersState): boolean {
  if (typeof window === "undefined") return false;
  if (!window.poracodeHost && !window.poracode) return true;
  const runtime = readClientRuntime();
  if (runtime.host === "electron") return runtime.capabilities.nativeBrowserWebContents;
  const selected = selectBrowserBridgeServer(state);
  return selected !== undefined && selected.hostMode !== "helper";
}

export function syncDesktopBrowserBridgeClient(state: RemoteServersState): void {
  if (typeof window === "undefined" || (!window.poracodeHost && !window.poracode)) return;
  const runtime = readClientRuntime();
  // Browser PWA and attached Electron both run the remote-http-websocket
  // transport against a paired owner; managed Electron (electron-backend-host)
  // owns its settings locally and must not enter this path.
  if (runtime.transport !== "remote-http-websocket") return;

  const server = selectBrowserBridgeClientServer(state);
  const socket = server
    ? (getRemoteServerEventSocketEntry(server.desktopId)?.socket ?? null)
    : null;
  if (desktopBrowserMirrorSocket !== socket) {
    desktopBrowserMirrorSocket = socket;
    setBrowserSocketSender(
      socket?.send
        ? (message) => {
            if (getRemoteServerEventSocketEntry(server?.desktopId ?? "")?.socket !== socket) {
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
  const agentStatuses = state.runtime[server.desktopId]?.agentStatuses;
  if (agentStatuses) {
    useAgentStatusesStore.getState().setAgentStatuses(agentStatuses.windows);
    useAgentStatusesStore.getState().setWslAgentStatuses(agentStatuses.wsl);
  }
  const clientKey = `${server.desktopId}\0${server.endpoint}\0${server.accessToken}\0${server.platform ?? ""}`;
  if (desktopBrowserBridgeClientKey === clientKey) return;
  desktopBrowserBridgeServerId = server.desktopId;
  desktopBrowserBridgeClientKey = clientKey;
  const client = state.clientFactory(server.endpoint, server.accessToken);
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
  if (
    typeof window !== "undefined" &&
    (!!window.poracodeHost || !!window.poracode) &&
    readClientRuntime().host === "browser"
  ) {
    setRemoteBridgeClient(null);
  }
}
