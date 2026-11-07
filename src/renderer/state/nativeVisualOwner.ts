import { useSyncExternalStore } from "react";
import type { Thread } from "@/shared/contracts";
import { hasAnyClientBridge, readClientRuntime } from "@/renderer/clientRuntime";
import { useAppStore } from "./appStore";
import { createArrayKeyedMap } from "./derivations";
import { useRemoteServersStore } from "./remoteServersStore";
import { remoteConnectionKey, type RemoteServerRecord } from "./remoteServers/types";
import { selectBrowserBridgeServer } from "./remoteServers/browserBridge";
import {
  getManagedParentAuthorityState,
  subscribeManagedParentAuthority,
} from "./remoteServers/managedLoopbackOwner";

const threadById = createArrayKeyedMap(
  (threads: Thread[]) => new Map(threads.map((thread) => [thread.id, thread])),
);
const serverByConnection = createArrayKeyedMap(
  (servers: RemoteServerRecord[]) =>
    new Map(servers.map((server) => [remoteConnectionKey(server), server])),
);

function managedHostId(): string | undefined {
  const state = getManagedParentAuthorityState();
  return state.status === "ready" ? state.authority.ref.hostDesktopId : undefined;
}

/** Uses verified owning/selected host identity, never a token, endpoint or launch generation. */
export function readNativeVisualHostId(thread: Pick<Thread, "remoteServerId">): string | undefined {
  const state = useRemoteServersStore.getState();
  if (thread.remoteServerId)
    return serverByConnection(state.servers, thread.remoteServerId)?.desktopId;
  if (hasAnyClientBridge() && readClientRuntime().transport === "remote-http-websocket")
    return selectBrowserBridgeServer(state)?.desktopId;
  return managedHostId();
}

export function useNativeVisualOwner(viewThreadId: string): {
  hostId: string | undefined;
  threadId: string;
} {
  const remoteServerId = useAppStore(
    (state) => threadById(state.threads, viewThreadId)?.remoteServerId,
  );
  const remoteId = useAppStore((state) => threadById(state.threads, viewThreadId)?.remoteId);
  const remoteHostId = useRemoteServersStore((state) =>
    remoteServerId
      ? serverByConnection(state.servers, remoteServerId)?.desktopId
      : hasAnyClientBridge() && readClientRuntime().transport === "remote-http-websocket"
        ? selectBrowserBridgeServer(state)?.desktopId
        : undefined,
  );
  const managed = useSyncExternalStore(
    subscribeManagedParentAuthority,
    managedHostId,
    () => undefined,
  );
  const isRemote =
    remoteServerId !== undefined ||
    (hasAnyClientBridge() && readClientRuntime().transport === "remote-http-websocket");
  return { hostId: isRemote ? remoteHostId : managed, threadId: remoteId ?? viewThreadId };
}
