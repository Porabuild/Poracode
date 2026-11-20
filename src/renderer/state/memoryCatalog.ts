import { readBridge } from "@/renderer/bridge";
import type { RemoteMemoryCatalogCommand } from "@/shared/memory";
import { useRemoteServersStore } from "./remoteServersStore";

export async function runMemoryCatalogCommand(
  connectionKey: string | undefined,
  command: RemoteMemoryCatalogCommand,
) {
  if (connectionKey === undefined) return readBridge().memoryCommand(command);
  const response = await useRemoteServersStore
    .getState()
    .withClient(connectionKey, (client) => client.memoryCatalog(command));
  return response.result;
}
