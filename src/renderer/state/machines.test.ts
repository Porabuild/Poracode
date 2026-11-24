import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";
import type { RemoteServerRecord } from "./remoteServers/types";
import { useAppStore } from "./appStore";
import { useMachineSelectionStore } from "./machineSelectionStore";
import {
  deriveMachines,
  machineIdForStatus,
  useAgentsScopeMachines,
  useMachines,
  useWslDistroListStore,
} from "./machines";
import { useRemoteServersStore } from "./remoteServersStore";

function status(overrides: Partial<AgentStatus>): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "terminal",
      settingDefs: [],
    },
    ...overrides,
  } as AgentStatus;
}

describe("deriveMachines", () => {
  it("always lists the local machine first and dedupes/sorts WSL distros", () => {
    const machines = deriveMachines({
      enumeratedDistros: ["Ubuntu", "Debian"],
      projectDistros: ["Ubuntu", "Alpine"],
      remoteServers: [],
      remoteRuntime: {},
    });
    expect(machines.map((machine) => machine.id)).toEqual([
      "local",
      "local/wsl:Alpine",
      "local/wsl:Debian",
      "local/wsl:Ubuntu",
    ]);
    expect(machines[0]!.status).toBe("online");
  });

  it("adds remote machines with connection state and their WSL distros", () => {
    const machines = deriveMachines({
      enumeratedDistros: [],
      projectDistros: [],
      remoteServers: [{ desktopId: "desk-1", label: "Studio" }],
      remoteRuntime: {
        "desk-1": {
          status: "online",
          agentStatuses: { wsl: [{ envDistro: "Ubuntu" }, { envDistro: "Ubuntu" }, {}] },
        },
      },
    });
    expect(machines.map((machine) => machine.id)).toEqual([
      "local",
      "remote:desk-1",
      "remote:desk-1/wsl:Ubuntu",
    ]);
    expect(machines[1]!.status).toBe("online");
    expect(machines[1]!.label).toBe("Studio");
  });

  it("marks unpaired runtime states offline", () => {
    const machines = deriveMachines({
      enumeratedDistros: [],
      projectDistros: [],
      remoteServers: [{ desktopId: "desk-2", label: "Laptop" }],
      remoteRuntime: {},
    });
    expect(machines[1]!.status).toBe("offline");
  });

  it("names a remote client's local entries after its bound host instead of this computer", () => {
    const machines = deriveMachines({
      enumeratedDistros: ["Ubuntu"],
      projectDistros: [],
      remoteServers: [
        { desktopId: "pc", label: "PC" },
        { desktopId: "mac", label: "Mac" },
      ],
      remoteRuntime: { pc: { status: "online" }, mac: { status: "online" } },
      localHost: { connectionKey: "pc", label: "PC" },
    });
    expect(machines.map((machine) => [machine.id, machine.label, machine.desktopId])).toEqual([
      ["local", "PC", "pc"],
      ["local/wsl:Ubuntu", "PC · WSL Ubuntu", "pc"],
      ["remote:mac", "Mac", "mac"],
    ]);
  });
});

describe("machineIdForStatus", () => {
  it("buckets local statuses by env", () => {
    expect(machineIdForStatus(status({ envKind: "windows" }))).toBe("local");
    expect(machineIdForStatus(status({ envKind: "posix" }))).toBe("local");
    expect(machineIdForStatus(status({ envKind: "wsl", envDistro: "Ubuntu" }))).toBe(
      "local/wsl:Ubuntu",
    );
  });
});

function project(
  overrides: Pick<Project, "id" | "location"> & Partial<Pick<Project, "disabled">>,
): Project {
  return {
    name: overrides.id,
    createdAt: "2026-11-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("useAgentsScopeMachines", () => {
  const mac: RemoteServerRecord = {
    desktopId: "mac",
    label: "MacBook",
    endpoint: "https://mac.test/",
    accessToken: "token",
    scopes: [],
  };
  const studio: RemoteServerRecord = { ...mac, desktopId: "studio", label: "Studio" };
  const ubuntu = {
    kind: "wsl" as const,
    distro: "Ubuntu",
    linuxPath: "/repo",
    uncPath: "\\\\wsl$\\Ubuntu\\repo",
  };

  afterEach(() => {
    useAppStore.setState({ projects: [] });
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useWslDistroListStore.setState({ distros: [], loadedFor: null });
    useMachineSelectionStore.setState({ selectedMachineId: "local" });
  });

  it("keeps the local machine and only machines that host an active project", () => {
    useWslDistroListStore.setState({ distros: ["Ubuntu", "Debian"], loadedFor: "local" });
    useRemoteServersStore.setState({ servers: [mac, studio], runtime: {} });
    useAppStore.setState({
      projects: [
        project({ id: "ubuntu", location: ubuntu }),
        project({ id: "ubuntu-again", location: { ...ubuntu, linuxPath: "/other" } }),
        project({
          id: "remote",
          location: { kind: "posix", path: "/srv/repo", remoteServerId: "mac" },
        }),
        // Debian hosts only a disabled project, so it must not count.
        project({ id: "disabled", disabled: true, location: { ...ubuntu, distro: "Debian" } }),
      ],
    });

    const { result } = renderHook(() => useAgentsScopeMachines(useMachines()));

    // Debian's only project is disabled and Studio is paired but projectless,
    // so neither is offered; the local machine stays as the anchor and the two
    // Ubuntu projects dedupe onto one machine.
    expect(result.current.map((machine) => machine.id)).toEqual([
      "local",
      "local/wsl:Ubuntu",
      "remote:mac",
    ]);
  });

  it("keeps the current scope listed even when it hosts no active project", () => {
    useWslDistroListStore.setState({ distros: ["Ubuntu", "Debian"], loadedFor: "local" });
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    useAppStore.setState({ projects: [project({ id: "ubuntu", location: ubuntu })] });
    useMachineSelectionStore.setState({ selectedMachineId: "local/wsl:Debian" });

    const { result } = renderHook(() => useAgentsScopeMachines(useMachines()));

    // An attention row can scope the page to a projectless machine; the picker
    // must show that scope instead of snapping it back to local.
    expect(result.current.map((machine) => machine.id)).toEqual([
      "local",
      "local/wsl:Debian",
      "local/wsl:Ubuntu",
    ]);
  });

  it("respects an explicit selectedId without leaking the Agents selection", () => {
    useWslDistroListStore.setState({ distros: ["Ubuntu", "Debian"], loadedFor: "local" });
    useRemoteServersStore.setState({ servers: [mac], runtime: {} });
    useAppStore.setState({
      projects: [
        project({
          id: "remote",
          location: { kind: "posix", path: "/srv/repo", remoteServerId: "mac" },
        }),
      ],
    });
    useMachineSelectionStore.setState({ selectedMachineId: "local/wsl:Debian" });

    const { result } = renderHook(() => useAgentsScopeMachines(useMachines(), "local"));

    expect(result.current.map((machine) => machine.id)).toEqual(["local", "remote:mac"]);
  });
});
