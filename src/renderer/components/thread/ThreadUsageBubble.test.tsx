import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderUsageResponse, Thread, UsageSnapshot } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ComposerInfoChips } from "@/renderer/components/mobileComposer/ComposerInfoChips";
import { ThreadUsageBubble } from "./ThreadUsageBubble";
import type { ThreadContextUsageSummary } from "./threadContextUsage";

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

const contextSummary: ThreadContextUsageSummary = {
  usedTokens: 40_000,
  maxTokens: 200_000,
  remainingTokens: 160_000,
  percent: 20,
  breakdown: [],
  usedLabel: "40K",
  maxLabel: "200K",
  remainingLabel: "160K",
  percentLabel: "20%",
  headline: "20% full",
  detail: "40K / 200K tokens",
};

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

  it("shows compact provider rings without a provider icon", () => {
    useProviderUsageStore.setState({
      snapshots: {
        claude: snapshot("claude", [
          { id: "weekly", label: "Weekly", usedPercent: 26 },
          { id: "session-5h", label: "Session", usedPercent: 61 },
        ]),
      },
    });

    render(<ThreadUsageBubble thread={makeThread("claude")} onUsageToggle={() => undefined} />);

    const bubble = screen.getByRole("button", { name: /usage/i });
    expect(bubble).not.toHaveTextContent(/\S/);
    expect(bubble.querySelectorAll("svg circle")).toHaveLength(4);
  });

  it("labels context separately from provider usage windows without repeating the provider icon", () => {
    useProviderUsageStore.setState({
      snapshots: {
        claude: snapshot("claude", [
          { id: "weekly", label: "Weekly", usedPercent: 26 },
          { id: "session-5h", label: "Session (5h)", usedPercent: 61 },
        ]),
      },
    });
    const onContextToggle = vi.fn<() => void>();
    const onUsageToggle = vi.fn<() => void>();

    render(
      <ThreadUsageBubble
        thread={makeThread("claude")}
        contextSummary={contextSummary}
        contextOpen={false}
        onContextToggle={onContextToggle}
        onUsageToggle={onUsageToggle}
      />,
    );

    const context = screen.getByRole("button", { name: "Show context usage details" });
    expect(context).toHaveTextContent("20%");
    expect(context.querySelector("svg")).not.toBeInTheDocument();
    fireEvent.click(context);
    expect(onContextToggle).toHaveBeenCalledOnce();

    const usage = screen.getByRole("button", { name: /claude usage/i });
    expect(usage).not.toHaveTextContent(/\S/);
    expect(usage.querySelectorAll("svg circle")).toHaveLength(4);
  });

  it("previews usage in the shared chip panel before opening the full provider panel", () => {
    useProviderUsageStore.setState({
      snapshots: {
        claude: snapshot("claude", [
          { id: "weekly", label: "Weekly", usedPercent: 26 },
          { id: "session-5h", label: "Session", usedPercent: 61 },
        ]),
      },
    });

    const thread = makeThread("claude");
    render(
      <ComposerInfoChips
        threadId={thread.id}
        agentStatus={undefined}
        project={undefined}
        projectLocation={{ kind: "posix", path: "/repo" }}
        contextSummary={null}
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        onTodoDockPlacementChange={() => undefined}
        hidden={false}
        usageThread={thread}
      />,
    );

    const bubble = screen.getByRole("button", { name: /usage/i });
    fireEvent.click(bubble);

    expect(openUsagePanelForProvider).not.toHaveBeenCalled();
    expect(bubble).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Usage" })).toHaveClass("m-chip-panel");
    expect(screen.getByRole("region", { name: "Claude usage" })).toBeVisible();
    expect(screen.getByText("Usage").parentElement).toHaveClass("items-baseline");
    expect(screen.getByText("Session (5h)")).toBeInTheDocument();
    expect(screen.getByText("61%")).toBeInTheDocument();
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("26%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Session (5h)" })).toHaveAttribute(
      "aria-valuenow",
      "61",
    );
    expect(screen.getByRole("progressbar", { name: "Weekly" })).toHaveAttribute(
      "aria-valuenow",
      "26",
    );

    fireEvent.click(screen.getByRole("button", { name: /open usage panel/i }));

    expect(openUsagePanelForProvider).toHaveBeenCalledWith("claude");
    expect(useSharedSettings.getState().usage.providerOrder).toEqual(["codex", "gemini", "claude"]);
  });
});
