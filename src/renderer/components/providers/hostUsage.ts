import { providerUsageResponseSchema, type ProviderUsagePayload } from "@/shared/contracts";
import { useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";

/** Reads/collects only through the selected connection's authenticated client, including child environments. */
export async function fetchHostUsage(
  connectionId: string,
  refresh = false,
  payload: ProviderUsagePayload = {},
): Promise<void> {
  const state = useRemoteServersStore.getState();
  const server = state.servers.find((candidate) => remoteConnectionKey(candidate) === connectionId);
  if (!server) return;
  const generation = currentRemoteServerGeneration(connectionId);
  const request = useHostUsageStore.getState().begin(connectionId);
  const isCurrent = () =>
    currentRemoteServerGeneration(connectionId) === generation &&
    useRemoteServersStore
      .getState()
      .servers.find((candidate) => remoteConnectionKey(candidate) === connectionId) === server;
  try {
    const result = await state.withClient(connectionId, (client) =>
      client.callRemoteProcedure(refresh ? "refreshProviderUsage" : "getProviderUsage", payload),
    );
    const usage = providerUsageResponseSchema.parse(result);
    if (isCurrent())
      useHostUsageStore
        .getState()
        .complete(connectionId, request, usage.snapshots, Boolean(payload.providerIds?.length));
  } catch {
    // A localized error is shown by the view; do not expose provider/transport diagnostics or secrets.
    if (isCurrent()) useHostUsageStore.getState().fail(connectionId, request);
  }
}

// Connection retirement invalidates outstanding work even when the usage view is unmounted.
useRemoteServersStore.subscribe((state, previous) => {
  for (const oldServer of previous.servers) {
    const key = remoteConnectionKey(oldServer);
    const server = state.servers.find((candidate) => remoteConnectionKey(candidate) === key);
    if (!server) useHostUsageStore.getState().remove(key);
    else if (server !== oldServer || state.runtime[key]?.status !== previous.runtime[key]?.status) {
      useHostUsageStore.getState().invalidate(key);
    }
  }
});
