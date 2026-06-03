import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AcpRegistryListResult,
  AgentStatusesResponse,
  AgentStatus,
  InstalledAcpRegistryAgent,
  Project,
} from "@/shared/contracts";

const statusesState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
};

const appState = {
  projects: [] as Project[],
};

const settingsState = {
  acpRegistryInstalledAgents: {} as Record<string, InstalledAcpRegistryAgent>,
  syncAcpRegistryInstalledAgents: vi.fn<(installed: InstalledAcpRegistryAgent[]) => void>(),
};

const bridge = {
  platform: "darwin" as NodeJS.Platform,
  listAcpRegistry: vi.fn<() => Promise<AcpRegistryListResult>>(),
  getAgentStatuses: vi.fn<() => Promise<AgentStatusesResponse>>(),
  refreshAgentStatuses: vi.fn<() => Promise<AgentStatusesResponse>>(),
  installAcpRegistryAgent:
    vi.fn<(payload: { agentId: string }) => Promise<{ installed: InstalledAcpRegistryAgent[] }>>(),
  updateAcpRegistryAgent:
    vi.fn<(payload: { agentId: string }) => Promise<{ installed: InstalledAcpRegistryAgent[] }>>(),
  removeAcpRegistryAgent:
    vi.fn<(payload: { agentId: string }) => Promise<{ installed: InstalledAcpRegistryAgent[] }>>(),
  authenticateAcpAgent:
    vi.fn<
      (payload: {
        agentKind: string;
        methodId: string;
        envKind?: AgentStatus["envKind"];
        wslDistro?: string;
      }) => Promise<void>
    >(),
  focusWindow: vi.fn<() => Promise<void>>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  getLatestAgentVersion:
    vi.fn<(payload: { agentKind: string }) => Promise<{ source: string; version?: string }>>(),
};

const runAgentInstallCommandMock = vi.hoisted(() => vi.fn<(input: unknown) => void>());
const runAgentLoginCommandMock = vi.hoisted(() => vi.fn<(input: unknown) => void>());
const resetDiscoveredAgentsMock = vi.hoisted(() => vi.fn<() => void>());

vi.mock("@/renderer/state/agentStatusesStore", () => {
  const useAgentStatusesStore = (
    selector: (state: {
      agentStatuses: AgentStatus[];
      wslAgentStatuses: AgentStatus[];
      resetDiscoveredAgents: () => void;
    }) => unknown,
  ) =>
    selector({
      ...statusesState,
      resetDiscoveredAgents: resetDiscoveredAgentsMock,
    });
  useAgentStatusesStore.getState = () => ({ resetDiscoveredAgents: resetDiscoveredAgentsMock });
  return { useAgentStatusesStore };
});

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
}));

vi.mock("@/renderer/bridge", () => ({
  isWindows: () => bridge.platform === "win32",
  isMac: () => bridge.platform === "darwin",
  readBridge: () => bridge,
}));

vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentLoginCommand: runAgentLoginCommandMock,
  runAgentInstallCommand: runAgentInstallCommandMock,
}));

vi.mock("@/renderer/components/common", () => ({
  PixelLoader: () => <span data-testid="loader" />,
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: (props: { fallbackLabel?: string }) => <span>{props.fallbackLabel}</span>,
}));

import { AcpRegistrySettings } from "./AcpRegistrySettings";
import { NATIVE_AGENT_REGISTRY_ENTRIES } from "./agentRegistryNative";

const baseCapabilities = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal" as const,
  presentationMode: "terminal" as const,
  settingDefs: [],
};

function makeStatus(kind: AgentStatus["kind"], input: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind,
    label: kind,
    installed: true,
    authState: "authenticated",
    capabilities: baseCapabilities,
    ...input,
  };
}

function makeProject(input: { id: string; name: string; location: Project["location"] }): Project {
  return {
    id: input.id,
    name: input.name,
    disabled: false,
    createdAt: new Date(0).toISOString(),
    location: input.location,
  };
}

function withHostPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const previous = bridge.platform;
  bridge.platform = platform;
  try {
    return run();
  } finally {
    bridge.platform = previous;
  }
}

const registry: AcpRegistryListResult = {
  version: "1.0.0",
  agents: [
    {
      id: "codex-acp",
      name: "Codex ACP",
      version: "1.0.0",
      description: "Codex through ACP",
      distribution: { npx: { package: "codex-acp" } },
    },
    {
      id: "glm-acp-agent",
      name: "GLM Agent",
      version: "1.1.3",
      description: "GLM through ACP",
      distribution: { npx: { package: "glm-acp-agent" } },
    },
    {
      id: "cursor",
      name: "Cursor",
      version: "1.0.0",
      description: "Cursor through ACP",
      distribution: { npx: { package: "cursor-acp" } },
    },
    {
      id: "grok-build",
      name: "Grok Build",
      version: "0.2.11",
      description: "xAI's coding agent and CLI",
      distribution: {
        binary: { windows: { archive: "https://example.com/grok.zip", cmd: "grok" } },
      },
    },
  ],
};

const emptyStatusesResponse: AgentStatusesResponse = { windows: [], wsl: [], fromCache: false };

function installedRecord(input: {
  id: string;
  name: string;
  version: string;
  adapterKind: string;
}): InstalledAcpRegistryAgent {
  return {
    id: input.id,
    name: input.name,
    version: input.version,
    installedAt: new Date(0).toISOString(),
    adapterKind: input.adapterKind,
    installKind: "generic",
  };
}

describe("AcpRegistrySettings", () => {
  beforeEach(() => {
    bridge.platform = "darwin";
    statusesState.agentStatuses = [];
    statusesState.wslAgentStatuses = [];
    appState.projects = [];
    settingsState.acpRegistryInstalledAgents = {};
    bridge.listAcpRegistry.mockReset().mockResolvedValue(registry);
    bridge.getAgentStatuses.mockReset().mockResolvedValue(emptyStatusesResponse);
    bridge.refreshAgentStatuses.mockReset().mockResolvedValue(emptyStatusesResponse);
    bridge.installAcpRegistryAgent.mockReset().mockResolvedValue({ installed: [] });
    bridge.updateAcpRegistryAgent.mockReset().mockResolvedValue({ installed: [] });
    bridge.removeAcpRegistryAgent.mockReset().mockResolvedValue({ installed: [] });
    bridge.authenticateAcpAgent.mockReset().mockResolvedValue(undefined);
    bridge.focusWindow.mockReset().mockResolvedValue(undefined);
    bridge.openExternal.mockReset().mockResolvedValue(undefined);
    bridge.getLatestAgentVersion.mockReset().mockResolvedValue({ source: "unknown" });
    runAgentLoginCommandMock.mockReset();
    runAgentInstallCommandMock.mockReset();
    resetDiscoveredAgentsMock.mockReset();
    settingsState.syncAcpRegistryInstalledAgents.mockReset().mockImplementation((installed) => {
      settingsState.acpRegistryInstalledAgents = Object.fromEntries(
        installed.map((record) => [record.id, record]),
      );
    });
  });

  it("shows detected native providers without offering a native install", async () => {
    statusesState.agentStatuses = [
      makeStatus("codex", {
        label: "Codex",
        version: "0.130.0",
        envKind: "posix",
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const codexCard = (await screen.findByText(/First-class Codex CLI integration/u)).closest(
      ".rounded-lg",
    );
    expect(codexCard).toBeTruthy();
    expect(within(codexCard as HTMLElement).getByText("Detected")).toBeInTheDocument();
    expect(within(codexCard as HTMLElement).queryByRole("button", { name: "Install" })).toBeNull();
  });

  it("hides native-preferred ACP wrappers and tags app-supported ACP agents", async () => {
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    expect(screen.queryByText("Codex ACP")).not.toBeInTheDocument();
    expect(screen.queryByText("xAI's coding agent and CLI")).not.toBeInTheDocument();
    expect(screen.getAllByText("GLM Agent").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Show advanced ACP" })).toBeNull();

    const cursorCard = screen.getAllByText("Cursor")[0]?.closest(".rounded-lg");
    expect(cursorCard).toBeTruthy();
    expect(within(cursorCard as HTMLElement).getByText("Native support")).toBeInTheDocument();
  });

  it("opens native install commands in the terminal", async () => {
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const codexCard = screen.getByText(/First-class Codex CLI integration/u).closest(".rounded-lg");
    expect(codexCard).toBeTruthy();

    fireEvent.click(within(codexCard as HTMLElement).getByRole("button", { name: "Install" }));

    await waitFor(() => {
      expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "Codex",
        }),
      );
    });
  });

  it("offers Antigravity as a native install", async () => {
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const antigravityCard = screen
      .getByText(/First-class Antigravity CLI integration/u)
      .closest(".rounded-lg");
    expect(antigravityCard).toBeTruthy();

    fireEvent.click(
      within(antigravityCard as HTMLElement).getByRole("button", { name: "Install" }),
    );

    await waitFor(() => {
      expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "Antigravity",
        }),
      );
    });
    const installInput = runAgentInstallCommandMock.mock.calls[0]?.[0] as
      | { command: (project: Project) => string }
      | undefined;
    expect(
      installInput?.command(
        makeProject({
          id: "wsl-project",
          name: "WSL Project",
          location: {
            kind: "wsl",
            distro: "Ubuntu",
            linuxPath: "/home/demo/project",
            uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
          },
        }),
      ),
    ).toContain("https://antigravity.google/cli/install.sh");
  });

  it("offers Grok Build as a native Windows install", async () => {
    bridge.platform = "win32";
    const windowsProject = makeProject({
      id: "windows-project",
      name: "Windows Project",
      location: { kind: "windows", path: "C:\\repo" },
    });
    appState.projects = [windowsProject];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const grokCard = screen
      .getByText(/First-class Grok Build CLI integration/u)
      .closest(".rounded-lg");
    expect(grokCard).toBeTruthy();
    expect(within(grokCard as HTMLElement).queryByText(/Windows is not supported/u)).toBeNull();

    fireEvent.click(within(grokCard as HTMLElement).getByRole("button", { name: "Install" }));

    await waitFor(() => {
      expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "Grok Build",
        }),
      );
    });
    const installInput = runAgentInstallCommandMock.mock.calls[0]?.[0] as
      | { command: (project: Project) => string }
      | undefined;
    const command = installInput?.command(windowsProject);
    expect(command).toContain("irm https://x.ai/cli/install.ps1 | iex");
  });

  it("keeps brew install commands mac-only", () => {
    const wslProject = makeProject({
      id: "wsl-project",
      name: "WSL Project",
      location: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
      },
    });
    const macProject = makeProject({
      id: "mac-project",
      name: "Mac Project",
      location: { kind: "posix", path: "/Users/demo/project" },
    });
    const entries = new Map(NATIVE_AGENT_REGISTRY_ENTRIES.map((entry) => [entry.id, entry]));

    expect(entries.get("codex")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
    );
    expect(entries.get("codex")?.installCommand(wslProject)).not.toContain("brew install");
    expect(entries.get("codex")?.installCommand(wslProject)).toContain(
      "npm install -g @openai/codex",
    );
    expect(entries.get("claude")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://claude.ai/install.sh | bash",
    );
    expect(entries.get("claude")?.installCommand(wslProject)).not.toContain("brew install");
    expect(entries.get("opencode")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://opencode.ai/install | bash",
    );
    expect(entries.get("opencode")?.installCommand(wslProject)).not.toContain("brew install");
    expect(entries.get("opencode")?.installCommand(wslProject)).toContain(
      "npm install -g opencode-ai",
    );
    expect(entries.get("antigravity")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://antigravity.google/cli/install.sh | bash",
    );
    expect(entries.get("grok")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://x.ai/cli/install.sh | bash",
    );

    withHostPlatform("darwin", () => {
      expect(entries.get("codex")?.installCommand(macProject)).toContain(
        "brew install --cask codex",
      );
      expect(entries.get("claude")?.installCommand(macProject)).toContain(
        "brew install --cask claude-code",
      );
      expect(entries.get("opencode")?.installCommand(macProject)).toContain(
        "brew install anomalyco/tap/opencode",
      );
    });

    withHostPlatform("win32", () => {
      expect(
        entries.get("grok")?.installCommand(
          makeProject({
            id: "windows-project",
            name: "Windows Project",
            location: { kind: "windows", path: "C:\\repo" },
          }),
        ),
      ).toContain("irm https://x.ai/cli/install.ps1 | iex");
    });
  });

  it("keeps ACP registry install pending until agent refresh completes", async () => {
    let resolveRefresh: (() => void) | undefined;
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    await waitFor(() => expect(bridge.getAgentStatuses).toHaveBeenCalledTimes(1));
    bridge.refreshAgentStatuses.mockReturnValueOnce(
      new Promise<AgentStatusesResponse>((resolve) => {
        resolveRefresh = () => resolve(emptyStatusesResponse);
      }),
    );

    const glmCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(glmCard).toBeTruthy();
    fireEvent.click(within(glmCard as HTMLElement).getByRole("button", { name: "Install" }));

    await screen.findByRole("button", { name: "Installing" });
    expect(screen.getByRole("button", { name: "Installing" })).toBeInTheDocument();

    resolveRefresh?.();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Installing" })).toBeNull();
    });
  });

  it("keeps ACP registry installs visible after leaving and returning to the registry", async () => {
    const installed = [
      installedRecord({
        id: "glm-acp-agent",
        name: "GLM Agent",
        version: "1.1.3",
        adapterKind: "acp-generic:glm-acp-agent",
      }),
    ];
    bridge.installAcpRegistryAgent.mockResolvedValueOnce({ installed });
    const view = render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const glmCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(glmCard).toBeTruthy();

    fireEvent.click(within(glmCard as HTMLElement).getByRole("button", { name: "Install" }));

    await waitFor(() => {
      expect(settingsState.syncAcpRegistryInstalledAgents).toHaveBeenCalledWith(installed);
    });

    view.unmount();
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const remountedCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(remountedCard).toBeTruthy();
    expect(
      within(remountedCard as HTMLElement).getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("keeps registry-installed agents deletable after status rescan", async () => {
    settingsState.acpRegistryInstalledAgents = {
      "glm-acp-agent": installedRecord({
        id: "glm-acp-agent",
        name: "GLM Agent",
        version: "1.1.3",
        adapterKind: "acp-generic:glm-acp-agent",
      }),
    };
    statusesState.agentStatuses = [
      makeStatus("acp-generic:glm-acp-agent", {
        label: "GLM Agent",
        envKind: "windows",
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const glmCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(glmCard).toBeTruthy();

    fireEvent.click(within(glmCard as HTMLElement).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(bridge.removeAcpRegistryAgent).toHaveBeenCalledWith({ agentId: "glm-acp-agent" });
    });
  });

  it("uses project-backed WSL targets on Windows", async () => {
    bridge.platform = "win32";
    const wslProject = makeProject({
      id: "wsl-project",
      name: "WSL Project",
      location: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
      },
    });
    appState.projects = [wslProject];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const codexCard = screen.getByText(/First-class Codex CLI integration/u).closest(".rounded-lg");
    expect(codexCard).toBeTruthy();

    fireEvent.click(
      within(codexCard as HTMLElement).getByRole("button", {
        name: "Install in WSL: Ubuntu",
      }),
    );

    await waitFor(() => {
      expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "Codex",
          project: wslProject,
        }),
      );
    });
  });

  it("shows WSL detection separately from local detection", async () => {
    bridge.platform = "win32";
    appState.projects = [
      makeProject({
        id: "wsl-project",
        name: "WSL Project",
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/project",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
        },
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("codex", {
        label: "Codex WSL",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const codexCard = screen.getByText(/First-class Codex CLI integration/u).closest(".rounded-lg");
    expect(codexCard).toBeTruthy();
    expect(within(codexCard as HTMLElement).getByText("WSL (Ubuntu)")).toBeInTheDocument();
    expect(
      within(codexCard as HTMLElement).queryByRole("button", {
        name: "Install in WSL: Ubuntu",
      }),
    ).toBeNull();
  });

  it("shows WSL detection for app-supported ACP registry agents", async () => {
    statusesState.agentStatuses = [
      makeStatus("cursor", {
        label: "Cursor",
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("cursor", {
        label: "Cursor WSL",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const cursorCard = screen.getByText("Cursor through ACP").closest(".rounded-lg");
    expect(cursorCard).toBeTruthy();
    expect(within(cursorCard as HTMLElement).getByText("(Windows)")).toBeInTheDocument();
    expect(within(cursorCard as HTMLElement).getByText("(WSL (Ubuntu))")).toBeInTheDocument();
  });

  it("does not label generic ACP registry agent statuses as detected", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:glm-acp-agent", {
        label: "GLM Agent",
        envKind: "windows",
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const glmCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(glmCard).toBeTruthy();
    expect(within(glmCard as HTMLElement).queryByText("Detected")).toBeNull();
    expect(
      within(glmCard as HTMLElement).getByRole("button", { name: "Install" }),
    ).toBeInTheDocument();
  });

  it("opens missing-auth WSL login commands in the matching WSL project", async () => {
    bridge.platform = "win32";
    const wslProject = makeProject({
      id: "wsl-project",
      name: "WSL Project",
      location: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
      },
    });
    appState.projects = [wslProject];
    statusesState.wslAgentStatuses = [
      makeStatus("codex", {
        label: "Codex WSL",
        authState: "missing",
        loginCommand: "codex login",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const codexCard = screen.getByText(/First-class Codex CLI integration/u).closest(".rounded-lg");
    expect(codexCard).toBeTruthy();

    fireEvent.click(within(codexCard as HTMLElement).getByRole("button", { name: "Login" }));

    expect(runAgentLoginCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Codex WSL",
        command: "codex login",
        project: wslProject,
        onCommandComplete: expect.any(Function),
      }),
    );
  });

  it("runs ACP agent-owned auth from registry cards", async () => {
    settingsState.acpRegistryInstalledAgents = {
      "glm-acp-agent": {
        id: "glm-acp-agent",
        name: "GLM Agent",
        version: "1.1.3",
        installedAt: new Date(0).toISOString(),
        adapterKind: "acp-generic:glm-acp-agent",
        installKind: "generic",
      },
    };
    statusesState.agentStatuses = [
      makeStatus("acp-generic:glm-acp-agent", {
        label: "GLM Agent",
        authState: "missing",
        authMethods: [{ id: "sso", name: "SSO" }],
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const glmCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(glmCard).toBeTruthy();

    fireEvent.click(within(glmCard as HTMLElement).getByRole("button", { name: "Login" }));

    expect(bridge.authenticateAcpAgent).toHaveBeenCalledWith({
      agentKind: "acp-generic:glm-acp-agent",
      methodId: "sso",
    });
    await waitFor(() => expect(bridge.focusWindow).toHaveBeenCalled());
    await waitFor(() => expect(bridge.refreshAgentStatuses).toHaveBeenCalled());
  });

  it("shows an Update button when the registry advertises a newer ACP version", async () => {
    settingsState.acpRegistryInstalledAgents = {
      "glm-acp-agent": {
        id: "glm-acp-agent",
        name: "GLM Agent",
        version: "1.0.0",
        installedAt: new Date(0).toISOString(),
        adapterKind: "acp-generic:glm-acp-agent",
        installKind: "generic",
      },
    };
    statusesState.agentStatuses = [makeStatus("acp-generic:glm-acp-agent", { label: "GLM Agent" })];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const glmCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(glmCard).toBeTruthy();
    const updateButton = within(glmCard as HTMLElement).getByRole("button", {
      name: /Update to v1\.1\.3/u,
    });

    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(bridge.updateAcpRegistryAgent).toHaveBeenCalledWith({ agentId: "glm-acp-agent" });
    });
  });

  it("hides the Update button when the installed ACP version is current", async () => {
    settingsState.acpRegistryInstalledAgents = {
      "glm-acp-agent": {
        id: "glm-acp-agent",
        name: "GLM Agent",
        version: "1.1.3",
        installedAt: new Date(0).toISOString(),
        adapterKind: "acp-generic:glm-acp-agent",
        installKind: "generic",
      },
    };

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const glmCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(glmCard).toBeTruthy();
    expect(
      within(glmCard as HTMLElement).queryByRole("button", { name: /Update to v/u }),
    ).toBeNull();
  });

  it("runs ACP registry auth in the selected WSL environment", async () => {
    settingsState.acpRegistryInstalledAgents = {
      "glm-acp-agent": {
        id: "glm-acp-agent",
        name: "GLM Agent",
        version: "1.1.3",
        installedAt: new Date(0).toISOString(),
        adapterKind: "acp-generic:glm-acp-agent",
        installKind: "generic",
      },
    };
    statusesState.agentStatuses = [
      makeStatus("acp-generic:glm-acp-agent", {
        label: "GLM Agent",
        authState: "missing",
        authMethods: [{ id: "sso", name: "SSO" }],
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("acp-generic:glm-acp-agent", {
        label: "GLM Agent",
        authState: "missing",
        authMethods: [{ id: "sso", name: "SSO" }],
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const glmCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(glmCard).toBeTruthy();

    fireEvent.click(
      within(glmCard as HTMLElement).getByRole("button", { name: "Login WSL (Ubuntu)" }),
    );

    expect(bridge.authenticateAcpAgent).toHaveBeenCalledWith({
      agentKind: "acp-generic:glm-acp-agent",
      methodId: "sso",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });
  });
});
