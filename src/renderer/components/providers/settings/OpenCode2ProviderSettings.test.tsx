import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentStatus,
  Project,
  ManageAgentCredentialsPayload,
  ManageAgentCredentialsResult,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { OpenCode2ProviderSettings } from "./OpenCode2ProviderSettings";

vi.mock("@/renderer/components/providers/opencode2/OpenCode2PluginsSettings", () => ({
  OpenCode2PluginsSettings: () => null,
}));
vi.mock("./ProviderMcpServersSection", () => ({ ProviderMcpServersSection: () => null }));

const runAgentLoginCommandMock = vi.hoisted(() =>
  vi.fn<(input: { label: string; command: string }) => boolean>(),
);
vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentLoginCommand: runAgentLoginCommandMock,
}));

const bridge = vi.hoisted(() => ({
  manageAgentCredentials:
    vi.fn<(payload: ManageAgentCredentialsPayload) => Promise<ManageAgentCredentialsResult>>(),
  refreshAgentStatuses: vi.fn<() => Promise<void>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const statuses = [
  {
    kind: "opencode2",
    label: "OpenCode 2",
    installed: true,
    envKind: "posix",
    authState: "authenticated",
    loginCommand: "opencode2 auth login",
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
    <OpenCode2ProviderSettings agentKind="opencode2" statuses={agentStatuses} wslDistros={[]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /AI providers/ }));
  return result;
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.manageAgentCredentials.mockResolvedValue({ providers: [] });
  bridge.refreshAgentStatuses.mockResolvedValue(undefined);
  runAgentLoginCommandMock.mockReturnValue(true);
});

describe("OpenCode 2 provider settings", () => {
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
      expect.objectContaining({ command: "opencode2 auth login" }),
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
        agentKind: "opencode2",
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
});
