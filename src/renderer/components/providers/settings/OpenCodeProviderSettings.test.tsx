import { act, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, McpServer } from "@/shared/contracts";
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
      onClick={props.onPress}
    >
      {props.children}
    </button>
  ),
  Disclosure: Object.assign((props: { children?: ReactNode }) => <div>{props.children}</div>, {
    Heading: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Trigger: (props: { children?: ReactNode }) => <button type="button">{props.children}</button>,
    Indicator: () => null,
    Content: (props: { children?: ReactNode }) => <div>{props.children}</div>,
    Body: (props: { children?: ReactNode }) => <div>{props.children}</div>,
  }),
  toast: toastMock,
}));

const runAgentLoginCommandMock = vi.hoisted(() =>
  vi.fn<
    (input: {
      label: string;
      command: string;
      onCommandComplete?: (exitCode: number) => void;
    }) => boolean
  >(),
);

vi.mock("@/renderer/actions/agentLoginActions", () => ({
  runAgentLoginCommand: runAgentLoginCommandMock,
}));

const bridgeMock = vi.hoisted(() => ({
  platform: "win32" as "linux" | "win32" | "darwin",
  refreshAgentStatuses: vi.fn<() => Promise<void>>(),
  reloadAgentMcpServers: vi.fn<(input: { agentKind: string }) => Promise<void>>(),
}));

const flushSharedSettingsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());
const setAgentSettingMock = vi.hoisted(() =>
  vi.fn<(agentKind: string, key: string, value: boolean | string) => void>(),
);
const setMcpServersMock = vi.hoisted(() => vi.fn<(servers: McpServer[]) => void>());

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

vi.mock("@/renderer/components/common", () => ({
  PixelLoader: () => <span data-testid="pixel-loader" />,
  ToggleSwitch: (props: {
    "aria-label"?: string;
    isSelected: boolean;
    onChange: (value: boolean) => void;
  }) => (
    <button
      type="button"
      role="switch"
      aria-label={props["aria-label"]}
      aria-checked={props.isSelected}
      onClick={() => props.onChange(!props.isSelected)}
    />
  ),
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: () => <span data-testid="provider-icon" />,
}));

vi.mock("@/renderer/state/sharedSettingsStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/sharedSettingsStore")>();
  return { ...actual, flushSharedSettings: flushSharedSettingsMock };
});

import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { OpenCodeProviderSettings } from "./OpenCodeProviderSettings";

function makeStatus(input: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "opencode",
    label: "OpenCode",
    installed: true,
    authState: "authenticated",
    ...input,
  } as AgentStatus;
}

const statusWithProviders = makeStatus({
  providerMetadata: {
    connectedProviders: [
      { label: "OpenCode Zen", detail: "API", id: "opencode" },
      { label: "Copilot", detail: "OAuth", id: "github-copilot" },
    ],
  },
});

beforeEach(() => {
  runAgentLoginCommandMock.mockReset().mockReturnValue(true);
  bridgeMock.platform = "win32";
  bridgeMock.refreshAgentStatuses.mockReset().mockResolvedValue(undefined);
  bridgeMock.reloadAgentMcpServers.mockReset().mockResolvedValue(undefined);
  flushSharedSettingsMock.mockReset().mockResolvedValue(undefined);
  setAgentSettingMock.mockReset();
  toastMock.danger.mockReset();
  toastMock.success.mockReset();
  setMcpServersMock.mockReset();
  useSharedSettings.setState({
    agentSettings: {
      opencode: { browserMcp: false, chromeMcp: false, computerUse: false },
    },
    setAgentSetting: setAgentSettingMock,
    mcpServers: [],
    setMcpServers: setMcpServersMock,
  });
});

describe("OpenCodeProviderSettings", () => {
  it("lists connected providers with their credential type", () => {
    render(
      <OpenCodeProviderSettings
        agentKind="opencode"
        statuses={[statusWithProviders]}
        wslDistros={[]}
      />,
    );
    expect(screen.getByText("OpenCode Zen")).toBeTruthy();
    expect(screen.getByText("Copilot")).toBeTruthy();
    expect(screen.getByText("API")).toBeTruthy();
    expect(screen.getByText("OAuth")).toBeTruthy();
  });

  it("runs `opencode providers login` from Add provider and re-probes on success", async () => {
    render(
      <OpenCodeProviderSettings
        agentKind="opencode"
        statuses={[statusWithProviders]}
        wslDistros={["Ubuntu"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add provider/ }));
    const call = runAgentLoginCommandMock.mock.calls[0]![0];
    expect(call.command).toBe("opencode providers login");
    await act(async () => {
      call.onCommandComplete?.(0);
    });
    expect(bridgeMock.refreshAgentStatuses).toHaveBeenCalledWith(["Ubuntu"], {
      agentKinds: ["opencode"],
    });
  });

  it("logs out a provider by its stable id", () => {
    render(
      <OpenCodeProviderSettings
        agentKind="opencode"
        statuses={[statusWithProviders]}
        wslDistros={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out of Copilot" }));
    expect(runAgentLoginCommandMock.mock.calls[0]![0].command).toBe(
      "opencode providers logout github-copilot",
    );
  });

  it("falls back to interactive removal when a provider has no id", () => {
    render(
      <OpenCodeProviderSettings
        agentKind="opencode"
        statuses={[
          makeStatus({
            providerMetadata: { connectedProviders: [{ label: "OpenAI", detail: "OAuth" }] },
          }),
        ]}
        wslDistros={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out of OpenAI" }));
    expect(runAgentLoginCommandMock.mock.calls[0]![0].command).toBe("opencode providers logout");
  });

  it("shows an empty state when no providers are connected", () => {
    render(
      <OpenCodeProviderSettings agentKind="opencode" statuses={[makeStatus()]} wslDistros={[]} />,
    );
    expect(screen.getByText("No providers connected yet.")).toBeTruthy();
    // Add provider stays available so users can connect their first provider.
    expect(screen.getByRole("button", { name: /Add provider/ })).toBeTruthy();
  });

  it("enables Save after toggling an MCP server", () => {
    render(
      <OpenCodeProviderSettings agentKind="opencode" statuses={[makeStatus()]} wslDistros={[]} />,
    );

    const saveButton = screen.getByRole("button", { name: "Save MCP servers" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("switch", { name: "Browser" }));
    expect(saveButton).toBeEnabled();
  });

  it("enables Crossagents by default for OpenCode", () => {
    render(
      <OpenCodeProviderSettings agentKind="opencode" statuses={[makeStatus()]} wslDistros={[]} />,
    );

    expect(screen.getByRole("switch", { name: "Crossagents" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("saves a Crossagents opt-out for OpenCode", async () => {
    render(
      <OpenCodeProviderSettings agentKind="opencode" statuses={[makeStatus()]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Crossagents" }));
    fireEvent.click(screen.getByRole("button", { name: "Save MCP servers" }));

    await vi.waitFor(() => {
      expect(setAgentSettingMock).toHaveBeenCalledWith("opencode", "crossagentMcp", false);
    });
  });

  it("lists and saves custom MCP server enablement", async () => {
    const customServer: McpServer = {
      id: "memory-id",
      name: "memory",
      description: "Memory tools",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio", command: "npx", args: ["-y", "server-memory"], env: {} },
    };
    useSharedSettings.setState({ mcpServers: [customServer] });

    render(
      <OpenCodeProviderSettings agentKind="opencode" statuses={[makeStatus()]} wslDistros={[]} />,
    );

    expect(screen.getByText("memory")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Disable memory" }));
    fireEvent.click(screen.getByRole("button", { name: "Save MCP servers" }));

    await vi.waitFor(() => {
      expect(setMcpServersMock).toHaveBeenCalledWith([{ ...customServer, enabled: false }]);
    });
  });

  it("saves changed MCP settings after flushing, then reloads the agent servers", async () => {
    render(
      <OpenCodeProviderSettings agentKind="opencode" statuses={[makeStatus()]} wslDistros={[]} />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Browser" }));
    fireEvent.click(screen.getByRole("button", { name: "Save MCP servers" }));

    await vi.waitFor(() => {
      expect(bridgeMock.reloadAgentMcpServers).toHaveBeenCalledWith({ agentKind: "opencode" });
    });
    expect(setAgentSettingMock).toHaveBeenCalledTimes(1);
    expect(setAgentSettingMock).toHaveBeenCalledWith("opencode", "browserMcp", true);
    expect(flushSharedSettingsMock.mock.invocationCallOrder[0]).toBeLessThan(
      bridgeMock.reloadAgentMcpServers.mock.invocationCallOrder[0]!,
    );
  });

  it("shows Computer Use on Linux", () => {
    bridgeMock.platform = "linux";
    render(
      <OpenCodeProviderSettings agentKind="opencode" statuses={[makeStatus()]} wslDistros={[]} />,
    );
    expect(screen.getByRole("switch", { name: "Computer Use" })).toBeInTheDocument();
  });
});
