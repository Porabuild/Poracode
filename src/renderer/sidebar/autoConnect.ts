import { closeAllRemoteServerEventSockets } from "@/renderer/state/remoteServers/sessionReconnect";
import { bumpRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";
import { syncDesktopBrowserBridgeClient } from "@/renderer/state/remoteServers/browserBridge";
import { managedLoopbackBootstrapSchema } from "@/shared/managedLoopback";
import { chromeSidebarClientIssueSchema } from "@/shared/chromeSidebarProtocol";
import {
  useRemoteServersStore,
  selectBrowserBridgeServer,
} from "@/renderer/state/remoteServersStore";

import { sidebarTransportPolicy } from "./installTransportPolicy";
import { sidebarWorkerMessage } from "./transportPolicy";
import { installRemoteServerLifecycle } from "@/renderer/state/remoteServers/lifecycle";

/** Discovery stays in the worker; credentials are never logged or put in page URLs. */
export function installSidebarAutoConnect(onStatus: (error: unknown | null) => void): () => void {
  const stopRetirement = sidebarTransportPolicy.onRetire(() => {
    closeAllRemoteServerEventSockets();
    const state = useRemoteServersStore.getState();
    for (const key of Object.keys(state.runtime)) bumpRemoteServerGeneration(key);
    useRemoteServersStore.setState({
      runtime: Object.fromEntries(
        Object.entries(state.runtime).map(([key, value]) => [
          key,
          { ...value, status: "offline" as const },
        ]),
      ),
    });
    syncDesktopBrowserBridgeClient(useRemoteServersStore.getState());
  });
  let disposed = false;
  let running = false;
  const attempt = async () => {
    if (disposed || running) return;
    running = true;
    try {
      if (await sidebarTransportPolicy.isCurrent()) {
        if (selectBrowserBridgeServer(useRemoteServersStore.getState())) {
          onStatus(null);
          return;
        }
      }
      sidebarTransportPolicy.retire();
      const response = await sidebarWorkerMessage("getChatBootstrap");
      if (disposed) return;
      const issue = chromeSidebarClientIssueSchema.safeParse(response);
      if (issue.success) {
        onStatus(issue.data.issue);
        return;
      }
      const parsed = managedLoopbackBootstrapSchema.safeParse(response);
      if (!parsed.success) {
        onStatus(null);
        return;
      }
      await sidebarTransportPolicy.authorize(parsed.data);
      if (disposed) {
        sidebarTransportPolicy.retire();
        return;
      }
      await useRemoteServersStore
        .getState()
        .pairServer({ endpoint: parsed.data.endpoint, token: parsed.data.pairingUrl });
      if (!disposed) onStatus(null);
    } catch (error) {
      sidebarTransportPolicy.retire();
      if (!disposed) onStatus(error);
    } finally {
      running = false;
    }
  };
  void attempt();
  const stopLifecycle = installRemoteServerLifecycle(attempt);
  const interval = setInterval(() => void attempt(), 4000);
  return () => {
    disposed = true;
    clearInterval(interval);
    stopLifecycle();
    sidebarTransportPolicy.retire();
    stopRetirement();
  };
}
