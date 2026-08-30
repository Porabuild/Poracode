import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AcpRegistryListResult,
  AgentInstanceConfig,
  AgentStatusesResponse,
  AgentStatus,
  InstalledAcpRegistryAgent,
  Project,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const statusesState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
};

const sharedSettingsState = {
  disabledAgents: [] as string[],
  hiddenModels: {} as Record<string, string[]>,
  agentSettings: {} as Record<string, Record<string, unknown>>,
  agentInstances: {} as Record<string, AgentInstanceConfig>,
  acpRegistryInstalledAgents: {} as Record<string, unknown>,
  syncAcpRegistryInstalledAgents: vi.fn<(installed: InstalledAcpRegistryAgent[]) => void>(),
  setAgentDisabled: vi.fn<(kind: string, disabled: boolean) => void>(),
  setHiddenModels: vi.fn<(kind: string, hidden: string[]) => void>(),
  setAgentSetting: vi.fn<(kind: string, key: string, value: unknown) => void>(),
  setAgentInstance: vi.fn<(instance: AgentInstanceConfig) => void>(),
};

const appState = {
  projects: [] as Project[],
};

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => {
  function Button(props: {
    children?: ReactNode;
    "aria-label"?: string;
    "data-acp-auth-save"?: string;
    isDisabled?: boolean;
    isIconOnly?: boolean;
    isPending?: boolean;
    onPress?: () => void;
    title?: string;
  }) {
    return (
      <button
        type="button"
        aria-label={props["aria-label"]}
        title={props.title}
        data-acp-auth-save={props["data-acp-auth-save"]}
        disabled={props.isDisabled}
        onClick={props.onPress}
      >
        {props.isPending ? "Saving" : props.children}
      </button>
    );
  }

  function Switch(props: {
    children?: ReactNode;
    isSelected?: boolean;
    onChange?: (selected: boolean) => void;
  }) {
    return (
      <label>
        <input
          type="checkbox"
          checked={props.isSelected}
          onChange={(event) => props.onChange?.(event.target.checked)}
        />
        {props.children}
      </label>
    );
  }
  Switch.Control = (props: { children?: ReactNode }) => <span>{props.children}</span>;
  Switch.Thumb = () => <span />;

  function RadioGroup(props: { children?: ReactNode; "aria-label"?: string }) {
    return (
      <div role="radiogroup" aria-label={props["aria-label"]}>
        {props.children}
      </div>
    );
  }

  function Radio(props: { children?: ReactNode; value: string }) {
    return (
      <label>
        <input type="radio" value={props.value} />
        {props.children}
      </label>
    );
  }
  Radio.Content = (props: { children?: ReactNode }) => <span>{props.children}</span>;

  function Wrapper(props: { children?: ReactNode }) {
    return <div>{props.children}</div>;
  }

  function Input(props: {
    "aria-label"?: string;
    placeholder?: string;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }) {
    return (
      <input
        aria-label={props["aria-label"]}
        placeholder={props.placeholder}
        value={props.value}
        onChange={props.onChange}
      />
    );
  }

  function ListBox(props: { children?: ReactNode }) {
    return <div>{props.children}</div>;
  }
  ListBox.Item = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  ListBox.ItemIndicator = () => <span />;

  const Popover = Wrapper as typeof Wrapper & {
    Trigger: typeof Wrapper;
    Content: typeof Wrapper;
    Dialog: typeof Wrapper;
  };
  Popover.Trigger = Wrapper;
  Popover.Content = Wrapper;
  Popover.Dialog = Wrapper;

  const Tooltip = Wrapper as typeof Wrapper & {
    Trigger: typeof Wrapper;
    Content: typeof Wrapper;
  };
  Tooltip.Trigger = Wrapper;
  Tooltip.Content = Wrapper;

  const Disclosure = Object.assign(Wrapper, {
    Heading: Wrapper,
    Trigger: Wrapper,
    Indicator: () => null,
    Content: Wrapper,
    Body: Wrapper,
  });
  const Card = Object.assign(Wrapper, {
    Header: Wrapper,
    Title: Wrapper,
    Content: Wrapper,
  });

  return {
    Button,
    Card,
    Disclosure,
    Input,
    Label: (props: { children?: ReactNode }) => <span>{props.children}</span>,
    ListBox,
    ListLayout: () => null,
    Popover,
    Radio,
    RadioGroup,
    Switch,
    Tooltip,
    toast: toastMock,
    Virtualizer: Wrapper,
  };
});

const refreshAgentStatusesMock = vi.hoisted(() =>
  vi.fn<() => Promise<AgentStatusesResponse | void>>(),
);
const setAcpRegistryAgentAuthMock = vi.hoisted(() =>
  vi.fn<(payload: { agentId: string; environment: Record<string, string> }) => Promise<unknown>>(),
);
const authenticateAcpAgentMock = vi.hoisted(() =>
  vi.fn<
    (payload: {
      agentKind: string;
      methodId: string;
      envKind?: AgentStatus["envKind"];
      wslDistro?: string;
    }) => Promise<void>
  >(),
);
const logoutAcpAgentMock = vi.hoisted(() =>
  vi.fn<
    (payload: {
      agentKind: string;
      envKind?: AgentStatus["envKind"];
      wslDistro?: string;
    }) => Promise<void>
  >(),
);
const focusWindowMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

const listAcpRegistryMock = vi.hoisted(() => vi.fn<() => Promise<AcpRegistryListResult>>());

const getLatestAgentVersionMock = vi.hoisted(() =>
  vi
    .fn<(payload: { agentKind: string }) => Promise<{ version?: string; source?: string }>>()
    .mockResolvedValue({}),
);

const resolveAgentAccountMock = vi.hoisted(() =>
  vi
    .fn<
      (payload: { wslDistros?: string[] }) => Promise<{
        account?: { authenticatedAs?: string; organization?: string; plan?: string };
      }>
    >()
    .mockResolvedValue({}),
);

const updateAgentBinaryMock = vi.hoisted(() =>
  vi
    .fn<
      (payload: { agentKind: string; envKind: string; wslDistro?: string }) => Promise<{
        ok: boolean;
        output?: string;
        strategy?: string;
      }>
    >()
    .mockResolvedValue({ ok: true }),
);
const updateAcpRegistryAgentMock = vi.hoisted(() =>
  vi.fn<() => Promise<{ installed: InstalledAcpRegistryAgent[] }>>(),
);
const getAgentHookPluginStatusesMock = vi.hoisted(() =>
  vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
);
const installAgentHookPluginMock = vi.hoisted(() =>
  vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
);
const uninstallAgentHookPluginMock = vi.hoisted(() =>
  vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    refreshAgentStatuses: refreshAgentStatusesMock,
    setAcpRegistryAgentAuth: setAcpRegistryAgentAuthMock,
    authenticateAcpAgent: authenticateAcpAgentMock,
    logoutAcpAgent: logoutAcpAgentMock,
    focusWindow: focusWindowMock,
    listAcpRegistry: listAcpRegistryMock,
    getLatestAgentVersion: getLatestAgentVersionMock,
    resolveAgentAccount: resolveAgentAccountMock,
    updateAgentBinary: updateAgentBinaryMock,
    updateAcpRegistryAgent: updateAcpRegistryAgentMock,
    getAgentHookPluginStatuses: getAgentHookPluginStatusesMock,
    installAgentHookPlugin: installAgentHookPluginMock,
    uninstallAgentHookPlugin: uninstallAgentHookPluginMock,
  }),
}));

const runAgentLoginCommandMock = vi.hoisted(() =>
  vi.fn<
    (input: {
      label: string;
      command: string;
      env?: Record<string, string>;
      onCommandComplete?: (exitCode: number) => void;
      project?: Project;
    }) => boolean
  >(),
);
const runAgentInstallCommandMock = vi.hoisted(() =>
  vi.fn<
    (input: {
      label: string;
      command: (project: Project) => string;
      onCommandComplete?: (exitCode: number) => void;
      project?: Project;
    }) => boolean
  >(),
);

vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentInstallCommand: runAgentInstallCommandMock,
  runAgentLoginCommand: runAgentLoginCommandMock,
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: Object.assign(
    (
      selector: (state: {
        agentStatuses: AgentStatus[];
        wslAgentStatuses: AgentStatus[];
      }) => unknown,
    ) => selector(statusesState),
    { getState: () => statusesState },
  ),
}));

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (
    selector: (state: { servers: never[]; runtime: Record<string, never> }) => unknown,
  ) => selector({ servers: [], runtime: {} }),
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof sharedSettingsState) => unknown) =>
    selector(sharedSettingsState),
}));

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    value?: string;
    onBlur?: (event: { relatedTarget: EventTarget | null }) => void;
    onChange?: (event: { target: { value: string } }) => void;
    onFocus?: () => void;
    type?: string;
  }) => (
    <input
      aria-label={props["aria-label"]}
      type={props.type}
      value={props.value}
      onBlur={(event) => props.onBlur?.({ relatedTarget: event.relatedTarget })}
      onFocus={() => props.onFocus?.()}
      onChange={(event) => props.onChange?.({ target: { value: event.target.value } })}
    />
  ),
  PixelLoader: () => <span data-testid="pixel-loader" />,
  // Reached through the Cursor panel's profile list, which confirms removals.
  ConfirmDialog: () => null,
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
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import "@/renderer/components/providers/antigravity";
import { resetAcpRegistryListingCache } from "@/renderer/components/providers/useCombinedProviderRuntimeUpdates";
import { SingleAgentSettings } from "./SingleAgentSettings";

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

function makeAntigravityStatus(cliVersion: string, acpVersion: string): AgentStatus {
  return makeStatus("antigravity", {
    label: "Antigravity",
    version: cliVersion,
    envKind: "windows",
    runtimeVariants: {
      cli: {
        presentationMode: "terminal",
        installed: true,
        version: cliVersion,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: baseCapabilities,
      },
      acp: {
        presentationMode: "gui",
        installed: true,
        version: acpVersion,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: {
          ...baseCapabilities,
          presentationMode: "gui",
          liveInputMode: "server",
        },
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

function envRow(label: string): HTMLElement {
  const row = screen.getByText(label).closest('[class*="group/env"]');
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Unable to find ${label} environment row`);
  }
  return row;
}

describe("SingleAgentSettings", () => {
  beforeEach(() => {
    resetAcpRegistryListingCache();
    statusesState.agentStatuses = [];
    statusesState.wslAgentStatuses = [];
    appState.projects = [];
    sharedSettingsState.disabledAgents = [];
    sharedSettingsState.hiddenModels = {};
    sharedSettingsState.agentSettings = {};
    sharedSettingsState.agentInstances = {};
    sharedSettingsState.setAgentDisabled.mockReset();
    sharedSettingsState.setHiddenModels.mockReset();
    sharedSettingsState.setAgentSetting.mockReset();
    sharedSettingsState.setAgentInstance.mockReset();
    sharedSettingsState.syncAcpRegistryInstalledAgents.mockReset();
    refreshAgentStatusesMock.mockReset().mockResolvedValue(undefined);
    setAcpRegistryAgentAuthMock.mockReset().mockResolvedValue({});
    authenticateAcpAgentMock.mockReset().mockResolvedValue(undefined);
    logoutAcpAgentMock.mockReset().mockResolvedValue(undefined);
    focusWindowMock.mockReset().mockResolvedValue(undefined);
    listAcpRegistryMock.mockReset().mockImplementation(() => new Promise(() => {}));
    getLatestAgentVersionMock.mockReset().mockImplementation(() => new Promise(() => {}));
    resolveAgentAccountMock.mockReset().mockImplementation(() => new Promise(() => {}));
    updateAgentBinaryMock.mockReset().mockResolvedValue({ ok: true });
    updateAcpRegistryAgentMock.mockReset().mockResolvedValue({ installed: [] });
    getAgentHookPluginStatusesMock.mockReset().mockImplementation(() => new Promise(() => {}));
    toastMock.danger.mockReset();
    toastMock.success.mockReset();
    runAgentInstallCommandMock.mockReset().mockReturnValue(true);
    runAgentLoginCommandMock.mockReset().mockReturnValue(true);
    useProviderUsageStore.setState({ snapshots: {} });
    useMachineSelectionStore.setState({ selectedMachineId: "local" });
  });

  /** Scope the Agents pages to another machine, as the machine bar would. */
  const selectMachine = (machineId: string) => {
    act(() => useMachineSelectionStore.getState().setSelectedMachine(machineId));
  };

  it("renders identity metadata as a single compact summary line", () => {
    statusesState.agentStatuses = [
      makeStatus("claude", {
        label: "Claude Code",
        version: "2.1.138",
        providerMetadata: {
          authenticatedAs: "user@example.com",
          organization: "Yieldmo",
          plan: "Team Subscription",
          authMethod: "Claude.ai",
        },
      }),
    ];

    render(<SingleAgentSettings agentKind="claude" />);

    expect(screen.getByText(/user@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Yieldmo/)).toBeInTheDocument();
    expect(screen.getByText(/Team Subscription/)).toBeInTheDocument();
    // Auth method is intentionally omitted from the summary when richer
    // identity fields are available.
    expect(screen.queryByText("Auth method")).not.toBeInTheDocument();
    expect(screen.queryByText("Claude.ai")).not.toBeInTheDocument();
  });

  it("prefers the live usage plan over the one baked into provider credentials", () => {
    // Codex derives its detected plan from the `chatgpt_plan_type` claim of the
    // cached OAuth id_token, so an upgrade keeps reporting the old tier until
    // that token is refreshed. The usage snapshot is read live.
    statusesState.agentStatuses = [
      makeStatus("codex", {
        label: "Codex",
        providerMetadata: {
          authenticatedAs: "user@example.com",
          plan: "ChatGPT Pro 5x",
        },
      }),
    ];
    useProviderUsageStore.getState().setSnapshots([
      {
        providerId: "codex",
        status: "ok",
        plan: "ChatGPT Pro 20x",
        windows: [],
        fetchedAt: 1,
      },
    ]);

    render(<SingleAgentSettings agentKind="codex" />);

    expect(screen.getByText(/ChatGPT Pro 20x/)).toBeInTheDocument();
    expect(screen.queryByText(/ChatGPT Pro 5x/)).not.toBeInTheDocument();
  });

  it("keeps the detected plan when the live usage snapshot is for another account", () => {
    statusesState.agentStatuses = [
      makeStatus("codex", {
        label: "Codex",
        providerMetadata: {
          authenticatedAs: "user@example.com",
          plan: "ChatGPT Pro 5x",
        },
      }),
    ];
    useProviderUsageStore.getState().setSnapshots([
      {
        providerId: "codex",
        status: "ok",
        plan: "ChatGPT Pro 20x",
        authenticatedAs: "someone-else@example.com",
        windows: [],
        fetchedAt: 1,
      },
    ]);

    render(<SingleAgentSettings agentKind="codex" />);

    expect(screen.getByText(/ChatGPT Pro 5x/)).toBeInTheDocument();
    expect(screen.queryByText(/ChatGPT Pro 20x/)).not.toBeInTheDocument();
  });

  it("keeps the detected plan when the live usage read failed", () => {
    statusesState.agentStatuses = [
      makeStatus("codex", {
        label: "Codex",
        providerMetadata: {
          authenticatedAs: "user@example.com",
          plan: "ChatGPT Pro 5x",
        },
      }),
    ];
    useProviderUsageStore
      .getState()
      .setSnapshots([{ providerId: "codex", status: "error", windows: [], fetchedAt: 1 }]);

    render(<SingleAgentSettings agentKind="codex" />);

    expect(screen.getByText(/ChatGPT Pro 5x/)).toBeInTheDocument();
  });

  it("does not lend the live plan to an environment that is not signed in", () => {
    statusesState.agentStatuses = [
      makeStatus("codex", {
        label: "Codex",
        envKind: "windows",
        providerMetadata: { authenticatedAs: "user@example.com", plan: "ChatGPT Pro 5x" },
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("codex", {
        label: "Codex",
        authState: "missing",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];
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
    useProviderUsageStore.getState().setSnapshots([
      {
        providerId: "codex",
        status: "ok",
        plan: "ChatGPT Pro 20x",
        windows: [],
        fetchedAt: 1,
      },
    ]);

    render(<SingleAgentSettings agentKind="codex" />);

    expect(within(envRow("This computer")).getByText(/ChatGPT Pro 20x/)).toBeInTheDocument();
    selectMachine("local/wsl:Ubuntu");
    expect(within(envRow("WSL · Ubuntu")).queryByText(/ChatGPT Pro/)).not.toBeInTheDocument();
  });

  it("renders a Claude profile editor before detection has reported the profile status", () => {
    sharedSettingsState.agentInstances = {
      glm: {
        id: "glm",
        driver: "claude",
        displayName: "GLM",
        config: { configDir: "~/.poracode/claude-profiles/glm" },
      },
    };

    render(<SingleAgentSettings agentKind="claude:glm" />);

    expect(screen.getByText("Claude GLM")).toBeInTheDocument();
    expect(screen.getByLabelText("Claude profile config directory")).toHaveValue(
      "~/.poracode/claude-profiles/glm",
    );
    expect(screen.queryByText("This agent is not installed.")).not.toBeInTheDocument();
  });

  it("summarizes OpenCode connected providers on a single line", () => {
    statusesState.agentStatuses = [
      makeStatus("opencode", {
        label: "OpenCode",
        providerMetadata: {
          connectedProviders: [
            { label: "Copilot", detail: "OAuth" },
            { label: "OpenAI", detail: "OAuth" },
          ],
        },
      }),
    ];

    render(<SingleAgentSettings agentKind="opencode" />);

    expect(screen.getByText(/2 providers/)).toBeInTheDocument();
    expect(screen.getByText(/Copilot, OpenAI/)).toBeInTheDocument();
  });

  it("falls back to the auth method when no identity is available", () => {
    statusesState.agentStatuses = [
      makeStatus("codex", {
        label: "Codex",
        providerMetadata: { authMethod: "ChatGPT" },
      }),
    ];

    render(<SingleAgentSettings agentKind="codex" />);

    expect(screen.getByText("via ChatGPT")).toBeInTheDocument();
  });

  it("shows a login action when the agent reports missing auth", async () => {
    statusesState.agentStatuses = [
      makeStatus("gemini", {
        label: "Gemini",
        authState: "missing",
        loginCommand: "gemini auth login",
      }),
    ];

    render(<SingleAgentSettings agentKind="gemini" />);

    expect(screen.getAllByText("Login required").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /login/i }));
    expect(runAgentLoginCommandMock).toHaveBeenCalledWith({
      label: "Gemini",
      command: "gemini auth login",
      onCommandComplete: expect.any(Function),
    });
  });

  it("opens WSL login actions in the matching project distro", async () => {
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

    render(<SingleAgentSettings agentKind="codex" />);
    selectMachine("local/wsl:Ubuntu");

    fireEvent.click(screen.getByRole("button", { name: /login/i }));
    expect(runAgentLoginCommandMock).toHaveBeenCalledWith({
      label: "Codex WSL",
      command: "codex login",
      onCommandComplete: expect.any(Function),
      project: wslProject,
    });
  });

  it("shows terminal auth login actions per environment", async () => {
    let resolveRefresh!: () => void;
    refreshAgentStatusesMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const windowsProject = makeProject({
      id: "windows-project",
      name: "Windows Project",
      location: { kind: "windows", path: "C:\\project" },
    });
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
    appState.projects = [windowsProject, wslProject];
    statusesState.agentStatuses = [
      makeStatus("cursor", {
        label: "Cursor",
        authState: "missing",
        loginCommand: "cursor-agent login",
        authMethods: [
          { type: "terminal", id: "cursor-agent-login", name: "Cursor login", args: ["login"] },
        ],
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("cursor", {
        label: "Cursor",
        authState: "missing",
        loginCommand: "cursor-agent login",
        authMethods: [
          {
            type: "terminal",
            id: "cursor-agent-login",
            name: "Cursor login",
            args: ["login"],
            env: { NO_OPEN_BROWSER: "1" },
          },
        ],
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SingleAgentSettings agentKind="cursor" />);

    const windowsRow = envRow("This computer");
    expect(within(windowsRow).getByRole("button", { name: /login/i })).toBeInTheDocument();
    expect(screen.queryByText(/This computer, WSL · Ubuntu needs authentication/u)).toBeNull();

    selectMachine("local/wsl:Ubuntu");
    const wslRow = envRow("WSL · Ubuntu");
    expect(within(wslRow).getByRole("button", { name: /login/i })).toBeInTheDocument();

    fireEvent.click(within(wslRow).getByRole("button", { name: /login/i }));

    const loginInput = runAgentLoginCommandMock.mock.calls[0]?.[0];
    expect(loginInput).toEqual({
      label: "Cursor",
      command: "cursor-agent login",
      env: { NO_OPEN_BROWSER: "1" },
      onCommandComplete: expect.any(Function),
      project: wslProject,
    });
    expect(screen.getByRole("status", { name: /logging in/i })).toBeInTheDocument();

    await act(async () => {
      loginInput?.onCommandComplete?.(0);
    });
    expect(screen.getByRole("status", { name: /logging in/i })).toBeInTheDocument();
    expect(
      screen.getByText("Refreshing WSL · Ubuntu Cursor authentication status."),
    ).toBeInTheDocument();
    expect(refreshAgentStatusesMock).toHaveBeenCalledWith(["Ubuntu"], {
      agentKinds: ["cursor"],
      envs: [{ kind: "wsl", distro: "Ubuntu" }],
    });
    await act(async () => {
      resolveRefresh();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: /logging in/i })).not.toBeInTheDocument(),
    );
  });

  it("saves ACP env-var auth through the supervisor and refreshes detection", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:glm-acp-agent", {
        label: "GLM Agent",
        authState: "missing",
        authMethods: [
          {
            type: "env_var",
            id: "zai",
            name: "Z.AI API key",
            vars: [{ name: "Z_AI_API_KEY", label: "Z.AI API key" }],
          },
        ],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:glm-acp-agent" />);

    fireEvent.change(screen.getByLabelText("Z.AI API key"), {
      target: { value: "sk-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(setAcpRegistryAgentAuthMock).toHaveBeenCalledWith({
      agentId: "glm-acp-agent",
      environment: { Z_AI_API_KEY: "sk-test" },
    });
    await waitFor(() => expect(refreshAgentStatusesMock).toHaveBeenCalled());
  });

  it("keeps ACP env-var auth editable after credentials are accepted", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:glm-acp-agent", {
        label: "GLM Agent",
        authState: "authenticated",
        authMethods: [
          {
            type: "env_var",
            id: "zai",
            name: "Z.AI API key",
            vars: [{ name: "Z_AI_API_KEY", label: "Z.AI API key" }],
          },
        ],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:glm-acp-agent" />);

    expect(screen.getByText("Z.AI API key")).toBeInTheDocument();
    const input = screen.getByLabelText("Z.AI API key");
    expect(input).toHaveValue("***********");
    expect(input).toHaveAttribute("type", "text");
    fireEvent.focus(input);
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.blur(input);
    expect(input).toHaveValue("***********");
    fireEvent.focus(input);
    fireEvent.change(input, {
      target: { value: "sk-unsaved" },
    });
    fireEvent.blur(input);
    expect(input).toHaveValue("***********");
    fireEvent.focus(input);
    fireEvent.change(input, {
      target: { value: "sk-next" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(setAcpRegistryAgentAuthMock).toHaveBeenCalledWith({
      agentId: "glm-acp-agent",
      environment: { Z_AI_API_KEY: "sk-next" },
    });
    await waitFor(() => expect(input).toHaveValue("***********"));
    expect(toastMock.success).toHaveBeenCalledWith("GLM Agent credentials saved.");
  });

  it("does not show re-login actions for accepted ACP env-var credentials", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:glm-acp-agent", {
        label: "GLM Agent",
        authState: "authenticated",
        authMethods: [
          {
            type: "env_var",
            id: "zai",
            name: "Z.AI API key",
            vars: [{ name: "Z_AI_API_KEY", label: "Z.AI API key" }],
          },
          { id: "login", name: "Login" },
        ],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:glm-acp-agent" />);

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-login/i })).toBeNull();
  });

  it("shows an error toast when ACP env-var auth save fails", async () => {
    setAcpRegistryAgentAuthMock.mockRejectedValueOnce(new Error("bad key"));
    statusesState.agentStatuses = [
      makeStatus("acp-generic:glm-acp-agent", {
        label: "GLM Agent",
        authState: "missing",
        authMethods: [
          {
            type: "env_var",
            id: "zai",
            name: "Z.AI API key",
            vars: [{ name: "Z_AI_API_KEY", label: "Z.AI API key" }],
          },
        ],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:glm-acp-agent" />);

    fireEvent.change(screen.getByLabelText("Z.AI API key"), {
      target: { value: "sk-bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledWith("bad key"));
  });

  it("runs ACP agent-owned auth through the supervisor and refocuses the app", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:sso-agent", {
        label: "SSO Agent",
        authState: "missing",
        authMethods: [{ id: "browser-login", name: "Browser login" }],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:sso-agent" />);

    const row = envRow("Default");
    fireEvent.click(within(row).getByRole("button", { name: /login/i }));

    expect(authenticateAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "acp-generic:sso-agent",
      methodId: "browser-login",
    });
    await waitFor(() => expect(focusWindowMock).toHaveBeenCalled());
    await waitFor(() => expect(refreshAgentStatusesMock).toHaveBeenCalled());
    expect(toastMock.success).toHaveBeenCalledWith("SSO Agent authenticated.");
  });

  it("prefers terminal login for Grok when it advertises both ACP and a loginCommand", async () => {
    statusesState.agentStatuses = [
      makeStatus("grok", {
        label: "Grok Build",
        authState: "missing",
        loginCommand: "grok login --device-auth",
        // Probe-reported: Grok's CLI login is the supported sign-in path.
        preferTerminalLogin: true,
        authMethods: [{ id: "grok.com", name: "Grok" }],
      }),
    ];

    render(<SingleAgentSettings agentKind="grok" />);

    const row = envRow("Default");
    fireEvent.click(within(row).getByRole("button", { name: /login/i }));

    expect(runAgentLoginCommandMock).toHaveBeenCalledWith({
      label: "Grok Build",
      command: "grok login --device-auth",
      onCommandComplete: expect.any(Function),
    });
    expect(authenticateAcpAgentMock).not.toHaveBeenCalled();
  });

  it("surfaces the lazily-resolved Antigravity account and a Re-login (no Logout) button", async () => {
    statusesState.agentStatuses = [
      makeStatus("antigravity", {
        label: "Antigravity",
        version: "1.0.8",
        authState: "authenticated",
        loginCommand: "agy",
        authMethods: [
          { type: "terminal", id: "antigravity-login", name: "Antigravity login", args: [] },
        ],
      }),
    ];
    resolveAgentAccountMock.mockResolvedValue({
      account: { authenticatedAs: "user@example.com", plan: "Google AI Pro" },
    });

    render(<SingleAgentSettings agentKind="antigravity" />);

    // Account line resolves out-of-band via the bridge, so it appears async.
    expect(await screen.findByText(/user@example\.com · Google AI Pro/)).toBeInTheDocument();
    expect(resolveAgentAccountMock).toHaveBeenCalledWith({
      agentKind: "antigravity",
      wslDistros: [],
    });

    const row = envRow("Default");
    // No `agy logout` exists, so authLogoutSupported is absent → Re-login, never Logout.
    expect(within(row).getByRole("button", { name: /re-login/i })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
  });

  it("shows and updates both Antigravity runtime versions in one settings card", async () => {
    statusesState.agentStatuses = [makeAntigravityStatus("1.2.0", "1.0.0")];
    getLatestAgentVersionMock.mockResolvedValue({ version: "1.3.0", source: "npm" });
    listAcpRegistryMock.mockResolvedValue({
      version: "1.0.0",
      agents: [
        {
          id: "antigravity-acp",
          name: "Google Antigravity",
          version: "1.1.0",
          description: "Official Antigravity ACP runtime",
          distribution: { npx: { package: "antigravity-acp" } },
        },
      ],
    });
    refreshAgentStatusesMock.mockResolvedValue({
      windows: [makeAntigravityStatus("1.3.0", "1.1.0")],
      wsl: [],
      fromCache: false,
    });

    render(<SingleAgentSettings agentKind="antigravity" />);

    await screen.findByText("agy CLI");
    const runtimeList = screen.getByRole("list", { name: "Runtime" });
    const runtimeRows = within(runtimeList).getAllByRole("listitem");
    expect(runtimeRows[0]).toHaveTextContent("agy CLIv1.2.0 → v1.3.0");
    expect(runtimeRows[1]).toHaveTextContent("Antigravity ACPv1.0.0 → v1.1.0");
    expect(screen.getAllByRole("button", { name: "Update" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => {
      expect(updateAgentBinaryMock).toHaveBeenCalledWith({
        agentKind: "antigravity",
        envKind: "windows",
      });
      expect(updateAcpRegistryAgentMock).toHaveBeenCalledWith({
        agentId: "antigravity-acp",
        target: { kind: "native" },
      });
    });
  });

  it("shows Login (not the shared account) for an Antigravity env that isn't signed in", async () => {
    statusesState.agentStatuses = [
      makeStatus("antigravity", {
        label: "Antigravity",
        version: "1.0.8",
        authState: "unknown",
        loginCommand: "agy",
        authMethods: [
          { type: "terminal", id: "antigravity-login", name: "Antigravity login", args: [] },
        ],
      }),
    ];
    // Even once the shared account resolves, it must not appear on an env whose
    // own auth state is unauthenticated (avoids "account + Login required").
    resolveAgentAccountMock.mockResolvedValue({
      account: { authenticatedAs: "user@example.com", plan: "Google AI Pro" },
    });

    render(<SingleAgentSettings agentKind="antigravity" />);

    await waitFor(() =>
      expect(resolveAgentAccountMock).toHaveBeenCalledWith({
        agentKind: "antigravity",
        wslDistros: [],
      }),
    );
    const row = envRow("Default");
    expect(within(row).queryByText(/user@example\.com/)).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: /login/i }));
    expect(runAgentLoginCommandMock).toHaveBeenCalledWith({
      label: "Antigravity",
      command: "agy",
      onCommandComplete: expect.any(Function),
    });
  });

  it("shows a native Windows install row when Grok is only installed in WSL", async () => {
    const windowsProject = makeProject({
      id: "windows-project",
      name: "Windows Project",
      location: { kind: "windows", path: "C:\\project" },
    });
    appState.projects = [
      windowsProject,
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
    statusesState.agentStatuses = [
      makeStatus("grok", {
        label: "Grok Build",
        installed: false,
        authState: "missing",
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("grok", {
        label: "Grok Build",
        version: "0.2.11",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SingleAgentSettings agentKind="grok" />);

    const windowsRow = envRow("This computer");
    expect(within(windowsRow).getByText("Not installed")).toBeInTheDocument();
    fireEvent.click(within(windowsRow).getByRole("button", { name: "Install on This computer" }));

    expect(runAgentInstallCommandMock).toHaveBeenCalledWith({
      label: "Grok Build",
      command: expect.any(Function),
      onCommandComplete: expect.any(Function),
      project: windowsProject,
    });
  });

  it("shows a WSL install row when Grok is only installed on Windows", async () => {
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
    appState.projects = [
      makeProject({
        id: "windows-project",
        name: "Windows Project",
        location: { kind: "windows", path: "C:\\project" },
      }),
      wslProject,
    ];
    statusesState.agentStatuses = [
      makeStatus("grok", {
        label: "Grok Build",
        version: "0.2.14",
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("grok", {
        label: "Grok Build",
        installed: false,
        authState: "missing",
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SingleAgentSettings agentKind="grok" />);
    selectMachine("local/wsl:Ubuntu");

    const wslRow = envRow("WSL · Ubuntu");
    expect(within(wslRow).getByText("Not installed")).toBeInTheDocument();
    fireEvent.click(within(wslRow).getByRole("button", { name: "Install on WSL · Ubuntu" }));

    expect(runAgentInstallCommandMock).toHaveBeenCalledWith({
      label: "Grok Build",
      command: expect.any(Function),
      onCommandComplete: expect.any(Function),
      project: wslProject,
    });
  });

  it("keeps ACP auth preferred for non-Grok agents that also expose loginCommand", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:sso-agent", {
        label: "SSO Agent",
        authState: "missing",
        loginCommand: "sso-agent login",
        authMethods: [{ id: "browser-login", name: "Browser login" }],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:sso-agent" />);

    const row = envRow("Default");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: /login/i }));
    });

    expect(authenticateAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "acp-generic:sso-agent",
      methodId: "browser-login",
    });
    expect(runAgentLoginCommandMock).not.toHaveBeenCalled();
  });

  it("hides malformed ACP API key methods while keeping browser login available", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "missing",
        authMethods: [
          { id: "login", name: "Login" },
          {
            id: "factory-key",
            name: "Factory API Key",
            vars: [{ name: "FACTORY_API_KEY", label: "Factory API Key" }],
          } as never,
        ],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:factory-droid" />);

    expect(screen.queryByLabelText("Factory API Key")).toBeNull();
    expect(screen.queryByRole("button", { name: "Factory API Key" })).toBeNull();
    const row = envRow("Default");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "Login" }));
    });

    expect(authenticateAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "acp-generic:factory-droid",
      methodId: "login",
    });
  });

  it("shows auth controls when probe advertised methods but authState is still unknown", () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "unknown",
        authMethods: [
          { id: "login", name: "Login" },
          {
            id: "factory-key",
            name: "Factory API Key",
            vars: [{ name: "FACTORY_API_KEY", label: "Factory API Key" }],
          } as never,
        ],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:factory-droid" />);

    expect(screen.queryByLabelText("Factory API Key")).toBeNull();
    expect(screen.queryByRole("button", { name: "Factory API Key" })).toBeNull();
    const row = envRow("Default");
    expect(within(row).getByRole("button", { name: "Login" })).toBeInTheDocument();
  });

  it("does not request login when ACP session setup succeeded without proving auth", () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:ready-agent", {
        label: "Ready Agent",
        authState: "unknown",
        acpSessionEstablished: true,
        authMethods: [{ id: "login", name: "Login" }],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:ready-agent" />);

    const row = envRow("Default");
    expect(within(row).queryByRole("button", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByText("Login required")).not.toBeInTheDocument();
  });

  it("keeps login required for an unready WSL env when native ACP setup succeeded", () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:ready-agent", {
        label: "Ready Agent",
        authState: "unknown",
        acpSessionEstablished: true,
        authMethods: [{ id: "login", name: "Login" }],
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("acp-generic:ready-agent", {
        label: "Ready Agent",
        authState: "unknown",
        authMethods: [{ id: "login", name: "Login" }],
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:ready-agent" />);

    expect(within(envRow("This computer")).queryByRole("button", { name: "Login" })).toBeNull();
    selectMachine("local/wsl:Ubuntu");
    expect(screen.getAllByText("Login required").length).toBeGreaterThan(0);
    expect(
      within(envRow("WSL · Ubuntu")).getByRole("button", { name: "Login WSL · Ubuntu" }),
    ).toBeVisible();
  });

  it("offers logout (not re-login) for an authenticated ACP agent env", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:sso-agent", {
        label: "SSO Agent",
        authState: "authenticated",
        authMethods: [{ id: "browser-login", name: "Browser login" }],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:sso-agent" />);

    expect(screen.queryByRole("button", { name: /re-login/i })).toBeNull();
    const row = envRow("Default");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: /logout/i }));
    });

    expect(logoutAcpAgentMock).toHaveBeenCalledWith({ agentKind: "acp-generic:sso-agent" });
  });

  it("runs ACP agent-owned auth in the selected WSL environment", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:sso-agent", {
        label: "SSO Agent",
        authState: "missing",
        authMethods: [{ id: "browser-login", name: "Browser login" }],
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("acp-generic:sso-agent", {
        label: "SSO Agent",
        authState: "missing",
        authMethods: [{ id: "browser-login", name: "Browser login" }],
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:sso-agent" />);
    selectMachine("local/wsl:Ubuntu");

    const row = envRow("WSL · Ubuntu");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: /login/i }));
    });

    expect(authenticateAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "acp-generic:sso-agent",
      methodId: "browser-login",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });
  });

  it("shows pending feedback while ACP agent-owned auth is running", async () => {
    let resolveAuth!: () => void;
    authenticateAcpAgentMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveAuth = resolve;
      }),
    );
    statusesState.wslAgentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "missing",
        authMethods: [{ id: "login", name: "Login" }],
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:factory-droid" />);
    selectMachine("local/wsl:Ubuntu");

    const row = envRow("WSL · Ubuntu");
    fireEvent.click(within(row).getByRole("button", { name: /login/i }));

    expect(screen.getByText(/Waiting for WSL · Ubuntu Login authentication/u)).toBeInTheDocument();

    resolveAuth();
    await waitFor(() => expect(refreshAgentStatusesMock).toHaveBeenCalled());
  });

  it("shows Windows login when WSL is signed in but Windows status omitted auth methods", () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "unknown",
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "authenticated",
        authMethods: [{ id: "login", name: "Login" }],
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:factory-droid" />);

    expect(screen.getByText("This computer")).toBeInTheDocument();
    expect(screen.getAllByText("Login required").length).toBeGreaterThan(0);
    expect(screen.getByText(/Complete Login sign-in for This computer\./u)).toBeInTheDocument();
    const windowsRow = envRow("This computer");
    expect(within(windowsRow).getByRole("button", { name: /login/i })).toBeInTheDocument();
    expect(screen.queryByText(/This computer · Authentication/u)).toBeNull();
  });

  it("labels the remaining WSL auth action when Windows is already signed in", async () => {
    statusesState.agentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "authenticated",
        authMethods: [{ id: "login", name: "Login" }],
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "missing",
        authMethods: [{ id: "login", name: "Login" }],
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:factory-droid" />);

    // Each machine owns its env row: the local machine shows logout plus an
    // attention hint pointing at the WSL machine; switching reveals login.
    const windowsRow = envRow("This computer");
    expect(within(windowsRow).getByRole("button", { name: /logout/i })).toBeInTheDocument();
    expect(screen.getByText("Needs attention on WSL · Ubuntu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    const wslRow = envRow("WSL · Ubuntu");
    expect(within(wslRow).getByRole("button", { name: /login/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-login/i })).toBeNull();
    expect(screen.getByText(/Complete Login sign-in for WSL · Ubuntu\./u)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(wslRow).getByRole("button", { name: /login/i }));
    });

    expect(authenticateAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "acp-generic:factory-droid",
      methodId: "login",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });
  });

  it("logs out the selected authenticated ACP environment", async () => {
    let resolveLogout!: () => void;
    logoutAcpAgentMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveLogout = resolve;
      }),
    );
    statusesState.agentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "authenticated",
        authMethods: [{ id: "login", name: "Login" }],
        envKind: "windows",
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("acp-generic:factory-droid", {
        label: "Factory Droid",
        authState: "missing",
        authLogoutSupported: true,
        authMethods: [{ id: "login", name: "Login" }],
        envKind: "wsl",
        envDistro: "Ubuntu",
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:factory-droid" />);

    const windowsRow = envRow("This computer");
    fireEvent.click(within(windowsRow).getByRole("button", { name: /logout/i }));

    expect(screen.getByRole("status", { name: /logging out/i })).toBeInTheDocument();
    expect(logoutAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "acp-generic:factory-droid",
      envKind: "windows",
    });
    resolveLogout();
    await waitFor(() => expect(refreshAgentStatusesMock).toHaveBeenCalled());
  });

  it("does not show native ACP logout when the agent did not advertise logout support", () => {
    statusesState.agentStatuses = [
      makeStatus("gemini", {
        label: "Gemini",
        authState: "authenticated",
        authMethods: [{ id: "oauth-personal", name: "Log in with Google" }],
        envKind: "windows",
      }),
    ];

    render(<SingleAgentSettings agentKind="gemini" />);

    expect(screen.queryByRole("button", { name: /logout/i })).toBeNull();
  });

  it("offers re-login for authenticated native ACP agents without logout support", async () => {
    statusesState.agentStatuses = [
      makeStatus("copilot", {
        label: "GitHub Copilot",
        authState: "authenticated",
        authMethods: [{ id: "github-copilot-login", name: "Copilot login" }],
        envKind: "windows",
      }),
    ];

    render(<SingleAgentSettings agentKind="copilot" />);

    const row = envRow("This computer");
    fireEvent.click(within(row).getByRole("button", { name: /re-login/i }));

    expect(authenticateAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "copilot",
      methodId: "github-copilot-login",
      envKind: "windows",
    });
    await waitFor(() => expect(focusWindowMock).toHaveBeenCalled());
  });

  it("runs terminal re-login for authenticated native ACP terminal auth agents", () => {
    const windowsProject = makeProject({
      id: "windows-project",
      name: "Windows Project",
      location: { kind: "windows", path: "C:\\project" },
    });
    appState.projects = [windowsProject];
    runAgentLoginCommandMock.mockReturnValue(true);
    statusesState.agentStatuses = [
      makeStatus("copilot", {
        label: "GitHub Copilot",
        authState: "authenticated",
        loginCommand: "copilot login",
        authMethods: [
          {
            type: "terminal",
            id: "copilot-login",
            name: "Log in with Copilot CLI",
            args: ["login"],
          },
        ],
        envKind: "windows",
      }),
    ];

    render(<SingleAgentSettings agentKind="copilot" />);

    const row = envRow("This computer");
    fireEvent.click(within(row).getByRole("button", { name: /re-login/i }));

    expect(authenticateAcpAgentMock).not.toHaveBeenCalled();
    expect(runAgentLoginCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "GitHub Copilot",
        command: "copilot login",
        project: windowsProject,
      }),
    );
  });

  it("refreshes terminal authentication after the login console is manually closed", async () => {
    const windowsProject = makeProject({
      id: "windows-project",
      name: "Windows Project",
      location: { kind: "windows", path: "C:\\project" },
    });
    appState.projects = [windowsProject];
    runAgentLoginCommandMock.mockReturnValue(true);
    statusesState.agentStatuses = [
      makeStatus("qwen", {
        label: "Qwen Code",
        authState: "missing",
        loginCommand: "qwen -i /auth",
        authMethods: [
          {
            type: "terminal",
            id: "qwen-terminal-login",
            name: "Login",
          },
        ],
        envKind: "windows",
      }),
    ];

    render(<SingleAgentSettings agentKind="qwen" />);
    fireEvent.click(within(envRow("This computer")).getByRole("button", { name: /login/i }));
    const loginInput = runAgentLoginCommandMock.mock.calls[0]?.[0];

    await act(async () => {
      loginInput?.onCommandComplete?.(-1);
    });

    expect(refreshAgentStatusesMock).toHaveBeenCalledWith([], {
      agentKinds: ["qwen"],
      envs: [{ kind: "native" }],
    });
  });

  it("runs native ACP agent-owned auth in the selected environment", async () => {
    statusesState.agentStatuses = [
      makeStatus("gemini", {
        label: "Gemini",
        authState: "missing",
        authMethods: [{ id: "oauth-personal", name: "Log in with Google" }],
        envKind: "windows",
      }),
    ];

    render(<SingleAgentSettings agentKind="gemini" />);

    const row = envRow("This computer");
    fireEvent.click(within(row).getByRole("button", { name: /login/i }));

    expect(authenticateAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "gemini",
      methodId: "oauth-personal",
      envKind: "windows",
    });
    await waitFor(() => expect(focusWindowMock).toHaveBeenCalled());
  });

  it("logs out native ACP agents only when ACP logout is advertised", async () => {
    statusesState.agentStatuses = [
      makeStatus("gemini", {
        label: "Gemini",
        authState: "authenticated",
        authLogoutSupported: true,
        authMethods: [{ id: "oauth-personal", name: "Log in with Google" }],
        envKind: "windows",
      }),
    ];

    render(<SingleAgentSettings agentKind="gemini" />);

    const row = envRow("This computer");
    fireEvent.click(within(row).getByRole("button", { name: /logout/i }));

    expect(logoutAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "gemini",
      envKind: "windows",
    });
    await waitFor(() => expect(refreshAgentStatusesMock).toHaveBeenCalled());
  });

  it("offers Cursor's built-in updater when no registry target is available", async () => {
    const platformSpy = vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    statusesState.agentStatuses = [
      makeStatus("cursor", {
        label: "Cursor",
        version: "2026.05.16-0338208",
        envKind: "windows",
        update: { builtIn: { binary: "cursor-agent", args: ["update"] } },
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("cursor", {
        label: "Cursor",
        version: "2026.05.01-eea359f",
        envKind: "wsl",
        envDistro: "Ubuntu",
        update: { builtIn: { binary: "cursor-agent", args: ["update"] } },
      }),
    ];
    getLatestAgentVersionMock.mockResolvedValueOnce({
      version: "2026.05.16-0338208",
      source: "homebrew-cask",
    });

    render(<SingleAgentSettings agentKind="cursor" />);

    const windowsRow = envRow("This computer");
    expect(within(windowsRow).queryByRole("button", { name: /Update to v/i })).toBeNull();
    selectMachine("local/wsl:Ubuntu");
    const wslRow = envRow("WSL · Ubuntu");
    await waitFor(() =>
      expect(
        within(wslRow).getByRole("button", {
          name: /Update to v2026\.05\.16-0338208/i,
        }),
      ).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(
        within(wslRow).getByRole("button", {
          name: /Update to v2026\.05\.16-0338208/i,
        }),
      );
    });

    expect(updateAgentBinaryMock).toHaveBeenCalledWith({
      agentKind: "cursor",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });
    platformSpy.mockRestore();
  });

  it("keeps Windows and WSL update loaders independent", async () => {
    const platformSpy = vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    statusesState.agentStatuses = [
      makeStatus("cursor", {
        label: "Cursor",
        version: "1.0.0",
        envKind: "windows",
        update: { builtIn: { binary: "cursor-agent", args: ["update"] } },
      }),
    ];
    statusesState.wslAgentStatuses = [
      makeStatus("cursor", {
        label: "Cursor",
        version: "1.0.0",
        envKind: "wsl",
        envDistro: "Ubuntu",
        update: { builtIn: { binary: "cursor-agent", args: ["update"] } },
      }),
    ];
    getLatestAgentVersionMock.mockResolvedValue({
      version: "1.1.0",
      source: "npm",
    });
    let resolveWindowsUpdate!: (result: { ok: boolean }) => void;
    let resolveWslUpdate!: (result: { ok: boolean }) => void;
    const windowsUpdate = new Promise<{ ok: boolean }>((resolve) => {
      resolveWindowsUpdate = resolve;
    });
    const wslUpdate = new Promise<{ ok: boolean }>((resolve) => {
      resolveWslUpdate = resolve;
    });
    updateAgentBinaryMock.mockImplementation((payload) =>
      payload.envKind === "wsl" ? wslUpdate : windowsUpdate,
    );

    render(<SingleAgentSettings agentKind="cursor" />);

    fireEvent.click(
      await within(envRow("This computer")).findByRole("button", {
        name: /Update to v1\.1\.0/i,
      }),
    );
    await waitFor(() =>
      expect(
        within(envRow("This computer")).getByRole("status", {
          name: "Updating Cursor (This computer)",
        }),
      ).toBeInTheDocument(),
    );

    selectMachine("local/wsl:Ubuntu");
    fireEvent.click(
      await within(envRow("WSL · Ubuntu")).findByRole("button", {
        name: /Update to v1\.1\.0/i,
      }),
    );
    await waitFor(() =>
      expect(
        within(envRow("WSL · Ubuntu")).getByRole("status", {
          name: "Updating Cursor (WSL · Ubuntu)",
        }),
      ).toBeInTheDocument(),
    );

    resolveWslUpdate({ ok: false });
    await waitFor(() =>
      expect(
        within(envRow("WSL · Ubuntu")).queryByRole("status", {
          name: "Updating Cursor (WSL · Ubuntu)",
        }),
      ).toBeNull(),
    );

    // The Windows loader survives the machine switches independently.
    selectMachine("local");
    expect(
      within(envRow("This computer")).getByRole("status", {
        name: "Updating Cursor (This computer)",
      }),
    ).toBeInTheDocument();

    resolveWindowsUpdate({ ok: false });
    await waitFor(() =>
      expect(
        within(envRow("This computer")).queryByRole("status", {
          name: "Updating Cursor (This computer)",
        }),
      ).toBeNull(),
    );
    platformSpy.mockRestore();
  });

  it("reports the new version in the toast after a successful update", async () => {
    statusesState.agentStatuses = [
      makeStatus("claude", { label: "Claude Code", version: "1.0.0" }),
    ];
    getLatestAgentVersionMock.mockResolvedValueOnce({ version: "1.1.0", source: "npm" });
    refreshAgentStatusesMock.mockImplementation(async () => {
      statusesState.agentStatuses = [
        makeStatus("claude", { label: "Claude Code", version: "1.1.0" }),
      ];
    });

    render(<SingleAgentSettings agentKind="claude" />);
    const row = envRow("Default");
    fireEvent.click(await within(row).findByRole("button", { name: /Update to v1\.1\.0/i }));

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Claude Code updated to v1.1.0."),
    );
  });

  it("reports up-to-date when the update command leaves the version unchanged", async () => {
    statusesState.agentStatuses = [
      makeStatus("claude", { label: "Claude Code", version: "1.0.0" }),
    ];
    getLatestAgentVersionMock.mockResolvedValueOnce({ version: "1.1.0", source: "npm" });

    render(<SingleAgentSettings agentKind="claude" />);
    const row = envRow("Default");
    fireEvent.click(await within(row).findByRole("button", { name: /Update to v1\.1\.0/i }));

    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Claude Code is already up to date."),
    );
  });

  it("shows an error toast when ACP agent-owned auth fails", async () => {
    authenticateAcpAgentMock.mockRejectedValueOnce(new Error("browser closed"));
    statusesState.agentStatuses = [
      makeStatus("acp-generic:sso-agent", {
        label: "SSO Agent",
        authState: "missing",
        authMethods: [{ id: "browser-login", name: "Browser login" }],
      }),
    ];

    render(<SingleAgentSettings agentKind="acp-generic:sso-agent" />);

    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledWith("browser closed"));
  });
});
