// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useComposerBubbleSlotStore } from "@/renderer/state/composerBubbleSlotStore";
import { useThreadBackgroundTasksDockStore } from "@/renderer/state/threadBackgroundTasksDockStore";
import { ComposerInfoChips } from "./ComposerInfoChips";

vi.mock("@/renderer/components/thread/ChatPane/parts/items/ActiveSubAgentTile", () => ({
  ActiveSubAgentTile: () => null,
  useActiveAgentKindCounts: () => ({ subagent: 0, crossagent: 0, workflow: 0 }),
}));

describe("ComposerInfoChips", () => {
  afterEach(() => {
    useAppStore.setState({ runtimeBackgroundTasksByThread: {} });
    useThreadBackgroundTasksDockStore.setState({ dismissedTasksKeyByThread: {} });
  });

  it("opens live background tasks from a compact info chip", () => {
    useAppStore.setState({
      runtimeBackgroundTasksByThread: {
        "thread-1": [{ taskId: "task-1", kind: "command", description: "pnpm test" }],
      },
    });
    const { container } = render(
      <ComposerInfoChips
        threadId="thread-1"
        agentStatus={undefined}
        project={undefined}
        projectLocation={{ kind: "posix", path: "/repo" }}
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        hidden={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Background tasks" }));

    expect(container.querySelector(".m-chip-panel")).toHaveAttribute("data-open");
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
  });

  it("keeps the chip for hidden tasks and restores them into its sheet", () => {
    useAppStore.setState({
      runtimeBackgroundTasksByThread: {
        "thread-1": [{ taskId: "task-1", kind: "command", description: "pnpm test" }],
      },
    });
    const { container } = render(
      <ComposerInfoChips
        threadId="thread-1"
        agentStatus={undefined}
        project={undefined}
        projectLocation={{ kind: "posix", path: "/repo" }}
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        hidden={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Background tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Close background tasks" }));

    expect(container.querySelector(".m-chip-panel")).not.toHaveAttribute("data-open");
    const chip = screen.getByRole("button", { name: "Background tasks" });
    expect(chip).toHaveTextContent("1");

    fireEvent.click(chip);

    expect(useThreadBackgroundTasksDockStore.getState().dismissedTasksKeyByThread).toEqual({});
    expect(container.querySelector(".m-chip-panel")).toHaveAttribute("data-open");
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
  });

  it("publishes, hands off across thread switches, and clears the control bubble slot", () => {
    const { container, rerender, unmount } = render(
      <ComposerInfoChips
        threadId="thread-slot-1"
        agentStatus={undefined}
        project={undefined}
        projectLocation={{ kind: "posix", path: "/repo" }}
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        hidden={false}
      />,
    );

    const root = container.querySelector<HTMLElement>(".m-thread-chips");
    expect(root).not.toHaveAttribute("data-has-chips");
    const slot = container.querySelector<HTMLElement>('[data-composer-bubble-slot="control"]');
    expect(slot).not.toBeNull();
    expect(useComposerBubbleSlotStore.getState().control["thread-slot-1"]).toBe(slot);

    rerender(
      <ComposerInfoChips
        threadId="thread-slot-2"
        agentStatus={undefined}
        project={undefined}
        projectLocation={{ kind: "posix", path: "/repo" }}
        todoDockState={null}
        goalDockState={null}
        errorDockStates={[]}
        onGoalDockDismiss={() => undefined}
        onDismissError={() => undefined}
        hidden={false}
        trailing={<span>chip</span>}
      />,
    );

    expect(root).toHaveAttribute("data-has-chips", "true");
    expect(useComposerBubbleSlotStore.getState().control["thread-slot-1"]).toBeUndefined();
    expect(useComposerBubbleSlotStore.getState().control["thread-slot-2"]).toBe(slot);

    unmount();
    expect(useComposerBubbleSlotStore.getState().control["thread-slot-2"]).toBeUndefined();
  });
});
