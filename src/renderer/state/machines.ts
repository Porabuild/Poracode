import { create } from "zustand";
import { readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useMachineSelectionStore } from "@/renderer/state/machineSelectionStore";
import { buildWslProjectDistrosKey, parseWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { localEnvLabel, machineLabel } from "@/renderer/utils/machineLabels";
import type { AgentStatus } from "@/shared/contracts";
import {
  agentEnvForStatus,
  machineKey,
  LOCAL_NATIVE_MACHINE_KEY,
  type MachineRef,
} from "@/shared/machines";

/** One selectable machine in the Agents settings area. */
export interface MachineDescriptor {
  /** `machineKey(ref)` — stable id used for selection and settings maps. */
  id: string;
  ref: MachineRef;
  kind: "local" | "local-wsl" | "remote" | "remote-wsl";
  label: string;
  status: "online" | "offline" | "connecting";
  desktopId?: string;
  wslDistro?: string;
}

/**
 * Locally enumerated WSL distros (registry-backed supervisor probe), fetched
 * when the Agents settings area mounts. Unioned with project-derived distros
 * so a distro appears even when only one of the two sources knows about it.
 */
interface WslDistroListState {
  distros: string[];
  loaded: boolean;
  refresh(): Promise<void>;
}

export const useWslDistroListStore = create<WslDistroListState>((set) => ({
  distros: [],
  loaded: false,
  refresh: async () => {
    try {
      const distros = await readBridge().listWslDistros();
      set({ distros, loaded: true });
    } catch {
      // Enumeration is best-effort; project-derived distros remain available.
      set({ loaded: true });
    }
  },
}));

function remoteStatusOf(status: string | undefined): MachineDescriptor["status"] {
  if (status === "online") return "online";
  if (status === "connecting") return "connecting";
  return "offline";
}

/**
 * Derive the machine list: local host, local WSL distros (enumerated ∪
 * project-derived), and each paired remote server plus the WSL distros its
 * agent statuses report. Pure given its inputs; exported for tests.
 */
export function deriveMachines(inputs: {
  enumeratedDistros: readonly string[];
  projectDistros: readonly string[];
  /** Distros already present in detected WSL agent statuses. */
  statusDistros?: readonly string[];
  remoteServers: readonly { desktopId: string; label: string }[];
  remoteRuntime: Readonly<
    Record<
      string,
      { status: string; agentStatuses?: { wsl: readonly { envDistro?: string | undefined }[] } }
    >
  >;
}): MachineDescriptor[] {
  const machines: MachineDescriptor[] = [
    {
      id: LOCAL_NATIVE_MACHINE_KEY,
      ref: { host: "local", env: { kind: "native" } },
      kind: "local",
      label: localEnvLabel({ kind: "native" }),
      status: "online",
    },
  ];
  const localDistros = [
    ...new Set([
      ...inputs.enumeratedDistros,
      ...inputs.projectDistros,
      ...(inputs.statusDistros ?? []),
    ]),
  ].sort();
  for (const distro of localDistros) {
    const ref: MachineRef = { host: "local", env: { kind: "wsl", distro } };
    machines.push({
      id: machineKey(ref),
      ref,
      kind: "local-wsl",
      label: localEnvLabel(ref.env),
      status: "online",
      wslDistro: distro,
    });
  }
  const remoteName = (desktopId: string) =>
    inputs.remoteServers.find((server) => server.desktopId === desktopId)?.label ?? desktopId;
  for (const server of inputs.remoteServers) {
    const runtime = inputs.remoteRuntime[server.desktopId];
    const status = remoteStatusOf(runtime?.status);
    const nativeRef: MachineRef = {
      host: "remote",
      desktopId: server.desktopId,
      env: { kind: "native" },
    };
    machines.push({
      id: machineKey(nativeRef),
      ref: nativeRef,
      kind: "remote",
      label: machineLabel(nativeRef, { remoteName }),
      status,
      desktopId: server.desktopId,
    });
    const remoteDistros = [
      ...new Set(
        (runtime?.agentStatuses?.wsl ?? [])
          .map((remoteStatus) => remoteStatus.envDistro)
          .filter((distro): distro is string => Boolean(distro)),
      ),
    ].sort();
    for (const distro of remoteDistros) {
      const ref: MachineRef = {
        host: "remote",
        desktopId: server.desktopId,
        env: { kind: "wsl", distro },
      };
      machines.push({
        id: machineKey(ref),
        ref,
        kind: "remote-wsl",
        label: machineLabel(ref, { remoteName }),
        status,
        desktopId: server.desktopId,
        wslDistro: distro,
      });
    }
  }
  return machines;
}

/** Machines currently selectable in the Agents settings area. */
export function useMachines(): MachineDescriptor[] {
  const enumeratedDistros = useWslDistroListStore((state) => state.distros);
  const projectDistrosKey = useAppStore((state) => buildWslProjectDistrosKey(state.projects));
  const wslAgentStatuses = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const remoteServers = useRemoteServersStore((state) => state.servers);
  const remoteRuntime = useRemoteServersStore((state) => state.runtime);
  return deriveMachines({
    enumeratedDistros,
    projectDistros: parseWslProjectDistrosKey(projectDistrosKey),
    statusDistros: wslAgentStatuses
      .map((status) => status.envDistro)
      .filter((distro): distro is string => Boolean(distro)),
    remoteServers,
    remoteRuntime,
  });
}

/** The selected machine, falling back to the local host when it disappears. */
export function useSelectedMachine(): MachineDescriptor {
  const machines = useMachines();
  const selectedMachineId = useMachineSelectionStore((state) => state.selectedMachineId);
  return (
    machines.find((machine) => machine.id === selectedMachineId) ??
    machines.find((machine) => machine.id === LOCAL_NATIVE_MACHINE_KEY) ??
    machines[0]!
  );
}

/**
 * Machine id a *local* agent status belongs to. Remote statuses never flow
 * through the local status stores, so bucketing by env is sufficient here.
 */
export function machineIdForStatus(status: AgentStatus): string {
  return machineKey({ host: "local", env: agentEnvForStatus(status) });
}
