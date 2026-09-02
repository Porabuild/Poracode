import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadGoalDockStore } from "@/renderer/state/threadGoalDockStore";
import { useThreadBackgroundTasksDockStore } from "@/renderer/state/threadBackgroundTasksDockStore";
import { ThreadDocksPanel } from "./ThreadDocksPanel";
import { selectThreadHasDockContent } from "./useThreadDocksSummary";

describe("ThreadDocksPanel", () => {
  beforeEach(() => {
    useThreadGoalDockStore.setState({ dismissedByThread: {} });
    useThreadBackgroundTasksDockStore.setState({
      collapsed: false,
      dismissedTasksKeyByThread: {},
    });
    useSharedSettings.setState({
      threadDocksOrder: ["backgroundTasks", "plan", "goal", "agents"],
    });
    useAppStore.setState({
      runtimeItemIdsByThread: { "thread-1": ["plan-1"] },
      runtimeItemsByIdByThread: {
        "thread-1": {
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "updated",
            payload: { steps: [{ step: "Run checks", status: "in_progress" }] },
            streams: {},
          },
        },
      },
      runtimeBackgroundTasksByThread: {
        "thread-1": [{ taskId: "task-1", kind: "command", description: "Run background checks" }],
      },
    });
  });

  it("keeps a dismissed goal hidden in the right panel until that goal updates", () => {
    const dismissedItem = {
      id: "goal-1",
      type: "goal" as const,
      state: "completed" as const,
      payload: { action: "set", objective: "Ship it", status: "active" },
      streams: {},
    };
    useAppStore.setState({
      runtimeItemIdsByThread: { "thread-1": ["goal-1"] },
      runtimeItemsByIdByThread: { "thread-1": { "goal-1": dismissedItem } },
      runtimeBackgroundTasksByThread: {},
    });
    useThreadGoalDockStore.getState().dismiss("thread-1", dismissedItem);

    render(
      <AppProvider>
        <ThreadDocksPanel threadId="thread-1" />
      </AppProvider>,
    );
    expect(screen.queryByRole("button", { name: "Reorder Goal" })).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState({
        runtimeItemsByIdByThread: {
          "thread-1": { "goal-1": { ...dismissedItem, payload: { ...dismissedItem.payload } } },
        },
      });
    });
    expect(screen.queryByRole("button", { name: "Reorder Goal" })).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState({
        runtimeItemsByIdByThread: {
          "thread-1": {
            "goal-1": {
              ...dismissedItem,
              payload: { ...dismissedItem.payload, objective: "Ship the update" },
            },
          },
        },
      });
    });

    expect(screen.getByRole("button", { name: "Reorder Goal" })).toBeInTheDocument();
    expect(screen.getByText("Ship the update")).toBeInTheDocument();
  });

  it("does not keep an empty docks panel alive for a dismissed agent row", () => {
    useAppStore.setState({
      runtimeItemIdsByThread: { "thread-dismissed-agent": ["agent-1"] },
      runtimeItemsByIdByThread: {
        "thread-dismissed-agent": {
          "agent-1": {
            id: "agent-1",
            type: "tool_call",
            state: "started",
            payload: {
              name: "spawnAgent",
              status: "running",
              isSubAgent: true,
              args: { description: "review" },
            },
            streams: {},
          },
        },
      },
      runtimeStructuralVersionByThread: { "thread-dismissed-agent": 1 },
      runtimeBackgroundTasksByThread: {},
    });

    expect(
      selectThreadHasDockContent(
        useAppStore.getState(),
        "thread-dismissed-agent",
        undefined,
        { "agent-1": true },
        undefined,
        undefined,
      ),
    ).toBe(false);
  });

  it("renders persisted dock order with a drag handle for every visible section", () => {
    const { container } = render(
      <AppProvider>
        <ThreadDocksPanel threadId="thread-1" />
      </AppProvider>,
    );

    expect(screen.getByRole("button", { name: "Reorder Background tasks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Background tasks" })).toHaveClass(
      "top-0",
      "h-8",
    );
    expect(screen.getByRole("button", { name: "Reorder Plan" })).toBeInTheDocument();
    expect(screen.getByText("Thread info")).toBeInTheDocument();
    expect(
      [...container.querySelectorAll("[data-dock-kind]")].map((element) =>
        element.getAttribute("data-dock-kind"),
      ),
    ).toEqual(["backgroundTasks", "plan"]);

    fireEvent.click(screen.getByRole("button", { name: "Close background tasks" }));
    expect(
      screen.queryByRole("button", { name: "Reorder Background tasks" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Plan" })).toBeInTheDocument();

    act(() => {
      useAppStore.setState({
        runtimeBackgroundTasksByThread: {
          "thread-1": [{ taskId: "task-2", kind: "other", description: "New background update" }],
        },
      });
    });
    expect(screen.getByRole("button", { name: "Reorder Background tasks" })).toBeInTheDocument();
    expect(screen.getByText("New background update")).toBeInTheDocument();
  });
});
