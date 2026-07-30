import { act, fireEvent, screen } from "@testing-library/react";
import type { ChangeEvent, ReactNode } from "react";
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

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    value: string;
    disabled?: boolean;
    placeholder?: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onFocus?: () => void;
    onBlur?: () => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      value={props.value}
      disabled={props.disabled}
      placeholder={props.placeholder}
      onChange={props.onChange}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
    />
  ),
  PixelLoader: () => <span data-testid="pixel-loader" />,
}));

const bridgeMock = vi.hoisted(() => ({
  refreshAgentStatuses: vi.fn<(...args: unknown[]) => Promise<void>>(),
  getLatestAgentVersion:
    vi.fn<(payload: unknown) => Promise<{ version?: string; source?: string }>>(),
}));
const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const setAgentSettingMock = vi.hoisted(() =>
  vi.fn<(agentKind: string, key: string, value: boolean | string) => void>(),
);
const setAgentSecretSettingMock = vi.hoisted(() =>
  vi.fn<(agentKind: string, key: string, value: string) => Promise<boolean>>(),
);
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
import type { AgentCapability, AgentStatus } from "@/shared/contracts";

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
  flushSharedSettingsMock.mockReset().mockResolvedValue(undefined);
  setAgentSettingMock.mockReset();
  setAgentSecretSettingMock.mockReset().mockResolvedValue(true);
  runAgentInstallCommandMock.mockReset().mockReturnValue(true);
  toastMock.danger.mockReset();
  toastMock.success.mockReset();
  useSharedSettings.setState({
    agentSettings: {},
    setAgentSetting: setAgentSettingMock,
    setAgentSecretSetting: setAgentSecretSettingMock,
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
    await vi.waitFor(() => expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalled());
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
});
