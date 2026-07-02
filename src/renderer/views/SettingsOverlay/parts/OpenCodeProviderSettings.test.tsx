import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

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

const refreshAgentStatusesMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ refreshAgentStatuses: refreshAgentStatusesMock }),
}));

vi.mock("@/renderer/components/common", () => ({
  PixelLoader: () => <span data-testid="pixel-loader" />,
}));

vi.mock("@/renderer/components/providers/ProviderIcon", () => ({
  ProviderIcon: () => <span data-testid="provider-icon" />,
}));

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
  refreshAgentStatusesMock.mockReset().mockResolvedValue(undefined);
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

  it("runs `opencode providers login` from Add provider and re-probes on success", () => {
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
    call.onCommandComplete?.(0);
    expect(refreshAgentStatusesMock).toHaveBeenCalledWith(["Ubuntu"], {
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
});
