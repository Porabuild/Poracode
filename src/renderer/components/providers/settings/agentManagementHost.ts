import type { z } from "zod";
import { readBridge } from "@/renderer/bridge";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { MachineDescriptor } from "@/renderer/state/machines";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";
import { refreshSlashCommandCatalogs } from "@/renderer/state/remoteServers/slashCommandCatalogs";
import type { HostAgentStatusPools } from "@/renderer/hooks/useHostAgentStatuses";
import {
  acpRegistryListResultSchema,
  agentStatusesResponseSchema,
  type AcpRegistryListResult,
  type AcpRegistryMutationResult,
  type AgentStatus,
  type AuthenticateAcpAgentPayload,
  type GetLatestAgentVersionPayload,
  type GetLatestAgentVersionResult,
  type InstallAcpRegistryAgentPayload,
  type InstalledAcpRegistryAgent,
  type LogoutAcpAgentPayload,
  type RefreshAgentScope,
  type RefreshAgentScopeEnv,
  type RemoveAcpRegistryAgentPayload,
  type ResolveAgentAccountPayload,
  type ResolveAgentAccountResult,
  type SetAcpRegistryAgentAuthPayload,
  type UpdateAcpRegistryAgentPayload,
  type UpdateAgentBinaryPayload,
  type UpdateAgentBinaryResult,
} from "@/shared/contracts";
import {
  ipcProcedureMap,
  parseRemoteProcedureResultValue,
  type IpcProcedurePayload,
  type IpcProcedureResult,
} from "@/shared/ipc";
import type { REMOTE_PROCEDURE_SPECS, RemoteProcedureName } from "@/shared/remote/procedures";

type RemoteProcedureArgs<Name extends RemoteProcedureName> =
  (typeof ipcProcedureMap)[Name]["__types"]["args"];

/**
 * Any allowlisted desktop-owned remote supervisor procedure that accepts a
 * single typed payload object. Adding a new agent-settings procedure to
 * `REMOTE_PROCEDURE_SPECS` automatically unlocks it here without per-procedure
 * boilerplate wrappers.
 */
export type AgentHostProcedureName = {
  [Name in RemoteProcedureName]: (typeof REMOTE_PROCEDURE_SPECS)[Name]["owner"] extends "desktop"
    ? RemoteProcedureArgs<Name> extends [IpcProcedurePayload<Name>]
      ? Name
      : never
    : never;
}[RemoteProcedureName];

/** One key namespace for per-host probe results, cache entries, and pending jobs. */
export function hostScopedKey(hostKey: string, id: string): string {
  return `${hostKey}\0${id}`;
}

/**
 * The host that owns one machine's CLI agents: version probes, settings
 * mutations, plugin/provider management, and updates run where the agents are
 * installed. The local host is this client's own bridge (the desktop's
 * supervisor, or a remote client's bridge host); a paired machine is reached
 * through its connection's authenticated client.
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
  /**
   * Generic typed supervisor procedure call scoped to this host. Locally it
   * invokes the corresponding method on `readBridge()`; remotely it forwards
   * through `client.callRemoteProcedure` and validates the response against
   * the procedure's canonical result schema.
   */
  callProcedure<Name extends AgentHostProcedureName>(
    procedure: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>>;
  getLatestAgentVersion(
    payload: GetLatestAgentVersionPayload,
  ): Promise<GetLatestAgentVersionResult>;
  resolveAgentAccount(payload: ResolveAgentAccountPayload): Promise<ResolveAgentAccountResult>;
  listAcpRegistry(): Promise<AcpRegistryListResult>;
  installAcpRegistryAgent(
    payload: InstallAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult>;
  removeAcpRegistryAgent(
    payload: RemoveAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult>;
  updateAgentBinary(payload: UpdateAgentBinaryPayload): Promise<UpdateAgentBinaryResult>;
  updateAcpRegistryAgent(
    payload: UpdateAcpRegistryAgentPayload,
  ): Promise<AcpRegistryMutationResult>;
  setAcpRegistryAgentAuth(
    payload: SetAcpRegistryAgentAuthPayload,
  ): Promise<AcpRegistryMutationResult>;
  authenticateAcpAgent(payload: AuthenticateAcpAgentPayload): Promise<void>;
  logoutAcpAgent(payload: LogoutAcpAgentPayload): Promise<void>;
  focusAfterAuth(): Promise<void>;
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
  /** Starts fresh host discovery, including when no agents have been found yet. */
  rediscoverAgents(wslDistros: string[], scope?: RefreshAgentScope): Promise<HostAgentStatusPools>;
}

function callLocalProcedure<Name extends AgentHostProcedureName>(
  procedure: Name,
  payload: IpcProcedurePayload<Name>,
): Promise<IpcProcedureResult<Name>> {
  const bridge = readBridge();
  const fn = bridge[procedure] as (
    input: IpcProcedurePayload<Name>,
  ) => Promise<IpcProcedureResult<Name>>;
  return fn(payload);
}

export const LOCAL_AGENT_MANAGEMENT_HOST: AgentManagementHost = {
  key: "local",
  connectionKey: undefined,
  isRemote: false,
  callProcedure: callLocalProcedure,
  getLatestAgentVersion: (payload) => callLocalProcedure("getLatestAgentVersion", payload),
  resolveAgentAccount: (payload) => callLocalProcedure("resolveAgentAccount", payload),
  listAcpRegistry: () => readBridge().listAcpRegistry(),
  installAcpRegistryAgent: (payload) => callLocalProcedure("installAcpRegistryAgent", payload),
  removeAcpRegistryAgent: (payload) => callLocalProcedure("removeAcpRegistryAgent", payload),
  updateAgentBinary: (payload) => callLocalProcedure("updateAgentBinary", payload),
  updateAcpRegistryAgent: (payload) => callLocalProcedure("updateAcpRegistryAgent", payload),
  setAcpRegistryAgentAuth: (payload) => callLocalProcedure("setAcpRegistryAgentAuth", payload),
  authenticateAcpAgent: (payload) => callLocalProcedure("authenticateAcpAgent", payload),
  logoutAcpAgent: (payload) => callLocalProcedure("logoutAcpAgent", payload),
  focusAfterAuth: () => readBridge().focusWindow(),
  recordRegistryInstalls: (installed, agentIds) =>
    useSharedSettings
      .getState()
      .syncAcpRegistryInstalledAgents(installed, ...(agentIds !== undefined ? [agentIds] : [])),
  refreshAgentStatuses: async (wslDistros, scope) => {
    const response = await readBridge().refreshAgentStatuses(wslDistros, scope);
    return { windows: response?.windows ?? [], wsl: response?.wsl ?? [] };
  },
  rediscoverAgents: (wslDistros, scope) =>
    LOCAL_AGENT_MANAGEMENT_HOST.refreshAgentStatuses(wslDistros, scope),
};

function readRuntimeStatuses(connectionKey: string) {
  return useRemoteServersStore.getState().runtime[connectionKey]?.agentStatuses;
}

async function refreshRemoteAgentStatuses(
  connectionKey: string,
  discovered?: { generation: number; wsl: AgentStatus[]; wslDistros: string[] },
): Promise<HostAgentStatusPools> {
  const generation = discovered?.generation ?? currentRemoteServerGeneration(connectionKey);
  const statuses = await useRemoteServersStore
    .getState()
    .withClient(connectionKey, async (client) => {
      const fetched = await client.agentStatuses({ omitSlashCommands: true });
      // The snapshot lists project distros; manual discovery may target another distro.
      const retainedWsl = discovered
        ? (readRuntimeStatuses(connectionKey)?.wsl ?? []).filter(
            (entry) => !discovered.wslDistros.includes(entry.envDistro ?? ""),
          )
        : [];
      const wsl = [
        ...fetched.wsl,
        ...[...(discovered?.wsl ?? []), ...retainedWsl].filter(
          (entry) => !fetched.wsl.some((status) => status.envDistro === entry.envDistro),
        ),
      ];
      return refreshSlashCommandCatalogs(client.endpoint, { ...fetched, wsl }, (kind) =>
        client.agentSlashCommands(kind).then((result) => result.commands),
      );
    });
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
  const callRaw = (procedure: string, payload: unknown) =>
    useRemoteServersStore
      .getState()
      .withClient(connectionKey, (client) => client.callRemoteProcedure(procedure, payload));

  async function callProcedure<Name extends AgentHostProcedureName>(
    procedure: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>> {
    const raw = await callRaw(procedure, payload);
    const descriptor = ipcProcedureMap[procedure];
    if ("resultSchema" in descriptor && descriptor.resultSchema) {
      return parseRemoteProcedureResultValue(
        descriptor.resultSchema as z.ZodType<IpcProcedureResult<Name>>,
        raw,
      );
    }
    return raw as IpcProcedureResult<Name>;
  }

  return {
    key: connectionKey,
    connectionKey,
    isRemote: true,
    callProcedure,
    getLatestAgentVersion: (payload) => callProcedure("getLatestAgentVersion", payload),
    resolveAgentAccount: (payload) => callProcedure("resolveAgentAccount", payload),
    listAcpRegistry: async () =>
      acpRegistryListResultSchema.parse(await callRaw("listAcpRegistry", {})),
    installAcpRegistryAgent: (payload) => callProcedure("installAcpRegistryAgent", payload),
    removeAcpRegistryAgent: (payload) => callProcedure("removeAcpRegistryAgent", payload),
    updateAgentBinary: (payload) => callProcedure("updateAgentBinary", payload),
    updateAcpRegistryAgent: (payload) => callProcedure("updateAcpRegistryAgent", payload),
    setAcpRegistryAgentAuth: (payload) => callProcedure("setAcpRegistryAgentAuth", payload),
    authenticateAcpAgent: (payload) => callProcedure("authenticateAcpAgent", payload),
    logoutAcpAgent: (payload) => callProcedure("logoutAcpAgent", payload),
    focusAfterAuth: () => Promise.resolve(),
    recordRegistryInstalls: () => undefined,
    refreshAgentStatuses: () => refreshRemoteAgentStatuses(connectionKey),
    rediscoverAgents: async (wslDistros, scope) => {
      const generation = currentRemoteServerGeneration(connectionKey);
      const response = agentStatusesResponseSchema.parse(
        await callRaw("refreshAgentStatuses", { wslDistros, ...(scope ? { scope } : {}) }),
      );
      return refreshRemoteAgentStatuses(connectionKey, {
        generation,
        wsl: response.wsl,
        wslDistros,
      });
    },
  };
}

const remoteHosts = new Map<string, AgentManagementHost>();

/** The host that manages `machine`'s agents; one stable instance per host. */
export function agentManagementHostForMachine(machine: MachineDescriptor): AgentManagementHost {
  // A remote client's local entries are its bridge host, reached through the
  // same connection as any paired machine.
  const connectionKey = machine.ref.host === "remote" ? machine.ref.desktopId : machine.desktopId;
  return agentManagementHostForConnection(connectionKey);
}

/** Project-owned actions use the project's connection, never the selected settings machine. */
export function agentManagementHostForConnection(
  connectionKey: string | undefined,
): AgentManagementHost {
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

/** Resolves the WSL distro list for a scoped status refresh on `host`. */
export function distrosForAgentHost(
  host: AgentManagementHost,
  env: RefreshAgentScopeEnv,
  localWslDistros: readonly string[],
): string[] {
  if (!host.isRemote) return [...localWslDistros];
  return env.kind === "wsl" ? [env.distro] : [];
}
