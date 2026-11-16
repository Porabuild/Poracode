import { useSyncExternalStore } from "react";
import {
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  getRemoteBridgeClient,
  subscribeRemoteBridgeClient,
} from "@/renderer/browser/remoteBridge";

function sandboxEndpoint(): string | undefined {
  // The bootstrap is public static code. App data and operations always use
  // the authenticated owning-thread bridge, even for a different paired host.
  return readManagedLoopbackActivation()?.endpoint ?? getRemoteBridgeClient()?.endpoint;
}

function subscribeEndpoint(listener: () => void): () => void {
  const stopManaged = subscribeManagedLoopbackActivation(listener);
  const stopRemote = subscribeRemoteBridgeClient(listener);
  return () => {
    stopManaged();
    stopRemote();
  };
}

/** Host origin that serves the sandbox proxy for MCP Apps and authored HTML. */
export function useMcpAppSandboxEndpoint(): string | undefined {
  return useSyncExternalStore(subscribeEndpoint, sandboxEndpoint, sandboxEndpoint);
}
