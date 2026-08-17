import { act, fireEvent, screen } from "@testing-library/react";
import type { ChangeEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import {
  CODEX_CONTEXT_WINDOWS_SETTING_KEY,
  serializeContextWindows,
  DEFAULT_CODEX_CONTEXT_WINDOWS,
} from "@/shared/agents/codexContextWindows";

const toastMock = vi.hoisted(() => ({
  danger: vi.fn<(message: string) => void>(),
  warning: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@heroui/react", () => ({
  Button: (props: {
    children?: ReactNode;
    "aria-label"?: string;
    isDisabled?: boolean;
    type?: "button" | "submit";
    onPress?: () => void;
  }) => (
    <button
      type={props.type === "submit" ? "submit" : "button"}
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
}));

const bridgeMock = vi.hoisted(() => ({
  refreshAgentStatuses: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));
const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

vi.mock("@/renderer/state/sharedSettingsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/sharedSettingsStore")>();
  return { ...actual, flushSharedSettings: flushSharedSettingsMock };
});

import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { CodexProviderSettings } from "./CodexProviderSettings";
import { NATIVE_AGENT_REGISTRY_ENTRIES } from "./agentRegistryNative";

const setAgentSettingMock = vi.hoisted(() =>
  vi.fn<(agentKind: string, key: string, value: boolean | string) => void>(),
);

beforeEach(() => {
  bridgeMock.refreshAgentStatuses.mockReset().mockResolvedValue(undefined);
  flushSharedSettingsMock.mockReset().mockResolvedValue(undefined);
  toastMock.danger.mockReset();
  toastMock.warning.mockReset();
  setAgentSettingMock.mockReset().mockImplementation((agentKind, key, value) => {
    const current = useSharedSettings.getState().agentSettings;
    useSharedSettings.setState({
      agentSettings: {
        ...current,
        [agentKind]: { ...current[agentKind], [key]: value },
      },
    });
  });
  useSharedSettings.setState({
    agentSettings: {},
    setAgentSetting: setAgentSettingMock,
  });
});

describe("CodexProviderSettings", () => {
  it("registers the provider-local panel for Codex", () => {
    expect(NATIVE_AGENT_REGISTRY_ENTRIES.find((entry) => entry.id === "codex")?.settingsPanel).toBe(
      CodexProviderSettings,
    );
  });

  it("shows the default 272k, 400k, and 1M sizes", () => {
    render(<CodexProviderSettings agentKind="codex" wslDistros={[]} />);

    expect(screen.getByText("272k")).toBeInTheDocument();
    expect(screen.getByText("400k")).toBeInTheDocument();
    expect(screen.getByText("1M")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset context windows" })).toBeDisabled();
  });

  it("adds a custom size and refreshes Codex detection", async () => {
    render(<CodexProviderSettings agentKind="codex" wslDistros={["Ubuntu"]} />);

    fireEvent.change(screen.getByLabelText("Custom context window"), {
      target: { value: "512k" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add context window" }));
    });

    expect(setAgentSettingMock).toHaveBeenCalledWith(
      "codex",
      CODEX_CONTEXT_WINDOWS_SETTING_KEY,
      serializeContextWindows([
        DEFAULT_CODEX_CONTEXT_WINDOWS[0]!,
        DEFAULT_CODEX_CONTEXT_WINDOWS[1]!,
        { id: "512k", label: "512k", tokens: 512_000 },
        DEFAULT_CODEX_CONTEXT_WINDOWS[2]!,
      ]),
    );
    expect(flushSharedSettingsMock).toHaveBeenCalled();
    expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledWith(["Ubuntu"], {
      agentKinds: ["codex"],
    });
    expect(screen.getByText("512k")).toBeInTheDocument();
  });

  it("removes a size from the list", async () => {
    render(<CodexProviderSettings agentKind="codex" wslDistros={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove 272k" }));
    });

    expect(setAgentSettingMock).toHaveBeenCalledWith(
      "codex",
      CODEX_CONTEXT_WINDOWS_SETTING_KEY,
      '["400k","1m"]',
    );
    expect(screen.queryByText("272k")).not.toBeInTheDocument();
  });

  it("ignores Enter when the custom size field is empty", async () => {
    render(<CodexProviderSettings agentKind="codex" wslDistros={[]} />);

    await act(async () => {
      fireEvent.submit(screen.getByLabelText("Custom context window").closest("form")!);
    });

    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(flushSharedSettingsMock).not.toHaveBeenCalled();
  });

  it("rejects invalid and duplicate sizes", async () => {
    render(<CodexProviderSettings agentKind="codex" wslDistros={[]} />);

    fireEvent.change(screen.getByLabelText("Custom context window"), {
      target: { value: "nope" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add context window" }));
    });
    expect(toastMock.warning).toHaveBeenCalledWith("Enter a size like 512k or 1m.");

    fireEvent.change(screen.getByLabelText("Custom context window"), {
      target: { value: "400k" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add context window" }));
    });
    expect(toastMock.warning).toHaveBeenCalledWith("400k is already in the list.");
    expect(flushSharedSettingsMock).not.toHaveBeenCalled();
  });

  it("resets a customized list back to the built-in sizes", async () => {
    useSharedSettings.setState({
      agentSettings: { codex: { contextWindows: '["400k","512k"]' } },
    });
    render(<CodexProviderSettings agentKind="codex" wslDistros={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset context windows" }));
    });

    expect(setAgentSettingMock).toHaveBeenCalledWith(
      "codex",
      CODEX_CONTEXT_WINDOWS_SETTING_KEY,
      serializeContextWindows(DEFAULT_CODEX_CONTEXT_WINDOWS),
    );
    expect(screen.getByText("272k")).toBeInTheDocument();
    expect(screen.getByText("1M")).toBeInTheDocument();
    expect(screen.queryByText("512k")).not.toBeInTheDocument();
  });

  it("restores the previous list when refresh fails", async () => {
    useSharedSettings.setState({
      agentSettings: { codex: { contextWindows: '["400k","1m"]' } },
    });
    flushSharedSettingsMock.mockRejectedValueOnce(new Error("disk write failed"));
    render(<CodexProviderSettings agentKind="codex" wslDistros={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove 400k" }));
    });

    expect(setAgentSettingMock).toHaveBeenLastCalledWith(
      "codex",
      CODEX_CONTEXT_WINDOWS_SETTING_KEY,
      '["400k","1m"]',
    );
    expect(toastMock.danger).toHaveBeenCalled();
    expect(screen.getByText("400k")).toBeInTheDocument();
  });
});
