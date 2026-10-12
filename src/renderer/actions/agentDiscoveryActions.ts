import type { AgentStatus } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";

// The scan belongs to the app, so leaving Settings cannot discard its result.
// A cancelled run must not hydrate over a newer refresh.
let run = 0;
let baseline: { windows: AgentStatus[]; wsl: AgentStatus[] } | undefined;

export function refreshAgentDiscovery(wslDistros: string[]): void {
  if (useAgentStatusesStore.getState().inFirstLaunchDiscovery) {
    useAgentStatusesStore.getState().setDiscoveryHidden(false);
    return;
  }
  const current = ++run;
  const previous = useAgentStatusesStore.getState();
  baseline = { windows: previous.agentStatuses, wsl: previous.wslAgentStatuses };
  useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "all", wslDistros });
  void readBridge()
    .refreshAgentStatuses(wslDistros)
    .then((response) => {
      if (run !== current) return;
      useAgentStatusesStore.setState({
        agentStatuses: response.windows,
        wslAgentStatuses: response.wsl,
        windowsLoaded: true,
        wslLoaded: true,
      });
    })
    .catch(() => undefined)
    .finally(() => {
      setTimeout(() => {
        if (run === current) {
          baseline = undefined;
          useAgentStatusesStore.getState().resetDiscoveredAgents();
        }
      }, 1000);
    });
}

export function cancelAgentDiscovery(): void {
  const current = ++run;
  const previous = useAgentStatusesStore.getState();
  const retained = baseline ?? { windows: previous.agentStatuses, wsl: previous.wslAgentStatuses };
  baseline = undefined;
  previous.resetDiscoveredAgents();
  previous.hydrateFromCache(retained);
  void readBridge()
    .cancelAgentDiscovery()
    .then((response) => {
      if (run !== current) return;
      const store = useAgentStatusesStore.getState();
      for (const status of [...response.windows, ...response.wsl]) store.mergeAgentStatus(status);
    })
    .catch(() => undefined);
}
