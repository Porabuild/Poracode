import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AcpRegistryListResult,
  AgentStatusesResponse,
  AgentStatus,
  InstalledAcpRegistryAgent,
  Project,
  AcpRegistryInstallTarget,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { resetAcpRegistryListingCache } from "@/renderer/components/providers/useCombinedProviderRuntimeUpdates";
import { getProviderManifests } from "@/renderer/components/providers/providerManifest";

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
  installAcpRegistryAgent: vi.fn<
    (payload: { agentId: string; target?: AcpRegistryInstallTarget }) => Promise<{
      installed: InstalledAcpRegistryAgent[];
    }>
  >(),
  updateAcpRegistryAgent: vi.fn<
    (payload: { agentId: string; target?: AcpRegistryInstallTarget }) => Promise<{
      installed: InstalledAcpRegistryAgent[];
    }>
  >(),
  updateAgentBinary: vi.fn<
    (payload: { agentKind: string; envKind: string; wslDistro?: string }) => Promise<{
      ok: boolean;
      output?: string;
    }>
  >(),
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

const runAgentInstallCommandMock = vi.hoisted(() => vi.fn<(input: unknown) => boolean>());
const runAgentLoginCommandMock = vi.hoisted(() => vi.fn<(input: unknown) => boolean>());
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

vi.mock("@/renderer/state/appStore", () => {
  const useAppStore = (selector: (state: typeof appState) => unknown) => selector(appState);
  useAppStore.getState = () => appState;
  return { useAppStore };
});

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
  registerProviderIcon: vi.fn<() => void>(),
}));

import { AcpRegistrySettings } from "./AcpRegistrySettings";
import "@/renderer/components/providers/antigravity";
import {
  APP_SUPPORTED_ACP_AGENT_IDS,
  KNOWN_NATIVE_FAMILY_ACP_AGENT_IDS,
  NATIVE_AGENT_REGISTRY_ENTRIES,
  REGISTRY_AGENT_FAMILY_KIND,
} from "./agentRegistryNative";

describe("native ACP registry aliases", () => {
  const aliases = NATIVE_AGENT_REGISTRY_ENTRIES.flatMap((entry) =>
    (entry.acpRegistryAliases ?? []).map((alias) => ({ ...alias, familyKind: entry.id })),
  );

  it("derives unique registry ids and their native family mappings", () => {
    const aliasIds = aliases.map((alias) => alias.id);

    expect(new Set(aliasIds).size).toBe(aliasIds.length);
    expect([...KNOWN_NATIVE_FAMILY_ACP_AGENT_IDS].toSorted()).toEqual(aliasIds.toSorted());
    expect(REGISTRY_AGENT_FAMILY_KIND).toEqual({
      "antigravity-acp": "antigravity",
      "claude-acp": "claude",
      "codex-acp": "codex",
      cursor: "cursor",
      "factory-droid": "factory",
      gemini: "gemini",
      "github-copilot": "copilot",
      "github-copilot-cli": "copilot",
      "grok-build": "grok",
      opencode: "opencode",
      "pi-acp": "pi",
      qoder: "qoder",
    });
  });

  it("derives the native-support subset from alias metadata", () => {
    const aliasesWithNativeSupport = aliases
      .filter((alias) => alias.nativeSupport === true)
      .map((alias) => alias.id)
      .toSorted();

    expect([...APP_SUPPORTED_ACP_AGENT_IDS].toSorted()).toEqual(aliasesWithNativeSupport);
    expect([...APP_SUPPORTED_ACP_AGENT_IDS].toSorted()).toEqual([
      "antigravity-acp",
      "cursor",
      "factory-droid",
      "gemini",
      "github-copilot",
      "github-copilot-cli",
      "qoder",
    ]);
    expect(
      [...APP_SUPPORTED_ACP_AGENT_IDS].every((id) => KNOWN_NATIVE_FAMILY_ACP_AGENT_IDS.has(id)),
    ).toBe(true);
  });

  it("keeps native agents in parity with renderer provider manifests", () => {
    expect(NATIVE_AGENT_REGISTRY_ENTRIES.map((entry) => entry.id).toSorted()).toEqual(
      getProviderManifests()
        .map((manifest) => manifest.kind)
        .toSorted(),
    );
  });
});

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

function makeCursorStatus(input: {
  acpInstalled: boolean;
  sdkInstalled: boolean;
  acpVersion?: string;
  sdkVersion?: string;
  sdkInstallationSource?: string;
}): AgentStatus {
  return makeStatus("cursor", {
    label: "Cursor",
    ...(input.acpVersion ? { version: input.acpVersion } : {}),
    envKind: "posix",
    runtimeVariants: {
      acp: {
        presentationMode: "gui",
        installed: input.acpInstalled,
        ...(input.acpVersion ? { version: input.acpVersion } : {}),
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: baseCapabilities,
      },
      sdk: {
        presentationMode: "gui",
        installed: input.sdkInstalled,
        ...(input.sdkVersion ? { version: input.sdkVersion } : {}),
        ...(input.sdkInstallationSource ? { installationSource: input.sdkInstallationSource } : {}),
        authState: "authenticated",
        authUsesProviderLogin: false,
        capabilities: baseCapabilities,
      },
    },
  });
}

function makeAntigravityStatus(input: {
  cliInstalled: boolean;
  acpInstalled: boolean;
  cliVersion?: string;
  acpVersion?: string;
}): AgentStatus {
  return makeStatus("antigravity", {
    label: "Antigravity",
    envKind: bridge.platform === "win32" ? "windows" : "posix",
    runtimeVariants: {
      cli: {
        presentationMode: "terminal",
        installed: input.cliInstalled,
        ...(input.cliVersion ? { version: input.cliVersion } : {}),
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: baseCapabilities,
      },
      acp: {
        presentationMode: "gui",
        installed: input.acpInstalled,
        ...(input.acpVersion ? { version: input.acpVersion } : {}),
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: { ...baseCapabilities, presentationMode: "gui", liveInputMode: "server" },
      },
    },
  });
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
      id: "gemini",
      name: "Gemini",
      version: "1.0.0",
      description: "Gemini through ACP",
      distribution: { npx: { package: "gemini-acp" } },
    },
    {
      id: "github-copilot",
      name: "GitHub Copilot",
      version: "1.0.0",
      description: "Copilot through ACP",
      distribution: { npx: { package: "copilot-acp" } },
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
    {
      id: "antigravity-acp",
      name: "Google Antigravity",
      version: "1.0.0",
      description: "Official Antigravity registry runtime",
      authors: ["Google LLC"],
      license: "proprietary",
      distribution: {
        binary: {
          "darwin-aarch64": {
            archive: "https://dl.google.com/antigravity/antigravity-acp.zip",
            cmd: "./agy_acp_server.par",
          },
        },
      },
    },
    {
      id: "factory-droid",
      name: "Factory Droid",
      version: "0.170.0",
      description: "Factory Droid through ACP",
      distribution: { npx: { package: "droid" } },
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
    resetAcpRegistryListingCache();
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
    bridge.updateAgentBinary.mockReset().mockResolvedValue({ ok: true });
    bridge.removeAcpRegistryAgent.mockReset().mockResolvedValue({ installed: [] });
    bridge.authenticateAcpAgent.mockReset().mockResolvedValue(undefined);
    bridge.focusWindow.mockReset().mockResolvedValue(undefined);
    bridge.openExternal.mockReset().mockResolvedValue(undefined);
    bridge.getLatestAgentVersion.mockReset().mockResolvedValue({ source: "unknown" });
    runAgentLoginCommandMock.mockReset().mockReturnValue(true);
    runAgentInstallCommandMock.mockReset().mockReturnValue(true);
    resetDiscoveredAgentsMock.mockReset();
    settingsState.syncAcpRegistryInstalledAgents.mockReset().mockImplementation((installed) => {
      settingsState.acpRegistryInstalledAgents = Object.fromEntries(
        installed.map((record) => [record.id, record]),
      );
    });
  });

  it("loads the registry through one shared listing on mount", async () => {
    // listAcpRegistry runs the supervisor's registry auto-update sweep; the
    // page mount and the combined-runtime probes must share one listing, not
    // race two sweeps into the same install dirs.
    statusesState.agentStatuses = [
      makeAntigravityStatus({ cliInstalled: true, acpInstalled: true }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    await vi.waitFor(() => expect(bridge.listAcpRegistry).toHaveBeenCalledTimes(1));
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

  it("hides native-preferred ACP wrappers", async () => {
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    expect(screen.queryByText("Codex ACP")).not.toBeInTheDocument();
    expect(screen.queryByText("Cursor through ACP")).not.toBeInTheDocument();
    expect(screen.queryByText("Gemini through ACP")).not.toBeInTheDocument();
    expect(screen.queryByText("Copilot through ACP")).not.toBeInTheDocument();
    expect(screen.queryByText("xAI's coding agent and CLI")).not.toBeInTheDocument();
    expect(screen.getAllByText("GLM Agent").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Show advanced ACP" })).toBeNull();
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

  it("offers Cursor ACP, SDK, or both as distinct installation choices", async () => {
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const cursorCard = screen.getByText(/First-class Cursor integration/u).closest(".rounded-lg");
    expect(cursorCard).toBeTruthy();

    fireEvent.click(within(cursorCard as HTMLElement).getByRole("button", { name: "Install" }));

    expect(
      await screen.findByRole("menuitem", { name: "Install Cursor Agent (ACP)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Install Cursor SDK" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Install ACP + SDK" })).toBeInTheDocument();
  });

  it("shows independent Cursor runtime versions and updates a managed SDK", async () => {
    statusesState.agentStatuses = [
      makeCursorStatus({
        acpInstalled: true,
        sdkInstalled: true,
        acpVersion: "2026.07.23",
        sdkVersion: "1.0.31",
        sdkInstallationSource: "global-npm",
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const cursorCard = screen.getByText(/First-class Cursor integration/u).closest(".rounded-lg");
    expect(cursorCard).toBeTruthy();
    expect(within(cursorCard as HTMLElement).getByText(/ACP v2026\.07\.23/u)).toBeInTheDocument();
    expect(
      within(cursorCard as HTMLElement).getByText(/SDK v1\.0\.31 \(global npm\)/u),
    ).toBeInTheDocument();

    fireEvent.click(within(cursorCard as HTMLElement).getByRole("button", { name: "Update SDK" }));

    expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Update Cursor SDK",
        command: expect.any(Function),
        onCommandComplete: expect.any(Function),
      }),
    );
    const updateInput = runAgentInstallCommandMock.mock.calls.at(-1)?.[0] as
      | { command: (project: Project) => string }
      | undefined;
    expect(
      updateInput?.command(
        makeProject({
          id: "project",
          name: "Project",
          location: { kind: "posix", path: "/repo" },
        }),
      ),
    ).toContain("npm install -g '@cursor/sdk@^1.0.24'");
  });

  it("shows externally managed SDK versions without a misleading update action", async () => {
    statusesState.agentStatuses = [
      makeCursorStatus({
        acpInstalled: true,
        sdkInstalled: true,
        acpVersion: "2026.07.23",
        sdkVersion: "1.0.31",
        sdkInstallationSource: "project",
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const cursorCard = screen.getByText(/First-class Cursor integration/u).closest(".rounded-lg");
    expect(cursorCard).toBeTruthy();
    expect(
      within(cursorCard as HTMLElement).getByText(/SDK v1\.0\.31 \(project managed\)/u),
    ).toBeInTheDocument();
    expect(
      within(cursorCard as HTMLElement).queryByRole("button", { name: "Update SDK" }),
    ).toBeNull();
  });

  it("fresh-installs both Antigravity prerequisites from the built-in card", async () => {
    bridge.refreshAgentStatuses
      .mockResolvedValueOnce({
        windows: [makeAntigravityStatus({ cliInstalled: true, acpInstalled: false })],
        wsl: [],
        fromCache: false,
      })
      .mockResolvedValueOnce({
        windows: [
          makeAntigravityStatus({ cliInstalled: true, acpInstalled: true, acpVersion: "1.0.0" }),
        ],
        wsl: [],
        fromCache: false,
      });
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const antigravityCard = screen
      .getByText(/First-class Antigravity integration/u)
      .closest(".rounded-lg");
    expect(antigravityCard).toBeTruthy();

    fireEvent.click(
      within(antigravityCard as HTMLElement).getByRole("button", { name: "Install Antigravity" }),
    );
    expect(screen.queryByRole("menuitem", { name: /Install Antigravity/u })).toBeNull();
    const installInput = runAgentInstallCommandMock.mock.calls.at(-1)?.[0] as
      | { command: (project: Project) => string; onCommandComplete: (code: number) => void }
      | undefined;
    expect(
      installInput?.command(
        makeProject({
          id: "posix-project",
          name: "Project",
          location: { kind: "posix", path: "/repo" },
        }),
      ),
    ).toContain("https://antigravity.google/cli/install.sh");
    await act(async () => installInput?.onCommandComplete(0));
    await waitFor(() => {
      expect(bridge.installAcpRegistryAgent).toHaveBeenCalledWith({
        agentId: "antigravity-acp",
        target: { kind: "native" },
      });
    });
  });

  it("does not install Chat when the Terminal prerequisite is still undetected", async () => {
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: "Install Antigravity" }),
    );
    const input = runAgentInstallCommandMock.mock.calls.at(-1)?.[0] as
      | { onCommandComplete: (code: number) => void }
      | undefined;
    await act(async () => input?.onCommandComplete(0));

    expect(await screen.findByText("Unable to refresh Antigravity status.")).toBeInTheDocument();
    expect(bridge.installAcpRegistryAgent).not.toHaveBeenCalled();
  });

  it("reconciles Chat from the unified card for a CLI-only Antigravity install", async () => {
    statusesState.agentStatuses = [
      makeAntigravityStatus({ cliInstalled: true, acpInstalled: false, cliVersion: "1.2.0" }),
    ];
    bridge.refreshAgentStatuses.mockResolvedValueOnce({
      windows: [
        makeAntigravityStatus({
          cliInstalled: true,
          acpInstalled: true,
          cliVersion: "1.2.0",
          acpVersion: "1.0.0",
        }),
      ],
      wsl: [],
      fromCache: false,
    });
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    expect(card).toBeTruthy();
    expect(within(card as HTMLElement).getByText("agy CLI").parentElement).toHaveTextContent(
      "agy CLIv1.2.0",
    );
    expect(
      within(card as HTMLElement).getByText("Antigravity ACP").parentElement,
    ).toHaveTextContent("Antigravity ACPNot installed → v1.0.0");
    expect(within(card as HTMLElement).queryByText("ACP not installed")).toBeNull();
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: "Install Antigravity" }),
    );

    await waitFor(() => {
      expect(bridge.installAcpRegistryAgent).toHaveBeenCalledWith({
        agentId: "antigravity-acp",
        target: { kind: "native" },
      });
    });
    expect(runAgentInstallCommandMock).not.toHaveBeenCalled();
  });

  it("reconciles Terminal from the unified card for an ACP-only Antigravity install", async () => {
    statusesState.agentStatuses = [
      makeAntigravityStatus({ cliInstalled: false, acpInstalled: true, acpVersion: "1.0.0" }),
    ];
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    expect(card).toBeTruthy();
    expect(within(card as HTMLElement).getByText("agy CLI").parentElement).toHaveTextContent(
      "agy CLINot installed",
    );
    expect(
      within(card as HTMLElement).getByText("Antigravity ACP").parentElement,
    ).toHaveTextContent("Antigravity ACPv1.0.0");
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: "Install Antigravity" }),
    );

    expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Antigravity", command: expect.any(Function) }),
    );
    expect(bridge.installAcpRegistryAgent).not.toHaveBeenCalled();
  });

  it("updates outdated Chat while reconciling Terminal through one Antigravity action", async () => {
    statusesState.agentStatuses = [
      makeAntigravityStatus({ cliInstalled: false, acpInstalled: true, acpVersion: "0.9.0" }),
    ];
    bridge.refreshAgentStatuses
      .mockResolvedValueOnce({
        windows: [
          makeAntigravityStatus({ cliInstalled: true, acpInstalled: true, acpVersion: "0.9.0" }),
        ],
        wsl: [],
        fromCache: false,
      })
      .mockResolvedValueOnce({
        windows: [
          makeAntigravityStatus({ cliInstalled: true, acpInstalled: true, acpVersion: "0.9.0" }),
        ],
        wsl: [],
        fromCache: false,
      })
      .mockResolvedValueOnce({
        windows: [
          makeAntigravityStatus({ cliInstalled: true, acpInstalled: true, acpVersion: "1.0.0" }),
        ],
        wsl: [],
        fromCache: false,
      });
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    expect(card).toBeTruthy();
    expect(within(card as HTMLElement).queryByRole("button", { name: "Update" })).toBeNull();
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: "Install Antigravity" }),
    );
    const input = runAgentInstallCommandMock.mock.calls.at(-1)?.[0] as
      | { onCommandComplete: (code: number) => void }
      | undefined;
    await act(async () => input?.onCommandComplete(0));

    await waitFor(() => {
      expect(bridge.updateAcpRegistryAgent).toHaveBeenCalledWith({
        agentId: "antigravity-acp",
        target: { kind: "native" },
      });
    });
    expect(bridge.installAcpRegistryAgent).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(within(card as HTMLElement).queryByText("Installing")).toBeNull();
    });
    expect(screen.queryByText("Unable to refresh Antigravity status.")).toBeNull();
  });

  it("offers and completes an Antigravity Chat update from the live registry version", async () => {
    statusesState.agentStatuses = [
      makeAntigravityStatus({
        cliInstalled: true,
        acpInstalled: true,
        cliVersion: "1.2.0",
        acpVersion: "1.0.0-beta",
      }),
    ];
    bridge.refreshAgentStatuses.mockResolvedValueOnce({
      windows: [
        makeAntigravityStatus({
          cliInstalled: true,
          acpInstalled: true,
          cliVersion: "1.2.0",
          acpVersion: "1.0.0",
        }),
      ],
      wsl: [],
      fromCache: false,
    });
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    fireEvent.click(await within(card as HTMLElement).findByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(bridge.updateAcpRegistryAgent).toHaveBeenCalledWith({
        agentId: "antigravity-acp",
        target: { kind: "native" },
      });
    });
  });

  it("accepts newer CLI and Chat versions published while the combined update runs", async () => {
    statusesState.agentStatuses = [
      makeAntigravityStatus({
        cliInstalled: true,
        acpInstalled: true,
        cliVersion: "1.2.0",
        acpVersion: "0.9.0",
      }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.3.0" });
    bridge.updateAcpRegistryAgent.mockResolvedValueOnce({
      installed: [
        {
          ...installedRecord({
            id: "antigravity-acp",
            name: "Google Antigravity",
            version: "1.1.0",
            adapterKind: "antigravity",
          }),
          installKind: "first-class",
          installations: {
            native: {
              version: "1.1.0",
              target: "darwin-aarch64",
              installedAt: new Date(0).toISOString(),
            },
          },
        },
      ],
    });
    bridge.refreshAgentStatuses.mockResolvedValueOnce({
      windows: [
        makeAntigravityStatus({
          cliInstalled: true,
          acpInstalled: true,
          cliVersion: "1.4.0",
          acpVersion: "1.1.0",
        }),
      ],
      wsl: [],
      fromCache: false,
    });
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    await within(card as HTMLElement).findByText("agy CLI");
    const runtimeRows = within(card as HTMLElement).getAllByRole("listitem");
    expect(runtimeRows[0]).toHaveTextContent("agy CLIv1.2.0 → v1.3.0");
    expect(runtimeRows[1]).toHaveTextContent("Antigravity ACPv0.9.0 → v1.0.0");

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(bridge.updateAgentBinary).toHaveBeenCalledWith({
        agentKind: "antigravity",
        envKind: "posix",
      });
      expect(bridge.updateAcpRegistryAgent).toHaveBeenCalledWith({
        agentId: "antigravity-acp",
        target: { kind: "native" },
      });
    });
    await waitFor(() => {
      expect(within(card as HTMLElement).queryByRole("button", { name: "Update" })).toBeNull();
    });
    expect(screen.queryByText("Unable to refresh Antigravity status.")).toBeNull();
  });

  it("re-probes combined versions when the registry is refreshed without remounting", async () => {
    statusesState.agentStatuses = [
      makeAntigravityStatus({
        cliInstalled: true,
        acpInstalled: true,
        cliVersion: "1.2.0",
        acpVersion: "1.0.0",
      }),
    ];
    bridge.getLatestAgentVersion.mockResolvedValue({ source: "npm", version: "1.2.0" });
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    await within(card as HTMLElement).findByText("Antigravity ACP");
    expect(within(card as HTMLElement).queryByRole("button", { name: "Update" })).toBeNull();

    bridge.listAcpRegistry.mockResolvedValue({
      ...registry,
      agents: registry.agents.map((agent) =>
        agent.id === "antigravity-acp" ? { ...agent, version: "1.1.0" } : agent,
      ),
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh registry" }));

    const refreshedCard = await waitFor(() => {
      const nextCard = screen
        .getByText(/First-class Antigravity integration/u)
        .closest(".rounded-lg");
      expect(
        within(nextCard as HTMLElement).getByRole("button", { name: "Update" }),
      ).toBeInTheDocument();
      return nextCard;
    });
    const acpRow = within(refreshedCard as HTMLElement).getByText("Antigravity ACP").parentElement;
    expect(acpRow).toHaveTextContent("Antigravity ACPv1.0.0 → v1.1.0");
  });

  it("reports an Antigravity Chat detection failure after updating", async () => {
    statusesState.agentStatuses = [
      makeAntigravityStatus({
        cliInstalled: true,
        acpInstalled: true,
        cliVersion: "1.2.0",
        acpVersion: "0.9.0",
      }),
    ];
    bridge.refreshAgentStatuses.mockRejectedValueOnce(new Error("Chat detection failed"));
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    fireEvent.click(await within(card as HTMLElement).findByRole("button", { name: "Update" }));

    expect(await screen.findByText("Chat detection failed")).toBeInTheDocument();
  });

  it("does not report a successful Chat update when refreshed detection is missing", async () => {
    statusesState.agentStatuses = [
      makeAntigravityStatus({
        cliInstalled: true,
        acpInstalled: true,
        cliVersion: "1.2.0",
        acpVersion: "0.9.0",
      }),
    ];
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    fireEvent.click(await within(card as HTMLElement).findByRole("button", { name: "Update" }));

    expect(await screen.findByText("Unable to refresh Antigravity status.")).toBeInTheDocument();
  });

  it("keeps a pre-adoption generic install of a native-support alias listed", async () => {
    settingsState.acpRegistryInstalledAgents = {
      gemini: installedRecord({
        id: "gemini",
        name: "Gemini",
        version: "1.0.0",
        adapterKind: "acp-generic:gemini",
      }),
    };

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    // Hiding it would strip the only surface that can update or remove it.
    expect(screen.getByText("Gemini through ACP")).toBeInTheDocument();
  });

  it("never renders antigravity-acp as a duplicate registry provider after adoption", async () => {
    settingsState.acpRegistryInstalledAgents = {
      "antigravity-acp": {
        ...installedRecord({
          id: "antigravity-acp",
          name: "Google Antigravity",
          version: "1.0.0",
          adapterKind: "antigravity",
        }),
        installKind: "first-class",
      },
    };
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    expect(screen.queryByText("Official Antigravity registry runtime")).not.toBeInTheDocument();
    expect(screen.getByText(/First-class Antigravity integration/u)).toBeInTheDocument();
  });

  it("routes combined Antigravity installation into the selected WSL distro", async () => {
    bridge.platform = "win32";
    const project = makeProject({
      id: "wsl-project",
      name: "WSL Project",
      location: {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
      },
    });
    appState.projects = [project];
    bridge.refreshAgentStatuses.mockResolvedValueOnce({
      windows: [],
      wsl: [
        {
          ...makeAntigravityStatus({ cliInstalled: true, acpInstalled: false }),
          envKind: "wsl",
          envDistro: "Ubuntu",
        },
      ],
      fromCache: false,
    });
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: "Install Antigravity" }),
    );
    const input = runAgentInstallCommandMock.mock.calls.at(-1)?.[0] as
      | { project?: Project; onCommandComplete: (code: number) => void }
      | undefined;
    expect(input?.project).toBe(project);
    await act(async () => input?.onCommandComplete(0));

    await waitFor(() => {
      expect(bridge.installAcpRegistryAgent).toHaveBeenCalledWith({
        agentId: "antigravity-acp",
        target: { kind: "wsl", distro: "Ubuntu" },
      });
    });
  });

  it("re-detects a successful CLI partial install when the ACP download fails", async () => {
    bridge.installAcpRegistryAgent.mockRejectedValueOnce(new Error("ACP download failed"));
    bridge.refreshAgentStatuses.mockResolvedValueOnce({
      windows: [makeAntigravityStatus({ cliInstalled: true, acpInstalled: false })],
      wsl: [],
      fromCache: false,
    });
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const card = screen.getByText(/First-class Antigravity integration/u).closest(".rounded-lg");
    fireEvent.click(
      within(card as HTMLElement).getByRole("button", { name: "Install Antigravity" }),
    );
    const input = runAgentInstallCommandMock.mock.calls.at(-1)?.[0] as
      | { onCommandComplete: (code: number) => void }
      | undefined;
    await act(async () => input?.onCommandComplete(0));

    expect(await screen.findByText("ACP download failed")).toBeInTheDocument();
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledWith([], {
      agentKinds: ["antigravity"],
    });
  });

  it("offers app-supported providers as native installs", async () => {
    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });

    const cases = [
      { pattern: /First-class Cursor integration/u, label: "Cursor" },
      { pattern: /First-class Factory Droid integration/u, label: "Factory Droid" },
      { pattern: /First-class Gemini CLI integration/u, label: "Gemini" },
      { pattern: /First-class GitHub Copilot CLI integration/u, label: "GitHub Copilot" },
    ];

    for (const expected of cases) {
      const card = screen.getByText(expected.pattern).closest(".rounded-lg");
      expect(card).toBeTruthy();

      fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Install" }));
      if (expected.label === "Cursor") {
        fireEvent.click(
          await screen.findByRole("menuitem", { name: "Install Cursor Agent (ACP)" }),
        );
      }

      await waitFor(() => {
        expect(runAgentInstallCommandMock).toHaveBeenLastCalledWith(
          expect.objectContaining({
            label: expected.label,
          }),
        );
      });
    }
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
    const grokCard = (await screen.findByText(/First-class Grok Build CLI integration/u)).closest(
      ".rounded-lg",
    );
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

  it("runs Muse's native Windows install through the default WSL distro", async () => {
    bridge.platform = "win32";
    const windowsProject = makeProject({
      id: "windows-project",
      name: "Windows Project",
      location: { kind: "windows", path: "C:\\repo" },
    });
    appState.projects = [windowsProject];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const museCard = screen.getByText(/First-class Muse Code integration/u).closest(".rounded-lg");
    expect(museCard).toBeTruthy();
    fireEvent.click(within(museCard as HTMLElement).getByRole("button", { name: "Install" }));

    expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Muse Code",
      }),
    );
    const installInput = runAgentInstallCommandMock.mock.calls[0]?.[0] as
      | { command: (project: Project) => string }
      | undefined;
    expect(installInput?.command(windowsProject)).toContain("wsl.exe --exec bash -lc");
    expect(installInput?.command(windowsProject)).toContain("https://dev.meta.ai/install.sh");
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
      "curl -fsSL https://antigravity.google/cli/install.sh -o",
    );
    expect(entries.get("grok")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://x.ai/cli/install.sh | bash",
    );
    expect(entries.get("muse")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://dev.meta.ai/install.sh | bash",
    );
    expect(entries.get("factory")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://app.factory.ai/cli | sh",
    );
    expect(entries.get("cursor")?.installCommand(wslProject)).toContain(
      "curl https://cursor.com/install -fsS | bash",
    );
    expect(entries.get("gemini")?.installCommand(wslProject)).toContain(
      "npm install -g @google/gemini-cli",
    );
    expect(entries.get("commandcode")?.installCommand(wslProject)).toContain(
      'prefix="$(npm config get prefix)"',
    );
    expect(entries.get("commandcode")?.installCommand(wslProject)).toContain(
      'ln -sf "$prefix/bin/command-code" "$HOME/.local/bin/command-code"',
    );
    expect(entries.get("qwen")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash",
    );
    expect(entries.get("qwen")?.installCommand(wslProject)).not.toContain("brew install");
    expect(entries.get("copilot")?.installCommand(wslProject)).toContain(
      "curl -fsSL https://gh.io/copilot-install | bash",
    );
    expect(entries.get("copilot")?.installCommand(wslProject)).not.toContain("brew install");

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
      expect(entries.get("gemini")?.installCommand(macProject)).not.toContain("brew install");
      expect(entries.get("qwen")?.installCommand(macProject)).toContain("brew install qwen-code");
      expect(entries.get("copilot")?.installCommand(macProject)).toContain(
        "brew install --cask copilot-cli",
      );
    });

    withHostPlatform("win32", () => {
      const windowsProject = makeProject({
        id: "windows-project",
        name: "Windows Project",
        location: { kind: "windows", path: "C:\\repo" },
      });

      expect(entries.get("grok")?.installCommand(windowsProject)).toContain(
        "irm https://x.ai/cli/install.ps1 | iex",
      );
      expect(entries.get("factory")?.installCommand(windowsProject)).toContain(
        "irm https://app.factory.ai/cli/windows | iex",
      );
      expect(entries.get("cursor")?.installCommand(windowsProject)).toContain(
        "https://cursor.com/install?win32=true",
      );
      expect(entries.get("gemini")?.installCommand(windowsProject)).toContain(
        "npm install -g @google/gemini-cli",
      );
      expect(entries.get("qwen")?.installCommand(windowsProject)).toContain(
        "irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex",
      );
      expect(entries.get("copilot")?.installCommand(windowsProject)).toContain(
        "winget install GitHub.Copilot",
      );
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

  it("shows WSL detection for app-supported native providers", async () => {
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
    const cursorCard = screen.getByText(/First-class Cursor integration/u).closest(".rounded-lg");
    expect(cursorCard).toBeTruthy();
    expect(within(cursorCard as HTMLElement).getByText("(local)")).toBeInTheDocument();
    expect(within(cursorCard as HTMLElement).getByText("WSL (Ubuntu)")).toBeInTheDocument();
    expect(screen.queryByText("Cursor through ACP")).not.toBeInTheDocument();
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

  it("preserves a native provider's terminal-login preference", async () => {
    statusesState.agentStatuses = [
      makeStatus("grok", {
        label: "Grok",
        authState: "missing",
        authMethods: [{ id: "agent-auth", name: "Agent auth", type: "agent" }],
        loginCommand: "grok login --device-auth",
        preferTerminalLogin: true,
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const grokCard = screen
      .getByText(/First-class Grok Build CLI integration/u)
      .closest(".rounded-lg");
    expect(grokCard).toBeTruthy();

    fireEvent.click(within(grokCard as HTMLElement).getByRole("button", { name: "Login" }));

    expect(runAgentLoginCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Grok",
        command: "grok login --device-auth",
      }),
    );
    expect(bridge.authenticateAcpAgent).not.toHaveBeenCalled();
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

  it("does not infer login is required from auth methods after ACP session setup", async () => {
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
        authState: "unknown",
        acpSessionEstablished: true,
        authMethods: [{ id: "sso", name: "SSO" }],
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const glmCard = screen.getByText("GLM through ACP").closest(".rounded-lg");
    expect(glmCard).toBeTruthy();
    expect(within(glmCard as HTMLElement).queryByRole("button", { name: "Login" })).toBeNull();
  });

  it("runs Factory agent-owned auth from its native card", async () => {
    statusesState.agentStatuses = [
      makeStatus("factory", {
        label: "Factory Droid",
        authState: "missing",
        authMethods: [{ id: "device-pairing", name: "Sign in with browser", type: "agent" }],
      }),
    ];

    render(<AcpRegistrySettings />);

    await screen.findByRole("heading", { name: "Agent Registry" });
    const factoryCard = screen
      .getByText(/First-class Factory Droid integration/u)
      .closest(".rounded-lg");
    expect(factoryCard).toBeTruthy();

    fireEvent.click(within(factoryCard as HTMLElement).getByRole("button", { name: "Login" }));

    expect(bridge.authenticateAcpAgent).toHaveBeenCalledWith({
      agentKind: "factory",
      methodId: "device-pairing",
    });
    await waitFor(() => expect(bridge.focusWindow).toHaveBeenCalled());
    await waitFor(() =>
      expect(bridge.refreshAgentStatuses).toHaveBeenCalledWith([], {
        agentKinds: ["factory"],
        envs: [{ kind: "native" }],
      }),
    );
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

    await act(async () => {
      fireEvent.click(
        within(glmCard as HTMLElement).getByRole("button", { name: "Login WSL (Ubuntu)" }),
      );
    });

    expect(bridge.authenticateAcpAgent).toHaveBeenCalledWith({
      agentKind: "acp-generic:glm-acp-agent",
      methodId: "sso",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });
  });
});
