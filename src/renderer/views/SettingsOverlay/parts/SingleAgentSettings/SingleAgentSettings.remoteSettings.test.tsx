import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig, AgentStatus, Project } from "@/shared/contracts";
import type { RemoteSettings, RemoteSettingsPatch } from "@/shared/remote";
import { defaultSharedSettings } from "@/shared/settings";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const statusesState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
};

const sharedSettingsState = {
  disabledAgents: [] as string[],
  hiddenModels: {} as Record<string, string[]>,
  agentSettings: {} as Record<string, Record<string, boolean | string>>,
  agentInstances: {} as Record<string, AgentInstanceConfig>,
  acpRegistryInstalledAgents: {} as Record<string, unknown>,
  syncAcpRegistryInstalledAgents: vi.fn<() => void>(),
  setAgentDisabled: vi.fn<(kind: string, disabled: boolean) => void>(),
  setHiddenModels: vi.fn<(kind: string, hidden: string[]) => void>(),
  setAgentSetting: vi.fn<(kind: string, key: string, value: boolean | string) => void>(),
  setAgentInstance: vi.fn<(instance: AgentInstanceConfig) => void>(),
};

const appState = {
  projects: [] as Project[],
};

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", async (importOriginal) => {
  const { ComboBox, ListBox, Tabs } = await importOriginal<typeof import("@heroui/react")>();
  function Button(props: {
    children?: ReactNode;
    "aria-label"?: string;
    isDisabled?: boolean;
    isPending?: boolean;
    onPress?: () => void;
    title?: string;
  }) {
    return (
      <button
        type="button"
        aria-label={props["aria-label"]}
        title={props.title}
        disabled={props.isDisabled}
        onClick={props.onPress}
      >
        {props.children}
      </button>
    );
  }
  function Wrapper(props: { children?: ReactNode }) {
    return <div>{props.children}</div>;
  }
  function Switch(props: {
    children?: ReactNode;
    "aria-label"?: string;
    isSelected?: boolean;
    isDisabled?: boolean;
    onChange?: (selected: boolean) => void;
  }) {
    return (
      <label>
        <input
          type="checkbox"
          role="switch"
          aria-checked={props.isSelected ?? false}
          aria-label={props["aria-label"]}
          checked={props.isSelected}
          disabled={props.isDisabled}
          onChange={(event) => props.onChange?.(event.target.checked)}
        />
        {props.children}
      </label>
    );
  }
  Switch.Control = (props: { children?: ReactNode }) => <span>{props.children}</span>;
  Switch.Thumb = () => <span />;

  function Checkbox(props: {
    children?: ReactNode;
    isSelected?: boolean;
    isDisabled?: boolean;
    onChange?: (selected: boolean) => void;
  }) {
    return (
      <label>
        <input
          type="checkbox"
          checked={props.isSelected}
          disabled={props.isDisabled}
          onChange={(event) => props.onChange?.(event.target.checked)}
        />
        {props.children}
      </label>
    );
  }
  Checkbox.Control = Wrapper;
  Checkbox.Indicator = () => null;
  Checkbox.Content = Wrapper;

  const Disclosure = Object.assign(Wrapper, {
    Heading: Wrapper,
    Trigger: (props: { children?: ReactNode }) => <button type="button">{props.children}</button>,
    Indicator: () => null,
    Content: Wrapper,
    Body: Wrapper,
  });
  const Popover = Object.assign(Wrapper, {
    Trigger: Wrapper,
    Content: Wrapper,
    Dialog: Wrapper,
  });
  const Tooltip = Object.assign(Wrapper, {
    Trigger: Wrapper,
    Content: Wrapper,
  });
  const Modal = Object.assign(Wrapper, {
    Backdrop: (props: { children?: ReactNode; isOpen?: boolean }) =>
      props.isOpen ? <div>{props.children}</div> : null,
    Container: Wrapper,
    Dialog: Wrapper,
    CloseTrigger: () => null,
    Header: Wrapper,
    Heading: Wrapper,
    Body: Wrapper,
    Footer: Wrapper,
  });
  const Card = Object.assign(Wrapper, {
    Header: Wrapper,
    Title: Wrapper,
    Content: Wrapper,
  });

  return {
    Button,
    Card,
    Checkbox,
    ComboBox,
    ListBox,
    Tabs,
    Disclosure,
    Input: (props: {
      "aria-label"?: string;
      value?: string;
      disabled?: boolean;
      onChange?: (event: { target: { value: string } }) => void;
    }) => (
      <input
        aria-label={props["aria-label"]}
        value={props.value}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    ),
    Label: (props: { children?: ReactNode }) => <span>{props.children}</span>,
    Modal,
    Popover,
    Switch,
    Tooltip,
    toast: toastMock,
    useMediaQuery: () => true,
  };
});

const localBridge = vi.hoisted(() => ({
  refreshAgentStatuses: vi.fn<() => Promise<unknown>>(),
  getLatestAgentVersion: vi.fn<() => Promise<Record<string, unknown>>>(async () => ({})),
  resolveAgentAccount: vi.fn<() => Promise<Record<string, unknown>>>(async () => ({})),
  getNativeMcpSetup: vi.fn<
    () => Promise<{
      supported: boolean;
      candidates: never[];
      installedNames: never[];
      modifiedNames: never[];
    }>
  >(async () => ({
    supported: false,
    candidates: [],
    installedNames: [],
    modifiedNames: [],
  })),
  applyNativeMcpSetup: vi.fn<() => Promise<unknown>>(),
  getAgentHookPluginStatuses: vi.fn<() => Promise<never[]>>(async () => []),
  installAgentHookPlugin: vi.fn<() => Promise<unknown>>(),
  uninstallAgentHookPlugin: vi.fn<() => Promise<unknown>>(),
  manageAgentPlugins: vi.fn<() => Promise<unknown>>(),
  manageAgentCredentials: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  isMac: () => false,
  isWindows: () => true,
  isRemoteSession: () => false,
  readBridge: () => localBridge,
}));

const runAgentLoginCommandMock = vi.hoisted(() =>
  vi.fn<(input: { label: string; command: string; project?: Project }) => boolean>(),
);
vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentInstallCommand: vi.fn<() => boolean>(() => true),
  runAgentLoginCommand: runAgentLoginCommandMock,
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof appState) => unknown) => selector(appState),
    { getState: () => appState },
  ),
}));

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: Object.assign(
    (selector: (state: typeof statusesState) => unknown) => selector(statusesState),
    { getState: () => statusesState },
  ),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  flushSharedSettings: vi.fn<() => Promise<void>>(async () => undefined),
  useSharedSettings: Object.assign(
    (selector: (state: typeof sharedSettingsState) => unknown) => selector(sharedSettingsState),
    { getState: () => sharedSettingsState },
  ),
}));

const remoteClientMock = vi.hoisted(() => ({
  endpoint: "https://conn-1.test",
  callRemoteProcedure: vi.fn<(procedure: string, payload: unknown) => Promise<unknown>>(),
  agentStatuses: vi.fn<() => Promise<unknown>>(),
  agentSlashCommands: vi.fn<(kind: string) => Promise<{ kind: string; commands: never[] }>>(),
  settings: vi.fn<() => Promise<RemoteSettings>>(),
  updateSettings: vi.fn<(patch: RemoteSettingsPatch) => Promise<RemoteSettings>>(),
  agentProfiles: vi.fn<() => Promise<Record<string, AgentInstanceConfig>>>(),
  commandAgentProfiles: vi.fn<
    (command: Record<string, unknown>) => Promise<{
      profiles: Record<string, AgentInstanceConfig>;
      instance?: AgentInstanceConfig;
    }>
  >(),
}));

vi.mock("@/renderer/state/remoteServersStore", async () => {
  const { create } = await import("zustand");
  const useRemoteServersStore = create(() => ({
    servers: [] as unknown[],
    runtime: {} as Record<string, unknown>,
    withClient: async (
      _desktopId: string,
      invoke: (client: typeof remoteClientMock) => Promise<unknown>,
    ) => invoke(remoteClientMock),
  }));
  return { useRemoteServersStore };
});

vi.mock("@/renderer/components/common", () => ({
  ConfirmDialog: () => null,
  Input: (props: {
    "aria-label"?: string;
    value?: string;
    disabled?: boolean;
    onChange?: (event: { target: { value: string } }) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      value={props.value}
      disabled={props.disabled}
      onChange={props.onChange}
    />
  ),
  PixelLoader: () => <span data-testid="pixel-loader" />,
  Select: () => <select aria-label="mock-select" />,
  ToggleSwitch: (props: {
    "aria-label": string;
    isDisabled?: boolean;
    isSelected?: boolean;
    onChange?: (selected: boolean) => void;
  }) => (
    <input
      type="checkbox"
      role="switch"
      aria-label={props["aria-label"]}
      aria-checked={props.isSelected}
      checked={props.isSelected}
      disabled={props.isDisabled}
      onChange={(event) => props.onChange?.(event.target.checked)}
    />
  ),
}));

import { useMachineSelectionStore } from "@/renderer/state/machineSelectionStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { __resetEventSocketRegistryForTest } from "@/renderer/state/remoteServers/eventSocketRegistry";
import { SingleAgentSettings } from "./SingleAgentSettings";

const baseCapabilities = {
  models: [
    { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
    { id: "openai/gpt-5", label: "GPT-5" },
  ],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "server" as const,
  presentationMode: "gui" as const,
  settingDefs: [],
};

function makeRemoteSettings(overrides: Partial<RemoteSettings> = {}): RemoteSettings {
  return {
    ...defaultSharedSettings,
    ...overrides,
  } as RemoteSettings;
}

function seedRemoteMachine(params: {
  status?: "online" | "offline";
  agentStatuses: AgentStatus[];
  remoteSettings?: RemoteSettings;
  remoteProfiles?: Record<string, AgentInstanceConfig>;
}) {
  let stored = params.remoteSettings ?? makeRemoteSettings();
  let storedProfiles: Record<string, AgentInstanceConfig> = { ...(params.remoteProfiles ?? {}) };
  remoteClientMock.settings.mockImplementation(async () => stored);
  remoteClientMock.updateSettings.mockImplementation(async (patch) => {
    stored = { ...stored, ...patch } as RemoteSettings;
    return stored;
  });
  remoteClientMock.agentProfiles.mockImplementation(async () => ({ ...storedProfiles }));
  remoteClientMock.commandAgentProfiles.mockImplementation(async (command) => {
    if (command.kind === "create") {
      const payload = command.payload as AgentInstanceConfig;
      storedProfiles = { ...storedProfiles, [payload.id]: payload };
      return { profiles: { ...storedProfiles }, instance: payload };
    }
    if (command.kind === "remove") {
      const { [command.instanceId as string]: _removed, ...rest } = storedProfiles;
      storedProfiles = rest;
      return { profiles: { ...storedProfiles } };
    }
    return { profiles: { ...storedProfiles } };
  });
  useRemoteServersStore.setState({
    servers: [
      {
        connectionId: "conn-1",
        desktopId: "conn-1",
        label: "MacBook",
        endpoint: "https://conn-1.test",
        accessToken: "token",
        platform: "darwin",
        scopes: ["session:read", "session:operate"],
      },
    ],
    runtime: {
      "conn-1": {
        status: params.status ?? "online",
        projects: [],
        threads: [],
        agentStatuses: {
          windows: params.agentStatuses,
          wsl: [],
          updatedAt: new Date(1).toISOString(),
        },
      },
    },
  });
  act(() => {
    useMachineSelectionStore.setState({ selectedMachineId: "remote:conn-1" });
  });
}

describe("SingleAgentSettings remote host support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetEventSocketRegistryForTest();
    statusesState.agentStatuses = [];
    statusesState.wslAgentStatuses = [];
    sharedSettingsState.disabledAgents = [];
    sharedSettingsState.hiddenModels = {};
    sharedSettingsState.agentSettings = {};
    sharedSettingsState.agentInstances = {};
    appState.projects = [];
    useMachineSelectionStore.setState({ selectedMachineId: "local" });
    remoteClientMock.callRemoteProcedure.mockImplementation(async (procedure) => {
      if (procedure === "getLatestAgentVersion") return {};
      if (procedure === "getNativeMcpSetup") {
        return {
          supported: true,
          revision: "rev-1",
          candidates: [
            {
              id: "mcp-1",
              name: "poracode",
              target: "stdio",
              eligible: true,
              conflict: false,
              installed: true,
            },
          ],
          installedNames: ["poracode"],
          modifiedNames: [],
        };
      }
      if (procedure === "getAgentHookPluginStatuses") {
        return [
          {
            agentKind: "opencode",
            env: { kind: "native" },
            supported: true,
            installed: false,
            bundledVersion: "1.0.0",
            canUninstall: true,
          },
        ];
      }
      if (procedure === "manageAgentPlugins") {
        return { packages: [] };
      }
      throw new Error(`Unexpected remote procedure: ${procedure}`);
    });
  });

  it("renders full OpenCode settings (AI providers, Plugins, host-scoped Visible models, CLI MCP, CLI hooks) on a remote machine without touching local bridge or settings", async () => {
    // Local settings intentionally disagree with remote settings to prove host isolation.
    sharedSettingsState.hiddenModels = { opencode: ["anthropic/claude-sonnet-4", "openai/gpt-5"] };
    sharedSettingsState.disabledAgents = ["opencode"];

    const remoteOpenCode: AgentStatus = {
      kind: "opencode",
      label: "OpenCode",
      installed: true,
      version: "2.4.1",
      envKind: "posix",
      authState: "authenticated",
      loginCommand: "opencode auth login",
      providerMetadata: {
        connectedProviders: [{ id: "anthropic", label: "Anthropic", detail: "work key" }],
      },
      capabilities: baseCapabilities,
    };

    seedRemoteMachine({
      agentStatuses: [remoteOpenCode],
      remoteSettings: makeRemoteSettings({
        disabledAgents: [],
        hiddenModels: { opencode: ["openai/gpt-5"] },
      }),
    });

    render(<SingleAgentSettings agentKind="opencode" />);

    // Provider panel sections (AI providers + Plugins) are now rendered on remote machines.
    expect(screen.getByText("AI providers")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Plugins")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage plugins" })).not.toBeDisabled();

    // Visible models reflects the REMOTE host's hiddenModels (1 / 2), not local (0 / 2).
    await waitFor(() => expect(screen.getByText("1 / 2")).toBeInTheDocument());

    // CLI MCP setup & CLI hooks route through remote procedures, never local readBridge().
    await waitFor(() =>
      expect(remoteClientMock.callRemoteProcedure).toHaveBeenCalledWith("getNativeMcpSetup", {
        agentKind: "opencode",
        env: { kind: "native" },
      }),
    );
    await waitFor(() =>
      expect(remoteClientMock.callRemoteProcedure).toHaveBeenCalledWith(
        "getAgentHookPluginStatuses",
        {
          agentKind: "opencode",
          envs: [{ kind: "native" }],
        },
      ),
    );
    expect(localBridge.getNativeMcpSetup).not.toHaveBeenCalled();
    expect(localBridge.getAgentHookPluginStatuses).not.toHaveBeenCalled();

    // Opening Manage plugins queries the remote host, never local bridge.
    fireEvent.click(screen.getByRole("button", { name: "Manage plugins" }));
    await waitFor(() =>
      expect(remoteClientMock.callRemoteProcedure).toHaveBeenCalledWith("manageAgentPlugins", {
        agentKind: "opencode",
        env: { kind: "native" },
        action: "list",
      }),
    );
    expect(localBridge.manageAgentPlugins).not.toHaveBeenCalled();

    // Enable/disable switch reflects remote disabledAgents (enabled) and writes remotely.
    const enableToggle = screen.getByRole("switch", { name: "Enabled" });
    expect(enableToggle).toBeChecked();
    fireEvent.click(enableToggle);
    await waitFor(() =>
      expect(remoteClientMock.updateSettings).toHaveBeenCalledWith({
        disabledAgents: ["opencode"],
      }),
    );
    expect(sharedSettingsState.setAgentDisabled).not.toHaveBeenCalled();
  });

  it("reads and writes AgentSettingRow and multi-profile settings via the remote paired host without leaking local profiles", async () => {
    sharedSettingsState.agentSettings = {
      claude: { skipPermissions: true },
    };
    sharedSettingsState.agentInstances = {
      "local-only": {
        id: "local-only",
        driver: "claude",
        displayName: "Local Only",
        config: { configDir: "~/.claude-local" },
      },
    };

    const remoteClaude: AgentStatus = {
      kind: "claude",
      label: "Claude Code",
      installed: true,
      version: "1.0.0",
      envKind: "posix",
      authState: "authenticated",
      capabilities: {
        ...baseCapabilities,
        settingDefs: [
          {
            key: "skipPermissions",
            label: "Skip permissions",
            description: "Bypass interactive permission prompts.",
            type: "toggle",
            env: { SKIP_PERMISSIONS: "1" },
            default: false,
          },
        ],
      },
    };

    seedRemoteMachine({
      agentStatuses: [remoteClaude],
      remoteSettings: makeRemoteSettings({
        agentSettings: { claude: { skipPermissions: false } },
      }),
      remoteProfiles: {
        "remote-work": {
          id: "remote-work",
          driver: "claude",
          displayName: "Remote Work",
          config: { configDir: "~/.claude-remote-work" },
        },
      },
    });

    render(<SingleAgentSettings agentKind="claude" />);

    const settingSwitch = await screen.findByRole("switch", { name: "Skip permissions" });
    await waitFor(() => expect(settingSwitch).not.toBeDisabled());
    expect(settingSwitch).not.toBeChecked();

    // Remote host profiles are shown; local-only profiles never leak into the remote view.
    expect(await screen.findByText("Remote Work")).toBeInTheDocument();
    expect(screen.queryByText("Local Only")).not.toBeInTheDocument();

    // Adding a profile sends a remote agent-profiles command rather than touching local storage.
    fireEvent.click(screen.getByRole("button", { name: /Add profile/i }));
    fireEvent.click(screen.getByRole("tab", { name: "Agent default" }));
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Remote Staging" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(remoteClientMock.commandAgentProfiles).toHaveBeenCalledWith({
        kind: "create",
        payload: expect.objectContaining({
          driver: "claude",
          id: "remote-staging",
          displayName: "Remote Staging",
        }),
      }),
    );

    fireEvent.click(settingSwitch);
    await waitFor(() =>
      expect(remoteClientMock.updateSettings).toHaveBeenCalledWith({
        agentSettings: { claude: { skipPermissions: true } },
      }),
    );
    expect(sharedSettingsState.setAgentSetting).not.toHaveBeenCalled();
  });

  it("disables remote OpenCode mutations and skips remote settings calls when the host is offline", () => {
    const remoteOpenCode: AgentStatus = {
      kind: "opencode",
      label: "OpenCode",
      installed: true,
      version: "2.4.1",
      envKind: "posix",
      authState: "authenticated",
      loginCommand: "opencode auth login",
      providerMetadata: {
        connectedProviders: [{ id: "anthropic", label: "Anthropic" }],
      },
      capabilities: baseCapabilities,
    };

    seedRemoteMachine({
      status: "offline",
      agentStatuses: [remoteOpenCode],
    });

    render(<SingleAgentSettings agentKind="opencode" />);

    expect(screen.getByRole("button", { name: "Manage plugins" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Add provider/ })).toBeDisabled();
    const calledProcedures = remoteClientMock.callRemoteProcedure.mock.calls.map(([name]) => name);
    expect(calledProcedures).not.toContain("getNativeMcpSetup");
    expect(calledProcedures).not.toContain("getAgentHookPluginStatuses");
    expect(calledProcedures).not.toContain("manageAgentPlugins");
    expect(calledProcedures).not.toContain("manageAgentCredentials");
    expect(localBridge.getNativeMcpSetup).not.toHaveBeenCalled();
    expect(localBridge.getAgentHookPluginStatuses).not.toHaveBeenCalled();
  });

  it("awaits remote disabledAgents persistence before rediscovering an enabled agent", async () => {
    const remoteOpenCode: AgentStatus = {
      kind: "opencode",
      label: "OpenCode",
      installed: true,
      version: "2.4.1",
      envKind: "posix",
      authState: "authenticated",
      capabilities: baseCapabilities,
    };

    const callOrder: string[] = [];
    let resolveUpdate!: (settings: RemoteSettings) => void;
    const stored = makeRemoteSettings({ disabledAgents: ["opencode"] });
    seedRemoteMachine({
      agentStatuses: [remoteOpenCode],
      remoteSettings: stored,
    });
    remoteClientMock.updateSettings.mockImplementation(
      () =>
        new Promise<RemoteSettings>((resolve) => {
          callOrder.push("updateSettings");
          resolveUpdate = resolve;
        }),
    );
    remoteClientMock.agentStatuses.mockResolvedValue({
      windows: [remoteOpenCode],
      wsl: [],
      updatedAt: new Date(2).toISOString(),
    });
    remoteClientMock.agentSlashCommands.mockResolvedValue({ kind: "opencode", commands: [] });
    remoteClientMock.callRemoteProcedure.mockImplementation(async (procedure) => {
      if (procedure === "refreshAgentStatuses") {
        callOrder.push("refreshAgentStatuses");
        return { windows: [remoteOpenCode], wsl: [], fromCache: false };
      }
      if (procedure === "getLatestAgentVersion") return {};
      if (procedure === "getNativeMcpSetup") {
        return { supported: false, candidates: [], installedNames: [], modifiedNames: [] };
      }
      if (procedure === "getAgentHookPluginStatuses") return [];
      throw new Error(`Unexpected remote procedure: ${procedure}`);
    });

    render(<SingleAgentSettings agentKind="opencode" />);

    const enableToggle = screen.getByRole("switch", { name: "Enabled" });
    await waitFor(() => expect(enableToggle).not.toBeDisabled());
    expect(enableToggle).not.toBeChecked();

    fireEvent.click(enableToggle);
    await waitFor(() => expect(callOrder).toEqual(["updateSettings"]));
    expect(callOrder).not.toContain("refreshAgentStatuses");

    resolveUpdate(makeRemoteSettings({ disabledAgents: [] }));
    await waitFor(() => expect(callOrder).toEqual(["updateSettings", "refreshAgentStatuses"]));
  });
});
