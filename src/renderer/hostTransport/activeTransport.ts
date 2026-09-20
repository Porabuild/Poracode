import type { IpcProcedureName } from "@/shared/ipc";
import { assertHostTransportVersion, type HostTransport } from "./types";

let activeHostTransport: HostTransport | null = null;

/** Install the one live HostTransport after the version stamp checks. */
export function activateHostTransport(transport: HostTransport): HostTransport {
  assertHostTransportVersion(transport.version);
  activeHostTransport = transport;
  return transport;
}

export function requestActiveHost(name: IpcProcedureName, args: unknown[]): Promise<unknown> {
  const transport = activeHostTransport;
  if (!transport) {
    throw new Error("host transport not installed");
  }
  return transport.request(name, args);
}

export function resetActiveHostTransportForTest(): void {
  activeHostTransport = null;
}
