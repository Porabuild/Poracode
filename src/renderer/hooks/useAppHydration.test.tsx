import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment, Project, Thread, ThreadRuntimeSnapshot } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useAppHydration } from "./useAppHydration";

const mocks = vi.hoisted(() => ({
  bridge: {
    getThreadSnapshots: vi.fn<() => Promise<ThreadRuntimeSnapshot[]>>(),
    closeThread: vi.fn<(payload: { threadId: string }) => Promise<void>>(),
    onPrWatchMerged: vi.fn<() => () => void>(() => () => undefined),
    onPrWatchStatus: vi.fn<() => () => void>(() => () => undefined),
    gitListWorktrees: vi.fn<
      (payload: unknown) => Promise<{
        worktrees: Array<{ path: string; branch: string }>;
      }>
    >(),
    gitGetWorktreeOwner: vi.fn<
      (payload: unknown) => Promise<{
        ownerToken: string | null;
      }>
    >(),
  },
  hydrateThreadRuntimeItems: vi.fn<(threadId: string) => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => mocks.bridge }));
vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  hydrateThreadRuntimeItems: mocks.hydrateThreadRuntimeItems,
}));
vi.mock("@/renderer/deferredFeatures", () => ({
  startDeferredFeaturePrewarm: () => () => undefined,
}));

const project: Project = {
  id: "project-1",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-07-13T00:00:00.000Z",
};

function thread(id: string): Thread {
  return {
    id,
    projectId: project.id,
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

function snapshot(threadId: string): ThreadRuntimeSnapshot {
  return {
    threadId,
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
  };
}

describe("useAppHydration experiments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAppStore.persist, "hasHydrated").mockReturnValue(true);
    vi.spyOn(useExperimentStore.persist, "hasHydrated").mockReturnValue(true);
    vi.spyOn(useAppStore.persist, "onHydrate").mockReturnValue(() => undefined);
    vi.spyOn(useAppStore.persist, "onFinishHydration").mockReturnValue(() => undefined);
    vi.spyOn(useExperimentStore.persist, "onHydrate").mockReturnValue(() => undefined);
    vi.spyOn(useExperimentStore.persist, "onFinishHydration").mockReturnValue(() => undefined);
    useAppStore.setState((state) => ({
      ...state,
      projects: [project],
      threads: [thread("candidate-1"), thread("candidate-2"), thread("unrelated")],
      view: { kind: "home" },
    }));
    const experiment: Experiment = {
      id: "experiment-1",
      projectId: project.id,
      title: "Experiment",
      prompt: "Implement it",
      baseBranch: "main",
      baseCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      candidates: [
        {
          threadId: "candidate-1",
          agentKind: "codex",
          worktreePath: "/repo/one",
          worktreeBranch: "poracode/one",
          worktreeOwnerToken: "experiment-1:candidate-1",
          worktreeState: "owned",
        },
        {
          threadId: "candidate-2",
          agentKind: "codex",
          worktreePath: "/repo/two",
          worktreeBranch: "poracode/two",
          worktreeOwnerToken: "experiment-1:candidate-2",
          worktreeState: "owned",
        },
      ],
      status: "running",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
    };
    useExperimentStore.setState({ experiments: { [experiment.id]: experiment } });
    mocks.bridge.getThreadSnapshots.mockResolvedValue([
      snapshot("candidate-1"),
      snapshot("candidate-2"),
      snapshot("unrelated"),
    ]);
    mocks.bridge.closeThread.mockResolvedValue(undefined);
    mocks.bridge.gitListWorktrees.mockResolvedValue({
      worktrees: [
        { path: "/repo/one", branch: "poracode/one" },
        { path: "/repo/two", branch: "poracode/two" },
      ],
    });
    mocks.bridge.gitGetWorktreeOwner.mockImplementation(async (payload) => ({
      ownerToken:
        (payload as { branch: string }).branch === "poracode/one"
          ? "experiment-1:candidate-1"
          : "experiment-1:candidate-2",
    }));
    mocks.hydrateThreadRuntimeItems.mockResolvedValue(undefined);
  });

  it("retains every running candidate even when the board is not the active view", async () => {
    renderHook(() => useAppHydration());

    await waitFor(() => {
      expect(mocks.bridge.closeThread).toHaveBeenCalledWith({ threadId: "unrelated" });
    });
    expect(mocks.bridge.closeThread).not.toHaveBeenCalledWith({ threadId: "candidate-1" });
    expect(mocks.bridge.closeThread).not.toHaveBeenCalledWith({ threadId: "candidate-2" });
    expect(mocks.hydrateThreadRuntimeItems).toHaveBeenCalledWith("candidate-1");
    expect(mocks.hydrateThreadRuntimeItems).toHaveBeenCalledWith("candidate-2");
  });

  it("shows persisted threads while live runtime snapshots reconcile in the background", async () => {
    let resolveSnapshots!: (snapshots: ThreadRuntimeSnapshot[]) => void;
    mocks.bridge.getThreadSnapshots.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshots = resolve;
      }),
    );

    const { result } = renderHook(() => useAppHydration());

    await waitFor(() => expect(mocks.hydrateThreadRuntimeItems).toHaveBeenCalled());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    expect(result.current.runtimeSnapshotsReady).toBe(false);

    resolveSnapshots([snapshot("candidate-1"), snapshot("candidate-2")]);
    await waitFor(() => {
      expect(result.current.runtimeSnapshotsReady).toBe(true);
      expect(useAppStore.getState().threads.find((item) => item.id === "candidate-1")?.status).toBe(
        "working",
      );
    });
  });

  it("recovers candidate worktree paths from their durable branches before showing the UI", async () => {
    useExperimentStore.setState((state) => ({
      experiments: Object.fromEntries(
        Object.entries(state.experiments).map(([id, experiment]) => [
          id,
          {
            ...experiment,
            candidates: experiment.candidates.map((candidate) => ({
              ...candidate,
              worktreeState: "pending" as const,
            })),
          },
        ]),
      ),
    }));
    const { result } = renderHook(() => useAppHydration());

    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    expect(
      useAppStore
        .getState()
        .threads.filter((item) => item.id.startsWith("candidate-"))
        .map((item) => item.worktreePath),
    ).toEqual(["/repo/one", "/repo/two"]);
    expect(
      useExperimentStore
        .getState()
        .experiments["experiment-1"]?.candidates.map((candidate) => candidate.worktreeState),
    ).toEqual(["owned", "owned"]);
  });

  it("clears a stale candidate path when the branch owner does not match", async () => {
    useExperimentStore.setState((state) => ({
      experiments: {
        ...state.experiments,
        "experiment-1": {
          ...state.experiments["experiment-1"]!,
          candidates: state.experiments["experiment-1"]!.candidates.map((candidate, index) =>
            index === 0
              ? { ...candidate, worktreePath: "/repo/stale", worktreeState: "pending" }
              : candidate,
          ),
        },
      },
    }));
    mocks.bridge.gitListWorktrees.mockResolvedValue({
      worktrees: [
        { path: "/repo/reused", branch: "poracode/one" },
        { path: "/repo/two", branch: "poracode/two" },
      ],
    });
    mocks.bridge.gitGetWorktreeOwner.mockImplementation(async (payload) => ({
      ownerToken:
        (payload as { branch: string }).branch === "poracode/one"
          ? "another-experiment"
          : "experiment-1:candidate-2",
    }));

    const { result } = renderHook(() => useAppHydration());

    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    expect(
      useExperimentStore.getState().experiments["experiment-1"]?.candidates[0]?.worktreePath,
    ).toBeUndefined();
    expect(
      useAppStore.getState().threads.find((item) => item.id === "candidate-1")?.worktreePath,
    ).toBeUndefined();
  });

  it("keeps experiment operations blocked while snapshot recovery is pending", async () => {
    mocks.bridge.getThreadSnapshots
      .mockRejectedValueOnce(new Error("snapshot unavailable"))
      .mockReturnValueOnce(new Promise(() => undefined));

    const { result } = renderHook(() => useAppHydration());

    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    expect(
      useAppStore
        .getState()
        .threads.filter((item) => item.id.startsWith("candidate-"))
        .map((item) => item.status),
    ).toEqual(["launching", "launching"]);
    expect(useAppStore.getState().threads.find((item) => item.id === "unrelated")?.status).toBe(
      "inactive",
    );
  });
});
