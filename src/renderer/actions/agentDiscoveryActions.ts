import type { AgentStatus } from "@/shared/contracts";
import { agentEnvForStatus, agentEnvKey, type AgentEnv } from "@/shared/machines";
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
          // Completion leaves the rows open while the screen's Done countdown
          // runs, with individual refreshes and immediate dismissal available.
          useAgentStatusesStore.setState({ discoveryScanning: false });
        }
      }, 1000);
    });
}

/**
 * Re-probe one discovered agent — every kind on its card (the base agent and
 * its profiles) in the environments where that kind was found (the card's
 * refresh button). The supervisor probes the agentKinds × envs cross-product
 * of one scoped call, so kinds share a call only when they were found in the
 * same environments. Batches run sequentially: a cold-cache full detection
 * warms the cache for later batches. `groupKind` is included even for a
 * profile-only card. Streamed updates refresh existing rows; scoped results
 * recover missing rows when the refresh supersedes their discovery events.
 */
export async function refreshDiscoveredAgent(
  statuses: readonly AgentStatus[],
  groupKind?: string,
): Promise<void> {
  if (statuses.length === 0) return;
  const { inFirstLaunchDiscovery, discoveryScope, discoveryAutoHideCancelled } =
    useAgentStatusesStore.getState();
  // Manual refresh means the user is still reviewing the discovery results.
  if (inFirstLaunchDiscovery && !discoveryAutoHideCancelled) {
    useAgentStatusesStore.setState({ discoveryAutoHideCancelled: true });
  }
  const discoveryRun = run;
  const envsByKind = new Map<string, Map<string, AgentEnv>>();
  const addEnv = (kind: string, status: AgentStatus) => {
    const env = agentEnvForStatus(status);
    const envs = envsByKind.get(kind) ?? new Map<string, AgentEnv>();
    envs.set(agentEnvKey(env), env);
    envsByKind.set(kind, envs);
  };
  for (const status of statuses) addEnv(status.kind, status);
  if (groupKind && !envsByKind.has(groupKind)) {
    for (const status of statuses) addEnv(groupKind, status);
  }
  const batches = new Map<string, { kinds: string[]; envs: Map<string, AgentEnv> }>();
  for (const [kind, envs] of envsByKind) {
    const key = JSON.stringify([...envs.keys()].sort());
    const batch = batches.get(key);
    if (batch) batch.kinds.push(kind);
    else batches.set(key, { kinds: [kind], envs });
  }
  for (const { kinds, envs } of batches.values()) {
    // The response filters WSL rows by this list, even for explicit scopes.
    const wslDistros = new Set(currentWslDistros());
    for (const env of envs.values()) {
      if (env.kind === "wsl") wslDistros.add(env.distro);
    }
    await readBridge()
      .refreshAgentStatuses([...wslDistros], {
        agentKinds: kinds,
        envs: [...envs.values()],
      })
      .then((response) => {
        const store = useAgentStatusesStore.getState();
        if (
          !inFirstLaunchDiscovery ||
          !store.inFirstLaunchDiscovery ||
          run !== discoveryRun ||
          store.discoveryScope !== discoveryScope
        )
          return;
        for (const status of [...response.windows, ...response.wsl]) {
          const envKey = agentEnvKey(agentEnvForStatus(status));
          if (!kinds.includes(status.kind) || !envs.has(envKey)) continue;
          // Existing rows receive streamed updates. A late response must not
          // overwrite a newer event, or append unrelated cached agents.
          const alreadyListed = useAgentStatusesStore
            .getState()
            .discoveredAgents.some(
              (entry) =>
                entry.kind === status.kind && agentEnvKey(agentEnvForStatus(entry)) === envKey,
            );
          if (!alreadyListed) store.pushDiscoveredAgent(status);
        }
      })
      .catch(() => undefined);
  }
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
