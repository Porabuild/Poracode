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
    onPress?: () => void;
  }) => (
    <button
      type="button"
      aria-label={props["aria-label"]}
      disabled={props.isDisabled}
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

// The base Codex page embeds its context-window settings; keep them inert here.
vi.mock("@/renderer/components/providers/settings/CodexProviderSettings", () => ({
  CodexProviderSettings: () => <div data-testid="codex-provider-settings" />,
}));

const refreshAgentStatusesMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const createProfileMock = vi.hoisted(() =>
  vi.fn<(payload: { id: string; displayName: string }) => Promise<AgentInstanceConfig>>(),
);
const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

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
  CodexAgentSettingsPanel,
  CodexProfileProviderSettings,
  CodexProfileSettings,
  defaultCodexHomeDir,
} from "./profileSettings";

function codexProfile(overrides: Partial<AgentInstanceConfig> = {}): AgentInstanceConfig {
  return {
    id: "work",
    driver: "codex",
    displayName: "Work",
    config: { homeDir: "~/.poracode/codex-profiles/work" },
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
    .mockImplementation(async ({ id, displayName }) => ({ id, driver: "codex", displayName }));
  flushSharedSettingsMock.mockReset().mockResolvedValue();
  toastMock.success.mockReset();
  toastMock.danger.mockReset();
});

describe("defaultCodexHomeDir", () => {
  it("derives a tilde-relative home from the allocated profile id", () => {
    expect(defaultCodexHomeDir("work-account-2")).toBe("~/.poracode/codex-profiles/work-account-2");
  });
});

describe("CodexProfileSettings", () => {
  it("adds a profile with the derived home dir when the field is left empty", async () => {
    render(<CodexProfileSettings />);
    fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
    expect(screen.getByLabelText("New Codex profile home directory")).toHaveAttribute(
      "placeholder",
      "~/.poracode/codex-profiles/profile",
    );
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await vi.waitFor(() =>
      expect(createProfileMock).toHaveBeenCalledWith({
        driver: "codex",
        id: "work",
        displayName: "Work",
        config: { homeDir: "~/.poracode/codex-profiles/work" },
      }),
    );
    expect(toastMock.success).toHaveBeenCalledWith("Profile Work added.");
  });

  it.each([
    ["Review Work 1", "Review Work-1", "review-work-1", "review-work-1-2"],
    ["Работа", "仕事", "profile", "profile-2"],
  ])(
    "keeps the default homes of %s and %s apart even though their names slugify alike",
    async (firstName, secondName, firstId, secondId) => {
      settingsState.agentInstances = {
        [firstId]: codexProfile({
          id: firstId,
          displayName: firstName,
          config: { homeDir: defaultCodexHomeDir(firstId) },
        }),
      };
      render(<CodexProfileSettings />);
      fireEvent.click(screen.getByRole("button", { name: /add profile/i }));
      fireEvent.change(screen.getByLabelText("New profile name"), {
        target: { value: secondName },
      });
      // The live default shown to the user is the one that gets persisted.
      expect(screen.getByLabelText("New Codex profile home directory")).toHaveAttribute(
        "placeholder",
        `~/.poracode/codex-profiles/${secondId}`,
      );
      fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

      await vi.waitFor(() =>
        expect(createProfileMock).toHaveBeenCalledWith({
          driver: "codex",
          id: secondId,
          displayName: secondName,
          config: { homeDir: `~/.poracode/codex-profiles/${secondId}` },
        }),
      );
      expect(defaultCodexHomeDir(secondId)).not.toBe(defaultCodexHomeDir(firstId));
    },
  );

  it("lists a profile with its home dir and opens its page", () => {
    settingsState.agentInstances = { work: codexProfile() };
    const onOpenProfile = vi.fn<(kind: string) => void>();
    render(<CodexProfileSettings onOpenProfile={onOpenProfile} />);

    expect(screen.getByText("~/.poracode/codex-profiles/work")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Work" }));
    expect(onOpenProfile).toHaveBeenCalledWith("codex:work");
  });

  it("removes a profile only after confirmation", async () => {
    settingsState.agentInstances = { work: codexProfile() };
    render(<CodexProfileSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Remove profile Work" }));
    expect(settingsState.removeAgentInstance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(settingsState.removeAgentInstance).toHaveBeenCalledWith("work");
    await vi.waitFor(() =>
      expect(statusState.removeAgentStatus).toHaveBeenCalledWith("codex:work"),
    );
  });
});

describe("CodexProfileProviderSettings", () => {
  it("renders nothing for an unknown instance id", () => {
    const { container } = render(<CodexProfileProviderSettings instanceId="missing" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("saves an edited name and home directory and refreshes the profile", async () => {
    settingsState.agentInstances = { work: codexProfile() };
    render(<CodexProfileProviderSettings instanceId="work" />);

    const saveButton = screen.getByRole("button", { name: "Save Codex profile" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Codex profile home directory"), {
      target: { value: "~/.codex-work" },
    });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      ...codexProfile(),
      config: { homeDir: "~/.codex-work" },
    });
    expect(toastMock.success).toHaveBeenCalledWith("Codex Work profile saved.");
    await vi.waitFor(() =>
      expect(refreshAgentStatusesMock).toHaveBeenCalledWith([], { agentKinds: ["codex:work"] }),
    );
  });
});

describe("CodexProfileProviderSettings home changes", () => {
  const warning = /This profile already has threads/;

  it("saves a home change directly when the profile has no threads", () => {
    settingsState.agentInstances = { work: codexProfile() };
    appState.threads = [{ id: "t1", agentKind: "codex:other" }];
    render(<CodexProfileProviderSettings instanceId="work" />);

    fireEvent.change(screen.getByLabelText("Codex profile home directory"), {
      target: { value: "~/.codex-work" },
    });
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Codex profile" }));
    expect(settingsState.setAgentInstance).toHaveBeenCalledTimes(1);
  });

  it("warns and asks before moving the home of a profile that has threads", () => {
    settingsState.agentInstances = { work: codexProfile() };
    appState.threads = [{ id: "t1", agentKind: "codex:work" }];
    render(<CodexProfileProviderSettings instanceId="work" />);

    // A rename alone keeps the home, so it neither warns nor asks.
    fireEvent.change(screen.getByLabelText("Codex profile name"), {
      target: { value: "Work 2" },
    });
    expect(screen.queryByText(warning)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Codex profile home directory"), {
      target: { value: "~/.codex-work" },
    });
    expect(screen.getByText(warning)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Codex profile" }));
    expect(settingsState.setAgentInstance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Change home" }));
    expect(settingsState.setAgentInstance).toHaveBeenCalledWith({
      ...codexProfile(),
      displayName: "Work 2",
      config: { homeDir: "~/.codex-work" },
    });
  });
});

describe("CodexAgentSettingsPanel", () => {
  it("shows context windows plus the profile list on the base Codex page", () => {
    render(<CodexAgentSettingsPanel agentKind="codex" statuses={[]} wslDistros={[]} />);
    expect(screen.getByTestId("codex-provider-settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add profile/i })).toBeInTheDocument();
  });

  it("shows the profile editor on a profile page", () => {
    settingsState.agentInstances = { work: codexProfile() };
    render(<CodexAgentSettingsPanel agentKind="codex:work" statuses={[]} wslDistros={[]} />);
    expect(screen.queryByTestId("codex-provider-settings")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Codex profile home directory")).toHaveValue(
      "~/.poracode/codex-profiles/work",
    );
  });
});
