import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import type { Thread } from "@/shared/contracts";
import type { SavedCrew, ThreadCrewBinding } from "@/shared/crew";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useThreadGoalDockStore } from "@/renderer/state/threadGoalDockStore";
import { useThreadBackgroundTasksDockStore } from "@/renderer/state/threadBackgroundTasksDockStore";
import { useThreadComposerControlStore } from "@/renderer/state/threadComposerControlStore";
import { ThreadDocksPanel } from "./ThreadDocksPanel";
import { ThreadDockBubbles } from "./ThreadDockBubbles";
import { selectThreadHasDockContent, useThreadDocksSummary } from "./useThreadDocksSummary";

function TaskBubbles() {
  const summary = useThreadDocksSummary("thread-1", null, null);
  return <ThreadDockBubbles threadId="thread-1" summary={summary} />;
}

describe("ThreadDocksPanel", () => {
  it("keeps the compact count available after hiding tasks and restores the dock from it", () => {
    usePanelStore.getState().openThreadDocksPanel("backgroundTasks");
    render(
      <AppProvider>
        <ThreadDocksPanel threadId="thread-1" />
        <TaskBubbles />
      </AppProvider>,
    );
    const taskLabel = "New background update";
    act(() => {
      useAppStore.setState({
        runtimeBackgroundTasksByThread: {
          "thread-1": [{ taskId: "reopen", kind: "command", description: taskLabel }],
        },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Close background tasks" }));
    expect(screen.queryByText(taskLabel)).not.toBeInTheDocument();
    const bubble = document.querySelector<HTMLButtonElement>(
      '[data-dock-bubble="backgroundTasks"]',
    )!;
    expect(bubble).toHaveTextContent("1");
    expect(bubble).toHaveAttribute("aria-pressed", "false");
    expect(bubble).toHaveAccessibleName("Show Background tasks");
    fireEvent.click(bubble);
    expect(screen.getByText(taskLabel)).toBeInTheDocument();
    expect(usePanelStore.getState().threadDocksPanelOpen).toBe(true);
    expect(bubble).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the Agents dock visible for a crew with no runs and requests the roster", () => {
    const role = {
      id: "builder",
      label: "Builder",
      selection: { agentKind: "codex", model: "gpt-5.5" },
    };
    const binding: ThreadCrewBinding = {
      version: 1,
      crewId: "crew-1",
      name: "Night shift",
      policy: "crew-only",
      roles: [role],
    };
    const saved: SavedCrew = {
      id: "crew-1",
      name: "Night shift",
      lead: { agentKind: "codex", model: "gpt-5.5" },
      roles: [role],
      policy: "crew-only",
      updatedAt: 1,
    };
    const thread = {
      id: "thread-crew",
      projectId: "project-1",
      agentKind: "codex",
      title: "Crew",
      config: { model: "gpt-5.5", crew: binding },
      status: "idle",
      attention: "none",
      canResumeWithConfig: true,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    } as unknown as Thread;
    useAppStore.setState({
      threads: [thread],
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
    });
    useSharedSettings.setState({ crews: [saved], threadDocksOrder: ["agents"] });
    useThreadComposerControlStore.setState({ requestsByThreadId: {}, nextNonce: 0 });
    usePanelStore.getState().openThreadDocksPanel("agents");

    render(
      <AppProvider>
        <ThreadDocksPanel threadId={thread.id} />
      </AppProvider>,
    );

    expect(screen.getByText("Night shift")).toBeInTheDocument();
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Builder")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit crew" }));
    expect(useThreadComposerControlStore.getState().requestsByThreadId[thread.id]).toMatchObject({
      target: "crew",
    });
  });
  beforeEach(() => {
    useProviderUsageStore.setState({ snapshots: {} });
    usePanelStore.setState({ threadDocksPanelOpen: false, threadDocksFocus: null });
    useThreadGoalDockStore.setState({ dismissedByThread: {} });
    useThreadBackgroundTasksDockStore.setState({
      collapsed: false,
      dismissedTasksKeyByThread: {},
    });
    useSharedSettings.setState({
      threadDocksPlacement: "right",
      threadDocksOrder: ["backgroundTasks", "images", "plan", "goal", "agents"],
    });
    useAppStore.setState({
      threads: [],
      runtimeContextByThread: {},
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

  it("offers a local dismiss for a right-panel goal without a clear action", () => {
    const failedItem = {
      id: "goal-1",
      type: "goal" as const,
      state: "completed" as const,
      payload: {
        action: "updated",
        objective: "Implement plan",
        status: "failed",
        tokensUsed: 1000,
      },
      streams: {},
    };
    useAppStore.setState({
      runtimeItemIdsByThread: { "thread-1": ["goal-1"] },
      runtimeItemsByIdByThread: { "thread-1": { "goal-1": failedItem } },
      runtimeBackgroundTasksByThread: {},
    });

    render(
      <AppProvider>
        <ThreadDocksPanel threadId="thread-1" />
      </AppProvider>,
    );

    expect(screen.getByText("Implement plan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close goal" }));
    expect(screen.queryByRole("button", { name: "Reorder Goal" })).not.toBeInTheDocument();
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

  it("shows the running agent loader without composer active-row highlighting", () => {
    usePanelStore.getState().openThreadDocksPanel("agents");
    useAppStore.setState({
      runtimeItemIdsByThread: { "thread-agent": ["agent-1"] },
      runtimeItemsByIdByThread: {
        "thread-agent": {
          "agent-1": {
            id: "agent-1",
            type: "tool_call",
            state: "started",
            payload: {
              name: "spawnAgent",
              status: "running",
              isSubAgent: true,
              args: { description: "Review the resize behavior" },
            },
            streams: {},
          },
        },
      },
      runtimeStructuralVersionByThread: { "thread-agent": 1 },
      runtimeBackgroundTasksByThread: {},
    });

    const { container } = render(
      <AppProvider>
        <ThreadDocksPanel threadId="thread-agent" />
      </AppProvider>,
    );

    const row = container.querySelector(".poracode-subagent-dock-row");
    expect(row?.querySelector(".poracode-pixel-loader")).not.toBeNull();
    expect(row).not.toHaveClass("bg-accent/10");
    fireEvent.click(screen.getByText("Review the resize behavior"));
    expect(usePanelStore.getState().subAgentPanelContext).toEqual({
      threadId: "thread-agent",
      parentItemId: "agent-1",
      returnToThreadInfo: true,
    });
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
    expect(screen.queryByTitle("Show docks above the composer")).not.toBeInTheDocument();
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

  it("renders Images in persisted order with its drag handle", () => {
    useAppStore.setState({
      runtimeItemIdsByThread: { "thread-1": ["plan-1", "image-1"] },
      runtimeItemsByIdByThread: {
        "thread-1": {
          ...useAppStore.getState().runtimeItemsByIdByThread["thread-1"],
          "image-1": {
            id: "image-1",
            type: "image_view",
            state: "completed",
            payload: {
              name: "imageGeneration",
              status: "success",
              result: { image: "data:image/png;base64,AAA" },
            },
            streams: {},
          },
        },
      },
      runtimeStructuralVersionByThread: { "thread-1": 1 },
    });

    const { container } = render(
      <AppProvider>
        <ThreadDocksPanel threadId="thread-1" />
      </AppProvider>,
    );

    expect(screen.getByRole("button", { name: "Reorder Images" })).toBeInTheDocument();
    expect(
      [...container.querySelectorAll("[data-dock-kind]")].map((element) =>
        element.getAttribute("data-dock-kind"),
      ),
    ).toEqual(["backgroundTasks", "images", "plan"]);
    const header = screen.getByRole("button", { name: "Images" });
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Open image 1 of 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse images" }));
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Open image 1 of 1" })).not.toBeInTheDocument();
  });

  it("toggles background tasks from the header while keeping dismissal independent", () => {
    useAppStore.setState({
      runtimeBackgroundTasksByThread: {
        "thread-1": [
          { taskId: "one", kind: "command", description: "First task" },
          { taskId: "two", kind: "command", description: "Second task" },
        ],
      },
    });
    render(
      <AppProvider>
        <ThreadDocksPanel threadId="thread-1" />
      </AppProvider>,
    );
    const header = screen.getByRole("button", { name: "Background tasks" });
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("First task")).not.toBeInTheDocument();
    expect(screen.getByText("Second task")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand background tasks" }));
    expect(header).toHaveAttribute("aria-expanded", "true");
    const region = within(screen.getByRole("region", { name: "Background tasks" }));
    fireEvent.click(region.getByRole("button", { name: "Close background tasks" }));
    expect(screen.queryByText("First task")).not.toBeInTheDocument();
    expect(useThreadBackgroundTasksDockStore.getState().collapsed).toBe(false);
  });

  it("keeps context and account usage as independent top-level collapsible sections", async () => {
    useProviderUsageStore.getState().setSnapshots([
      {
        providerId: "codex",
        status: "ok",
        fetchedAt: Date.now(),
        windows: [{ id: "session", label: "Session", usedPercent: 48 }],
      },
    ]);
    useAppStore.setState({
      threads: [
        {
          id: "thread-1",
          projectId: "p1",
          title: "Chat",
          agentKind: "codex",
          config: { model: "test" },
          status: "idle",
          attention: "none",
          canResumeWithConfig: false,
          presentationMode: "gui",
          archived: false,
          done: false,
          starred: false,
          createdAt: "2026-10-20",
          updatedAt: "2026-10-20",
        },
      ],
      runtimeContextByThread: { "thread-1": { usedTokens: 123 } },
    });
    useSharedSettings
      .getState()
      .setThreadDocksOrder([
        "usage",
        "context",
        "plan",
        "backgroundTasks",
        "images",
        "goal",
        "agents",
      ]);
    const { container } = render(
      <AppProvider>
        <ThreadDocksPanel threadId="thread-1" />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: "Reorder Thread context" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Usage" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand thread context" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand agent usage" })).toBeInTheDocument();
    const context = screen.getByRole("button", { name: "Thread context" });
    const usage = screen.getByRole("button", { name: "Usage" });
    expect(context).toHaveTextContent("123 tokens");
    expect(usage).toHaveTextContent("Session 48%");
    expect(context.closest("[data-dock-kind]")).toHaveAttribute("data-dock-kind", "context");
    expect(usage.closest("[data-dock-kind]")).toHaveAttribute("data-dock-kind", "usage");
    fireEvent.click(context);
    expect(context).toHaveAttribute("aria-expanded", "true");
    expect(usage).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("123 used")).toBeInTheDocument();
    fireEvent.click(usage);
    expect(screen.getByRole("progressbar", { name: "Session" })).toBeInTheDocument();
    fireEvent.click(context);
    expect(usage).toHaveAttribute("aria-expanded", "true");
    expect(
      [...container.querySelectorAll("[data-dock-kind]")].map((element) =>
        element.getAttribute("data-dock-kind"),
      ),
    ).toEqual(["usage", "context", "plan", "backgroundTasks"]);
    await act(async () => {
      useProviderUsageStore.setState({ snapshots: {} });
    });
    expect(screen.queryByRole("button", { name: "Reorder Usage" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Thread context" })).toBeInTheDocument();
  });

  it("keeps composer-placed informational docks out of image-focused Thread info", () => {
    usePanelStore.setState({ threadDocksPanelOpen: true, threadDocksFocus: "images" });
    useSharedSettings.setState({ threadDocksPlacement: "composer" });

    render(
      <AppProvider>
        <ThreadDocksPanel threadId="thread-1" />
      </AppProvider>,
    );

    expect(screen.queryByRole("button", { name: "Reorder Background tasks" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reorder Plan" })).toBeNull();
  });
});
