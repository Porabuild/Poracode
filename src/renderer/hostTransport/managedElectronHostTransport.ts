import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import type { IpcProcedureName } from "@/shared/ipc";
import { isManagedLoopbackRequestRoutingActive } from "@/renderer/state/remoteServers/managedLoopbackOwner";
import {
  HOST_TRANSPORT_VERSION,
  type HostEventListener,
  type HostIdentity,
  type HostTransport,
} from "./types";
import type { PreloadIpcTransport } from "./preloadIpcTransport";
import { LoopbackHttpWsTransport } from "./loopbackHttpWsTransport";

/**
 * Managed-desktop `HostTransport`: loopback HTTP/WS is the data plane;
 * preload IPC stays bootstrap + local-shell (V6 B.6). The client runtime
 * holds this and does not fork request/event routing itself.
 */
export class ManagedElectronHostTransport implements HostTransport {
  readonly version = HOST_TRANSPORT_VERSION;
  readonly identity: HostIdentity = { kind: "managed" };
  private readonly loopback: LoopbackHttpWsTransport;

  constructor(
    preload: PreloadIpcTransport,
    readonly capabilities: HostServiceCapabilities,
  ) {
    this.loopback = new LoopbackHttpWsTransport(preload, capabilities);
  }

  request(name: IpcProcedureName, args: unknown[]): Promise<unknown> {
    if (isManagedLoopbackRequestRoutingActive()) {
      return this.loopback.request(name, args);
    }
    return this.loopback.preloadRequest(name, args);
  }

  subscribeEvents(listener: HostEventListener): () => void {
    return this.loopback.subscribeEvents(listener);
  }
}
