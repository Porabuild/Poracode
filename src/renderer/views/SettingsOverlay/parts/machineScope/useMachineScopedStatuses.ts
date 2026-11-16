import { machineIdForStatus, type MachineDescriptor } from "@/renderer/state/machines";
import {
  useHostAgentStatusPools,
  type HostAgentStatusPools,
} from "@/renderer/hooks/useHostAgentStatuses";
import { machineKey } from "@/shared/machines";
import { agentStatusNeedsAuthAttention } from "@/shared/agentSelection";
import type { AgentStatus } from "@/shared/contracts";

export interface MachineScopedStatuses {
  /** Statuses of `agentKind` on the selected machine. */
  scoped: AgentStatus[];
  /** Machine ids (≠ selected) where this agent still needs auth attention. */
  othersNeedingAttention: string[];
}

/**
 * Buckets an agent's statuses by machine. Every machine reads the status pools
 * of the host it lives on: this device's (or a remote client's bridge host's)
 * own pools for local machines, the paired host's already-collected pools for
 * remote ones. The attention list keeps cross-machine auth problems visible
 * while the page is scoped to one machine.
 */
export function useMachineScopedStatuses(
  agentKind: string,
  machine: MachineDescriptor,
): MachineScopedStatuses {
  const localPools = useHostAgentStatusPools(undefined);
  const machineHost = machine.ref.host === "remote" ? machine.ref.desktopId : undefined;
  const machinePools = useHostAgentStatusPools(machineHost);

  const ofKind = (pools: HostAgentStatusPools): AgentStatus[] =>
    [...pools.windows, ...pools.wsl].filter((status) => status.kind === agentKind);
  // A machine is one environment of its host; a host's statuses are bucketed
  // by the environment they report, independent of which host reports them.
  const machineEnvId = machineKey({ host: "local", env: machine.ref.env });
  const scoped = ofKind(machinePools).filter(
    (status) => machineIdForStatus(status) === machineEnvId,
  );

  const localOfKind = ofKind(localPools);
  const othersNeedingAttention = [
    ...new Set(
      localOfKind
        .filter(
          (status) =>
            machineIdForStatus(status) !== machine.id && agentStatusNeedsAuthAttention(status),
        )
        .map((status) => machineIdForStatus(status)),
    ),
  ];

  return { scoped, othersNeedingAttention };
}
