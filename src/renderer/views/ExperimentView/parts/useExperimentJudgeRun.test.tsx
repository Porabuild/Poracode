import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { describe, expect, it } from "vitest";
import type { Experiment } from "@/shared/contracts";
import { i18n } from "@/renderer/i18n/i18n";
import { useExperimentJudgeRun } from "./useExperimentJudgeRun";

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
      agentLabel: "Candidate A",
      model: "model-a",
      worktreeBranch: "candidate-a",
      worktreeOwnerToken: "owner-a",
      worktreeState: "owned",
    },
    {
      threadId: "thread-2",
      agentKind: "claude",
      agentLabel: "Candidate B",
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
    rationale: "Solution 2 is stronger than Solution 1.",
    assessments: [
      { threadId: "thread-1", rationale: "Solution 1 misses coverage." },
      { threadId: "thread-2", rationale: "Solution 2 covers the behavior." },
    ],
  },
  status: "running",
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
};

function I18nWrapper(props: { children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{props.children}</I18nProvider>;
}

describe("useExperimentJudgeRun", () => {
  it("reopens persisted AI winner results", () => {
    const { result } = renderHook(
      () =>
        useExperimentJudgeRun({
          experiment,
          judgeAgents: [],
          projectAgents: [],
          runCrown: () => undefined,
        }),
      { wrapper: I18nWrapper },
    );

    act(() => result.current.openResults());

    expect(result.current.run).toMatchObject({
      stage: "won",
      winner: {
        label: "model-b",
        details: "Candidate B",
        solutionLabel: "Solution 2",
        rationale:
          "model-b · Candidate B (Solution 2) is stronger than model-a · Candidate A (Solution 1).",
        assessments: [
          {
            threadId: "thread-1",
            rationale: "model-a · Candidate A (Solution 1) misses coverage.",
          },
          {
            threadId: "thread-2",
            rationale: "model-b · Candidate B (Solution 2) covers the behavior.",
          },
        ],
      },
    });
  });
});
