import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRuntime } from "@/renderer/state/remoteServers/types";

/** An empty accepted cache on a cold host is not an unavailable-agent verdict. */
export function sidebarAgentsPending(runtime: RemoteServerRuntime | undefined): boolean {
  return (
    !runtime?.agentStatuses ||
    (runtime.agentStatuses.windows.length === 0 && runtime.agentStatuses.wsl.length === 0)
  );
}

/** Close the initial HTTP-read/event-subscription discovery gap on a cold host. */
export function installSidebarAgentReadiness(serverKey: string): () => void {
  let disposed = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    const state = useRemoteServersStore.getState();
    const runtime = state.runtime[serverKey];
    if (
      disposed ||
      running ||
      !runtime ||
      runtime.status !== "online" ||
      !sidebarAgentsPending(runtime)
    )
      return;
    running = true;
    try {
      await state.refreshServer(serverKey, { includeAgentStatuses: true });
    } finally {
      running = false;
      if (!disposed && sidebarAgentsPending(useRemoteServersStore.getState().runtime[serverKey])) {
        timer = setTimeout(() => void refresh(), 2000);
      }
    }
  };
  void refresh();
  return () => {
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
