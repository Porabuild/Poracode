import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import type {
  AgentStatus,
  Project,
  ManageAgentCredentialsPayload,
  ManageAgentCredentialsResult,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { AgentSettingsHostProvider, type AgentSettingsHost } from "./AgentSettingsHostContext";
import { OpenCodeProviderSettings } from "./OpenCodeProviderSettings";

vi.mock("@/renderer/components/providers/opencode/OpenCodePluginsSettings", () => ({
  OpenCodePluginsSettings: () => null,
}));

const runAgentLoginCommandMock = vi.hoisted(() =>
  vi.fn<
    (input: {
      label: string;
      command: string;
      project?: Project;
      onCommandComplete?: (exitCode: number) => void;
    }) => boolean
  >(),
);
vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentLoginCommand: runAgentLoginCommandMock,
  runAgentInstallCommand: vi.fn<() => boolean>(() => true),
}));

const bridge = vi.hoisted(() => ({
  manageAgentCredentials:
    vi.fn<(payload: ManageAgentCredentialsPayload) => Promise<ManageAgentCredentialsResult>>(),
  refreshAgentStatuses: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const statuses = [
  {
    kind: "opencode",
    label: "OpenCode",
    installed: true,
    envKind: "posix",
    authState: "authenticated",
    loginCommand: "opencode auth login",
    providerMetadata: {
      connectedProviders: [
        { label: "OpenCode Zen", id: "cred_1" },
        { label: "Anthropic", id: "cred_2", detail: "work key" },
      ],
    },
  },
] as unknown as AgentStatus[];

/** The provider list lives in a collapsed disclosure; open it to reach the rows. */
const renderPanel = (agentStatuses = statuses) => {
  const result = render(
    <OpenCodeProviderSettings agentKind="opencode" statuses={agentStatuses} wslDistros={[]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /AI providers/ }));
  return result;
};

function makeRemoteHost(overrides?: Partial<AgentSettingsHost>) {
  const callProcedure = vi.fn<AgentSettingsHost["callProcedure"]>(
    async () => ({ providers: [] }) as never,
  );
  const rediscoverAgents = vi.fn<AgentSettingsHost["rediscoverAgents"]>(async () => ({
    windows: [],
    wsl: [],
  }));
  const machineProject = {
    id: "__machine__:remote:conn-1:posix",
    name: "MacBook",
    remoteServerId: "conn-1",
    location: { kind: "posix", path: "~", remoteServerId: "conn-1" },
  } as Project;
  const host: AgentSettingsHost = {
    key: "conn-1",
    connectionKey: "conn-1",
    isRemote: true,
    isOnline: true,
    machineProject,
    canManageProfiles: false,
    canWrite: true,
    canEditSecrets: false,
    callProcedure,
    rediscoverAgents,
    setAgentSetting: vi.fn<AgentSettingsHost["setAgentSetting"]>(),
    saveAgentSettings: vi.fn<AgentSettingsHost["saveAgentSettings"]>(async () => undefined),
    setAgentDisabled: vi.fn<AgentSettingsHost["setAgentDisabled"]>(),
    setHiddenModels: vi.fn<AgentSettingsHost["setHiddenModels"]>(),
    createProfile: vi.fn<AgentSettingsHost["createProfile"]>(),
    updateProfile: vi.fn<AgentSettingsHost["updateProfile"]>(),
    setProfileEnvironment: vi.fn<AgentSettingsHost["setProfileEnvironment"]>(),
    removeProfile: vi.fn<AgentSettingsHost["removeProfile"]>(),
    ...overrides,
  };
  return { host, callProcedure, rediscoverAgents, machineProject };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.manageAgentCredentials.mockResolvedValue({ providers: [] });
  bridge.refreshAgentStatuses.mockResolvedValue(undefined);
  runAgentLoginCommandMock.mockReturnValue(true);
});

afterEach(async () => {
  await dynamicActivate("en");
});

describe("OpenCode provider settings", () => {
  it("localizes legacy account guidance received in English from the supervisor", async () => {
    await dynamicActivate("es");
    render(
      <OpenCodeProviderSettings
        agentKind="opencode"
        statuses={[
          {
            ...statuses[0]!,
            authState: "missing",
            providerMetadata: {
              connectedProviders: [
                {
                  id: "legacy-oauth",
                  label: "Fixture · Work",
                  detail: "Previous sessions; sign in again for new threads.",
                },
              ],
            },
          },
        ]}
        wslDistros={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Proveedores de IA/ }));
    expect(
      screen.getByText("Sesiones anteriores; vuelve a iniciar sesión para los nuevos hilos."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Previous sessions; sign in again for new threads."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Fixture · Work")).toBeInTheDocument();
  });
  it("lists every connected upstream provider rather than one account", () => {
    renderPanel();
    expect(screen.getByText("OpenCode Zen")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("work key")).toBeInTheDocument();
  });

  it("adds a provider through the agent's own login command", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Add provider/ }));
    expect(runAgentLoginCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ command: "opencode auth login" }),
    );
  });

  it.each(["windows", "wsl"] as const)("routes %s login to its matching project", (envKind) => {
    const projects = [
      { id: "native", location: { kind: "windows", path: "C:\\repo" } },
      {
        id: "linux",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "//wsl/Ubuntu/repo",
        },
      },
    ] as Project[];
    const previous = useAppStore.getState().projects;
    useAppStore.setState({ projects });
    try {
      renderPanel([
        { ...statuses[0]!, envKind, ...(envKind === "wsl" ? { envDistro: "Ubuntu" } : {}) },
      ]);
      fireEvent.click(screen.getByRole("button", { name: /Add provider/ }));
      expect(runAgentLoginCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({
          project: projects[envKind === "windows" ? 0 : 1],
        }),
      );
    } finally {
      useAppStore.setState({ projects: previous });
    }
  });

  it("does not run a native login command when only WSL projects exist", () => {
    const previous = useAppStore.getState().projects;
    useAppStore.setState({
      projects: [
        {
          id: "linux",
          location: {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/repo",
            uncPath: "//wsl/Ubuntu/repo",
          },
        },
      ] as Project[],
    });
    try {
      renderPanel([{ ...statuses[0]!, envKind: "windows" }]);
      fireEvent.click(screen.getByRole("button", { name: /Add provider/ }));
      expect(runAgentLoginCommandMock).not.toHaveBeenCalled();
    } finally {
      useAppStore.setState({ projects: previous });
    }
  });

  it("confirms before removing a credential, then signs out by its own id", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sign out of Anthropic" }));
    await screen.findByText("Sign out of Anthropic");
    expect(bridge.manageAgentCredentials).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    await waitFor(() =>
      expect(bridge.manageAgentCredentials).toHaveBeenCalledWith({
        agentKind: "opencode",
        env: { kind: "native" },
        action: "remove",
        credentialId: "cred_2",
      }),
    );
    await waitFor(() => expect(bridge.refreshAgentStatuses).toHaveBeenCalled());
  });

  it("shows an empty state when no provider is connected", () => {
    renderPanel([{ ...statuses[0], providerMetadata: undefined }] as unknown as AgentStatus[]);
    expect(screen.getByText("No providers connected yet.")).toBeInTheDocument();
  });

  it("disables Add provider when the agent has no login command", () => {
    renderPanel([{ ...statuses[0], loginCommand: undefined }] as unknown as AgentStatus[]);
    expect(screen.getByRole("button", { name: /Add provider/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Add provider/ }));
    expect(runAgentLoginCommandMock).not.toHaveBeenCalled();
  });

  it("routes Add provider and Sign out through the remote settings host without touching readBridge", async () => {
    const { host, callProcedure, rediscoverAgents, machineProject } = makeRemoteHost();
    render(
      <AgentSettingsHostProvider host={host}>
        <OpenCodeProviderSettings agentKind="opencode" statuses={statuses} wslDistros={[]} />
      </AgentSettingsHostProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /AI providers/ }));

    fireEvent.click(screen.getByRole("button", { name: /Add provider/ }));
    const loginCall = runAgentLoginCommandMock.mock.calls.at(-1)?.[0];
    expect(loginCall).toEqual(
      expect.objectContaining({
        command: "opencode auth login",
        project: machineProject,
      }),
    );
    await act(async () => loginCall?.onCommandComplete?.(0));
    await waitFor(() => expect(rediscoverAgents).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Sign out of Anthropic" }));
    await screen.findByText("Sign out of Anthropic");
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    await waitFor(() =>
      expect(callProcedure).toHaveBeenCalledWith("manageAgentCredentials", {
        agentKind: "opencode",
        env: { kind: "native" },
        action: "remove",
        credentialId: "cred_2",
      }),
    );
    await waitFor(() => expect(rediscoverAgents).toHaveBeenCalledTimes(2));
    expect(bridge.manageAgentCredentials).not.toHaveBeenCalled();
    expect(bridge.refreshAgentStatuses).not.toHaveBeenCalled();
  });

  it("disables Add provider and Sign out when the remote host is offline", () => {
    const { host } = makeRemoteHost({ isOnline: false });
    render(
      <AgentSettingsHostProvider host={host}>
        <OpenCodeProviderSettings agentKind="opencode" statuses={statuses} wslDistros={[]} />
      </AgentSettingsHostProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /AI providers/ }));
    expect(screen.getByRole("button", { name: /Add provider/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign out of Anthropic" })).toBeDisabled();
  });
});
