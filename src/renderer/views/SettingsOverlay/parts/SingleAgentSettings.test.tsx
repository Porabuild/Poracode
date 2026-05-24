import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, Project } from "@/shared/contracts";

const statusesState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
};

const sharedSettingsState = {
  disabledAgents: [] as string[],
  hiddenModels: {} as Record<string, string[]>,
  agentSettings: {} as Record<string, Record<string, unknown>>,
  acpRegistryInstalledAgents: {} as Record<string, unknown>,
  setAgentDisabled: vi.fn<(kind: string, disabled: boolean) => void>(),
  setHiddenModels: vi.fn<(kind: string, hidden: string[]) => void>(),
  setAgentSetting: vi.fn<(kind: string, key: string, value: unknown) => void>(),
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

  function Wrapper(props: { children?: ReactNode }) {
    return <div>{props.children}</div>;
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

  return {
    Button,
    Label: (props: { children?: ReactNode }) => <span>{props.children}</span>,
    ListBox,
    ListLayout: () => null,
    Popover,
    Switch,
    Tooltip,
    toast: toastMock,
    Virtualizer: Wrapper,
  };
});

const refreshAgentStatusesMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
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

const listAcpRegistryMock = vi.hoisted(() =>
  vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
);

const getLatestAgentVersionMock = vi.hoisted(() =>
  vi
    .fn<(payload: { agentKind: string }) => Promise<{ version?: string; source?: string }>>()
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

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    refreshAgentStatuses: refreshAgentStatusesMock,
    setAcpRegistryAgentAuth: setAcpRegistryAgentAuthMock,
    authenticateAcpAgent: authenticateAcpAgentMock,
    logoutAcpAgent: logoutAcpAgentMock,
    focusWindow: focusWindowMock,
    listAcpRegistry: listAcpRegistryMock,
    getLatestAgentVersion: getLatestAgentVersionMock,
    updateAgentBinary: updateAgentBinaryMock,
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

vi.mock("@/renderer/actions/agentLoginActions", () => ({
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
  Select: () => <select aria-label="mock-select" />,
}));

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

function makeProject(input: { id: string; name: string; location: Project["location"] }): Project {
  return {
    id: input.id,
    name: input.name,
    disabled: false,
    createdAt: new Date(0).toISOString(),
    location: input.location,
  };
}

describe("SingleAgentSettings", () => {
  beforeEach(() => {
    statusesState.agentStatuses = [];
    statusesState.wslAgentStatuses = [];
    appState.projects = [];
    sharedSettingsState.disabledAgents = [];
    sharedSettingsState.hiddenModels = {};
    sharedSettingsState.agentSettings = {};
    sharedSettingsState.setAgentDisabled.mockReset();
    sharedSettingsState.setHiddenModels.mockReset();
    sharedSettingsState.setAgentSetting.mockReset();
    refreshAgentStatusesMock.mockReset().mockResolvedValue(undefined);
    setAcpRegistryAgentAuthMock.mockReset().mockResolvedValue({});
    authenticateAcpAgentMock.mockReset().mockResolvedValue(undefined);
    logoutAcpAgentMock.mockReset().mockResolvedValue(undefined);
    focusWindowMock.mockReset().mockResolvedValue(undefined);
    listAcpRegistryMock.mockReset().mockResolvedValue([]);
    getLatestAgentVersionMock.mockReset().mockResolvedValue({});
    updateAgentBinaryMock.mockReset().mockResolvedValue({ ok: true });
    toastMock.danger.mockReset();
    toastMock.success.mockReset();
    runAgentLoginCommandMock.mockReset().mockReturnValue(true);
  });

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

    expect(screen.getByText("user@example.com · Yieldmo · Team Subscription")).toBeInTheDocument();
    // Auth method is intentionally omitted from the summary when richer
    // identity fields are available.
    expect(screen.queryByText("Auth method")).not.toBeInTheDocument();
    expect(screen.queryByText("Claude.ai")).not.toBeInTheDocument();
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

    expect(screen.getByText("2 providers · Copilot, OpenAI")).toBeInTheDocument();
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

  it("shows a login action when the agent reports missing auth", () => {
    statusesState.agentStatuses = [
      makeStatus("gemini", {
        label: "Gemini",
        authState: "missing",
        loginCommand: "gemini auth login",
      }),
    ];

    render(<SingleAgentSettings agentKind="gemini" />);

    expect(screen.getByText("Login required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /login/i }));
    expect(runAgentLoginCommandMock).toHaveBeenCalledWith({
      label: "Gemini",
      command: "gemini auth login",
      onCommandComplete: expect.any(Function),
    });
  });

  it("opens WSL login actions in the matching project distro", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /login/i }));
    expect(runAgentLoginCommandMock).toHaveBeenCalledWith({
      label: "Codex WSL",
      command: "codex login",
      onCommandComplete: expect.any(Function),
      project: wslProject,
    });
  });

  it("shows terminal auth login actions per environment", () => {
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

    expect(screen.getByRole("button", { name: /login windows/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /login wsl \(ubuntu\)/i })).toBeInTheDocument();
    expect(screen.queryByText(/Windows, WSL \(Ubuntu\) needs authentication/u)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /login wsl \(ubuntu\)/i }));

    const loginInput = runAgentLoginCommandMock.mock.calls[0]?.[0];
    expect(loginInput).toEqual({
      label: "Cursor",
      command: "cursor-agent login",
      env: { NO_OPEN_BROWSER: "1" },
      onCommandComplete: expect.any(Function),
      project: wslProject,
    });
    expect(screen.getByRole("status", { name: /logging in/i })).toBeInTheDocument();

    loginInput?.onCommandComplete?.(0);
    expect(refreshAgentStatusesMock).toHaveBeenCalledWith(["Ubuntu"], {
      agentKinds: ["cursor"],
      envs: [{ kind: "wsl", distro: "Ubuntu" }],
    });
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

    expect(screen.getByText("Authentication")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    expect(authenticateAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "acp-generic:sso-agent",
      methodId: "browser-login",
    });
    await waitFor(() => expect(focusWindowMock).toHaveBeenCalled());
    await waitFor(() => expect(refreshAgentStatusesMock).toHaveBeenCalled());
    expect(toastMock.success).toHaveBeenCalledWith("SSO Agent authenticated.");
  });

  it("keeps browser login available when an ACP agent also advertises API key auth", async () => {
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

    expect(screen.getByLabelText("Factory API Key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

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

    expect(screen.getByLabelText("Factory API Key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /logout/i }));

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

    fireEvent.click(screen.getByRole("button", { name: /login wsl \(ubuntu\)/i }));

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

    fireEvent.click(screen.getByRole("button", { name: /login/i }));

    expect(
      screen.getByText(/Waiting for WSL \(Ubuntu\) Login authentication/u),
    ).toBeInTheDocument();

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

    expect(screen.getByText(/Windows · Login required/u)).toBeInTheDocument();
    expect(screen.getByText(/Complete Login sign-in for Windows\./u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /login windows/i })).toBeInTheDocument();
    expect(screen.getByText(/WSL \(Ubuntu\) · Signed in/u)).toBeInTheDocument();
    expect(screen.queryByText(/Windows · Authentication/u)).toBeNull();
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

    // Per-env rows: Windows env gets its own logout action, WSL env gets
    // its own login action. No combined Re-login button across envs.
    expect(screen.getByRole("button", { name: /logout windows/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /login wsl \(ubuntu\)/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-login/i })).toBeNull();
    expect(screen.getByText(/Complete Login sign-in for WSL \(Ubuntu\)\./u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /login wsl \(ubuntu\)/i }));

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

    fireEvent.click(screen.getByRole("button", { name: /logout windows/i }));

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

    fireEvent.click(screen.getByRole("button", { name: /^re-login$/i }));

    expect(authenticateAcpAgentMock).toHaveBeenCalledWith({
      agentKind: "copilot",
      methodId: "github-copilot-login",
      envKind: "windows",
    });
    await waitFor(() => expect(focusWindowMock).toHaveBeenCalled());
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

    fireEvent.click(screen.getByRole("button", { name: /^login$/i }));

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

    fireEvent.click(screen.getByRole("button", { name: /^logout$/i }));

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

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Update to v2026.05.16-0338208 for Cursor (WSL (Ubuntu))",
        }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /for Cursor \(Windows\)/ })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Update to v2026.05.16-0338208 for Cursor (WSL (Ubuntu))",
      }),
    );

    expect(updateAgentBinaryMock).toHaveBeenCalledWith({
      agentKind: "cursor",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });
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
    fireEvent.click(
      await screen.findByRole("button", { name: /Update to v1\.1\.0 for Claude Code/ }),
    );

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
    fireEvent.click(
      await screen.findByRole("button", { name: /Update to v1\.1\.0 for Claude Code/ }),
    );

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
