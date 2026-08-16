import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));
import type { Experiment, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ExperimentView } from "./ExperimentView";

const experiment: Experiment = {
  id: "experiment-1",
  projectId: "project-1",
  title: "Compare candidates",
  prompt: "Implement the change",
  baseBranch: "main",
  baseCommit: "a".repeat(40),
  candidates: [
    {
      threadId: "thread-1",
      agentKind: "codex",
      model: "model-a",
      worktreeBranch: "candidate-a",
      worktreeOwnerToken: "owner-a",
      worktreeState: "owned",
    },
    {
      threadId: "thread-2",
      agentKind: "claude",
      model: "model-b",
      worktreeBranch: "candidate-b",
      worktreeOwnerToken: "owner-b",
      worktreeState: "owned",
    },
  ],
  crown: {
    source: "ai",
    threadId: "thread-2",
    createdAt: "2026-07-16T00:00:00.000Z",
    rationale: "Solution 2 is stronger.",
    assessments: [
      { threadId: "thread-1", rationale: "Solution 1 misses coverage." },
      { threadId: "thread-2", rationale: "Solution 2 covers the behavior." },
    ],
  },
  status: "running",
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
};

describe("ExperimentView", () => {
  beforeEach(() => {
    layout.compact = false;
  });

  afterEach(() => {
    act(() => {
      useExperimentStore.setState({ experiments: {} });
      useAppStore.setState({ threads: [] });
    });
  });

  it("migrates generated candidate thread titles to model-first ordering", async () => {
    const thread: Thread = {
      id: "thread-1",
      projectId: experiment.projectId,
      title: "codex · model-a",
      agentKind: "codex",
      config: { model: "model-a" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      groupId: experiment.id,
      groupName: experiment.title,
      archived: false,
      done: false,
      starred: false,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    };
    act(() => {
      useAppStore.setState({ threads: [thread] });
      useExperimentStore.setState({ experiments: { [experiment.id]: experiment } });
    });

    render(<ExperimentView experimentId={experiment.id} />);

    await waitFor(() =>
      expect(useAppStore.getState().threads[0]).toMatchObject({
        title: "model-a · codex",
        updatedAt: "2026-07-16T00:00:00.000Z",
      }),
    );
  });

  it("allows discarding while a candidate is running", () => {
    const thread: Thread = {
      id: "thread-1",
      projectId: experiment.projectId,
      title: "model-a · codex",
      agentKind: "codex",
      config: { model: "model-a" },
      status: "working",
      attention: "none",
      canResumeWithConfig: false,
      groupId: experiment.id,
      groupName: experiment.title,
      archived: false,
      done: false,
      starred: false,
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    };
    act(() => {
      useAppStore.setState({ threads: [thread] });
      useExperimentStore.setState({ experiments: { [experiment.id]: experiment } });
    });

    render(<ExperimentView experimentId={experiment.id} />);

    expect(screen.getByRole("button", { name: "Discard experiment" })).toBeEnabled();
  });

  it("keeps AI judging available while saved results can be reopened", () => {
    act(() => {
      useExperimentStore.setState({ experiments: { [experiment.id]: experiment } });
    });
    render(<ExperimentView experimentId={experiment.id} />);

    expect(screen.getByText("Crown with AI").closest("button")).toBeInTheDocument();
    const results = screen.getByRole("button", { name: "Results" });
    fireEvent.click(results);

    expect(screen.getByText("We have a winner!")).toBeInTheDocument();
  });

  it("uses a wrapping touch toolbar instead of the desktop titlebar on compact", () => {
    layout.compact = true;
    act(() => {
      useExperimentStore.setState({ experiments: { [experiment.id]: experiment } });
    });

    const { container } = render(<ExperimentView experimentId={experiment.id} />);

    expect(container.querySelector("[class*='titlebar-area-height']")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close experiment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open All" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Discard experiment" })).toHaveClass("size-11");
  });
});
