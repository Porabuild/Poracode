import type { RemoteAccessPairingInfo } from "@/shared/remote";
import type { RemoteAccessServer } from "./RemoteAccessServer";

export function getRemoteAccessPairingInfo(
  server: RemoteAccessServer | null,
): RemoteAccessPairingInfo {
  if (!server) {
    return { status: "disabled" };
  }
  const info = server.getInfo();
  if (!info) {
    return { status: "starting" };
  }
  return {
    status: "ready",
    httpBaseUrl: info.httpBaseUrl,
    localHttpBaseUrl: info.localHttpBaseUrl,
    ...(info.tailscaleHttpBaseUrl ? { tailscaleHttpBaseUrl: info.tailscaleHttpBaseUrl } : {}),
    wsBaseUrl: info.wsBaseUrl,
    pairingUrl: info.pairingUrl,
    pairingExpiresAt: info.pairingExpiresAt,
    sessions: server.listAccessSessions(),
  };
}
