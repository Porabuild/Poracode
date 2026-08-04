import { beforeEach, describe, expect, it } from "vitest";
import type { Experiment } from "@/shared/contracts";
import { useExperimentStore } from "./experimentStore";

function experiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: "experiment-1",
    projectId: "project-1",
    title: "Try two approaches",
    prompt: "Implement the feature",
    baseBranch: "main",
    baseCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    candidates: [
      {
        threadId: "thread-1",
        agentKind: "codex",
        worktreePath: "C:/repo/one",
        worktreeBranch: "poracode/one",
        worktreeOwnerToken: "experiment-1:thread-1",
        worktreeState: "owned",
      },
      {
        threadId: "thread-2",
        agentKind: "codex",
        worktreePath: "C:/repo/two",
        worktreeBranch: "poracode/two",
        worktreeOwnerToken: "experiment-1:thread-2",
        worktreeState: "owned",
      },
    ],
    status: "running",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("experimentStore", () => {
  beforeEach(() => {
    useExperimentStore.setState({ experiments: {} });
  });

  it("records a crown and decides a candidate", () => {
    const store = useExperimentStore.getState();
    store.addExperiment(experiment());
    store.setExperimentCrown("experiment-1", {
      threadId: "thread-2",
      source: "user",
      createdAt: "2026-07-13T00:01:00.000Z",
    });
    useExperimentStore.getState().decideExperiment("experiment-1", "thread-2");

    expect(useExperimentStore.getState().experiments["experiment-1"]).toMatchObject({
      crown: { threadId: "thread-2", source: "user" },
      winnerThreadId: "thread-2",
      status: "decided",
    });
  });

  it("does not decide an unknown candidate", () => {
    useExperimentStore.getState().addExperiment(experiment());
    useExperimentStore.getState().decideExperiment("experiment-1", "missing");

    expect(useExperimentStore.getState().experiments["experiment-1"]?.status).toBe("running");
  });

  it("removes every experiment for a deleted project", () => {
    useExperimentStore.getState().addExperiment(experiment());
    useExperimentStore
      .getState()
      .addExperiment(experiment({ id: "experiment-2", projectId: "project-2" }));

    useExperimentStore.getState().removeProjectExperiments("project-1");

    expect(Object.keys(useExperimentStore.getState().experiments)).toEqual(["experiment-2"]);
  });

  it("retains candidate ownership when a thread row is missing", () => {
    const record = experiment({
      candidates: [
        ...experiment().candidates,
        {
          threadId: "thread-3",
          agentKind: "codex",
          worktreePath: "C:/repo/three",
          worktreeBranch: "poracode/three",
          worktreeOwnerToken: "experiment-1:thread-3",
          worktreeState: "owned",
        },
      ],
      crown: {
        threadId: "thread-3",
        source: "user",
        createdAt: "2026-07-13T00:01:00.000Z",
      },
    });
    useExperimentStore.getState().addExperiment(record);

    useExperimentStore.getState().reconcileExperiments(new Set(["project-1"]));

    expect(useExperimentStore.getState().experiments["experiment-1"]).toEqual(record);
  });
});
