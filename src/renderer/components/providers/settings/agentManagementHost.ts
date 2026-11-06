import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";
import { refreshSlashCommandCatalogs } from "@/renderer/state/remoteServers/slashCommandCatalogs";
import type { HostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import {
  acpRegistryListResultSchema,
  acpRegistryMutationResultSchema,
  getLatestAgentVersionResultSchema,
  updateAgentBinaryResultSchema,
  type AcpRegistryListResult,
  type AcpRegistryMutationResult,
  type GetLatestAgentVersionPayload,
  type GetLatestAgentVersionResult,
  type InstalledAcpRegistryAgent,
  type RefreshAgentScope,
  type UpdateAcpRegistryAgentPayload,
  type UpdateAgentBinaryPayload,
  type UpdateAgentBinaryResult,
} from "@/shared/contracts";

/** One key namespace for per-host probe results, cache entries, and pending jobs. */
export function hostScopedKey(hostKey: string, id: string): string {
  return `${hostKey}\0${id}`;
}

/**
 * The host that owns one machine's CLI agents: version probes and updates run
 * where the agents are installed. The local host is this client's own bridge
 * (the desktop's supervisor, or a remote client's bridge host); a paired
 * machine is reached through its connection's authenticated client.
 */
export interface AgentManagementHost {
  /** `"local"` or the paired connection key; stable, for effect deps and cache keys. */
  readonly key: string;
  /** Paired connection key, `undefined` for the local host (see `useHostAgentStatusPools`). */
  readonly connectionKey: string | undefined;
  /**
   * True when reached through a paired connection. Its ACP registry records
   * live in that host's settings, so calls must not sync them into this
   * client's settings.
   */
  readonly isRemote: boolean;
  getLatestAgentVersion(
    payload: GetLatestAgentVersionPayload,
  ): Promise<GetLatestAgentVersionResult>;
  listAcpRegistry(): Promise<AcpRegistryListResult>;
  updateAgentBinary(payload: UpdateAgentBinaryPayload): Promise<UpdateAgentBinaryResult>;
  updateAcpRegistryAgent(
    payload: UpdateAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult>;
  /** Records registry installs this host reported; only the local host's live in this client's settings. */
  recordRegistryInstalls(
    installed: InstalledAcpRegistryAgent[],
    agentIds?: readonly string[],
  ): void;
  /**
   * Re-reads the host's agent statuses after a mutation and resolves with
   * both pools. The local host re-probes; a paired host has already
   * re-detected the agents its update touched, so its statuses are re-read
   * and stored on the connection's runtime row.
   */
  refreshAgentStatuses(
    wslDistros: string[],
    scope?: RefreshAgentScope,
  ): Promise<HostAgentStatusPools>;
}

export const LOCAL_AGENT_MANAGEMENT_HOST: AgentManagementHost = {
  key: "local",
  connectionKey: undefined,
  isRemote: false,
  getLatestAgentVersion: (payload) => readBridge().getLatestAgentVersion(payload),
  listAcpRegistry: () => readBridge().listAcpRegistry(),
  updateAgentBinary: (payload) => readBridge().updateAgentBinary(payload),
  updateAcpRegistryAgent: (payload) => readBridge().updateAcpRegistryAgent(payload),
  recordRegistryInstalls: (installed, agentIds) =>
    useSharedSettings.getState().syncAcpRegistryInstalledAgents(installed, agentIds),
  refreshAgentStatuses: async (wslDistros, scope) => {
    const response = await readBridge().refreshAgentStatuses(wslDistros, scope);
    return { windows: response.windows, wsl: response.wsl };
  },
};

function readRuntimeStatuses(connectionKey: string) {
  return useRemoteServersStore.getState().runtime[connectionKey]?.agentStatuses;
}

async function refreshRemoteAgentStatuses(connectionKey: string): Promise<HostAgentStatusPools> {
  const generation = currentRemoteServerGeneration(connectionKey);
  const statuses = await useRemoteServersStore
    .getState()
    .withClient(connectionKey, async (client) =>
      refreshSlashCommandCatalogs(
        client.endpoint,
        await client.agentStatuses({ omitSlashCommands: true }),
        (kind) => client.agentSlashCommands(kind).then((result) => result.commands),
      ),
    );
  useRemoteServersStore.setState((state) => {
    const current = state.runtime[connectionKey];
    if (!current) return state;
    if (currentRemoteServerGeneration(connectionKey) !== generation) return state;
    const held = current.agentStatuses;
    if (held && Date.parse(held.updatedAt) > Date.parse(statuses.updatedAt)) return state;
    return {
      runtime: { ...state.runtime, [connectionKey]: { ...current, agentStatuses: statuses } },
    };
  });
  const pools = readRuntimeStatuses(connectionKey) ?? statuses;
  return { windows: pools.windows, wsl: pools.wsl };
}

function createRemoteAgentManagementHost(connectionKey: string): AgentManagementHost {
  const call = (procedure: string, payload: unknown) =>
    useRemoteServersStore
      .getState()
      .withClient(connectionKey, (client) => client.callRemoteProcedure(procedure, payload));
  return {
    key: connectionKey,
    connectionKey,
    isRemote: true,
    getLatestAgentVersion: async (payload) =>
      getLatestAgentVersionResultSchema.parse(await call("getLatestAgentVersion", payload)),
    listAcpRegistry: async () =>
      acpRegistryListResultSchema.parse(await call("listAcpRegistry", {})),
    updateAgentBinary: async (payload) =>
      updateAgentBinaryResultSchema.parse(await call("updateAgentBinary", payload)),
    updateAcpRegistryAgent: async (payload) =>
      acpRegistryMutationResultSchema.parse(await call("updateAcpRegistryAgent", payload)),
    recordRegistryInstalls: () => undefined,
    refreshAgentStatuses: () => refreshRemoteAgentStatuses(connectionKey),
  };
}

const remoteHosts = new Map<string, AgentManagementHost>();

/** The host that manages `machine`'s agents; one stable instance per host. */
export function agentManagementHostForMachine(machine: MachineDescriptor): AgentManagementHost {
  // A remote client's local entries are its bridge host, reached through the
  // same connection as any paired machine.
  const connectionKey = machine.ref.host === "remote" ? machine.ref.desktopId : machine.desktopId;
  if (connectionKey === undefined) return LOCAL_AGENT_MANAGEMENT_HOST;
  let host = remoteHosts.get(connectionKey);
  if (!host) {
    host = createRemoteAgentManagementHost(connectionKey);
    remoteHosts.set(connectionKey, host);
  }
  return host;
}

const EMPTY_REGISTRY_RECORDS: Readonly<Record<string, InstalledAcpRegistryAgent>> = Object.freeze<
  Record<string, InstalledAcpRegistryAgent>
>({});

/** Registry install records of `host`; a paired host's never describe this client's settings. */
export function useHostRegistryInstalledAgents(
  host: AgentManagementHost,
): Readonly<Record<string, InstalledAcpRegistryAgent>> {
  const local = useSharedSettings((s) => s.acpRegistryInstalledAgents);
  return host.isRemote ? EMPTY_REGISTRY_RECORDS : local;
}
