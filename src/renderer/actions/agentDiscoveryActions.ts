import type { AgentStatus } from "@/shared/contracts";
import { agentEnvForStatus } from "@/shared/machines";
import { readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { currentWslDistros } from "@/renderer/utils/acpRegistryAuth";

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
          // The scan is over but its rows stay open — refreshed one by one or
          // dismissed with Done; nothing here auto-hides the overlay.
          useAgentStatusesStore.setState({ discoveryScanning: false });
        }
      }, 1000);
    });
}

/**
 * Re-probe one discovered agent in its own environment (the row's refresh
 * button). The scan session is untouched; the refreshed status streams back
 * as `agent-detected` / `agent-status-updated` events and updates the row.
 */
export async function refreshDiscoveredAgent(status: AgentStatus): Promise<void> {
  await readBridge()
    .refreshAgentStatuses(currentWslDistros(), {
      agentKinds: [status.kind],
      envs: [agentEnvForStatus(status)],
    })
    .then(() => undefined)
    .catch(() => undefined);
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
