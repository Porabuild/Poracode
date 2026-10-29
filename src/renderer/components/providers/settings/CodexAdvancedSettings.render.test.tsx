import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

// Real HeroUI Disclosure / Select / Input: guards the composition the mocked
// component tests cannot (a mocked library hides a missing export or prop).
const bridgeMock = vi.hoisted(() => ({
  getAgentConfigDefaults:
    vi.fn<(payload: { agentKind: string }) => Promise<{ defaults: Record<string, string> }>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
  isRemoteSession: () => false,
}));

import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { CodexAdvancedSettings } from "./CodexAdvancedSettings";

beforeEach(() => {
  bridgeMock.getAgentConfigDefaults.mockReset().mockResolvedValue({
    defaults: { subagentModel: "gpt-6-luna", maxSubagents: "10" },
  });
  useSharedSettings.setState({ agentSettings: {} });
  useAgentStatusesStore.setState({ agentStatuses: [] });
});

describe("CodexAdvancedSettings with real HeroUI components", () => {
  it("renders collapsed, expands, and shows the config.toml hints", async () => {
    render(<CodexAdvancedSettings agentKind="codex" />);
    await act(async () => {});

    const trigger = screen.getByRole("button", { name: /Advanced settings/u });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("From config.toml: gpt-6-luna")).toBeInTheDocument();
    expect(screen.getByText("From config.toml: 10")).toBeInTheDocument();
    expect(screen.getByLabelText("Max concurrent sub-agents")).toHaveAttribute("placeholder", "10");
    expect(screen.getByLabelText("Sub-agent model")).toBeInTheDocument();
  });
});
