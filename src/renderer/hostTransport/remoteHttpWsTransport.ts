import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import type { IpcProcedureName } from "@/shared/ipc";
import { HOST_TRANSPORT_VERSION, type HostIdentity, type HostRequestTransport } from "./types";

/**
 * Attached-Electron and browser `HostTransport`: procedures already route
 * through the remote HTTP/WS stack (procedure router + remote event sockets).
 * Live events are applied by the remote stores' event sockets.
 */
export class RemoteHttpWsTransport implements HostRequestTransport {
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
}
