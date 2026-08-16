import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderUsageResponse, Thread, UsageSnapshot } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ThreadUsageBubble } from "./ThreadUsageBubble";

const { getProviderUsage, openUsagePanelForProvider } = vi.hoisted(() => ({
  getProviderUsage: vi
    .fn<() => Promise<ProviderUsageResponse>>()
    .mockResolvedValue({ snapshots: [], fromCache: true }),
  openUsagePanelForProvider: vi.fn<(providerId: string) => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ getProviderUsage }),
}));

vi.mock("@/renderer/actions/panelActions", () => ({ openUsagePanelForProvider }));

function makeThread(agentKind: string): Thread {
  const now = new Date().toISOString();
  return {
    id: `thread-${agentKind}`,
    projectId: "project-1",
    title: `${agentKind} thread`,
    agentKind,
    config: { model: "test-model" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    presentationMode: "gui",
    archived: false,
    done: false,
    starred: false,
    createdAt: now,
    updatedAt: now,
  };
}

function snapshot(providerId: string, windows: UsageSnapshot["windows"]): UsageSnapshot {
  return {
    providerId,
    status: "ok",
    windows,
    fetchedAt: 1,
  };
}

describe("ThreadUsageBubble", () => {
  beforeEach(() => {
    getProviderUsage.mockClear();
    openUsagePanelForProvider.mockClear();
    useProviderUsageStore.setState({ snapshots: {} });
    useSharedSettings.setState((state) => ({
      usage: {
        ...state.usage,
        providerOrder: ["codex", "gemini", "claude"],
        selectedRingGroups: {},
      },
    }));
  });

  it("shows the supported provider rings without percentage text", () => {
    useProviderUsageStore.setState({
      snapshots: {
        claude: snapshot("claude", [
          { id: "weekly", label: "Weekly", usedPercent: 26 },
          { id: "session-5h", label: "Session", usedPercent: 61 },
        ]),
      },
    });

    render(<ThreadUsageBubble thread={makeThread("claude")} />);

    const bubble = screen.getByRole("button", { name: /usage/i });
    expect(bubble).not.toHaveTextContent("%");
    expect(bubble.querySelectorAll("svg circle")).toHaveLength(4);
  });

  it("passes the thread provider to Usage without changing the saved order", () => {
    useProviderUsageStore.setState({
      snapshots: {
        claude: snapshot("claude", [
          { id: "weekly", label: "Weekly", usedPercent: 26 },
          { id: "session-5h", label: "Session", usedPercent: 61 },
        ]),
      },
    });

    render(<ThreadUsageBubble thread={makeThread("claude")} />);

    const bubble = screen.getByRole("button", { name: /usage/i });
    fireEvent.click(bubble);

    expect(openUsagePanelForProvider).toHaveBeenCalledWith("claude");
    expect(useSharedSettings.getState().usage.providerOrder).toEqual(["codex", "gemini", "claude"]);
  });
});
