import type { AgentStatus } from "@/shared/contracts";
import { readBridge } from "@/renderer/bridge";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  currentWslDistros,
  findStatusForTarget,
  scopeEnvForStatus,
} from "@/renderer/utils/acpRegistryAuth";

/**
 * Re-reads one agent's sign-in state from the host that owns it.
 *
 * `connectionKey` is the owning host's paired connection (`undefined` for the
 * host this client is bound to: the desktop's managed host, or a browser
 * client's bound host through its bridge). Returns the refreshed status when
 * the host could actually re-probe it, `undefined` when it could only publish
 * its cached inventory.
 */
export async function refreshHostAgentAuthStatus(
  status: AgentStatus,
  connectionKey: string | undefined,
): Promise<AgentStatus | undefined> {
  const target = scopeEnvForStatus(status);
  if (connectionKey !== undefined) {
    await useRemoteServersStore.getState().refreshServer(connectionKey);
    // A paired host's inventory can still hold a cached authenticated status;
    // re-reading that projection does not prove an expired login recovered.
    return undefined;
  }
  const response = await readBridge().refreshAgentStatuses(currentWslDistros(), {
    agentKinds: [status.kind],
    envs: [target],
  });
  return findStatusForTarget(response, status.kind, target);
}
