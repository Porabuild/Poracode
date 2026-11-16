import type { ReactNode } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AcpRegistryListResult,
  AgentStatus,
  AgentStatusesResponse,
  InstalledAcpRegistryAgent,
  Project,
} from "@/shared/contracts";
import { agentCapabilitySchema } from "@/shared/contracts";
import type { RemoteAgentStatuses } from "@/shared/remote/protocol";
import { RemoteClientError } from "@/shared/remote/clientErrors";
import type { RemoteServerRecord, RemoteServersState } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useMachineSelectionStore } from "@/renderer/state/machineSelectionStore";
import { useSettingsHostStore } from "@/renderer/state/settingsHostStore";
import { __resetBrowserBridgeForTest } from "@/renderer/state/remoteServers/browserBridge";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { reconcileAcpRegistryInstalls } from "@/renderer/state/reconcileAcpRegistryInstalls";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { msg } from "@/shared/messages";

const statusesState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
};

const settingsState = {
  providerOrder: [] as string[],
  machineScopeModes: {
    providerOrder: "synced" as const,
    hiddenModels: "synced" as const,
    disabledAgents: "synced" as const,
  },
  machineSettings: {} as Record<string, { providerOrder?: string[] }>,
  setProviderOrder: vi.fn<(order: string[]) => void>(),
  setMachineScopeMode: vi.fn<(domain: string, mode: string) => void>(),
  setMachineProviderOrder: vi.fn<(machineId: string, order: string[]) => void>(),
  lockProviderOrderToMachine: vi.fn<(machineId: string) => void>(),
  acpRegistryInstalledAgents: {} as Record<string, InstalledAcpRegistryAgent>,
  syncAcpRegistryInstalledAgents:
    vi.fn<(installed: InstalledAcpRegistryAgent[], agentIds?: readonly string[]) => void>(),
};

const appState = { projects: [] as Project[] };
const session = { remote: false };

const bridge = {
  getLatestAgentVersion:
    vi.fn<(payload: { agentKind: string }) => Promise<{ source: string; version?: string }>>(),
  updateAgentBinary: vi.fn<
    (payload: { agentKind: string; envKind: string; wslDistro?: string }) => Promise<{
      ok: boolean;
      output?: string;
    }>
  >(),
  updateAcpRegistryAgent:
    vi.fn<(payload: { agentId: string }) => Promise<{ installed: InstalledAcpRegistryAgent[] }>>(),
  refreshAgentStatuses: vi.fn<() => Promise<AgentStatusesResponse>>(),
  listAcpRegistry: vi.fn<() => Promise<AcpRegistryListResult>>(),
};

const toastMock = vi.hoisted(() => ({
  success: vi.fn<(message: string) => void>(),
  danger: vi.fn<(message: string) => void>(),
}));

const remoteCalls = {
  callRemoteProcedure: vi.fn<(procedure: string, payload: unknown) => Promise<unknown>>(),
  agentStatuses: vi.fn<() => Promise<RemoteAgentStatuses>>(),
  agentSlashCommands: vi.fn<(kind: string) => Promise<{ kind: string; commands: never[] }>>(),
};
const remoteWithClientCalls: string[] = [];
const connectionProcedures = new Map<
  string,
  (procedure: string, payload: unknown) => Promise<unknown>
>();
const remoteClient = {
  endpoint: "https://conn-1.test",
  callRemoteProcedure: remoteCalls.callRemoteProcedure,
  agentStatuses: remoteCalls.agentStatuses,
  agentSlashCommands: remoteCalls.agentSlashCommands,
};
const remoteWithClient: RemoteServersState["withClient"] = async (desktopId, invoke) => {
  remoteWithClientCalls.push(desktopId);
  const callRemoteProcedure = connectionProcedures.get(desktopId);
  return invoke(
    (callRemoteProcedure ? { ...remoteClient, callRemoteProcedure } : remoteClient) as never,
  );
};

const REMOTE_MACHINE_ID = "remote:conn-1";
const REMOTE_SERVERS: RemoteServerRecord[] = [
  {
    desktopId: "conn-1",
    connectionId: "conn-1",
    label: "Studio",
    endpoint: "https://conn-1.test",
    accessToken: "fixture",
    scopes: ["session:read", "session:operate"],
  },
];

function remoteStatuses(version = "1.2.0"): RemoteAgentStatuses {
  return {
    windows: [makeStatus({ kind: "claude", label: "Claude Code", version, envKind: "posix" })],
    wsl: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function selectRemoteMachine(statuses: RemoteAgentStatuses): void {
  useRemoteServersStore.setState({
    servers: REMOTE_SERVERS,
    runtime: {
      "conn-1": { status: "online", projects: [], threads: [], agentStatuses: statuses },
    },
    withClient: remoteWithClient,
  });
  useMachineSelectionStore.setState({ selectedMachineId: REMOTE_MACHINE_ID });
}

/** A remote client whose bridge host is `desktopId`, so its local entries point there. */
function selectBridgeHost(desktopId: string, statuses: RemoteAgentStatuses): void {
  useRemoteServersStore.setState({
    servers: [
      {
        desktopId,
        connectionId: desktopId,
        label: `Bridge ${desktopId}`,
        endpoint: `https://${desktopId}.test`,
        accessToken: "fixture",
        scopes: ["session:read", "session:operate"],
      },
    ],
    runtime: {
      [desktopId]: { status: "online", projects: [], threads: [], agentStatuses: statuses },
    },
    withClient: remoteWithClient,
  });
  useSettingsHostStore.getState().choose(desktopId);
}

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: typeof statusesState) => unknown) =>
    selector(statusesState),
  isDetectingAgentsForLocation: () => false,
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: Object.assign(
    (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
    { getState: () => settingsState },
  ),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof appState) => unknown) => selector(appState),
    {
      getState: () => appState,
    },
  ),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => session.remote,
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

vi.mock("@heroui/react", () => ({
  toast: toastMock,
  Button: (props: {
    children?: ReactNode;
    "aria-label"?: string;
    "aria-disabled"?: boolean;
    isPending?: boolean;
    isDisabled?: boolean;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      aria-disabled={props["aria-disabled"]}
      disabled={props.isDisabled}
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
}));

vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: (props: { children?: ReactNode }) => <div>{props.children}</div>,
}));

vi.mock("@dnd-kit/react/sortable", () => ({
  isSortable: () => false,
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
}));

vi.mock("@/renderer/components/common", () => ({
  PixelLoader: () => <span data-testid="loader" role="img" aria-label="Loading" />,
  ToggleSwitch: (props: { "aria-label"?: string; isSelected?: boolean }) => (
    <input type="checkbox" aria-label={props["aria-label"]} checked={props.isSelected} readOnly />
  ),
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: (props: { fallbackLabel?: string }) => <span>{props.fallbackLabel}</span>,
}));

import { registerCombinedRuntimeUpdates } from "@/renderer/components/providers/providerComposer";
import { resetAcpRegistryListingCache } from "@/renderer/components/providers/useCombinedProviderRuntimeUpdates";
import { ModelOrderSection } from "./ModelOrderSection";

/** Lingui descriptors without the macro, so extraction never sees test-only ids. */
function runtimeLabel(id: string): MessageDescriptor {
  return { id };
}

function makeStatus(overrides: Partial<AgentStatus> & { kind: string }): AgentStatus {
  return {
    label: overrides.kind,
    installed: true,
    envKind: "posix",
    capabilities: {},
    ...overrides,
  } as AgentStatus;
}

describe("ModelOrderSection provider updates", () => {
  beforeEach(() => {
    resetAcpRegistryListingCache();
    registerCombinedRuntimeUpdates("multi-runtime", ({ agentStatus }) => [
      {
        id: "cli",
        label: runtimeLabel("CLI"),
        installed: agentStatus.runtimeVariants?.cli?.installed === true,
        ...(agentStatus.runtimeVariants?.cli?.version
          ? { installedVersion: agentStatus.runtimeVariants.cli.version }
          : {}),
        channel: { kind: "agent-binary" },
      },
      {
        id: "acp",
        label: runtimeLabel("ACP"),
        installed: agentStatus.runtimeVariants?.acp?.installed === true,
        ...(agentStatus.runtimeVariants?.acp?.version
          ? { installedVersion: agentStatus.runtimeVariants.acp.version }
          : {}),
        channel: { kind: "acp-registry", agentId: "runtime-acp" },
      },
    ]);
    session.remote = false;
    statusesState.agentStatuses = [];
    statusesState.wslAgentStatuses = [];
    settingsState.providerOrder = [];
    settingsState.acpRegistryInstalledAgents = {};
    settingsState.syncAcpRegistryInstalledAgents.mockReset();
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
    bridge.getLatestAgentVersion.mockReset().mockResolvedValue({ source: "unknown" });
    bridge.updateAgentBinary.mockReset().mockResolvedValue({ ok: true });
    bridge.updateAcpRegistryAgent.mockReset().mockResolvedValue({ installed: [] });
    bridge.refreshAgentStatuses
      .mockReset()
      .mockResolvedValue({ windows: [], wsl: [] } as unknown as AgentStatusesResponse);
    bridge.listAcpRegistry.mockReset().mockResolvedValue({ version: "1", agents: [] });
    remoteCalls.callRemoteProcedure.mockReset();
    remoteCalls.agentStatuses.mockReset().mockResolvedValue(remoteStatuses());
    remoteCalls.agentSlashCommands.mockReset();
    remoteWithClientCalls.length = 0;
    connectionProcedures.clear();
    useRemoteServersStore.setState({ servers: [], runtime: {}, withClient: remoteWithClient });
    useMachineSelectionStore.setState({ selectedMachineId: "local" });
    useSettingsHostStore.setState({ desktopId: null });
    __resetBrowserBridgeForTest();
  });

  it("shows the installed version of every provider", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
      makeStatus({ kind: "codex", label: "Codex" }),
    ];

    render(<ModelOrderSection />);

    expect(await screen.findByText("v1.2.3")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("probes the bridge host's providers from a remote client", async () => {
    // A remote client labels its bridge host as the local machine; that host
    // runs the agents, so its providers are probed and updated over the same
    // connection as any paired machine.
    session.remote = true;
    const statuses = remoteStatuses("1.2.3");
    statusesState.agentStatuses = statuses.windows;
    const bridgeCall = vi.fn<(procedure: string, payload: unknown) => Promise<unknown>>(
      async (procedure) => {
        if (procedure === "getLatestAgentVersion") return { version: "1.3.0" };
        if (procedure === "updateAgentBinary") return { ok: true };
        if (procedure === "listAcpRegistry") return { version: "1", agents: [] };
        throw new Error(`unexpected procedure: ${procedure}`);
      },
    );
    connectionProcedures.set("conn-bridge", bridgeCall);
    selectBridgeHost("conn-bridge", statuses);

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    await waitFor(() =>
      expect(bridgeCall).toHaveBeenCalledWith("updateAgentBinary", {
        agentKind: "claude",
        envKind: "posix",
      }),
    );
    expect(remoteWithClientCalls).toContain("conn-bridge");
    expect(remoteWithClientCalls.every((key) => key === "conn-bridge")).toBe(true);
    expect(bridge.getLatestAgentVersion).not.toHaveBeenCalled();
    expect(bridge.updateAgentBinary).not.toHaveBeenCalled();
  });

  it("re-probes when the bridge host changes", async () => {
    session.remote = true;
    const statuses = remoteStatuses("1.2.3");
    statusesState.agentStatuses = statuses.windows;
    connectionProcedures.set("bridge-a", async (procedure) => {
      if (procedure === "getLatestAgentVersion") return { version: "1.3.0" };
      if (procedure === "listAcpRegistry") return { version: "1", agents: [] };
      throw new Error(`unexpected procedure: ${procedure}`);
    });
    connectionProcedures.set("bridge-b", async (procedure) => {
      if (procedure === "getLatestAgentVersion") return { version: "1.4.0" };
      if (procedure === "listAcpRegistry") return { version: "1", agents: [] };
      throw new Error(`unexpected procedure: ${procedure}`);
    });
    selectBridgeHost("bridge-a", statuses);

    render(<ModelOrderSection />);

    expect(
      await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }),
    ).toBeTruthy();

    act(() => selectBridgeHost("bridge-b", statuses));

    expect(
      await screen.findByRole("button", { name: "Update Claude Code to v1.4.0" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update Claude Code to v1.3.0" })).toBeNull();
    expect(remoteWithClientCalls).toContain("bridge-b");
  });

  it("shows and updates a paired machine's provider through its host", async () => {
    const statuses = remoteStatuses();
    remoteCalls.callRemoteProcedure.mockImplementation(async (procedure) => {
      if (procedure === "getLatestAgentVersion") return { version: "1.3.0" };
      if (procedure === "updateAgentBinary") return { ok: true };
      if (procedure === "listAcpRegistry") return { version: "1", agents: [] };
      throw new Error(`unexpected procedure: ${procedure}`);
    });
    selectRemoteMachine(statuses);

    render(<ModelOrderSection />);

    expect(await screen.findByText("v1.2.0")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    await waitFor(() =>
      expect(remoteCalls.callRemoteProcedure).toHaveBeenCalledWith("updateAgentBinary", {
        agentKind: "claude",
        envKind: "posix",
      }),
    );
    expect(remoteWithClientCalls.every((key) => key === "conn-1")).toBe(true);
    expect(bridge.getLatestAgentVersion).not.toHaveBeenCalled();
    expect(bridge.updateAgentBinary).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Claude Code updated to v1.3.0."),
    );
  });

  it("updates a paired machine's ACP registry provider through its host", async () => {
    const statuses: RemoteAgentStatuses = {
      windows: [
        makeStatus({
          kind: "acp-generic:pi-acp",
          label: "Pi",
          version: "0.1.0",
          envKind: "posix",
        }),
      ],
      wsl: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    remoteCalls.callRemoteProcedure.mockImplementation(async (procedure) => {
      if (procedure === "listAcpRegistry")
        return {
          version: "1",
          agents: [
            {
              id: "pi-acp",
              name: "Pi",
              version: "0.2.0",
              description: "Pi agent",
              distribution: {},
            },
          ],
        };
      if (procedure === "updateAcpRegistryAgent") return { installed: [] };
      throw new Error(`unexpected procedure: ${procedure}`);
    });
    selectRemoteMachine(statuses);

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Pi to v0.2.0" }));

    await waitFor(() =>
      expect(remoteCalls.callRemoteProcedure).toHaveBeenCalledWith("updateAcpRegistryAgent", {
        agentId: "pi-acp",
      }),
    );
    expect(remoteWithClientCalls).toContain("conn-1");
    expect(remoteWithClientCalls.every((key) => key === "conn-1")).toBe(true);
    expect(settingsState.syncAcpRegistryInstalledAgents).not.toHaveBeenCalled();
    expect(bridge.updateAcpRegistryAgent).not.toHaveBeenCalled();
  });

  it("leaves a paired machine's version visible when its host predates remote updates", async () => {
    // Older hosts reject the update procedures with a 403; the row must still
    // show what is installed, just without an offered update.
    remoteCalls.callRemoteProcedure.mockRejectedValue(
      new RemoteClientError("not allowed", 403, "git_procedure_not_allowed"),
    );
    selectRemoteMachine(remoteStatuses());

    render(<ModelOrderSection />);

    expect(await screen.findByText("v1.2.0")).toBeTruthy();
    await waitFor(() =>
      expect(remoteCalls.callRemoteProcedure).toHaveBeenCalledWith("getLatestAgentVersion", {
        agentKind: "claude",
      }),
    );
    expect(screen.queryByRole("button", { name: /^Update/u })).toBeNull();
    expect(bridge.getLatestAgentVersion).not.toHaveBeenCalled();
  });

  it("scopes each provider row's version to the selected machine", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3", envKind: "windows" }),
      makeStatus({ kind: "codex", label: "Codex", version: "1.0.0", envKind: "windows" }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus({
        kind: "claude",
        label: "Claude Code",
        version: "1.1.0",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
      makeStatus({
        kind: "codex",
        label: "Codex",
        version: "1.0.0",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<ModelOrderSection />);

    // The default scope is the local machine, so only its versions render —
    // the WSL copy belongs to the "local/wsl:Ubuntu" machine.
    expect(await screen.findByText("v1.2.3")).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
    expect(screen.queryByText(/WSL/)).toBeNull();
  });

  it("offers a per-provider update when the published version is newer", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    await waitFor(() =>
      expect(bridge.updateAgentBinary).toHaveBeenCalledWith({
        agentKind: "claude",
        envKind: "posix",
      }),
    );
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Claude Code updated to v1.3.0."),
    );
  });

  it("leaves a provider with independently versioned runtimes off the binary update lane", async () => {
    // Antigravity's root version is whichever runtime is installed — comparing
    // it against the agy binary's upstream would offer a bogus update.
    registerCombinedRuntimeUpdates("antigravity", () => [
      {
        id: "cli",
        label: runtimeLabel("agy CLI"),
        installed: false,
        channel: { kind: "agent-binary" },
      },
      {
        id: "acp",
        label: runtimeLabel("Antigravity ACP"),
        installed: true,
        installedVersion: "0.3.0",
        channel: { kind: "acp-registry", agentId: "antigravity-acp" },
      },
    ]);
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.3.0" }),
      makeStatus({ kind: "antigravity", label: "Antigravity", version: "0.3.0" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });

    render(<ModelOrderSection />);

    await waitFor(() =>
      expect(bridge.getLatestAgentVersion).toHaveBeenCalledWith({ agentKind: "claude" }),
    );
    expect(bridge.getLatestAgentVersion).toHaveBeenCalledWith({ agentKind: "antigravity" });
    expect(screen.queryByRole("button", { name: /^Update/u })).toBeNull();
  });

  function combinedStatus(cli = "1.4.5", acp = "1.4.1"): AgentStatus {
    return makeStatus({
      kind: "multi-runtime",
      label: "Multi Runtime",
      version: cli,
      runtimeVariants: {
        cli: {
          installed: true,
          version: cli,
          presentationMode: "terminal",
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: agentCapabilitySchema.parse({}),
        },
        acp: {
          installed: true,
          version: acp,
          presentationMode: "gui",
          authState: "authenticated",
          authUsesProviderLogin: true,
          capabilities: agentCapabilitySchema.parse({}),
        },
      },
    });
  }

  function mockCombinedLatest(cli = "1.5.3", acp = "1.4.5"): void {
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: cli });
    bridge.listAcpRegistry.mockResolvedValue({
      version: "1",
      agents: [
        {
          id: "runtime-acp",
          name: "Runtime ACP",
          version: acp,
          description: "Runtime ACP",
          distribution: {},
        },
      ],
    });
  }

  it.each([
    ["1.4.5", "1.4.1", true, true],
    ["1.4.5", "1.4.5", true, false],
    ["1.5.3", "1.4.1", false, true],
  ])(
    "updates independently versioned runtimes from %s / %s",
    async (cli, acp, binary, registry) => {
      statusesState.agentStatuses = [combinedStatus(cli, acp)];
      mockCombinedLatest();
      bridge.updateAcpRegistryAgent.mockResolvedValue({ installed: [] });
      bridge.refreshAgentStatuses.mockResolvedValue({
        windows: [combinedStatus("1.5.3", "1.4.5")],
        wsl: [],
      } as unknown as AgentStatusesResponse);

      render(<ModelOrderSection />);
      const button = await screen.findByRole("button", { name: "Update Multi Runtime" });
      await screen.findByText(/ACP v1\.4/u);
      fireEvent.click(button);

      await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Multi Runtime updated."));
      expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(binary ? 1 : 0);
      expect(bridge.updateAcpRegistryAgent).toHaveBeenCalledTimes(registry ? 1 : 0);
      expect(bridge.updateAgentBinary.mock.calls.map(([payload]) => payload)).toEqual(
        binary ? [{ agentKind: "multi-runtime", envKind: "posix" }] : [],
      );
      expect(bridge.updateAcpRegistryAgent.mock.calls.map(([payload]) => payload)).toEqual(
        registry ? [{ agentId: "runtime-acp", target: { kind: "native" } }] : [],
      );
      expect(screen.queryByRole("button", { name: "Update Multi Runtime" })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Update all/u })).toBeNull();
      expect(toastMock.danger).not.toHaveBeenCalled();
    },
  );

  it("counts a combined provider once in Update all and updates both runtimes", async () => {
    statusesState.agentStatuses = [
      combinedStatus(),
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.0.0" }),
    ];
    mockCombinedLatest();
    bridge.refreshAgentStatuses.mockResolvedValue({
      windows: [combinedStatus("1.5.3", "1.4.5")],
      wsl: [],
    } as unknown as AgentStatusesResponse);
    render(<ModelOrderSection />);
    await screen.findByText("CLI v1.4.5 → v1.5.3 · ACP v1.4.1 → v1.4.5");
    fireEvent.click(await screen.findByRole("button", { name: "Update all (2)" }));
    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(bridge.updateAcpRegistryAgent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Multi Runtime updated."));
  });

  it("retains the update and reports failure when refreshed runtime versions are stale", async () => {
    statusesState.agentStatuses = [combinedStatus()];
    mockCombinedLatest();
    bridge.refreshAgentStatuses.mockResolvedValue({
      windows: [combinedStatus()],
      wsl: [],
    } as unknown as AgentStatusesResponse);
    render(<ModelOrderSection />);
    await screen.findByText("CLI v1.4.5 → v1.5.3 · ACP v1.4.1 → v1.4.5");
    fireEvent.click(screen.getByRole("button", { name: "Update Multi Runtime" }));
    await waitFor(() =>
      expect(toastMock.danger).toHaveBeenCalledWith("Unable to refresh Multi Runtime status."),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Update Multi Runtime" })).toBeTruthy();
  });

  it("updates combined runtimes on the paired host and keeps verified versions host-scoped", async () => {
    session.remote = true;
    statusesState.agentStatuses = [combinedStatus()];
    const statuses: RemoteAgentStatuses = {
      windows: [combinedStatus()],
      wsl: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    remoteCalls.callRemoteProcedure.mockImplementation(async (procedure) => {
      if (procedure === "getLatestAgentVersion") return { version: "1.5.3" };
      if (procedure === "listAcpRegistry")
        return {
          version: "1",
          agents: [
            {
              id: "runtime-acp",
              name: "ACP",
              version: "1.4.5",
              description: "Runtime ACP",
              distribution: {},
            },
          ],
        };
      if (procedure === "updateAgentBinary") return { ok: true };
      if (procedure === "updateAcpRegistryAgent") return { installed: [] };
      throw new Error(`unexpected procedure: ${procedure}`);
    });
    remoteCalls.agentStatuses.mockResolvedValue({
      ...statuses,
      windows: [combinedStatus("1.5.3", "1.4.5")],
    });
    selectBridgeHost("bridge-a", statuses);
    render(<ModelOrderSection />);
    await screen.findByText("CLI v1.4.5 → v1.5.3 · ACP v1.4.1 → v1.4.5");
    fireEvent.click(screen.getByRole("button", { name: "Update Multi Runtime" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Multi Runtime updated."));
    expect(remoteCalls.callRemoteProcedure).toHaveBeenCalledWith("updateAgentBinary", {
      agentKind: "multi-runtime",
      envKind: "posix",
    });
    expect(remoteCalls.callRemoteProcedure).toHaveBeenCalledWith("updateAcpRegistryAgent", {
      agentId: "runtime-acp",
      target: { kind: "native" },
    });
    expect(bridge.updateAgentBinary).not.toHaveBeenCalled();
    expect(bridge.updateAcpRegistryAgent).not.toHaveBeenCalled();
    expect(settingsState.syncAcpRegistryInstalledAgents).not.toHaveBeenCalled();

    act(() => selectBridgeHost("bridge-b", statuses));
    expect(await screen.findByRole("button", { name: "Update Multi Runtime" })).toBeTruthy();
    await screen.findByText("CLI v1.4.5 → v1.5.3 · ACP v1.4.1 → v1.4.5");
  });

  it("routes both runtime updates to only the selected WSL distro", async () => {
    statusesState.agentStatuses = [combinedStatus("1.5.3", "1.4.5")];
    statusesState.wslAgentStatuses = [
      { ...combinedStatus(), envKind: "wsl", envDistro: "Ubuntu" },
      { ...combinedStatus(), envKind: "wsl", envDistro: "Debian" },
    ];
    useMachineSelectionStore.setState({ selectedMachineId: "local/wsl:Ubuntu" });
    mockCombinedLatest();
    bridge.refreshAgentStatuses.mockResolvedValue({
      windows: statusesState.agentStatuses,
      wsl: [{ ...combinedStatus("1.5.3", "1.4.5"), envKind: "wsl", envDistro: "Ubuntu" }],
    } as unknown as AgentStatusesResponse);
    render(<ModelOrderSection />);
    await screen.findByText("CLI v1.4.5 → v1.5.3 · ACP v1.4.1 → v1.4.5");
    fireEvent.click(screen.getByRole("button", { name: "Update all (1)" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Multi Runtime updated."));
    expect(bridge.updateAgentBinary.mock.calls).toEqual([
      [
        {
          agentKind: "multi-runtime",
          envKind: "wsl",
          wslDistro: "Ubuntu",
        },
      ],
    ]);
    expect(bridge.updateAcpRegistryAgent.mock.calls).toEqual([
      [
        {
          agentId: "runtime-acp",
          target: { kind: "wsl", distro: "Ubuntu" },
        },
      ],
    ]);
  });

  it("compares each runtime independently when both are current", async () => {
    statusesState.agentStatuses = [combinedStatus("1.5.3", "1.4.5")];
    mockCombinedLatest();
    render(<ModelOrderSection />);
    await waitFor(() => expect(bridge.listAcpRegistry).toHaveBeenCalled());
    expect(screen.getByText("CLI v1.5.3 · ACP v1.4.5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Update/u })).toBeNull();
  });

  it("hides the update control while the provider is current", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.3.0" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });

    render(<ModelOrderSection />);

    await waitFor(() => expect(bridge.getLatestAgentVersion).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /^Update/u })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Update all/u })).toBeNull();
  });

  it("updates every outdated provider from the Update all control", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
      makeStatus({ kind: "codex", label: "Codex", version: "0.9.0" }),
      makeStatus({ kind: "gemini", label: "Gemini", version: "2.0.0" }),
    ];
    bridge.getLatestAgentVersion.mockImplementation(({ agentKind }) =>
      Promise.resolve(
        agentKind === "gemini"
          ? { source: "npm", version: "2.0.0" }
          : { source: "npm", version: agentKind === "claude" ? "1.3.0" : "1.0.0" },
      ),
    );

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update all (2)" }));

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(2));
    expect(bridge.updateAgentBinary.mock.calls.map(([payload]) => payload.agentKind)).toEqual([
      "claude",
      "codex",
    ]);
  });

  it("shows queued, updating, and probing phases during Update all", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "test-a", label: "Agent A", version: "1.0.0" }),
      makeStatus({ kind: "test-b", label: "Agent B", version: "1.0.0" }),
      makeStatus({ kind: "test-c", label: "Agent C", version: "1.0.0" }),
      makeStatus({ kind: "test-d", label: "Agent D", version: "1.0.0" }),
    ];
    settingsState.providerOrder = statusesState.agentStatuses.map((agent) => agent.kind);
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "2.0.0" });
    const resolveUpdates = new Map<string, (value: { ok: boolean }) => void>();
    const resolveRefreshes: Array<(value: AgentStatusesResponse) => void> = [];
    bridge.updateAgentBinary.mockImplementation(
      ({ agentKind }) =>
        new Promise((resolve) => {
          resolveUpdates.set(agentKind, resolve);
        }),
    );
    bridge.refreshAgentStatuses.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefreshes.push(resolve);
        }),
    );

    render(<ModelOrderSection />);
    const updateAllButton = await screen.findByRole("button", { name: "Update all (4)" });
    updateAllButton.focus();
    fireEvent.click(updateAllButton);

    const firstProgress = await screen.findByRole("status", {
      name: "Updating providers (0 of 4 complete)",
    });
    expect(firstProgress.querySelector("span.truncate")).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Agent D queued for update to v2.0.0" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(updateAllButton);
    expect(updateAllButton).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Updating (0/4)")).toBeTruthy();
    expect(screen.getAllByText("Updating to v2.0.0")).toHaveLength(3);
    expect(screen.getByText("Queued for v2.0.0")).toBeTruthy();
    expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolveUpdates.get("test-b")?.({ ok: true });
    });

    expect(await screen.findByRole("status", { name: "Probing Agent B v2.0.0" })).toBeTruthy();
    expect(screen.getByText("Probing v2.0.0")).toBeTruthy();
    expect(screen.getByText("Queued for v2.0.0")).toBeTruthy();
    expect(screen.getByText("Updating (0/4)")).toBeTruthy();

    await act(async () => {
      resolveRefreshes.shift()?.({ windows: [], wsl: [] } as unknown as AgentStatusesResponse);
    });

    expect(await screen.findByRole("status", { name: "Updating Agent D to v2.0.0" })).toBeTruthy();
    expect(screen.getByText("Updating (1/4)")).toBeTruthy();
    expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(4);
    expect(screen.queryByText("Queued for v2.0.0")).toBeNull();

    await act(async () => {
      for (const kind of ["test-a", "test-c", "test-d"]) {
        resolveUpdates.get(kind)?.({ ok: true });
      }
    });

    expect(await screen.findByRole("status", { name: "Probing Agent D v2.0.0" })).toBeTruthy();
    expect(screen.getAllByText("Probing v2.0.0")).toHaveLength(3);

    await act(async () => {
      for (const resolve of resolveRefreshes) {
        resolve({ windows: [], wsl: [] } as unknown as AgentStatusesResponse);
      }
    });
    await waitFor(() => expect(screen.queryByText(/Updating \(/u)).toBeNull());
    expect(toastMock.success).toHaveBeenCalledTimes(4);
  });

  it("keeps an individual provider's versioned row status until refresh finishes", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });
    let resolveUpdate!: (value: { ok: boolean }) => void;
    bridge.updateAgentBinary.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    let resolveRefresh!: (value: AgentStatusesResponse) => void;
    bridge.refreshAgentStatuses.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const view = render(<ModelOrderSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    const rowStatus = await screen.findByRole("status", {
      name: "Updating Claude Code to v1.3.0",
    });
    expect(rowStatus).toHaveClass("min-w-[6.5rem]", "max-w-[45%]", "shrink-0");
    expect(rowStatus.querySelector("span.truncate")).toHaveTextContent("Updating to v1.3.0");

    await act(async () => {
      resolveUpdate({ ok: true });
    });

    await waitFor(() => expect(bridge.refreshAgentStatuses).toHaveBeenCalled());
    expect(screen.getByRole("status", { name: "Probing Claude Code v1.3.0" })).toHaveTextContent(
      "Probing v1.3.0",
    );

    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.3.0" }),
    ];
    view.rerender(<ModelOrderSection />);

    expect(screen.getByRole("status", { name: "Probing Claude Code v1.3.0" })).toHaveTextContent(
      "Probing v1.3.0",
    );

    await act(async () => {
      resolveRefresh({ windows: [], wsl: [] } as unknown as AgentStatusesResponse);
    });
  });

  it("offers updates only on base providers, not their profiles", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
      makeStatus({ kind: "claude:work", label: "Claude Z AI", version: "1.2.3" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });

    render(<ModelOrderSection />);

    expect(
      await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update Claude Z AI to v1.3.0" })).toBeNull();
    expect(bridge.getLatestAgentVersion).toHaveBeenCalledTimes(1);
    expect(bridge.getLatestAgentVersion).toHaveBeenCalledWith({ agentKind: "claude" });

    fireEvent.click(screen.getByRole("button", { name: "Update all (1)" }));

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(1));
    expect(bridge.updateAgentBinary).toHaveBeenCalledWith({
      agentKind: "claude",
      envKind: "posix",
    });
  });

  it("updates only the selected machine's environment", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3", envKind: "windows" }),
    ];
    // A WSL copy belongs to another machine and must not be touched by an
    // update-all run scoped to the local machine.
    statusesState.wslAgentStatuses = [
      makeStatus({
        kind: "claude",
        label: "Claude Code",
        version: "1.1.0",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update all (1)" }));

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(1));
    expect(bridge.updateAgentBinary.mock.calls.map(([payload]) => payload)).toEqual([
      { agentKind: "claude", envKind: "windows" },
    ]);
  });

  it("reports a failed update without claiming success", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });
    bridge.updateAgentBinary.mockResolvedValue({ ok: false, output: "npm ERR! EACCES" });

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    await waitFor(() =>
      expect(toastMock.danger).toHaveBeenCalledWith(
        "Unable to update Claude Code: npm ERR! EACCES",
      ),
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("reports a failed machine update without claiming success", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3", envKind: "windows" }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });
    bridge.updateAgentBinary.mockResolvedValue({ ok: false, output: "npm ERR! EACCES" });

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Claude Code to v1.3.0" }));

    await waitFor(() => expect(bridge.updateAgentBinary).toHaveBeenCalledTimes(1));
    expect(bridge.updateAgentBinary.mock.calls.map(([payload]) => payload)).toEqual([
      { agentKind: "claude", envKind: "windows" },
    ]);
    expect(toastMock.danger).toHaveBeenCalledWith("Unable to update Claude Code: npm ERR! EACCES");
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("translates the supervisor's queue-timeout detail in a non-English locale", async () => {
    const supervisorOutput = msg("agent.updateQueueTimeout");
    await dynamicActivate("es");
    try {
      statusesState.agentStatuses = [
        makeStatus({ kind: "test-agent", label: "Test Agent", version: "1.2.3" }),
      ];
      bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });
      bridge.updateAgentBinary.mockResolvedValue({ ok: false, output: supervisorOutput });
      render(<ModelOrderSection />);

      fireEvent.click(await screen.findByRole("button", { name: /Test Agent.*v1\.3\.0/u }));

      const translated = msg("agent.updateQueueTimeout");
      expect(translated).not.toBe(supervisorOutput);
      await waitFor(() => expect(toastMock.danger).toHaveBeenCalledOnce());
      expect(toastMock.danger.mock.calls[0]?.[0]).toContain(translated);
      expect(toastMock.danger.mock.calls[0]?.[0]).not.toContain(supervisorOutput);
      expect(toastMock.success).not.toHaveBeenCalled();
    } finally {
      await dynamicActivate("en");
    }
  });

  it("disables per-provider updates while an update-all run is active", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "claude", label: "Claude Code", version: "1.2.3" }),
      makeStatus({ kind: "codex", label: "Codex", version: "0.9.0" }),
    ];
    let resolveCodexProbe!: (value: { source: string; version?: string }) => void;
    bridge.getLatestAgentVersion.mockImplementation(({ agentKind }) =>
      agentKind === "claude"
        ? Promise.resolve({ source: "npm", version: "1.3.0" })
        : new Promise((resolve) => {
            resolveCodexProbe = resolve;
          }),
    );
    let resolveClaudeUpdate!: (value: { ok: boolean; output?: string }) => void;
    bridge.updateAgentBinary.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveClaudeUpdate = resolve;
        }),
    );

    render(<ModelOrderSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Update all (1)" }));

    await act(async () => {
      resolveCodexProbe({ source: "npm", version: "1.0.0" });
    });
    const codexButton = screen.getByRole("button", {
      name: "Update Codex to v1.0.0",
    }) as HTMLButtonElement;
    expect(codexButton.disabled).toBe(true);

    await act(async () => {
      resolveClaudeUpdate({ ok: true });
    });
    await waitFor(() => expect(codexButton.disabled).toBe(false));
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Claude Code updated to v1.3.0."),
    );
  });

  it("shares registry discovery and preserves concurrent combined and generic updates", async () => {
    const before = ["runtime-acp", "test-b"].map((id) => ({
      id,
      name: id,
      version: "1.0.0",
      installedAt: "2026-10-13",
      adapterKind: `acp-generic:${id}`,
      installKind: "generic" as const,
    }));
    statusesState.agentStatuses = [
      combinedStatus("1.5.3", "1.0.0"),
      makeStatus({ kind: "acp-generic:test-b", label: "test-b", version: "1.0.0" }),
    ];
    settingsState.acpRegistryInstalledAgents = Object.fromEntries(
      before.map((record) => [record.id, record]),
    );
    settingsState.syncAcpRegistryInstalledAgents.mockImplementation((installed, ids) => {
      settingsState.acpRegistryInstalledAgents = reconcileAcpRegistryInstalls(
        settingsState.acpRegistryInstalledAgents,
        installed,
        ids,
      );
    });
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.5.3" });
    bridge.listAcpRegistry.mockResolvedValue({
      version: "1",
      agents: before.map((record) => ({ id: record.id, version: "2.0.0" })),
    } as unknown as AcpRegistryListResult);
    let finishCombined!: () => void;
    bridge.updateAcpRegistryAgent.mockImplementation(({ agentId }) => {
      const result = {
        installed: before.map((record) => ({
          ...record,
          version: record.id === agentId ? "2.0.0" : "1.0.0",
        })),
      };
      return agentId === "runtime-acp"
        ? new Promise((resolve) => {
            finishCombined = () => resolve(result);
          })
        : Promise.resolve(result);
    });
    bridge.refreshAgentStatuses.mockResolvedValue({
      windows: [combinedStatus("1.5.3", "2.0.0")],
      wsl: [],
    } as unknown as AgentStatusesResponse);
    render(<ModelOrderSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Update all (2)" }));
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("test-b updated to v2.0.0."),
    );
    expect(bridge.listAcpRegistry).toHaveBeenCalledTimes(1);
    await act(async () => finishCombined());
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("Multi Runtime updated."));
    expect(settingsState.acpRegistryInstalledAgents["test-b"]?.version).toBe("2.0.0");
    expect(settingsState.acpRegistryInstalledAgents["runtime-acp"]?.version).toBe("2.0.0");
    expect(settingsState.syncAcpRegistryInstalledAgents).toHaveBeenCalledWith(expect.any(Array), [
      "runtime-acp",
    ]);
  });

  it("keeps both registry updates current when their replies contain stale sibling versions", async () => {
    const before = ["test-a", "test-b"].map((id) => ({
      id,
      name: id,
      version: "1.0.0",
      installedAt: "2026-10-13",
      adapterKind: `acp-generic:${id}`,
      installKind: "generic" as const,
    }));
    statusesState.agentStatuses = before.map((record) =>
      makeStatus({ kind: record.adapterKind, label: record.name, version: record.version }),
    );
    settingsState.acpRegistryInstalledAgents = Object.fromEntries(
      before.map((record) => [record.id, record]),
    );
    settingsState.syncAcpRegistryInstalledAgents.mockImplementation((installed, ids) => {
      settingsState.acpRegistryInstalledAgents = reconcileAcpRegistryInstalls(
        settingsState.acpRegistryInstalledAgents,
        installed,
        ids,
      );
    });
    bridge.listAcpRegistry.mockResolvedValue({
      version: "1",
      agents: before.map((record) => ({ id: record.id, version: "2.0.0" })),
    } as unknown as AcpRegistryListResult);
    bridge.updateAcpRegistryAgent.mockImplementation(async ({ agentId }) => ({
      installed: before.map((record) => ({
        ...record,
        version: record.id === agentId ? "2.0.0" : "1.0.0",
      })),
    }));
    render(<ModelOrderSection />);
    fireEvent.click(await screen.findByRole("button", { name: "Update all (2)" }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(2));
    expect(settingsState.acpRegistryInstalledAgents["test-a"]?.version).toBe("2.0.0");
    expect(settingsState.acpRegistryInstalledAgents["test-b"]?.version).toBe("2.0.0");
    expect(screen.queryByRole("button", { name: /^Update/u })).toBeNull();
  });

  it("routes ACP registry instances through the registry update", async () => {
    statusesState.agentStatuses = [
      makeStatus({ kind: "acp-generic:pi-acp", label: "Pi", version: "0.1.0" }),
    ];
    settingsState.acpRegistryInstalledAgents = {
      "pi-acp": { id: "pi-acp", version: "0.1.0" } as InstalledAcpRegistryAgent,
    };
    bridge.listAcpRegistry.mockResolvedValue({
      version: "1",
      agents: [{ id: "pi-acp", version: "0.2.0" }],
    } as unknown as AcpRegistryListResult);

    render(<ModelOrderSection />);

    fireEvent.click(await screen.findByRole("button", { name: "Update Pi to v0.2.0" }));

    await waitFor(() =>
      expect(bridge.updateAcpRegistryAgent).toHaveBeenCalledWith({ agentId: "pi-acp" }),
    );
    expect(bridge.updateAgentBinary).not.toHaveBeenCalled();
  });
});
