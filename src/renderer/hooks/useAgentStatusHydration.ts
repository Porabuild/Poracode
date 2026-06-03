import { useEffect } from "react";
import type { AgentStatus } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { parseWslProjectDistrosKey } from "@/renderer/state/projectKeys";

function findMissingWslDistro(distros: readonly string[], statuses: readonly AgentStatus[]) {
  const cachedDistros = new Set(
    statuses.flatMap((status) => (status.envDistro ? [status.envDistro] : [])),
  );
  return distros.find((distro) => !cachedDistros.has(distro));
}

/**
 * Triggers agent detection in the supervisor. When a cache is available the RPC
 * resolves immediately with the previously-detected statuses so the first
 * ThreadDraft render has real agents instead of the empty initial state. Fresh
 * detection results still arrive via events (windows-agent-statuses,
 * wsl-agent-statuses). Shared by the main window and the quick-composer overlay.
 */
export function useAgentStatusHydration(wslProjectDistrosKey: string, enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const wslDistros = parseWslProjectDistrosKey(wslProjectDistrosKey);
    void readBridge()
      .getAgentStatuses(wslDistros)
      .then((response) => {
        const missingWslDistro = findMissingWslDistro(wslDistros, response.wsl);
        if (response.fromCache) {
          useAgentStatusesStore.getState().hydrateFromCache({
            windows: response.windows,
            wsl: response.wsl,
          });
          if (missingWslDistro) {
            useAgentStatusesStore
              .getState()
              .beginFirstLaunchDiscovery({ kind: "wsl", distro: missingWslDistro });
          }
          return;
        }
        useAgentStatusesStore
          .getState()
          .beginFirstLaunchDiscovery(
            missingWslDistro ? { kind: "wsl", distro: missingWslDistro } : undefined,
          );
      })
      .catch(() => undefined);
  }, [enabled, wslProjectDistrosKey]);
}
