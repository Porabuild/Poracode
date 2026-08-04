import { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemotePortsClient, RemotePushClient } from "@/shared/remote";

export interface RemoteSessionActions {
  readonly ports: {
    readonly list: RemotePortsClient["listPorts"];
    readonly start: RemotePortsClient["startPortForward"];
    readonly stop: RemotePortsClient["stopPortForward"];
    readonly enter: RemotePortsClient["enterPortForward"];
  };
}

/** Owns the one foreground action client for the active desktop identity. */
export class RemoteSessionTransport {
  private identity: string | null = null;
  private activeClient: RemoteDesktopClient | null = null;

  readonly actions: RemoteSessionActions = {
    ports: {
      list: async () => this.requireClient().listPorts(),
      start: async (targetPort) => this.requireClient().startPortForward(targetPort),
      stop: async (id) => this.requireClient().stopPortForward(id),
      enter: async (id) => this.requireClient().enterPortForward(id),
    },
  };

  private requireClient(): RemoteDesktopClient {
    if (!this.activeClient) throw new Error("Not connected to a desktop.");
    return this.activeClient;
  }

  update(identity: string, createClient: () => RemoteDesktopClient): RemoteDesktopClient {
    if (this.identity !== identity || !this.activeClient) {
      this.identity = identity;
      this.activeClient = createClient();
    }
    return this.activeClient;
  }

  clear(): void {
    this.identity = null;
    this.activeClient = null;
  }
}

/** Background registration intentionally does not mutate foreground reachability state. */
export function createBackgroundRemoteClient(
  endpoint: string,
  accessToken: string,
): RemotePushClient {
  return new RemoteDesktopClient(endpoint, accessToken);
}
