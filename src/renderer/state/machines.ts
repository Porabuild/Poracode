import { create } from "zustand";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useMachineSelectionStore } from "@/renderer/state/machineSelectionStore";
import { buildWslProjectDistrosKey, parseWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useSettingsHostServer, useSettingsHostStore } from "@/renderer/state/settingsHostStore";
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
 * `loadedFor` names the host that answered, because a remote client's bridge
 * can move to another host.
 */
interface WslDistroListState {
  distros: string[];
  loadedFor: string | null;
  refresh(owner: string): Promise<void>;
}

export const useWslDistroListStore = create<WslDistroListState>((set) => ({
  distros: [],
  loadedFor: null,
  refresh: async (owner) => {
    try {
      const distros = await readBridge().listWslDistros();
      set({ distros, loadedFor: owner });
    } catch {
      // Enumeration is best-effort; project-derived distros remain available.
      set({ distros: [], loadedFor: owner });
    }
  },
}));

/** The host whose WSL distros are "local": this device, or a remote client's bridge host. */
export function useLocalDistroOwner(): string | null {
  const settingsHost = useSettingsHostServer();
  if (!isRemoteSession()) return LOCAL_NATIVE_MACHINE_KEY;
  return settingsHost ? remoteConnectionKey(settingsHost) : null;
}

function remoteStatusOf(status: string | undefined): MachineDescriptor["status"] {
  if (status === "online") return "online";
  if (status === "connecting") return "connecting";
  return "offline";
}

/**
 * Derive the machine list: local host, local WSL distros (enumerated ∪
 * project-derived), and each paired remote server plus the WSL distros its
 * agent statuses report. Pure given its inputs; exported for tests.
 *
 * In a remote client, "local" is the host the bridge client talks to, not the
 * device: `localHost` names those entries after that host and drops its
 * duplicate remote entry, so it keeps the bridge's install and sign-in actions.
 */
export function deriveMachines(inputs: {
  enumeratedDistros: readonly string[];
  projectDistros: readonly string[];
  /** Distros already present in detected WSL agent statuses. */
  statusDistros?: readonly string[];
  remoteServers: readonly { desktopId: string; connectionId?: string; label: string }[];
  remoteRuntime: Readonly<
    Record<
      string,
      { status: string; agentStatuses?: { wsl: readonly { envDistro?: string | undefined }[] } }
    >
  >;
  localHost?: { connectionKey: string; label: string };
}): MachineDescriptor[] {
  const localHost = inputs.localHost;
  const localLabel = (env: MachineRef["env"]): string =>
    localHost
      ? machineLabel(
          { host: "remote", desktopId: localHost.connectionKey, env },
          { remoteName: () => localHost.label },
        )
      : localEnvLabel(env);
  const machines: MachineDescriptor[] = [
    {
      id: LOCAL_NATIVE_MACHINE_KEY,
      ref: { host: "local", env: { kind: "native" } },
      kind: "local",
      label: localLabel({ kind: "native" }),
      status: "online",
      ...(localHost ? { desktopId: localHost.connectionKey } : {}),
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
      label: localLabel(ref.env),
      status: "online",
      wslDistro: distro,
      ...(localHost ? { desktopId: localHost.connectionKey } : {}),
    });
  }
  const remoteName = (connectionKey: string) =>
    inputs.remoteServers.find(
      (server) => (server.connectionId ?? server.desktopId) === connectionKey,
    )?.label ?? connectionKey;
  for (const server of inputs.remoteServers) {
    const connectionKey = server.connectionId ?? server.desktopId;
    if (connectionKey === localHost?.connectionKey) continue;
    const runtime = inputs.remoteRuntime[connectionKey];
    const status = remoteStatusOf(runtime?.status);
    const nativeRef: MachineRef = {
      host: "remote",
      desktopId: connectionKey,
      env: { kind: "native" },
    };
    machines.push({
      id: machineKey(nativeRef),
      ref: nativeRef,
      kind: "remote",
      label: machineLabel(nativeRef, { remoteName }),
      status,
      desktopId: connectionKey,
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
        desktopId: connectionKey,
        env: { kind: "wsl", distro },
      };
      machines.push({
        id: machineKey(ref),
        ref,
        kind: "remote-wsl",
        label: machineLabel(ref, { remoteName }),
        status,
        desktopId: connectionKey,
        wslDistro: distro,
      });
    }
  }
  return machines;
}

const NO_DISTROS: string[] = [];

/** Machines currently selectable in the Agents settings area. */
export function useMachines(): MachineDescriptor[] {
  const distroOwner = useLocalDistroOwner();
  const enumeratedDistros = useWslDistroListStore((state) =>
    state.loadedFor === distroOwner ? state.distros : NO_DISTROS,
  );
  const projectDistrosKey = useAppStore((state) => buildWslProjectDistrosKey(state.projects));
  const wslAgentStatuses = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const remoteServers = useRemoteServersStore((state) => state.servers);
  const remoteRuntime = useRemoteServersStore((state) => state.runtime);
  const remoteSession = isRemoteSession();
  const settingsHost = useSettingsHostServer();
  return deriveMachines({
    enumeratedDistros,
    // A remote client's projects span every paired host; the bridge host's own
    // distros come from its enumeration and its agent statuses instead.
    projectDistros: remoteSession ? [] : parseWslProjectDistrosKey(projectDistrosKey),
    statusDistros: wslAgentStatuses
      .map((status) => status.envDistro)
      .filter((distro): distro is string => Boolean(distro)),
    remoteServers,
    remoteRuntime,
    ...(remoteSession && settingsHost
      ? {
          localHost: {
            connectionKey: remoteConnectionKey(settingsHost),
            label: settingsHost.label,
          },
        }
      : {}),
  });
}

/**
 * Scope the settings area to `machine`. In a remote client, another host's
 * entry rebinds the bridge to that host, whose entries then become the local
 * ones, so install and sign-in keep working wherever the user points it.
 */
export function chooseMachine(machine: MachineDescriptor): void {
  const { setSelectedMachine } = useMachineSelectionStore.getState();
  if (machine.ref.host === "remote" && isRemoteSession()) {
    useSettingsHostStore.getState().choose(machine.ref.desktopId);
    setSelectedMachine(machineKey({ host: "local", env: machine.ref.env }));
    return;
  }
  setSelectedMachine(machine.id);
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
