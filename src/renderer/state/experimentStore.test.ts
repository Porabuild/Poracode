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

  it("installs a confirmed host record with its crown and decided winner", () => {
    const decided = experiment({
      crown: {
        threadId: "thread-2",
        source: "user",
        createdAt: "2026-07-13T00:01:00.000Z",
      },
      winnerThreadId: "thread-2",
      status: "decided",
    });
    useExperimentStore.getState().upsertExperiment(decided);

    expect(useExperimentStore.getState().experiments["experiment-1"]).toMatchObject({
      crown: { threadId: "thread-2", source: "user" },
      winnerThreadId: "thread-2",
      status: "decided",
    });
  });

  it("installs the host map verbatim without filtering by known projects", () => {
    useExperimentStore.getState().replaceExperiments({
      "experiment-1": experiment(),
      "experiment-2": experiment({ id: "experiment-2", projectId: "project-not-loaded" }),
    });

    expect(Object.keys(useExperimentStore.getState().experiments)).toEqual([
      "experiment-1",
      "experiment-2",
    ]);
    expect(useExperimentStore.getState().experiments["experiment-2"]?.projectId).toBe(
      "project-not-loaded",
    );
  });

  it("drops only the host-confirmed removed record", () => {
    useExperimentStore.getState().replaceExperiments({
      "experiment-1": experiment(),
      "experiment-2": experiment({ id: "experiment-2" }),
    });

    useExperimentStore.getState().removeExperiment("experiment-1");

    expect(Object.keys(useExperimentStore.getState().experiments)).toEqual(["experiment-2"]);
  });

  it("removes every experiment for a deleted project", () => {
    useExperimentStore.getState().addExperiment(experiment());
    useExperimentStore
      .getState()
      .addExperiment(experiment({ id: "experiment-2", projectId: "project-2" }));

    useExperimentStore.getState().removeProjectExperiments("project-1");

    expect(Object.keys(useExperimentStore.getState().experiments)).toEqual(["experiment-2"]);
  });
});
