import { readBridge } from "@/renderer/bridge";
import type { IpcProcedurePayload, IpcProcedureResult } from "@/shared/ipc";
import { invokeRemoteIpcProcedure, type RemoteIpcAdapterProcedureName } from "@/shared/remote";
import { useRemoteServersStore } from "./remoteServersStore";

/**
 * Calls a host-scoped procedure (schedules, project notes, PR watches, ...) on
 * one host, whichever host that is.
 *
 * `connectionKey` names a paired host; `undefined` is the host this client is
 * attached to. The attached host's calls go through the bridge, whose router
 * already sends these procedures to that host's client (the desktop's managed
 * loopback client, or the standalone/attach owner on web), so it is the same
 * client call a paired host gets. A paired host is reached through its own
 * connection with the identical procedure-to-client translation, so a caller
 * writes each operation once and picks the host by key.
 */
export function callHostProcedure<Name extends RemoteIpcAdapterProcedureName>(
  connectionKey: string | undefined,
  procedure: Name,
  payload: IpcProcedurePayload<Name>,
): Promise<IpcProcedureResult<Name>> {
  if (connectionKey === undefined) {
    const bridge = readBridge() as unknown as Record<Name, (payload: unknown) => Promise<unknown>>;
    return bridge[procedure](payload) as Promise<IpcProcedureResult<Name>>;
  }
  return useRemoteServersStore
    .getState()
    .withClient(connectionKey, (client) =>
      invokeRemoteIpcProcedure(client, procedure, payload),
    ) as Promise<IpcProcedureResult<Name>>;
}
