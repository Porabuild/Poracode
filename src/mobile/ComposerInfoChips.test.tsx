import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadDockState } from "@/renderer/components/thread/useThreadDockState";
import type { ThreadContextUsageSummary } from "@/renderer/components/thread/threadContextUsage";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadBackgroundTasksDockStore } from "@/renderer/state/threadBackgroundTasksDockStore";
import { ComposerInfoChips } from "./ComposerInfoChips";
import { byTextContent } from "@/renderer/testUtils/text";

vi.mock("@/renderer/components/thread/ChatPane/parts/items/ActiveSubAgentTile", () => ({
  ActiveSubAgentTile: () => null,
  useActiveAgentKindCounts: () => ({ subagent: 0, crossagent: 0, workflow: 0 }),
}));

const dockState: ThreadDockState = {
  todoDockCollapsed: false,
  docksPlacement: "composer",
  todoDockState: null,
  goalDockState: {
    sourceItemId: "goal-1",
    itemState: "completed",
    objective: "Ship the PWA fixes",
    status: "active",
    action: "set",
  },
  errorDockStates: [],
  showTodoDock: false,
  showGoalDock: true,
  hiddenRuntimeItemId: undefined,
  dockLayoutToken: "goal:goal-1",
  onGoalDockDismiss: vi.fn<ThreadDockState["onGoalDockDismiss"]>(),
  onDismissError: vi.fn<ThreadDockState["onDismissError"]>(),
  onTodoDockCollapsedChange: vi.fn<ThreadDockState["onTodoDockCollapsedChange"]>(),
  onTodoDockRetire: vi.fn<ThreadDockState["onTodoDockRetire"]>(),
};

const contextSummary: ThreadContextUsageSummary = {
  usedTokens: 50_000,
  maxTokens: 200_000,
  remainingTokens: 150_000,
  percent: 25,
  breakdown: [{ id: "used", label: "Used", tokens: 50_000 }],
  usedLabel: "50K",
  maxLabel: "200K",
  remainingLabel: "150K",
  percentLabel: "25%",
  headline: "25% full",
  detail: "50K / 200K tokens",
};

describe("ComposerInfoChips", () => {
  afterEach(() => {
    useAppStore.setState({ runtimeBackgroundTasksByThread: {} });
    useThreadBackgroundTasksDockStore.setState({ dismissedTasksKeyByThread: {} });
  });

  it("opens live background tasks from a mobile info chip", () => {
    useAppStore.setState({
      runtimeBackgroundTasksByThread: {
        "thread-1": [{ taskId: "task-1", kind: "command", description: "pnpm test" }],
      },
    });
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <ComposerInfoChips
          threadId="thread-1"
          projectLocation={{ kind: "posix", path: "/repo" }}
          dockState={{ ...dockState, goalDockState: null, showGoalDock: false }}
          hidden={false}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Background tasks" }));

    expect(container.querySelector(".m-chip-panel")).toHaveAttribute("data-open");
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
  });

  it("opens context usage details in the external panel", () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <ComposerInfoChips
          threadId="thread-1"
          projectLocation={{ kind: "posix", path: "/repo" }}
          dockState={{ ...dockState, goalDockState: null, showGoalDock: false }}
          contextSummary={contextSummary}
          hidden={false}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Context" }));

    const panel = container.querySelector(".m-chip-panel");
    expect(panel).toHaveAttribute("data-open");
    expect(panel).toContainElement(screen.getByRole("region", { name: "Thread context usage" }));
    expect(screen.getByText(byTextContent("25% Full"))).toBeInTheDocument();
  });

  it("keeps the expanded panel mounted through its exit animation", async () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <ComposerInfoChips
          threadId="thread-1"
          projectLocation={{ kind: "posix", path: "/repo" }}
          dockState={dockState}
          hidden={false}
        />
      </I18nProvider>,
    );

    const chip = screen.getByRole("button", { name: "Goal" });
    fireEvent.click(chip);
    const panel = container.querySelector<HTMLElement>(".m-chip-panel");
    expect(panel).toHaveAttribute("data-open");

    fireEvent.click(chip);
    expect(panel).not.toHaveAttribute("data-open");
    expect(container.querySelector(".m-chip-panel")).toBe(panel);

    await waitFor(() => expect(container.querySelector(".m-chip-panel")).not.toBeInTheDocument());
  });

  it("keeps disappearing chips mounted through their exit animation", async () => {
    const { container, rerender } = render(
      <I18nProvider i18n={i18n}>
        <ComposerInfoChips
          threadId="thread-1"
          projectLocation={{ kind: "posix", path: "/repo" }}
          dockState={dockState}
          hidden={false}
        />
      </I18nProvider>,
    );

    rerender(
      <I18nProvider i18n={i18n}>
        <ComposerInfoChips
          threadId="thread-1"
          projectLocation={{ kind: "posix", path: "/repo" }}
          dockState={{ ...dockState, goalDockState: null, showGoalDock: false }}
          hidden={false}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "Goal" })).toHaveAttribute("data-exiting");
    await waitFor(() =>
      expect(container.querySelector('.m-chip[aria-label="Goal"]')).not.toBeInTheDocument(),
    );
  });
});
