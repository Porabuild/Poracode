import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig, AgentStatus } from "@/shared/contracts";

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
  }) => (
    <input
      aria-label={props["aria-label"]}
      placeholder={props.placeholder}
      type={props.type}
      value={props.value}
      onChange={props.onChange}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
    />
  ),
}));

const refreshAgentStatusesMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const setClaudeProfileEnvironmentMock = vi.hoisted(() =>
  vi.fn<(payload: unknown) => Promise<AgentInstanceConfig>>(),
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    refreshAgentStatuses: refreshAgentStatusesMock,
    setClaudeProfileEnvironment: setClaudeProfileEnvironmentMock,
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

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
}));

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
    config: { configDir: "~/.lightcode/claude-profiles/glm" },
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
    setClaudeProfileEnvironmentMock.mockReset().mockImplementation(async () => claudeProfile());
    toastMock.success.mockReset();
    toastMock.danger.mockReset();
  });

  it("hides the add form until the add button is pressed", () => {
    render(<ClaudeProfileSettings />);
    expect(screen.queryByLabelText("New Claude profile name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));

    expect(screen.getByLabelText("New Claude profile name")).toHaveValue("");
    expect(screen.getByLabelText("New Claude profile name")).toHaveAttribute(
      "placeholder",
      "e.g. Work",
    );
    expect(screen.getByLabelText("New Claude profile config directory")).toHaveAttribute(
      "placeholder",
      "~/.lightcode/claude-profiles/profile",
    );
  });

  it("disables Add until a name is typed and derives the dir placeholder from it", () => {
    render(<ClaudeProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));

    const addButton = screen.getByRole("button", { name: "Add Claude profile" });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("New Claude profile name"), {
      target: { value: "Work" },
    });

    expect(addButton).toBeEnabled();
    expect(screen.getByLabelText("New Claude profile config directory")).toHaveAttribute(
      "placeholder",
      "~/.lightcode/claude-profiles/work",
    );
  });

  it("adds a profile with the derived config dir when the dir is left empty", () => {
    render(<ClaudeProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText("New Claude profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Claude profile" }));

    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      id: "work",
      driver: "claude",
      displayName: "Work",
      config: { configDir: "~/.lightcode/claude-profiles/work" },
    });
    // The form collapses back to the add button after a successful add.
    expect(screen.queryByLabelText("New Claude profile name")).not.toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith("Claude Work profile added.");
  });

  it("discards the draft on cancel", () => {
    render(<ClaudeProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText("New Claude profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel new Claude profile" }));

    expect(screen.queryByLabelText("New Claude profile name")).not.toBeInTheDocument();
    expect(settingsState.setAgentInstance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    expect(screen.getByLabelText("New Claude profile name")).toHaveValue("");
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

  it("opens the new profile's page after adding", () => {
    const onOpenProfile = vi.fn<(kind: string) => void>();
    render(<ClaudeProfileSettings onOpenProfile={onOpenProfile} />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    fireEvent.change(screen.getByLabelText("New Claude profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Claude profile" }));

    expect(onOpenProfile).toHaveBeenCalledWith("claude:work");
  });

  it("removes a profile from settings and agent statuses", () => {
    settingsState.agentInstances = { glm: claudeProfile() };
    render(<ClaudeProfileSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Claude profile" }));

    expect(settingsState.removeAgentInstance).toHaveBeenCalledWith("glm");
    expect(statusState.removeAgentStatus).toHaveBeenCalledWith("claude:glm");
  });
});

describe("ClaudeProfileProviderSettings", () => {
  beforeEach(() => {
    settingsState.agentInstances = { glm: claudeProfile() };
    settingsState.setAgentInstance.mockReset();
    refreshAgentStatusesMock.mockReset().mockResolvedValue();
    setClaudeProfileEnvironmentMock.mockReset().mockImplementation(async () => claudeProfile());
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

    expect(setClaudeProfileEnvironmentMock).toHaveBeenCalledWith({
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
    ).toEqual(["deepseek-v4-pro[1m]", "deepseek-v4-flash"]);
    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      id: "glm",
      driver: "claude",
      displayName: "GLM",
      config: {
        configDir: "~/.lightcode/claude-profiles/glm",
        models: [
          { id: "deepseek-v4-pro[1m]", label: "DeepSeek V4 Pro" },
          { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
        ],
        efforts: ["max"],
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

  it("keeps a saved sealed secret when the masked field is focused but not replaced", () => {
    settingsState.agentInstances = {
      glm: claudeProfile({
        environment: { ANTHROPIC_AUTH_TOKEN: { value: "lc-safe:v1:sealed", sensitive: true } },
      }),
    };
    render(<ClaudeProfileProviderSettings instanceId="glm" />);

    fireEvent.focus(screen.getByLabelText("Environment variable value"));
    fireEvent.click(screen.getByRole("button", { name: "Save Claude profile" }));

    expect(setClaudeProfileEnvironmentMock).toHaveBeenCalledWith({
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
      configDir: "~/.lightcode/claude-profiles/glm",
      models: [{ id: "glm-5.2" }],
      efforts: ["medium", "high", "xHigh", "max", "ultracode"],
    });
  });
});
