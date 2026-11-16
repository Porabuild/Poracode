import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInstanceConfig, AgentStatus } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => ({
  Button: (props: {
    children?: ReactNode;
    "aria-label"?: string;
    isDisabled?: boolean;
    isPending?: boolean;
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      disabled={props.isDisabled}
      data-pending={props.isPending ? "true" : undefined}
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
  toast: toastMock,
}));

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    placeholder?: string;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
    onKeyDown?: (event: { key: string; preventDefault: () => void }) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
      onKeyDown={props.onKeyDown}
    />
  ),
  PixelLoader: () => <span data-testid="pixel-loader" />,
  ConfirmDialog: (props: {
    isOpen: boolean;
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
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
const createProfileMock = vi.hoisted(() =>
  vi.fn<(payload: { id: string; displayName: string }) => Promise<AgentInstanceConfig>>(),
);
const flushSharedSettingsMock = vi.hoisted(() =>
  vi.fn<(options?: { requireSuccess?: boolean }) => Promise<void>>(),
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    refreshAgentStatuses: refreshAgentStatusesMock,
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
};
const statusState = {
  agentStatuses: [] as AgentStatus[],
  wslAgentStatuses: [] as AgentStatus[],
  removeAgentStatus: vi.fn<(kind: string) => void>(),
};

vi.mock("@/renderer/state/sharedSettingsStore", () => {
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

const appState = {
  threads: [] as Array<{ id: string; agentKind: string }>,
};
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock("@/renderer/state/agentStatusesStore", () => ({
  useAgentStatusesStore: (selector: (state: typeof statusState) => unknown) =>
    selector(statusState),
}));

import {
  GeminiAgentSettingsPanel,
  GeminiProfileProviderSettings,
  GeminiProfileSettings,
  defaultGeminiHomeDir,
} from "./profileSettings";

function geminiProfile(overrides: Partial<AgentInstanceConfig> = {}): AgentInstanceConfig {
  return {
    id: "work",
    driver: "gemini",
    displayName: "Work",
    config: { homeDir: "~/.poracode/gemini-profiles/work" },
    ...overrides,
  };
}

beforeEach(() => {
  appState.threads = [];
  settingsState.agentInstances = {};
  settingsState.setAgentInstance.mockReset();
  settingsState.removeAgentInstance.mockReset();
  statusState.agentStatuses = [];
  statusState.wslAgentStatuses = [];
  statusState.removeAgentStatus.mockReset();
  refreshAgentStatusesMock.mockReset().mockResolvedValue();
  createProfileMock
    .mockReset()
    .mockImplementation(async ({ id, displayName }) => ({ id, driver: "gemini", displayName }));
  flushSharedSettingsMock.mockReset().mockResolvedValue();
  toastMock.success.mockReset();
  toastMock.danger.mockReset();
});

describe("defaultGeminiHomeDir", () => {
  it("derives a tilde-relative home from the allocated profile id", () => {
    expect(defaultGeminiHomeDir("work-account-2")).toBe(
      "~/.poracode/gemini-profiles/work-account-2",
    );
  });
});

describe("GeminiProfileSettings", () => {
  it("adds a profile with the derived home dir when the field is left empty", async () => {
    render(<GeminiProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    expect(screen.getByLabelText("New Gemini profile home directory")).toHaveAttribute(
      "placeholder",
      "~/.poracode/gemini-profiles/profile",
    );
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await vi.waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith({
        driver: "gemini",
        id: "work",
        displayName: "Work",
        config: { homeDir: "~/.poracode/gemini-profiles/work" },
      }),
    );
    expect(toastMock.success).toHaveBeenCalledWith("Profile Work added.");
  });

  it("lists a profile with its home dir and opens its page", () => {
    settingsState.agentInstances = { work: geminiProfile() };
    const onOpenProfile = vi.fn<(kind: string) => void>();
    render(<GeminiProfileSettings onOpenProfile={onOpenProfile} />);

    expect(screen.getByText("~/.poracode/gemini-profiles/work")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Work" }));
    expect(onOpenProfile).toHaveBeenCalledWith("gemini:work");
  });

  it("removes a profile only after confirmation", async () => {
    settingsState.agentInstances = { work: geminiProfile() };
    render(<GeminiProfileSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Remove profile Work" }));
    expect(settingsState.removeAgentInstance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(settingsState.removeAgentInstance).toHaveBeenCalledWith("work");
    await vi.waitFor(() =>
      expect(statusState.removeAgentStatus).toHaveBeenCalledWith("gemini:work"),
    );
  });
});

describe("GeminiProfileProviderSettings", () => {
  it("renders nothing for an unknown instance id", () => {
    const { container } = render(<GeminiProfileProviderSettings instanceId="missing" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a repairable editor with an inline warning when config is malformed", async () => {
    const broken = geminiProfile({ config: { homeDir: 123 as unknown as string } });
    settingsState.agentInstances = { work: broken };
    render(<GeminiProfileProviderSettings instanceId="work" />);

    expect(screen.getByText(/The stored configuration is invalid/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Gemini profile home directory")).toHaveValue(
      "~/.poracode/gemini-profiles/work",
    );
    const saveButton = screen.getByRole("button", { name: "Save Gemini profile" });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await vi.waitFor(() =>
      expect(flushSharedSettingsMock).toHaveBeenCalledWith({ requireSuccess: true }),
    );
    expect(settingsState.setAgentInstance).toHaveBeenCalledWith(geminiProfile());
  });

  it("saves an edited name and home directory asynchronously and refreshes the profile", async () => {
    settingsState.agentInstances = { work: geminiProfile() };
    render(<GeminiProfileProviderSettings instanceId="work" />);

    const saveButton = screen.getByRole("button", { name: "Save Gemini profile" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Gemini profile home directory"), {
      target: { value: "~/.gemini-work" },
    });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      ...geminiProfile(),
      config: { homeDir: "~/.gemini-work" },
    });
    await vi.waitFor(() =>
      expect(flushSharedSettingsMock).toHaveBeenCalledWith({ requireSuccess: true }),
    );
    await vi.waitFor(() =>
      expect(refreshAgentStatusesMock).toHaveBeenCalledWith([], { agentKinds: ["gemini:work"] }),
    );
    await vi.waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Gemini Work profile saved."),
    );
  });

  it("rolls back and shows an error toast if persisting settings fails", async () => {
    const initial = geminiProfile();
    settingsState.agentInstances = { work: initial };
    flushSharedSettingsMock.mockRejectedValueOnce(new Error("Disk full"));
    render(<GeminiProfileProviderSettings instanceId="work" />);

    fireEvent.change(screen.getByLabelText("Gemini profile home directory"), {
      target: { value: "~/.gemini-work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Gemini profile" }));

    await vi.waitFor(() => expect(toastMock.danger).toHaveBeenCalledWith("Disk full"));
    expect(settingsState.setAgentInstance).toHaveBeenNthCalledWith(1, {
      ...initial,
      config: { homeDir: "~/.gemini-work" },
    });
    expect(settingsState.setAgentInstance).toHaveBeenNthCalledWith(2, initial);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(refreshAgentStatusesMock).not.toHaveBeenCalled();
  });

  it("warns before moving the home of a profile that has threads", async () => {
    settingsState.agentInstances = { work: geminiProfile() };
    appState.threads = [{ id: "t1", agentKind: "gemini:work" }];
    render(<GeminiProfileProviderSettings instanceId="work" />);

    fireEvent.change(screen.getByLabelText("Gemini profile home directory"), {
      target: { value: "~/.gemini-work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Gemini profile" }));
    expect(settingsState.setAgentInstance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Change home" }));
    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      ...geminiProfile(),
      config: { homeDir: "~/.gemini-work" },
    });
    await vi.waitFor(() =>
      expect(flushSharedSettingsMock).toHaveBeenCalledWith({ requireSuccess: true }),
    );
  });
});

describe("GeminiAgentSettingsPanel", () => {
  it("shows the profile list on the base Gemini page and the editor on a profile page", () => {
    render(<GeminiAgentSettingsPanel agentKind="gemini" statuses={[]} wslDistros={[]} />);
    expect(screen.getByRole("button", { name: /add profile/i })).toBeInTheDocument();

    settingsState.agentInstances = { work: geminiProfile() };
    render(<GeminiAgentSettingsPanel agentKind="gemini:work" statuses={[]} wslDistros={[]} />);
    expect(screen.getByLabelText("Gemini profile home directory")).toHaveValue(
      "~/.poracode/gemini-profiles/work",
    );
  });
});
