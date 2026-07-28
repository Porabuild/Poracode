import { act, fireEvent, screen } from "@testing-library/react";
import type { ChangeEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      data-pending={props.isPending || undefined}
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
    value: string;
    disabled?: boolean;
    placeholder?: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      value={props.value}
      disabled={props.disabled}
      placeholder={props.placeholder}
      onChange={props.onChange}
    />
  ),
  Select: (props: {
    "aria-label"?: string;
    value: string;
    isDisabled?: boolean;
    options: readonly { id: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={props["aria-label"]}
      value={props.value}
      disabled={props.isDisabled}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const bridgeMock = vi.hoisted(() => ({
  refreshAgentStatuses: vi.fn<() => Promise<void>>(),
}));
const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const setAgentSettingMock = vi.hoisted(() =>
  vi.fn<(agentKind: string, key: string, value: boolean | string) => void>(),
);

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
      authState: "authenticated",
      authUsesProviderLogin: false,
      capabilities: { ...runtimeCapabilities, runtimeLabel: "SDK" },
    },
  },
};

beforeEach(() => {
  bridgeMock.refreshAgentStatuses.mockReset().mockResolvedValue(undefined);
  flushSharedSettingsMock.mockReset().mockResolvedValue(undefined);
  setAgentSettingMock.mockReset();
  toastMock.danger.mockReset();
  toastMock.success.mockReset();
  useSharedSettings.setState({
    agentSettings: {},
    setAgentSetting: setAgentSettingMock,
  });
});

describe("CursorProviderSettings", () => {
  it("registers the provider-local panel for Cursor", () => {
    expect(
      NATIVE_AGENT_REGISTRY_ENTRIES.find((entry) => entry.id === "cursor")?.settingsPanel,
    ).toBe(CursorProviderSettings);
  });

  it("defaults to ACP and stages a runtime change until Save", () => {
    render(<CursorProviderSettings agentKind="cursor" wslDistros={[]} />);

    const runtime = screen.getByRole("combobox", { name: "Structured runtime" });
    const save = screen.getByRole("button", { name: "Save Cursor GUI runtime" });
    expect(runtime).toHaveValue("acp");
    expect(save).toBeDisabled();

    fireEvent.change(runtime, { target: { value: "sdk" } });
    expect(save).toBeEnabled();
    expect(setAgentSettingMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/requires a separately installed @cursor\/sdk package and CURSOR_API_KEY/),
    ).toBeTruthy();
  });

  it("loads the saved SDK runtime and explicit package path", () => {
    useSharedSettings.setState({
      agentSettings: {
        cursor: {
          structuredRuntime: "sdk",
          sdkPackagePath: " /opt/cursor-sdk/node_modules/@cursor/sdk ",
        },
      },
    });

    render(<CursorProviderSettings agentKind="cursor" wslDistros={[]} />);

    expect(screen.getByRole("combobox", { name: "Structured runtime" })).toHaveValue("sdk");
    expect(screen.getByRole("textbox", { name: "SDK package path" })).toHaveValue(
      "/opt/cursor-sdk/node_modules/@cursor/sdk",
    );
    expect(screen.getByRole("button", { name: "Save Cursor GUI runtime" })).toBeDisabled();
  });

  it("shows both installed runtimes and their actual model controls and modes", () => {
    render(
      <CursorProviderSettings agentKind="cursor" statuses={[runtimeStatus]} wslDistros={[]} />,
    );

    expect(screen.getAllByText("Installed")).toHaveLength(2);
    expect(
      screen.getAllByText((_, element) => element?.textContent === "2 models · Modes: Work, Plan"),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        (_, element) =>
          element?.textContent === "Model controls: Context, Reasoning, Fast, Thinking",
      ),
    ).toHaveLength(2);
  });

  it("persists both staged values, flushes, then refreshes Cursor status", async () => {
    render(<CursorProviderSettings agentKind="cursor" wslDistros={["Ubuntu"]} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Structured runtime" }), {
      target: { value: "sdk" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "SDK package path" }), {
      target: { value: "  /opt/cursor-sdk/node_modules/@cursor/sdk  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Cursor GUI runtime" }));

    await vi.waitFor(() => {
      expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledWith(["Ubuntu"], {
        agentKinds: ["cursor"],
      });
    });
    expect(setAgentSettingMock).toHaveBeenNthCalledWith(1, "cursor", "structuredRuntime", "sdk");
    expect(setAgentSettingMock).toHaveBeenNthCalledWith(
      2,
      "cursor",
      "sdkPackagePath",
      "/opt/cursor-sdk/node_modules/@cursor/sdk",
    );
    expect(flushSharedSettingsMock.mock.invocationCallOrder[0]).toBeLessThan(
      bridgeMock.refreshAgentStatuses.mock.invocationCallOrder[0]!,
    );
    expect(toastMock.success).toHaveBeenCalledWith("Cursor GUI runtime updated.");
    expect(screen.getByRole("button", { name: "Save Cursor GUI runtime" })).toBeDisabled();
  });

  it("does not refresh status when the settings flush fails", async () => {
    flushSharedSettingsMock.mockRejectedValueOnce(new Error("write failed"));
    render(<CursorProviderSettings agentKind="cursor" wslDistros={[]} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Structured runtime" }), {
      target: { value: "sdk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Cursor GUI runtime" }));

    await act(async () => {
      await vi.waitFor(() => expect(toastMock.danger).toHaveBeenCalled());
    });
    expect(bridgeMock.refreshAgentStatuses).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Cursor GUI runtime" })).toBeEnabled();
  });
});
