import type { IpcProcedureName } from "@/shared/ipc";
import { assertHostTransportVersion, type HostRequestTransport } from "./types";

let activeHostTransport: HostRequestTransport | null = null;

/** Install the one live HostTransport after the version stamp checks. */
export function activateHostTransport<T extends HostRequestTransport>(transport: T): T {
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
