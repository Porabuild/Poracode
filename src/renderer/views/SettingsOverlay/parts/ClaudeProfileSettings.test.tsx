import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentInstanceConfig,
  AgentStatus,
  ClaudeProfileInstanceConfig,
} from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => {
  const Wrapper = (props: { children?: ReactNode }) => <div>{props.children}</div>;
  // Always render the popover content so its options are testable.
  const Popover = Object.assign(Wrapper, {
    Trigger: Wrapper,
    Content: Wrapper,
    Dialog: Wrapper,
  });
  return {
    Button: (props: {
      children?: ReactNode;
      "aria-label"?: string;
      "aria-pressed"?: boolean;
      isDisabled?: boolean;
      onPress?: () => void;
    }) => (
      <button
        type="button"
        aria-label={props["aria-label"]}
        aria-pressed={props["aria-pressed"]}
        disabled={props.isDisabled}
        onClick={props.onPress}
      >
        {props.children}
      </button>
    ),
    Popover,
    toast: toastMock,
  };
});

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    placeholder?: string;
    value?: string;
    type?: string;
    onChange?: (event: { target: { value: string } }) => void;
    onFocus?: () => void;
    onBlur?: (event: unknown) => void;
    onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      placeholder={props.placeholder}
      type={props.type}
      value={props.value}
      onChange={props.onChange}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
    />
  ),
  PixelLoader: () => <span data-testid="pixel-loader" />,
  // The shared profile list confirms removals before touching settings.
  ConfirmDialog: (props: {
    isOpen: boolean;
    title: string;
    body: unknown;
    confirmLabel: string;
    onConfirm: () => void;
    onClose: () => void;
  }) =>
    props.isOpen ? (
      <div role="alertdialog" aria-label={props.title}>
        <button type="button" onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    ) : null,
}));

const refreshAgentStatusesMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const setProfileEnvironmentMock = vi.hoisted(() =>
  vi.fn<(payload: unknown) => Promise<AgentInstanceConfig>>(),
);
const createProfileMock = vi.hoisted(() =>
  vi.fn<(payload: { id: string; displayName: string }) => Promise<AgentInstanceConfig>>(),
);
const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    refreshAgentStatuses: refreshAgentStatusesMock,
    setProfileEnvironment: setProfileEnvironmentMock,
    createProfile: createProfileMock,
  }),
}));

vi.mock("@/renderer/utils/acpRegistryAuth", () => ({
  currentWslDistros: () => [],
}));

const settingsState = {
  agentInstances: {} as Record<string, AgentInstanceConfig>,
  setAgentInstance: vi.fn<(instance: AgentInstanceConfig) => void>(),
  removeAgentInstance: vi.fn<(id: string) => void>(),
  setHiddenModels: vi.fn<(kind: string, hidden: string[]) => void>(),
};
const statusState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
  removeAgentStatus: vi.fn<(kind: string) => void>(),
};

vi.mock("@/renderer/state/sharedSettingsStore", () => {
  // The shared profile list also reads the store imperatively (snapshot for the
  // removal rollback) and flushes it, so the stub carries those entry points.
  const useSharedSettings = ((selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState)) as unknown as {
    (selector: (state: typeof settingsState) => unknown): unknown;
    getState: () => typeof settingsState;
    setState: (patch: Partial<typeof settingsState>) => void;
  };
  useSharedSettings.getState = () => settingsState;
  useSharedSettings.setState = (patch) => {
    Object.assign(settingsState, patch);
  };
  return { useSharedSettings, flushSharedSettings: flushSharedSettingsMock };
});

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: typeof statusState) => unknown) =>
    selector(statusState),
}));

import { ClaudeProfileProviderSettings, ClaudeProfileSettings } from "./ClaudeProfileSettings";

function claudeProfile(overrides: Partial<AgentInstanceConfig> = {}): AgentInstanceConfig {
  return {
    id: "glm",
    driver: "claude",
    displayName: "GLM",
    config: { configDir: "~/.poracode/claude-profiles/glm" },
    ...overrides,
  };
}

function agentStatus(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "claude:glm",
    label: "Claude GLM",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [
        { id: "claude-opus-4-8", label: "Opus 4.8" },
        { id: "claude-opus-4-7", label: "Opus 4.7" },
        { id: "claude-opus-4-6", label: "Opus 4.6" },
        { id: "sonnet", label: "Sonnet" },
        { id: "haiku", label: "Haiku" },
        { id: "glm-5.2[1m]", label: "GLM 5.2" },
      ],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      settingDefs: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal"],
    },
    ...overrides,
  };
}

describe("ClaudeProfileSettings", () => {
  beforeEach(() => {
    settingsState.agentInstances = {};
    settingsState.setAgentInstance.mockReset();
    settingsState.removeAgentInstance.mockReset();
    settingsState.setHiddenModels.mockReset();
    statusState.agentStatuses = [agentStatus()];
    statusState.wslAgentStatuses = [];
    statusState.removeAgentStatus.mockReset();
    refreshAgentStatusesMock.mockReset().mockResolvedValue();
    setProfileEnvironmentMock.mockReset().mockImplementation(async () => claudeProfile());
    createProfileMock
      .mockReset()
      .mockImplementation(async ({ id, displayName }) => ({ id, driver: "claude", displayName }));
    flushSharedSettingsMock.mockReset().mockResolvedValue();
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
  });

  it("hides the add form until the add button is pressed", () => {
    render(<ClaudeProfileSettings />);
    expect(screen.queryByLabelText("New profile name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));

    expect(screen.getByLabelText("New profile name")).toHaveValue("");
    expect(screen.getByLabelText("New profile name")).toHaveAttribute("placeholder", "e.g. Work");
    expect(screen.getByLabelText("New Claude profile config directory")).toHaveAttribute(
      "placeholder",
      "~/.poracode/claude-profiles/profile",
    );
  });

  it("disables Add until a name is typed and derives the dir placeholder from it", () => {
    render(<ClaudeProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));

    const addButton = screen.getByRole("button", { name: "Create profile" });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Work" },
    });

    expect(addButton).toBeEnabled();
    expect(screen.getByLabelText("New Claude profile config directory")).toHaveAttribute(
      "placeholder",
      "~/.poracode/claude-profiles/work",
    );
  });

  it("adds a profile with the derived config dir when the dir is left empty", async () => {
    render(<ClaudeProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    // Every provider's profile is created through the one sealing main-local
    // write, so a credential-carrying provider needs no separate path.
    await vi.waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith({
        driver: "claude",
        id: "work",
        displayName: "Work",
        config: { configDir: "~/.poracode/claude-profiles/work" },
      }),
    );
    // The form collapses back to the add button after a successful add.
    await vi.waitFor(() =>
      expect(screen.queryByLabelText("New profile name")).not.toBeInTheDocument(),
    );
    expect(toastMock.success).toHaveBeenCalledWith("Profile Work added.");
  });

  it("discards the draft on cancel", () => {
    render(<ClaudeProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel new profile" }));

    expect(screen.queryByLabelText("New profile name")).not.toBeInTheDocument();
    expect(settingsState.setAgentInstance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    expect(screen.getByLabelText("New profile name")).toHaveValue("");
  });

  it("opens a profile's own page from its row", () => {
    settingsState.agentInstances = { glm: claudeProfile() };
    const onOpenProfile = vi.fn<(kind: string) => void>();
    render(<ClaudeProfileSettings onOpenProfile={onOpenProfile} />);

    // The list does not embed the editor — env vars live on the profile page.
    expect(screen.queryByLabelText("Environment variable name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open GLM" }));
    expect(onOpenProfile).toHaveBeenCalledWith("claude:glm");
  });

  it("opens the new profile's page after adding", async () => {
    const onOpenProfile = vi.fn<(kind: string) => void>();
    render(<ClaudeProfileSettings onOpenProfile={onOpenProfile} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await vi.waitFor(() => expect(onOpenProfile).toHaveBeenCalledWith("claude:work"));
  });

  it("removes a profile only after the shared confirmation", async () => {
    settingsState.agentInstances = { glm: claudeProfile() };
    render(<ClaudeProfileSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Remove profile GLM" }));
    // Claude profiles used to delete on the first click; the shared list makes
    // every provider confirm first.
    expect(settingsState.removeAgentInstance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(settingsState.removeAgentInstance).toHaveBeenCalledWith("glm");
    await vi.waitFor(() =>
      expect(statusState.removeAgentStatus).toHaveBeenCalledWith("claude:glm"),
    );
  });
});

describe("ClaudeProfileProviderSettings", () => {
  beforeEach(() => {
    settingsState.agentInstances = { glm: claudeProfile() };
    settingsState.setAgentInstance.mockReset();
    refreshAgentStatusesMock.mockReset().mockResolvedValue();
    setProfileEnvironmentMock.mockReset().mockImplementation(async () => claudeProfile());
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
  });

  it("renders nothing for an unknown instance id", () => {
    const { container } = render(<ClaudeProfileProviderSettings instanceId="missing" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("saves an added env var through the sealing bridge", async () => {
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(screen.getByLabelText("Environment variable name"), {
      target: { value: "ANTHROPIC_BASE_URL" },
    });
    fireEvent.change(screen.getByLabelText("Environment variable value"), {
      target: { value: "https://api.z.ai/api/anthropic" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Claude profile" }));

    expect(setProfileEnvironmentMock).toHaveBeenCalledWith({
      instanceId: "glm",
      environment: { ANTHROPIC_BASE_URL: { value: "https://api.z.ai/api/anthropic" } },
    });
    await waitFor(() => expect(settingsState.setAgentInstance).toHaveBeenCalled());
  });

  it("fills the editor from the z.ai preset", () => {
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.click(screen.getByRole("menuitem", { name: "z.ai" }));

    expect(screen.getByDisplayValue("https://api.z.ai/api/anthropic")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ANTHROPIC_AUTH_TOKEN")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CLAUDE_CODE_AUTO_COMPACT_WINDOW")).toBeInTheDocument();
    // The preset's GLM 5.2 picker model id keeps its [1m] suffix verbatim.
    expect(screen.getByLabelText("Model id")).toHaveValue("glm-5.2[1m]");
    expect(settingsState.setHiddenModels).toHaveBeenCalledWith("claude:glm", [
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "sonnet",
      "haiku",
    ]);
  });

  it("fills the editor from the DeepSeek preset with two models", async () => {
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.click(screen.getByRole("menuitem", { name: "DeepSeek" }));

    expect(screen.getByDisplayValue("https://api.deepseek.com/anthropic")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ANTHROPIC_MODEL")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CLAUDE_CODE_SUBAGENT_MODEL")).toBeInTheDocument();
    expect(
      screen.getAllByLabelText("Model id").map((input) => input.getAttribute("value")),
    ).toEqual(["deepseek-v4-pro-0813[1m]", "deepseek-v4-flash"]);
    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      id: "glm",
      driver: "claude",
      displayName: "GLM",
      config: {
        configDir: "~/.poracode/claude-profiles/glm",
        models: [
          { id: "deepseek-v4-pro-0813[1m]", label: "DeepSeek V4 Pro 0813" },
          { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
        ],
        efforts: ["max"],
        defaultEffort: "max",
        modelEfforts: {
          "deepseek-v4-pro-0813[1m]": ["max"],
          "deepseek-v4-flash": ["max"],
        },
      },
    });
    expect(settingsState.setHiddenModels).toHaveBeenCalledWith("claude:glm", [
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "sonnet",
      "haiku",
      "glm-5.2[1m]",
    ]);
    await waitFor(() => expect(refreshAgentStatusesMock).toHaveBeenCalled());
  });

  it("fills the editor from the MiniMax preset", () => {
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.click(screen.getByRole("menuitem", { name: "MiniMax" }));

    expect(screen.getByDisplayValue("https://api.minimax.io/anthropic")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("CLAUDE_CODE_AUTO_COMPACT_WINDOW")).toBeInTheDocument();
    expect(screen.getByLabelText("Model id")).toHaveValue("MiniMax-M3");
  });

  it("fills the editor from the Kimi Code preset", () => {
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Kimi Code" }));

    expect(screen.getByDisplayValue("https://api.kimi.com/coding/")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ANTHROPIC_API_KEY")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CLAUDE_CODE_AUTO_COMPACT_WINDOW")).toBeInTheDocument();
    expect(
      screen.getAllByLabelText("Model id").map((input) => input.getAttribute("value")),
    ).toEqual(["k3[1m]", "kimi-for-coding", "kimi-for-coding-highspeed"]);
    const applied = settingsState.setAgentInstance.mock.calls.at(-1)?.[0];
    const appliedConfig = applied?.config as ClaudeProfileInstanceConfig | undefined;
    expect(appliedConfig?.models).toEqual([
      { id: "k3[1m]", label: "Kimi K3 (1M)" },
      { id: "kimi-for-coding", label: "Kimi K2.7 Code" },
      { id: "kimi-for-coding-highspeed", label: "Kimi K2.7 Code HighSpeed" },
    ]);
    expect(applied?.config).toMatchObject({
      configDir: "~/.poracode/claude-profiles/glm",
      efforts: ["low", "high", "max", "ultracode"],
      defaultEffort: "high",
      modelEfforts: {
        "k3[1m]": ["low", "high", "max", "ultracode"],
        "kimi-for-coding": ["high"],
      },
    });
  });

  it("fills the editor from the Qwen Token Plan preset", () => {
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.click(screen.getByRole("menuitem", { name: "Qwen Token Plan" }));

    expect(
      screen.getByDisplayValue(
        "https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic",
      ),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("ANTHROPIC_MODEL")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CLAUDE_CODE_SUBAGENT_MODEL")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Model id").at(0)).toHaveValue("qwen3.8-max");
    const applied = settingsState.setAgentInstance.mock.calls.at(-1)?.[0];
    const config = applied?.config as ClaudeProfileInstanceConfig | undefined;
    expect(config?.models?.map((model) => model.id)).toEqual([
      "qwen3.8-max",
      "qwen3.7-max",
      "qwen3.7-plus",
      "qwen3.6-flash",
      "glm-5.2",
      "deepseek-v4-pro-0813",
      "deepseek-v4-flash-0731",
    ]);
    expect(config).toMatchObject({
      configDir: "~/.poracode/claude-profiles/glm",
      efforts: ["low", "medium", "high", "xHigh", "max"],
      defaultEffort: "xHigh",
      modelEfforts: {
        "qwen3.8-max": ["low", "medium", "xHigh"],
        "qwen3.7-max": [],
        "qwen3.7-plus": [],
        "qwen3.6-flash": [],
        "glm-5.2": ["high", "max"],
        "deepseek-v4-pro-0813": ["high", "max"],
        "deepseek-v4-flash-0731": ["low", "high", "max"],
      },
    });
  });

  it("masks an already-sealed secret value", () => {
    settingsState.agentInstances = {
      glm: claudeProfile({
        environment: { ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true } },
      }),
    };
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    expect(screen.getByDisplayValue("ANTHROPIC_AUTH_TOKEN")).toBeInTheDocument();
    expect(screen.getByLabelText("Environment variable value")).toHaveValue("••••••••");
  });

  it("keeps a saved sealed secret when the masked field is focused but not replaced", async () => {
    settingsState.agentInstances = {
      glm: claudeProfile({
        environment: { ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true } },
      }),
    };
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.focus(screen.getByLabelText("Environment variable value"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Claude profile" }));
    });

    expect(setProfileEnvironmentMock).toHaveBeenCalledWith({
      instanceId: "glm",
      environment: {
        ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true },
      },
    });
  });

  it("persists model and effort overrides as profile config", async () => {
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.click(screen.getByRole("button", { name: /add model/i }));
    fireEvent.change(screen.getByLabelText("Model id"), { target: { value: "glm-5.2" } });
    fireEvent.click(screen.getByRole("option", { name: /disable low effort/i }));

    fireEvent.click(screen.getByRole("button", { name: "Save Claude profile" }));

    await waitFor(() => expect(settingsState.setAgentInstance).toHaveBeenCalled());
    const saved = settingsState.setAgentInstance.mock.calls.at(-1)?.[0];
    expect(saved?.config).toEqual({
      configDir: "~/.poracode/claude-profiles/glm",
      models: [{ id: "glm-5.2" }],
      efforts: ["medium", "high", "xHigh", "max", "ultracode"],
    });
  });

  it("configures and persists an effort override on an individual model row", async () => {
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.click(screen.getByRole("button", { name: /add model/i }));
    fireEvent.change(screen.getByLabelText("Model id"), { target: { value: "glm-5.2" } });

    expect(screen.getByRole("button", { name: "Effort levels for glm-5.2" })).toHaveTextContent(
      "Inherit global",
    );
    fireEvent.click(screen.getByRole("option", { name: "High" }));

    fireEvent.click(screen.getByRole("button", { name: "Save Claude profile" }));

    await waitFor(() => expect(settingsState.setAgentInstance).toHaveBeenCalled());
    expect(settingsState.setAgentInstance.mock.calls.at(-1)?.[0]?.config).toEqual({
      configDir: "~/.poracode/claude-profiles/glm",
      models: [{ id: "glm-5.2" }],
      modelEfforts: { "glm-5.2": ["high"] },
    });
  });

  it("can reset a saved model effort override to inherit the global list", async () => {
    settingsState.agentInstances = {
      glm: claudeProfile({
        config: {
          configDir: "~/.poracode/claude-profiles/glm",
          models: [{ id: "glm-5.2", label: "GLM 5.2" }],
          modelEfforts: { "glm-5.2": ["high"] },
        },
      }),
    };
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    expect(screen.getByRole("button", { name: "Effort levels for GLM 5.2" })).toHaveTextContent(
      "High",
    );
    fireEvent.click(screen.getByRole("option", { name: "Inherit global" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Claude profile" }));

    await waitFor(() => expect(settingsState.setAgentInstance).toHaveBeenCalled());
    expect(settingsState.setAgentInstance.mock.calls.at(-1)?.[0]?.config).toEqual({
      configDir: "~/.poracode/claude-profiles/glm",
      models: [{ id: "glm-5.2", label: "GLM 5.2" }],
    });
  });
});
