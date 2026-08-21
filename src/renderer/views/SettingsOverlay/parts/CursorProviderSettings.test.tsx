import { act, fireEvent, screen } from "@testing-library/react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", async () => {
  const React = await import("react");
  const RadioGroupContext = React.createContext<{
    isDisabled: boolean | undefined;
    onChange: ((value: string) => void) | undefined;
    value: string | undefined;
  }>({
    isDisabled: undefined,
    onChange: undefined,
    value: undefined,
  });

  function RadioGroup(props: {
    children?: ReactNode;
    "aria-label"?: string;
    isDisabled?: boolean;
    onChange?: (value: string) => void;
    value?: string;
  }) {
    return (
      <RadioGroupContext.Provider
        value={{
          isDisabled: props.isDisabled,
          onChange: props.onChange,
          value: props.value,
        }}
      >
        <div role="radiogroup" aria-label={props["aria-label"]}>
          {props.children}
        </div>
      </RadioGroupContext.Provider>
    );
  }

  function Radio(props: { children?: ReactNode; isDisabled?: boolean; value: string }) {
    const group = React.useContext(RadioGroupContext);
    return (
      <label>
        <input
          type="radio"
          checked={group.value === props.value}
          disabled={group.isDisabled || props.isDisabled}
          value={props.value}
          onChange={() => group.onChange?.(props.value)}
        />
        {props.children}
      </label>
    );
  }
  Radio.Content = (props: { children?: ReactNode }) => <span>{props.children}</span>;

  return {
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
        data-pending={props.isPending || undefined}
        onClick={props.onPress}
      >
        {props.children}
      </button>
    ),
    Radio,
    RadioGroup,
    toast: toastMock,
  };
});

vi.mock("@/renderer/components/common", async () => {
  const React = await import("react");
  return {
    Input: React.forwardRef<
      HTMLInputElement,
      {
        "aria-label"?: string;
        value: string;
        disabled?: boolean;
        placeholder?: string;
        onChange: (event: ChangeEvent<HTMLInputElement>) => void;
        onFocus?: () => void;
        onBlur?: () => void;
        onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
      }
    >((props, ref) => (
      <input
        ref={ref}
        aria-label={props["aria-label"]}
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={props.onChange}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        onKeyDown={props.onKeyDown}
      />
    )),
    PixelLoader: () => <span data-testid="pixel-loader" />,
    // Destructive profile removal routes through the shared confirm dialog, so
    // the stub renders its real actions instead of swallowing them.
    ConfirmDialog: (props: {
      isOpen: boolean;
      title: string;
      body: ReactNode;
      confirmLabel: string;
      onConfirm: () => void;
      onClose: () => void;
    }) =>
      props.isOpen ? (
        <div role="alertdialog" aria-label={props.title}>
          <div>{props.body}</div>
          <button type="button" onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
        </div>
      ) : null,
  };
});

const bridgeMock = vi.hoisted(() => ({
  refreshAgentStatuses: vi.fn<(...args: unknown[]) => Promise<void>>(),
  getLatestAgentVersion:
    vi.fn<(payload: unknown) => Promise<{ version?: string; source?: string }>>(),
  setProfileEnvironment:
    vi.fn<
      (payload: { instanceId: string; environment: unknown }) => Promise<AgentInstanceConfig>
    >(),
  createProfile:
    vi.fn<
      (payload: {
        driver: string;
        id: string;
        displayName: string;
        environment?: unknown;
      }) => Promise<AgentInstanceConfig>
    >(),
}));
const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const setAgentSettingMock = vi.hoisted(() =>
  vi.fn<(agentKind: string, key: string, value: boolean | string) => void>(),
);
const setAgentSecretSettingMock = vi.hoisted(() =>
  vi.fn<(agentKind: string, key: string, value: string) => Promise<boolean>>(),
);
const setAgentInstanceMock = vi.hoisted(() => vi.fn<(instance: AgentInstanceConfig) => void>());
const removeAgentInstanceMock = vi.hoisted(() => vi.fn<(instanceId: string) => void>());
const runAgentInstallCommandMock = vi.hoisted(() =>
  vi.fn<
    (input: {
      label: string;
      command: unknown;
      onCommandComplete?: (exitCode: number) => void;
      purpose?: string;
    }) => boolean
  >(),
);

vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentInstallCommand: runAgentInstallCommandMock,
  runAgentLoginCommand: vi.fn<(input: unknown) => boolean>(() => true),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
  isMac: () => false,
  isWindows: () => false,
}));

vi.mock("@/renderer/state/sharedSettingsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/sharedSettingsStore")>();
  return { ...actual, flushSharedSettings: flushSharedSettingsMock };
});

import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { CursorProviderSettings } from "./CursorProviderSettings";
import { NATIVE_AGENT_REGISTRY_ENTRIES } from "./agentRegistryNative";
import type { AgentCapability, AgentInstanceConfig, AgentStatus } from "@/shared/contracts";

const runtimeCapabilities: AgentCapability = {
  models: [
    { id: "composer-2.5", label: "Composer 2.5" },
    { id: "gpt-5.6", label: "GPT-5.6" },
  ],
  efforts: ["low", "medium", "high"],
  modelEfforts: { "composer-2.5": [], "gpt-5.6": ["low", "medium", "high"] },
  contextSizes: [
    { id: "272k", label: "272K" },
    { id: "1m", label: "1M" },
  ],
  modelContextSizes: { "gpt-5.6": ["272k", "1m"] },
  fastModels: ["gpt-5.6"],
  thinkingModels: ["gpt-5.6"],
  modes: ["agent", "plan"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: false,
  liveInputMode: "server",
  presentationMode: "gui",
  settingDefs: [],
};

const runtimeStatus: AgentStatus = {
  kind: "cursor",
  label: "Cursor",
  installed: true,
  authState: "authenticated",
  capabilities: runtimeCapabilities,
  runtimeVariants: {
    acp: {
      presentationMode: "gui",
      installed: true,
      authState: "authenticated",
      authUsesProviderLogin: true,
      capabilities: runtimeCapabilities,
    },
    sdk: {
      presentationMode: "gui",
      installed: true,
      version: "1.0.24",
      installationSource: "global-npm",
      authState: "authenticated",
      authUsesProviderLogin: false,
      capabilities: { ...runtimeCapabilities, runtimeLabel: "SDK" },
    },
  },
};

beforeEach(() => {
  bridgeMock.refreshAgentStatuses.mockReset().mockResolvedValue(undefined);
  // The SDK row only offers an update when npm publishes a newer supported
  // release than the detected one (1.0.24 in these fixtures).
  bridgeMock.getLatestAgentVersion
    .mockReset()
    .mockResolvedValue({ version: "1.0.31", source: "npm" });
  bridgeMock.setProfileEnvironment.mockReset().mockImplementation(async ({ instanceId }) => ({
    id: instanceId,
    driver: "cursor",
    displayName: "Work",
    environment: { CURSOR_API_KEY: { value: "lc-safe:encrypted", sensitive: true } },
  }));
  bridgeMock.createProfile.mockReset().mockImplementation(async ({ id, displayName }) => ({
    id,
    driver: "cursor",
    displayName,
    environment: { CURSOR_API_KEY: { value: "lc-safe:encrypted", sensitive: true } },
  }));
  flushSharedSettingsMock.mockReset().mockResolvedValue(undefined);
  setAgentSettingMock.mockReset();
  setAgentSecretSettingMock.mockReset().mockResolvedValue(true);
  setAgentInstanceMock.mockReset();
  removeAgentInstanceMock.mockReset();
  runAgentInstallCommandMock.mockReset().mockReturnValue(true);
  toastMock.danger.mockReset();
  toastMock.success.mockReset();
  useSharedSettings.setState({
    agentSettings: {},
    agentInstances: {},
    setAgentSetting: setAgentSettingMock,
    setAgentSecretSetting: setAgentSecretSettingMock,
    setAgentInstance: setAgentInstanceMock,
    removeAgentInstance: removeAgentInstanceMock,
  });
});

describe("CursorProviderSettings", () => {
  it("registers the provider-local panel for Cursor", () => {
    expect(
      NATIVE_AGENT_REGISTRY_ENTRIES.find((entry) => entry.id === "cursor")?.settingsPanel,
    ).toBe(CursorProviderSettings);
  });

  it("defaults to ACP and disables SDK until it is installed and authenticated", () => {
    render(<CursorProviderSettings agentKind="cursor" wslDistros={[]} />);

    const acpRuntime = screen.getByRole("radio", { name: /ACP/ });
    const sdkRuntime = screen.getByRole("radio", { name: /SDK/ });
    expect(screen.getByRole("radiogroup", { name: "Structured runtime" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(acpRuntime).toBeChecked();
    expect(sdkRuntime).not.toBeChecked();
    expect(acpRuntime).toBeDisabled();
    expect(sdkRuntime).toBeDisabled();
  });

  it("keeps Cursor CLI sign-in out of the panel so the environment rows own it", () => {
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    expect(screen.queryByRole("button", { name: /Re-login|Logout/ })).toBeNull();
    expect(screen.queryByText("ACP authentication")).toBeNull();
  });

  it("places the handed-over environment rows inside the ACP runtime card", () => {
    render(
      <CursorProviderSettings
        agentKind="cursor"
        statuses={[runtimeStatus]}
        wslDistros={[]}
        installRows={<div data-testid="env-rows">Default v1.2.3</div>}
      />,
    );

    const envRows = screen.getByTestId("env-rows");
    const acpCard = screen.getByRole("radio", { name: /ACP/ }).closest("div");
    expect(acpCard?.contains(envRows)).toBe(true);
    expect(screen.getByTestId("env-rows")).toBeInTheDocument();
  });

  it("loads the saved SDK runtime and masks a saved API key", () => {
    useSharedSettings.setState({
      agentSettings: {
        cursor: {
          structuredRuntime: "sdk",
          sdkApiKey: "lc-safe:encrypted",
        },
      },
    });

    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    expect(screen.getByRole("radio", { name: /SDK/ })).toBeChecked();
    // A stored key renders as a mask, like the ACP credential fields.
    expect(screen.getByLabelText("Cursor SDK API key")).toHaveValue("***********");
    expect(screen.queryByText(/package path/i)).not.toBeInTheDocument();
  });

  it("lists Cursor profiles under the base provider and opens their settings", () => {
    const onOpenProfile = vi.fn<(kind: string) => void>();
    useSharedSettings.setState({
      agentInstances: {
        work: {
          id: "work",
          driver: "cursor",
          displayName: "Work",
          environment: {
            CURSOR_API_KEY: { value: "lc-safe:encrypted", sensitive: true },
          },
        },
      },
    });

    render(
      <CursorProviderSettings
        agentKind="cursor"
        statuses={[runtimeStatus]}
        wslDistros={[]}
        onOpenProfile={onOpenProfile}
      />,
    );

    const openButton = screen.getByRole("button", { name: "Open Work" });
    const chevron = openButton.querySelector("svg");
    expect(chevron).not.toBeNull();
    fireEvent.click(chevron!);
    expect(onOpenProfile).toHaveBeenCalledWith("cursor:work");
    expect(screen.getAllByRole("button", { name: "Open Work" })).toHaveLength(1);
  });

  it("adds a Cursor profile with a required encrypted API key", async () => {
    const onOpenProfile = vi.fn<(kind: string) => void>();
    setAgentInstanceMock.mockImplementation((instance) => {
      useSharedSettings.setState((state) => ({
        agentInstances: { ...state.agentInstances, [instance.id]: instance },
      }));
    });
    let resolveRefresh!: () => void;
    bridgeMock.refreshAgentStatuses.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    useSharedSettings.setState({
      agentInstances: {},
    });
    render(
      <CursorProviderSettings
        agentKind="cursor"
        statuses={[runtimeStatus]}
        wslDistros={[]}
        onOpenProfile={onOpenProfile}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add profile" }));
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Work" },
    });
    fireEvent.change(screen.getByLabelText("New Cursor profile API key"), {
      target: { value: " profile-key " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await vi.waitFor(() => {
      expect(bridgeMock.createProfile).toHaveBeenCalledWith({
        driver: "cursor",
        id: "work",
        displayName: "Work",
        environment: { CURSOR_API_KEY: { value: "profile-key", sensitive: true } },
      });
    });
    const openProfile = screen.getByRole("button", { name: "Open Work" });
    expect(openProfile).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove profile Work" })).toBeDisabled();
    fireEvent.click(openProfile);
    expect(onOpenProfile).not.toHaveBeenCalled();
    resolveRefresh();
    await vi.waitFor(() => expect(onOpenProfile).toHaveBeenCalledWith("cursor:work"));
    // The key itself never rides the plaintext renderer flush; the pinned
    // runtime does, so a new profile never inherits an unusable default.
    expect(bridgeMock.createProfile).toHaveBeenCalledTimes(1);
    expect(setAgentSettingMock).toHaveBeenCalledWith("cursor:work", "structuredRuntime", "sdk");
    expect(flushSharedSettingsMock).toHaveBeenCalled();
    expect(setAgentInstanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "work", driver: "cursor", displayName: "Work" }),
    );
  });

  it("does not offer a fake cancellation after profile creation starts", async () => {
    let resolveCreate!: (instance: AgentInstanceConfig) => void;
    bridgeMock.createProfile.mockReturnValueOnce(
      new Promise<AgentInstanceConfig>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add profile" }));
    fireEvent.change(screen.getByLabelText("New profile name"), { target: { value: "Work" } });
    fireEvent.change(screen.getByLabelText("New Cursor profile API key"), {
      target: { value: "profile-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await vi.waitFor(() => expect(bridgeMock.createProfile).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Cancel new profile" })).toBeDisabled();
    expect(screen.getByLabelText("New profile name")).toBeDisabled();

    resolveCreate({ id: "work", driver: "cursor", displayName: "Work" });
    await vi.waitFor(() => expect(screen.queryByLabelText("New profile name")).toBeNull());
  });

  it("gives each Cursor profile remove button a distinct accessible name", () => {
    useSharedSettings.setState({
      agentInstances: {
        work: { id: "work", driver: "cursor", displayName: "Work" },
        personal: { id: "personal", driver: "cursor", displayName: "Personal" },
      },
    });

    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    expect(screen.getByRole("button", { name: "Remove profile Work" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove profile Personal" })).toBeTruthy();
  });

  it("persists profile removal before refreshing the supervisor registry", async () => {
    let resolveFlush!: () => void;
    flushSharedSettingsMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveFlush = resolve;
      }),
    );
    useSharedSettings.setState({
      agentInstances: {
        work: { id: "work", driver: "cursor", displayName: "Work" },
      },
    });
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove profile Work" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeAgentInstanceMock).toHaveBeenCalledWith("work");
    expect(bridgeMock.refreshAgentStatuses).not.toHaveBeenCalled();

    resolveFlush();
    await vi.waitFor(() => expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalled());
  });

  it("restores profile-scoped settings when removal persistence fails", async () => {
    flushSharedSettingsMock.mockRejectedValueOnce(new Error("write failed"));
    // Mirror the store action's synchronous slice removal so the rollback has
    // something real to restore.
    removeAgentInstanceMock.mockImplementation((instanceId: string) => {
      useSharedSettings.setState((state) => {
        const { [instanceId]: _removed, ...agentInstances } = state.agentInstances;
        const prefix = `cursor:${instanceId}`;
        const dropProfileKey = <T extends Record<string, unknown>>(values: T): T =>
          Object.fromEntries(Object.entries(values).filter(([key]) => key !== prefix)) as T;
        return {
          agentInstances,
          agentSettings: dropProfileKey(state.agentSettings),
          providerOrder: state.providerOrder.filter((kind) => kind !== prefix),
        };
      });
    });
    useSharedSettings.setState({
      agentInstances: {
        work: { id: "work", driver: "cursor", displayName: "Work" },
      },
      agentSettings: { "cursor:work": { structuredRuntime: "sdk" } },
      providerOrder: ["cursor", "cursor:work"],
    });
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove profile Work" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await vi.waitFor(() => expect(toastMock.danger).toHaveBeenCalledWith("write failed"));
    const state = useSharedSettings.getState();
    expect(state.agentInstances.work?.displayName).toBe("Work");
    expect(state.agentSettings["cursor:work"]).toEqual({ structuredRuntime: "sdk" });
    expect(state.providerOrder).toEqual(["cursor", "cursor:work"]);
  });

  it("reports a removal refresh failure without claiming ordinary success", async () => {
    bridgeMock.refreshAgentStatuses.mockRejectedValueOnce(new Error("refresh failed"));
    useSharedSettings.setState({
      agentInstances: {
        work: { id: "work", driver: "cursor", displayName: "Work" },
      },
    });
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove profile Work" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await vi.waitFor(() =>
      expect(toastMock.danger).toHaveBeenCalledWith(
        "Profile removed, but statuses could not be refreshed.",
      ),
    );
    expect(toastMock.success).not.toHaveBeenCalledWith("Profile removed.");
  });

  it("keeps API-key focus while typing in the add form", () => {
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add profile" }));
    const apiKey = screen.getByLabelText("New Cursor profile API key");
    apiKey.focus();
    fireEvent.change(apiKey, { target: { value: "profile-key" } });

    expect(apiKey).toHaveFocus();
    expect(apiKey).toHaveValue("profile-key");
  });

  it("replaces a Cursor profile key through the profile secret path", async () => {
    useSharedSettings.setState({
      agentInstances: {
        work: {
          id: "work",
          driver: "cursor",
          displayName: "Work",
          environment: {
            CURSOR_API_KEY: { value: "lc-safe:encrypted", sensitive: true },
          },
        },
      },
    });
    const profileStatus = { ...runtimeStatus, kind: "cursor:work", label: "Cursor Work" };

    render(
      <CursorProviderSettings agentKind="cursor:work" statuses={[profileStatus]} wslDistros={[]} />,
    );

    const field = screen.getByLabelText("Cursor profile API key");
    expect(field).toHaveValue("***********");
    expect(
      screen.getByText("The API key below is used by Cursor CLI, ACP, and SDK for this profile."),
    ).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Structured runtime" }).contains(field)).toBe(
      false,
    );
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: " replacement-key " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Cursor profile API key" }));

    await vi.waitFor(() => {
      expect(bridgeMock.setProfileEnvironment).toHaveBeenCalledWith({
        instanceId: "work",
        environment: { CURSOR_API_KEY: { value: "replacement-key", sensitive: true } },
      });
      expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledWith([], {
        agentKinds: ["cursor:work"],
      });
    });
    expect(screen.queryByRole("button", { name: "Remove Cursor SDK API key" })).toBeNull();
  });

  it("confirms a saved profile key even when status refresh fails", async () => {
    bridgeMock.refreshAgentStatuses.mockRejectedValueOnce(new Error("refresh failed"));
    useSharedSettings.setState({
      agentInstances: {
        work: {
          id: "work",
          driver: "cursor",
          displayName: "Work",
          environment: {
            CURSOR_API_KEY: { value: "lc-safe:encrypted", sensitive: true },
          },
        },
      },
    });
    render(
      <CursorProviderSettings
        agentKind="cursor:work"
        statuses={[{ ...runtimeStatus, kind: "cursor:work", label: "Cursor Work" }]}
        wslDistros={[]}
      />,
    );

    const field = screen.getByLabelText("Cursor profile API key");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "replacement-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Cursor profile API key" }));

    await vi.waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith("Cursor profile API key saved.");
      expect(toastMock.danger).toHaveBeenCalledWith("refresh failed");
    });
  });

  it("replaces the masked key on focus and restores the mask when left empty", () => {
    useSharedSettings.setState({
      agentSettings: { cursor: { structuredRuntime: "sdk", sdkApiKey: "lc-safe:encrypted" } },
    });
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    const field = screen.getByLabelText("Cursor SDK API key");
    fireEvent.focus(field);
    expect(field).toHaveValue("");
    fireEvent.blur(field);
    expect(field).toHaveValue("***********");
  });

  it("shows both installed runtimes and their actual model controls and modes", () => {
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    expect(
      screen.getAllByText((_, element) => element?.textContent === "Installed · Authenticated"),
    ).toHaveLength(2);
    expect(
      screen.getAllByText((_, element) => element?.textContent === "2 models · Modes: Work, Plan"),
    ).toHaveLength(2);
    // The SDK card carries its own API key state; ACP auth lives with the CLI.
    expect(screen.getByText("Authenticated")).toBeInTheDocument();
  });

  it("combines runtime availability detected in different environments", () => {
    const acpOnly: AgentStatus = {
      ...runtimeStatus,
      runtimeVariants: {
        acp: runtimeStatus.runtimeVariants!.acp!,
        sdk: {
          ...runtimeStatus.runtimeVariants!.sdk!,
          installed: false,
          authState: "unknown",
          capabilities: { ...runtimeCapabilities, models: [] },
        },
      },
    };
    const sdkOnly: AgentStatus = {
      ...runtimeStatus,
      runtimeVariants: {
        acp: {
          ...runtimeStatus.runtimeVariants!.acp!,
          installed: false,
          authState: "unknown",
          capabilities: { ...runtimeCapabilities, models: [] },
        },
        sdk: runtimeStatus.runtimeVariants!.sdk!,
      },
    };

    render(
      <CursorProviderSettings
        agentKind="cursor"
        statuses={[acpOnly, sdkOnly]}
        wslDistros={["Ubuntu"]}
      />,
    );

    expect(screen.getByRole("radio", { name: /ACP/ })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /SDK/ })).toBeEnabled();
    expect(
      screen.getByText((_, element) => element?.textContent === "@cursor/sdk · v1.0.24"),
    ).toBeInTheDocument();
  });

  it("shows the separately detected SDK version and runs its package update", async () => {
    useSharedSettings.setState({
      agentInstances: {
        work: {
          id: "work",
          driver: "cursor",
          displayName: "Work",
          environment: {
            CURSOR_API_KEY: { value: "lc-safe:encrypted", sensitive: true },
          },
        },
      },
    });
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    expect(
      screen.getByText((_, element) => element?.textContent === "@cursor/sdk · v1.0.24"),
    ).toBeInTheDocument();
    const updateButton = await vi.waitFor(() =>
      screen.getByRole("button", { name: "Update Cursor SDK" }),
    );
    fireEvent.click(updateButton);

    expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Update Cursor SDK",
        purpose: "update",
      }),
    );
    const input = runAgentInstallCommandMock.mock.calls[0]![0];
    await act(async () => input.onCommandComplete?.(0));
    await vi.waitFor(() =>
      expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledWith([], {
        agentKinds: ["cursor", "cursor:work"],
      }),
    );
  });

  it("hides the SDK update button when the newest supported release is installed", async () => {
    const upToDateStatus: AgentStatus = {
      ...runtimeStatus,
      runtimeVariants: {
        ...runtimeStatus.runtimeVariants,
        sdk: {
          ...runtimeStatus.runtimeVariants!.sdk!,
          version: "1.0.26",
        },
      },
    };
    bridgeMock.getLatestAgentVersion.mockResolvedValue({ version: "1.0.26", source: "npm" });
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[upToDateStatus]} wslDistros={[]} />,
    );

    await vi.waitFor(() => expect(bridgeMock.getLatestAgentVersion).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Update Cursor SDK" })).toBeNull();
  });

  it("hides the SDK update button when the version probe fails", async () => {
    bridgeMock.getLatestAgentVersion.mockRejectedValue(new Error("offline"));
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    await vi.waitFor(() => expect(bridgeMock.getLatestAgentVersion).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Update Cursor SDK" })).toBeNull();
  });

  it("offers SDK installation when the package is not detected", () => {
    const withoutSdk: AgentStatus = {
      ...runtimeStatus,
      runtimeVariants: {
        ...runtimeStatus.runtimeVariants,
        sdk: {
          ...runtimeStatus.runtimeVariants!.sdk!,
          installed: false,
          authState: "missing",
        },
      },
    };
    render(<CursorProviderSettings agentKind="cursor" statuses={[withoutSdk]} wslDistros={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Install Cursor SDK" }));
    expect(runAgentInstallCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Install Cursor SDK",
      }),
    );
  });

  it("persists the picked runtime, flushes, then refreshes Cursor status", async () => {
    render(
      <CursorProviderSettings
        agentKind="cursor"
        statuses={[runtimeStatus]}
        wslDistros={["Ubuntu"]}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /SDK/ }));

    await vi.waitFor(() => {
      expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledWith(["Ubuntu"], {
        agentKinds: ["cursor"],
      });
    });
    expect(setAgentSettingMock).toHaveBeenCalledWith("cursor", "structuredRuntime", "sdk");
    expect(flushSharedSettingsMock.mock.invocationCallOrder[0]).toBeLessThan(
      bridgeMock.refreshAgentStatuses.mock.invocationCallOrder[0]!,
    );
    // The selected card is the confirmation — no toast for a silent success.
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("restores the previous runtime when the settings flush fails", async () => {
    flushSharedSettingsMock.mockRejectedValueOnce(new Error("write failed"));
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /SDK/ }));

    await act(async () => {
      await vi.waitFor(() => expect(toastMock.danger).toHaveBeenCalled());
    });
    expect(bridgeMock.refreshAgentStatuses).not.toHaveBeenCalled();
    expect(setAgentSettingMock).toHaveBeenLastCalledWith("cursor", "structuredRuntime", "acp");
  });

  it("persists a profile runtime choice under the profile kind", async () => {
    render(
      <CursorProviderSettings
        agentKind="cursor:work"
        statuses={[{ ...runtimeStatus, kind: "cursor:work", label: "Cursor Work" }]}
        wslDistros={[]}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /ACP/ }));

    await vi.waitFor(() => {
      expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledWith([], {
        agentKinds: ["cursor:work"],
      });
    });
    expect(setAgentSettingMock).toHaveBeenCalledWith("cursor:work", "structuredRuntime", "acp");
    expect(flushSharedSettingsMock.mock.invocationCallOrder[0]).toBeLessThan(
      bridgeMock.refreshAgentStatuses.mock.invocationCallOrder[0]!,
    );
  });

  it("restores a profile runtime choice when the settings flush fails", async () => {
    flushSharedSettingsMock.mockRejectedValueOnce(new Error("write failed"));
    render(
      <CursorProviderSettings
        agentKind="cursor:work"
        statuses={[{ ...runtimeStatus, kind: "cursor:work", label: "Cursor Work" }]}
        wslDistros={[]}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /ACP/ }));

    await act(async () => {
      await vi.waitFor(() => expect(toastMock.danger).toHaveBeenCalled());
    });
    expect(bridgeMock.refreshAgentStatuses).not.toHaveBeenCalled();
    expect(setAgentSettingMock).toHaveBeenLastCalledWith("cursor:work", "structuredRuntime", "sdk");
  });

  it("saves an SDK API key through the encrypted setting path and refreshes detection", async () => {
    const missingSdkAuth: AgentStatus = {
      ...runtimeStatus,
      runtimeVariants: {
        ...runtimeStatus.runtimeVariants,
        sdk: {
          ...runtimeStatus.runtimeVariants!.sdk!,
          authState: "missing",
          capabilities: { ...runtimeCapabilities, models: [] },
        },
      },
    };
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[missingSdkAuth]} wslDistros={[]} />,
    );

    fireEvent.change(screen.getByLabelText("Cursor SDK API key"), {
      target: { value: " cursor-secret " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Cursor SDK API key" }));

    await vi.waitFor(() => {
      expect(setAgentSecretSettingMock).toHaveBeenCalledWith(
        "cursor",
        "sdkApiKey",
        "cursor-secret",
      );
      expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalled();
    });
    expect(screen.getByRole("radio", { name: /SDK/ })).toBeDisabled();
    expect(toastMock.success).toHaveBeenCalledWith("Cursor SDK API key saved.");
  });
  it("submits the add form from Enter in either field", async () => {
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add profile" }));
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Work" },
    });
    const apiKey = screen.getByLabelText("New Cursor profile API key");
    fireEvent.change(apiKey, { target: { value: "profile-key" } });
    fireEvent.keyDown(apiKey, { key: "Enter" });

    await vi.waitFor(() =>
      expect(bridgeMock.createProfile).toHaveBeenCalledWith({
        driver: "cursor",
        id: "work",
        displayName: "Work",
        environment: { CURSOR_API_KEY: { value: "profile-key", sensitive: true } },
      }),
    );
  });

  it("blocks a duplicate profile name instead of creating a second identical row", () => {
    useSharedSettings.setState({
      agentInstances: { work: { id: "work", driver: "cursor", displayName: "Work" } },
    });
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add profile" }));
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: " work " },
    });
    fireEvent.change(screen.getByLabelText("New Cursor profile API key"), {
      target: { value: "profile-key" },
    });

    expect(screen.getByText("A profile with this name already exists.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create profile" })).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText("New Cursor profile API key"), { key: "Enter" });
    expect(bridgeMock.createProfile).not.toHaveBeenCalled();
  });

  it("pins the ACP runtime for a new profile when @cursor/sdk is missing", async () => {
    const withoutSdk: AgentStatus = {
      ...runtimeStatus,
      runtimeVariants: {
        ...runtimeStatus.runtimeVariants,
        sdk: { ...runtimeStatus.runtimeVariants!.sdk!, installed: false, authState: "missing" },
      },
    };
    render(<CursorProviderSettings agentKind="cursor" statuses={[withoutSdk]} wslDistros={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add profile" }));
    fireEvent.change(screen.getByLabelText("New profile name"), {
      target: { value: "Work" },
    });
    fireEvent.change(screen.getByLabelText("New Cursor profile API key"), {
      target: { value: "profile-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create profile" }));

    await vi.waitFor(() =>
      expect(setAgentSettingMock).toHaveBeenCalledWith("cursor:work", "structuredRuntime", "acp"),
    );
  });

  it("keeps a profile until its removal is confirmed", () => {
    useSharedSettings.setState({
      agentInstances: { work: { id: "work", driver: "cursor", displayName: "Work" } },
    });
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove profile Work" }));
    expect(removeAgentInstanceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Remove profile?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(removeAgentInstanceMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove profile Work" })).toBeTruthy();
  });

  it("labels each profile row with the runtime it launches on", () => {
    useSharedSettings.setState({
      agentInstances: {
        work: { id: "work", driver: "cursor", displayName: "Work" },
        personal: { id: "personal", driver: "cursor", displayName: "Personal" },
      },
      agentSettings: { "cursor:personal": { structuredRuntime: "acp" } },
    });
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    // "Personal" pinned ACP; "Work" has no saved choice and follows the
    // supervisor's SDK default.
    const rowText = screen.getAllByRole("button").map((button) => button.textContent);
    expect(rowText).toContain("PersonalCursor CLI (ACP)");
    expect(rowText).toContain("WorkCursor SDK");
  });

  it("renames a profile and refreshes so every surface relabels", async () => {
    useSharedSettings.setState({
      agentInstances: { work: { id: "work", driver: "cursor", displayName: "Work" } },
    });
    const profileStatus = { ...runtimeStatus, kind: "cursor:work", label: "Cursor Work" };
    render(
      <CursorProviderSettings agentKind="cursor:work" statuses={[profileStatus]} wslDistros={[]} />,
    );

    const nameField = screen.getByLabelText("Cursor profile name");
    expect(nameField).toHaveValue("Work");
    fireEvent.change(nameField, { target: { value: " Day job " } });
    fireEvent.keyDown(nameField, { key: "Enter" });

    await vi.waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith("Cursor profile renamed."),
    );
    expect(setAgentInstanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "work", displayName: "Day job" }),
    );
    expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledWith([], {
      agentKinds: ["cursor:work"],
    });
  });

  it("reports the profile key's detected auth state instead of restating the section", () => {
    useSharedSettings.setState({
      agentInstances: {
        work: {
          id: "work",
          driver: "cursor",
          displayName: "Work",
          environment: { CURSOR_API_KEY: { value: "lc-safe:encrypted", sensitive: true } },
        },
      },
    });
    // The SDK variant is the one that authenticates with the key itself; ACP
    // stays "authenticated" here precisely because it can fall back to the
    // machine login, which must not make a bad profile key look fine.
    const unauthenticated: AgentStatus = {
      ...runtimeStatus,
      kind: "cursor:work",
      label: "Cursor Work",
      runtimeVariants: {
        ...runtimeStatus.runtimeVariants,
        sdk: { ...runtimeStatus.runtimeVariants!.sdk!, authState: "missing" },
      },
    };
    render(
      <CursorProviderSettings
        agentKind="cursor:work"
        statuses={[unauthenticated]}
        wslDistros={[]}
      />,
    );

    expect(screen.queryByText("Separate API key")).toBeNull();
    expect(screen.getAllByText("API key required").length).toBeGreaterThan(0);
  });
});
