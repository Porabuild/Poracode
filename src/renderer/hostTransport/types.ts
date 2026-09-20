import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import type { IpcProcedureName, SupervisorEvent } from "@/shared/ipc";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";

/**
 * Renderer-to-host hop version (V6 B.1). One constant for every
 * `HostTransport` implementation. B.5 collapsed client runtime, IPC map, and
 * backend-host protocol into `CLIENT_HOST_HOP_VERSION`; this stays the
 * in-process TypeScript interface stamp (not a serialized wire hop).
 */
export const HOST_TRANSPORT_VERSION = 1 as const;
export const PREVIOUS_HOST_TRANSPORT_VERSION = 0 as const;

/** Old-reader / future-reader refusal for the in-process HostTransport stamp. */
export function assertHostTransportVersion(
  version: unknown,
): asserts version is typeof HOST_TRANSPORT_VERSION {
  if (version !== HOST_TRANSPORT_VERSION) {
    throw new Error(`Unsupported host transport version: ${String(version)}`);
  }
}

/**
 * V6 B.7: the hop names whether this renderer is talking to the co-located
 * managed desktop host or a paired remote. Projection, terminal feed, and
 * the procedure router must not special-case a fake paired-server id.
 */
export type HostIdentity =
  | { readonly kind: "managed" }
  | { readonly kind: "paired"; readonly desktopId: string };

export type HostEventListener = (
  event: SupervisorEvent,
  seq?: number,
  space?: EventSequenceSpace,
) => void;

/**
 * The single data plane a client runtime holds after bootstrap IPC.
 * Preload IPC, loopback HTTP/WS, and remote HTTP/WS implement this; the
 * runtime never forks request/event/terminal legs itself.
 */
export interface HostTransport {
  readonly version: typeof HOST_TRANSPORT_VERSION;
  readonly identity: HostIdentity;
  readonly capabilities: HostServiceCapabilities;
  request(name: IpcProcedureName, args: unknown[]): Promise<unknown>;
  subscribeEvents(listener: HostEventListener): () => void;
}
