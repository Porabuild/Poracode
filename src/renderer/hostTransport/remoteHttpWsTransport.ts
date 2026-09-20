import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import type { IpcProcedureName } from "@/shared/ipc";
import {
  HOST_TRANSPORT_VERSION,
  type HostEventListener,
  type HostIdentity,
  type HostTransport,
} from "./types";

/**
 * Attached-Electron and browser `HostTransport`: procedures already route
 * through the remote HTTP/WS stack (procedure router + remote event sockets).
 * This object is the runtime's single request/event handle so clientRuntime
 * does not fork those legs itself.
 */
export class RemoteHttpWsTransport implements HostTransport {
  readonly version = HOST_TRANSPORT_VERSION;
  readonly identity: HostIdentity;

  constructor(
    private readonly invoke: (name: IpcProcedureName, args: unknown[]) => Promise<unknown>,
    readonly capabilities: HostServiceCapabilities,
    identity: HostIdentity = { kind: "paired", desktopId: "remote" },
  ) {
    this.identity = identity;
  }

  request(name: IpcProcedureName, args: unknown[]): Promise<unknown> {
    return this.invoke(name, args);
  }

  /**
   * Deliberately inert on this flavor: this transport serves only the request
   * leg. Supervisor live events for both runtimes built on it (browser and
   * attached Electron) arrive over the remote event sockets owned by the
   * remote stores (`state/remoteServers`, see `eventSocketMessages.ts`), which
   * dispatch into the stores directly — there is no transport-level event
   * stream to join, and joining one would double-deliver events the stores
   * already applied. The attached runtime still wires
   * `native.onSupervisorEvent` through this method (clientRuntime.ts), so it
   * must stay a valid subscription: it registers nothing and returns a
   * callable unsubscribe.
   */
  subscribeEvents(_listener: HostEventListener): () => void {
    return () => {};
  }
}
