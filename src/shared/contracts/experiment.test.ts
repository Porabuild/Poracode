import { describe, expect, it } from "vitest";
import {
  MAX_EXPERIMENT_PROMPT_LENGTH,
  experimentSchema,
  getExperimentCandidateDiffPayloadSchema,
  judgeExperimentPayloadSchema,
  judgeExperimentSnapshotPayloadSchema,
} from "./experiment";

const BASE_COMMIT = "a".repeat(40);

function candidate(threadId: string) {
  return {
    threadId,
    agentKind: "codex",
    agentLabel: "Codex",
    model: "gpt-5.5",
    effort: "high",
    fast: true,
    worktreePath: `C:\\repo\\${threadId}`,
    worktreeBranch: `experiment/${threadId}`,
    worktreeOwnerToken: `experiment-1:${threadId}`,
    worktreeState: "owned" as const,
  };
}

function runningExperiment() {
  return {
    id: "experiment-1",
    projectId: "project-1",
    title: "Compare implementations",
    prompt: "Implement the feature",
    segments: [
      { kind: "text" as const, content: "Implement the feature" },
      { kind: "attachment" as const, path: "C:\\tmp\\design.png", mimeType: "image/png" },
    ],
    baseBranch: "main",
    baseCommit: BASE_COMMIT,
    candidates: [candidate("thread-1"), candidate("thread-2")],
    status: "running" as const,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}

function judgePayload() {
  return {
    experimentId: "exp-1",
    projectLocation: { kind: "windows" as const, path: "C:\\repo" },
    agentKind: "codex",
    model: "gpt-5.5",
    effort: "high",
    fast: true,
    prompt: "Implement the feature",
    candidates: [
      { threadId: "thread-1", diff: "diff one" },
      { threadId: "thread-2", diff: "diff two" },
    ],
  };
}

describe("experimentSchema", () => {
  it("accepts running and decided experiments with valid candidate references", () => {
    expect(experimentSchema.safeParse(runningExperiment()).success).toBe(true);
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        status: "decided",
        winnerThreadId: "thread-2",
        crown: {
          threadId: "thread-2",
          rationale: "Most complete solution.",
          source: "ai",
          modelLabel: "Codex · gpt-5.5",
          snapshotHash: "candidate-patch-hash",
          createdAt: "2026-07-13T00:01:00.000Z",
        },
      }).success,
    ).toBe(true);
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        crown: {
          threadId: "thread-1",
          source: "user",
          createdAt: "2026-07-13T00:01:00.000Z",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects blank prompts and fewer than two candidates", () => {
    expect(experimentSchema.safeParse({ ...runningExperiment(), prompt: "   " }).success).toBe(
      false,
    );
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        candidates: [candidate("thread-1")],
      }).success,
    ).toBe(false);
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        candidates: runningExperiment().candidates.map((item) => ({
          ...item,
          worktreeOwnerToken: undefined,
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects prompts above the experiment prompt limit", () => {
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        prompt: "x".repeat(MAX_EXPERIMENT_PROMPT_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate candidates and references outside the candidate set", () => {
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        candidates: [candidate("thread-1"), candidate("thread-1")],
      }).success,
    ).toBe(false);
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        crown: {
          threadId: "missing",
          source: "user",
          createdAt: "2026-07-13T00:01:00.000Z",
        },
      }).success,
    ).toBe(false);
  });

  it("requires AI rationale but disallows persisted rationale for a user crown", () => {
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        crown: {
          threadId: "thread-1",
          source: "ai",
          rationale: "   ",
          createdAt: "2026-07-13T00:01:00.000Z",
        },
      }).success,
    ).toBe(false);
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        crown: {
          threadId: "thread-1",
          source: "user",
          rationale: "Your pick",
          createdAt: "2026-07-13T00:01:00.000Z",
        },
      }).success,
    ).toBe(false);
  });

  it("keeps status and winner state consistent", () => {
    expect(
      experimentSchema.safeParse({ ...runningExperiment(), winnerThreadId: "thread-1" }).success,
    ).toBe(false);
    expect(experimentSchema.safeParse({ ...runningExperiment(), status: "decided" }).success).toBe(
      false,
    );
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        status: "decided",
        winnerThreadId: "missing",
      }).success,
    ).toBe(false);
    expect(
      experimentSchema.safeParse({
        ...runningExperiment(),
        status: "decided",
        winnerThreadId: "thread-2",
        crown: {
          threadId: "thread-1",
          source: "user",
          createdAt: "2026-07-13T00:01:00.000Z",
        },
      }).success,
    ).toBe(false);
  });
});

describe("judgeExperimentPayloadSchema", () => {
  it("accepts a valid judge request", () => {
    expect(judgeExperimentPayloadSchema.safeParse(judgePayload()).success).toBe(true);
  });

  it("rejects blank prompts, too few candidates, and duplicate candidate ids", () => {
    expect(
      judgeExperimentPayloadSchema.safeParse({ ...judgePayload(), prompt: "\n\t" }).success,
    ).toBe(false);
    expect(
      judgeExperimentPayloadSchema.safeParse({
        ...judgePayload(),
        candidates: [{ threadId: "thread-1", diff: "diff" }],
      }).success,
    ).toBe(false);
    expect(
      judgeExperimentPayloadSchema.safeParse({
        ...judgePayload(),
        candidates: [
          { threadId: "thread-1", diff: "one" },
          { threadId: "thread-1", diff: "two" },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("judgeExperimentSnapshotPayloadSchema", () => {
  const snapshotPayload = {
    experimentId: "exp-1",
    projectLocation: { kind: "posix" as const, path: "/repo" },
    baseCommit: BASE_COMMIT,
    agentKind: "codex",
    prompt: "Research the question",
    candidates: [
      { threadId: "thread-1", branch: "one", ownerToken: "owner-1" },
      { threadId: "thread-2", branch: "two", ownerToken: "owner-2" },
    ],
  };

  it("requires one matching chat response entry per candidate in response mode", () => {
    expect(
      judgeExperimentSnapshotPayloadSchema.safeParse({
        ...snapshotPayload,
        mode: "responses",
        responses: [
          { threadId: "thread-1", response: "First answer" },
          { threadId: "thread-2", response: "" },
        ],
      }).success,
    ).toBe(true);
    expect(
      judgeExperimentSnapshotPayloadSchema.safeParse({
        ...snapshotPayload,
        mode: "responses",
        responses: [{ threadId: "thread-1", response: "First answer" }],
      }).success,
    ).toBe(false);
  });
});

describe("getExperimentCandidateDiffPayloadSchema", () => {
  it("requires a frozen commit hash as the diff base", () => {
    expect(
      getExperimentCandidateDiffPayloadSchema.safeParse({
        projectLocation: { kind: "windows", path: "C:\\repo\\candidate" },
        baseRef: BASE_COMMIT,
      }).success,
    ).toBe(true);
    expect(
      getExperimentCandidateDiffPayloadSchema.safeParse({
        projectLocation: { kind: "windows", path: "C:\\repo\\candidate" },
        baseRef: "main~1",
      }).success,
    ).toBe(false);
    expect(
      getExperimentCandidateDiffPayloadSchema.safeParse({
        projectLocation: { kind: "windows", path: "C:\\repo\\candidate" },
        baseRef: "abcdef1",
      }).success,
    ).toBe(false);
  });
});
