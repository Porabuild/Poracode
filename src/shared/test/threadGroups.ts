import type { Experiment, Thread } from "../contracts";

export function groupThread(id: string, groupId: string | undefined = "group-1"): Thread {
  return {
    id,
    projectId: "project-1",
    title: id,
    agentKind: "test-agent",
    config: { model: "test-model" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...(groupId ? { groupId, groupName: "Research" } : {}),
  };
}

export function groupExperiment(): Experiment {
  return {
    id: "experiment-1",
    projectId: "project-1",
    title: "Experiment",
    prompt: "Compare approaches",
    baseBranch: "main",
    baseCommit: "a".repeat(40),
    status: "running",
    candidates: ["a", "b"].map((threadId) => ({
      threadId,
      agentKind: "test-agent",
      worktreeBranch: "experiment/" + threadId,
      worktreeOwnerToken: "experiment-1:" + threadId,
      worktreeState: "owned",
    })),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** The released version-1 persisted shape remains valid without migration. */
export function persistedGroupExperiment(): string {
  const experiment = groupExperiment();
  return JSON.stringify({ version: 1, state: { experiments: { [experiment.id]: experiment } } });
}
