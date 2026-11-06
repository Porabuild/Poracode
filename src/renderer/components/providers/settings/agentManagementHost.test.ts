import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentStatus,
  AgentStatusesResponse,
  InstalledAcpRegistryAgent,
} from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/clientErrors";
import type { RemoteAgentStatuses } from "@/shared/remote/protocol";
import type { MachineDescriptor } from "@/renderer/state/machines";
import type { RemoteServersState } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  __resetEventSocketRegistryForTest,
  bumpRemoteServerGeneration,
} from "@/renderer/state/remoteServers/eventSocketRegistry";
import { LOCAL_AGENT_MANAGEMENT_HOST, agentManagementHostForMachine } from "./agentManagementHost";

const settingsMocks = vi.hoisted(() => ({
  syncAcpRegistryInstalledAgents:
    vi.fn<(installed: InstalledAcpRegistryAgent[], agentIds?: readonly string[]) => void>(),
  acpRegistryInstalledAgents: {} as Record<string, InstalledAcpRegistryAgent>,
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: Object.assign(
    (
      selector: (state: {
        acpRegistryInstalledAgents: Record<string, InstalledAcpRegistryAgent>;
      }) => unknown,
    ) => selector(settingsMocks),
    { getState: () => settingsMocks },
  ),
}));

const bridge = {
  getLatestAgentVersion: vi.fn<() => Promise<{ source?: string; version?: string }>>(),
  listAcpRegistry: vi.fn<() => Promise<{ version: string; agents: never[] }>>(),
  updateAgentBinary: vi.fn<() => Promise<{ ok: boolean }>>(),
  updateAcpRegistryAgent: vi.fn<() => Promise<{ installed: never[] }>>(),
  refreshAgentStatuses: vi.fn<() => Promise<AgentStatusesResponse>>(),
};

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/state/remoteServersStore", async () => {
  const { create } = await import("zustand");
  return {
    useRemoteServersStore: create(() => ({
      servers: [],
      runtime: {},
      withClient: vi.fn<RemoteServersState["withClient"]>(),
    })),
  };
});

const callRemoteProcedure = vi.fn<(procedure: string, payload: unknown) => Promise<unknown>>();
const agentStatuses = vi.fn<() => Promise<RemoteAgentStatuses>>();
const agentSlashCommands = vi.fn<(kind: string) => Promise<{ kind: string; commands: never[] }>>();
const remoteClient = {
  endpoint: "https://conn-1.test",
  callRemoteProcedure,
  agentStatuses,
  agentSlashCommands,
};
const withClientCalls: string[] = [];
const withClient: RemoteServersState["withClient"] = async (desktopId, invoke) => {
  withClientCalls.push(desktopId);
  return invoke(remoteClient as never);
};

function makeStatus(overrides: Partial<AgentStatus> & { kind: string }): AgentStatus {
  return {
    label: overrides.kind,
    installed: true,
    envKind: "posix",
    capabilities: {},
    ...overrides,
  } as AgentStatus;
}

function makeRemoteStatuses(updatedAt = "2026-01-01T00:00:00.000Z"): RemoteAgentStatuses {
  return {
    windows: [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.0", envKind: "posix" }),
    ],
    wsl: [],
    updatedAt,
  };
}

function statusesWithVersion(version: string, updatedAt: string): RemoteAgentStatuses {
  return {
    windows: [makeStatus({ kind: "claude", label: "Claude Code", version, envKind: "posix" })],
    wsl: [],
    updatedAt,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const LOCAL_MACHINE: MachineDescriptor = {
  id: "local",
  ref: { host: "local", env: { kind: "native" } },
  kind: "local",
  label: "This device",
  status: "online",
};

const BRIDGE_LOCAL_MACHINE: MachineDescriptor = {
  ...LOCAL_MACHINE,
  desktopId: "bridge-1",
  label: "Bridge host",
};

const REMOTE_MACHINE: MachineDescriptor = {
  id: "remote:conn-1",
  ref: { host: "remote", desktopId: "conn-1", env: { kind: "native" } },
  kind: "remote",
  label: "Studio",
  status: "online",
  desktopId: "conn-1",
};

describe("agent management hosts", () => {
  beforeEach(() => {
    bridge.getLatestAgentVersion.mockReset();
    bridge.listAcpRegistry.mockReset();
    bridge.updateAgentBinary.mockReset();
    bridge.updateAcpRegistryAgent.mockReset();
    bridge.refreshAgentStatuses.mockReset();
    callRemoteProcedure.mockReset();
    agentStatuses.mockReset();
    agentSlashCommands.mockReset();
    settingsMocks.syncAcpRegistryInstalledAgents.mockReset();
    withClientCalls.length = 0;
    __resetEventSocketRegistryForTest();
    useRemoteServersStore.setState({
      servers: [],
      runtime: { "conn-1": { status: "online", projects: [], threads: [] } },
      withClient,
    });
  });

  it("routes the local host through this client's bridge", async () => {
    const host = agentManagementHostForMachine(LOCAL_MACHINE);
    expect(host).toBe(LOCAL_AGENT_MANAGEMENT_HOST);
    expect(host.isRemote).toBe(false);
    expect(host.connectionKey).toBeUndefined();

    const payload = { agentKind: "claude", envKind: "windows" as const };
    bridge.updateAgentBinary.mockResolvedValue({ ok: true });
    await expect(host.updateAgentBinary(payload)).resolves.toEqual({ ok: true });
    expect(bridge.updateAgentBinary).toHaveBeenCalledWith(payload);

    const windows = [makeStatus({ kind: "claude", envKind: "windows", version: "1.0.0" })];
    const wsl = [makeStatus({ kind: "claude", envKind: "wsl", envDistro: "Ubuntu" })];
    bridge.refreshAgentStatuses.mockResolvedValue({ windows, wsl, fromCache: false });
    await expect(host.refreshAgentStatuses(["Ubuntu"])).resolves.toEqual({ windows, wsl });
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledWith(["Ubuntu"], undefined);
  });

  it("runs paired-host probes, updates, and registry reads on the connection", async () => {
    const host = agentManagementHostForMachine(REMOTE_MACHINE);
    expect(host.isRemote).toBe(true);
    expect(host.connectionKey).toBe("conn-1");

    const payload = { agentKind: "claude", envKind: "posix" as const };
    callRemoteProcedure.mockResolvedValueOnce({ ok: true });
    await expect(host.updateAgentBinary(payload)).resolves.toEqual({ ok: true });
    expect(withClientCalls).toEqual(["conn-1"]);
    expect(callRemoteProcedure).toHaveBeenCalledWith("updateAgentBinary", payload);

    callRemoteProcedure.mockResolvedValueOnce({ version: "1", agents: [] });
    await expect(host.listAcpRegistry()).resolves.toEqual({ version: "1", agents: [] });
    expect(callRemoteProcedure).toHaveBeenLastCalledWith("listAcpRegistry", {});
  });

  it("re-reads a paired host's statuses and stores them on its runtime row", async () => {
    const statuses = makeRemoteStatuses();
    agentStatuses.mockResolvedValue(statuses);
    const host = agentManagementHostForMachine(REMOTE_MACHINE);

    await expect(host.refreshAgentStatuses([])).resolves.toEqual({
      windows: statuses.windows,
      wsl: statuses.wsl,
    });
    expect(withClientCalls).toEqual(["conn-1"]);
    expect(agentStatuses).toHaveBeenCalledWith({ omitSlashCommands: true });
    expect(useRemoteServersStore.getState().runtime["conn-1"]?.agentStatuses).toEqual(statuses);
  });

  it("propagates a procedure rejection from an older host", async () => {
    const host = agentManagementHostForMachine(REMOTE_MACHINE);
    const error = new RemoteClientError("not allowed", 403, "git_procedure_not_allowed");
    callRemoteProcedure.mockRejectedValueOnce(error);

    await expect(host.updateAgentBinary({ agentKind: "claude", envKind: "posix" })).rejects.toBe(
      error,
    );
    expect(bridge.updateAgentBinary).not.toHaveBeenCalled();
  });

  it("returns one stable host per paired connection", () => {
    expect(agentManagementHostForMachine(REMOTE_MACHINE)).toBe(
      agentManagementHostForMachine(REMOTE_MACHINE),
    );
  });

  it("treats a remote client's local machine as its bridge host", async () => {
    const host = agentManagementHostForMachine(BRIDGE_LOCAL_MACHINE);
    expect(host).not.toBe(LOCAL_AGENT_MANAGEMENT_HOST);
    expect(host.key).toBe("bridge-1");
    expect(host.connectionKey).toBe("bridge-1");
    expect(host.isRemote).toBe(true);

    callRemoteProcedure.mockResolvedValueOnce({ version: "9.0.0" });
    await expect(host.getLatestAgentVersion({ agentKind: "claude" })).resolves.toEqual({
      version: "9.0.0",
    });
    expect(withClientCalls).toEqual(["bridge-1"]);
    expect(callRemoteProcedure).toHaveBeenCalledWith("getLatestAgentVersion", {
      agentKind: "claude",
    });
    expect(bridge.getLatestAgentVersion).not.toHaveBeenCalled();
  });

  it("keeps the newest statuses when responses land out of order", async () => {
    const initial = makeRemoteStatuses("2025-12-31T00:00:00.000Z");
    const newer = statusesWithVersion("2.0.0", "2026-01-02T00:00:00.000Z");
    const older = statusesWithVersion("1.0.0", "2026-01-01T00:00:00.000Z");
    useRemoteServersStore.setState({
      runtime: {
        "conn-1": { status: "online", projects: [], threads: [], agentStatuses: initial },
      },
    });
    const newerResponse = deferred<RemoteAgentStatuses>();
    const olderResponse = deferred<RemoteAgentStatuses>();
    agentStatuses
      .mockReturnValueOnce(newerResponse.promise)
      .mockReturnValueOnce(olderResponse.promise);
    const host = agentManagementHostForMachine(REMOTE_MACHINE);

    const first = host.refreshAgentStatuses([]);
    const second = host.refreshAgentStatuses([]);
    newerResponse.resolve(newer);
    await expect(first).resolves.toEqual({ windows: newer.windows, wsl: newer.wsl });
    olderResponse.resolve(older);

    await expect(second).resolves.toEqual({ windows: newer.windows, wsl: newer.wsl });
    expect(useRemoteServersStore.getState().runtime["conn-1"]?.agentStatuses).toEqual(newer);
  });

  it("skips a status write when the connection generation changed", async () => {
    const initial = makeRemoteStatuses("2026-01-01T00:00:00.000Z");
    const fresh = statusesWithVersion("2.0.0", "2026-01-02T00:00:00.000Z");
    useRemoteServersStore.setState({
      runtime: {
        "conn-1": { status: "online", projects: [], threads: [], agentStatuses: initial },
      },
    });
    const response = deferred<RemoteAgentStatuses>();
    agentStatuses.mockReturnValueOnce(response.promise);
    const host = agentManagementHostForMachine(REMOTE_MACHINE);

    const refresh = host.refreshAgentStatuses([]);
    bumpRemoteServerGeneration("conn-1");
    response.resolve(fresh);

    await expect(refresh).resolves.toEqual({ windows: initial.windows, wsl: initial.wsl });
    expect(useRemoteServersStore.getState().runtime["conn-1"]?.agentStatuses).toEqual(initial);
  });

  it("records registry installs only for the local host", () => {
    const installed = [{ id: "pi-acp" } as InstalledAcpRegistryAgent];

    LOCAL_AGENT_MANAGEMENT_HOST.recordRegistryInstalls(installed, ["pi-acp"]);
    agentManagementHostForMachine(REMOTE_MACHINE).recordRegistryInstalls(installed);

    expect(settingsMocks.syncAcpRegistryInstalledAgents).toHaveBeenCalledTimes(1);
    expect(settingsMocks.syncAcpRegistryInstalledAgents).toHaveBeenCalledWith(installed, [
      "pi-acp",
    ]);
  });
});
