import { machineIdForStatus, type MachineDescriptor } from "@/renderer/state/machines";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { agentStatusNeedsAuthAttention } from "@/shared/agentSelection";
import type { AgentStatus } from "@/shared/contracts";

export interface MachineScopedStatuses {
  /** Statuses of `agentKind` on the selected machine. */
  scoped: AgentStatus[];
  /** Machine ids (≠ selected) where this agent still needs auth attention. */
  othersNeedingAttention: string[];
}

/**
 * Buckets an agent's statuses by machine. Local machines read the local
 * status stores; remote machines read the paired host's already-collected
 * statuses. The attention list keeps cross-machine auth problems visible
 * while the page is scoped to one machine.
 */
export function useMachineScopedStatuses(
  agentKind: string,
  machine: MachineDescriptor,
): MachineScopedStatuses {
  const agentStatuses = useAgentStatusesStore((state) => state.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const remoteRuntime = useRemoteServersStore((state) =>
    machine.desktopId ? state.runtime[machine.desktopId] : undefined,
  );

  const localOfKind = [...agentStatuses, ...wslAgentStatuses].filter(
    (status) => status.kind === agentKind,
  );

  let scoped: AgentStatus[];
  if (machine.ref.host === "remote") {
    const remote = remoteRuntime?.agentStatuses;
    const source = machine.ref.env.kind === "wsl" ? (remote?.wsl ?? []) : (remote?.windows ?? []);
    const distro = machine.wslDistro;
    scoped = source.filter(
      (status) =>
        status.kind === agentKind && (distro === undefined || status.envDistro === distro),
    );
  } else {
    scoped = localOfKind.filter((status) => machineIdForStatus(status) === machine.id);
  }

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
