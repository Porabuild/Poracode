// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
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
});
