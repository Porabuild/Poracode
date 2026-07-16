import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExperimentCandidate, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ExperimentCandidateCard } from "./ExperimentCandidateCard";

const candidate: ExperimentCandidate = {
  threadId: "thread-1",
  agentKind: "codex",
  agentLabel: "Codex",
  model: "gpt-5",
  worktreeBranch: "candidate-one",
  worktreeOwnerToken: "owner-one",
  worktreeState: "owned",
};

const thread: Thread = {
  id: candidate.threadId,
  projectId: "project-1",
  title: "Candidate",
  agentKind: "codex",
  config: { model: "gpt-5" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  worktreePath: "/repo/one",
  worktreeBranch: candidate.worktreeBranch,
  prNumber: 328,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
};

function renderCard(props: { isCreatingPr: boolean; isMerging: boolean }) {
  return render(
    <ExperimentCandidateCard
      candidate={candidate}
      candidateNumber={1}
      baseCommit={"a".repeat(40)}
      configLabel="GPT-5"
      isCrowned
      isWinner={false}
      decided={false}
      operationLocked={props.isCreatingPr || props.isMerging}
      hasActiveCandidate={false}
      isCreatingPr={props.isCreatingPr}
      isMerging={props.isMerging}
      onOpen={vi.fn<() => void>()}
      onCrown={vi.fn<() => void>()}
      onMerge={vi.fn<() => void>()}
      onCreatePr={vi.fn<() => void>()}
    />,
  );
}

describe("ExperimentCandidateCard", () => {
  afterEach(() => {
    act(() => {
      useAppStore.setState({ threads: [] });
      useGitStore.setState({ prData: {} });
    });
  });

  it("shows the model configuration as the primary label and provider as secondary", () => {
    renderCard({ isCreatingPr: false, isMerging: false });

    expect(screen.getByRole("button", { name: "Open candidate 1: GPT-5" })).toBeInTheDocument();
    expect(screen.getByText("Codex").parentElement).toHaveClass("text-muted");
  });

  it("shows progress while creating a pull request or merging the winner", () => {
    const { rerender } = renderCard({ isCreatingPr: true, isMerging: false });

    expect(
      screen.getByText("Create PR").closest("button")?.querySelector(".animate-spin"),
    ).not.toBe(null);

    rerender(
      <ExperimentCandidateCard
        candidate={candidate}
        candidateNumber={1}
        baseCommit={"a".repeat(40)}
        configLabel="GPT-5"
        isCrowned
        isWinner={false}
        decided={false}
        operationLocked
        hasActiveCandidate={false}
        isCreatingPr={false}
        isMerging
        onOpen={vi.fn<() => void>()}
        onCrown={vi.fn<() => void>()}
        onMerge={vi.fn<() => void>()}
        onCreatePr={vi.fn<() => void>()}
      />,
    );

    expect(
      screen.getByText("Merge winner").closest("button")?.querySelector(".animate-spin"),
    ).not.toBe(null);
  });

  it("replaces Create PR with the existing pull request status icon", () => {
    act(() => {
      useAppStore.setState({ threads: [thread] });
      useGitStore.setState({
        prData: {
          "/repo/one": {
            number: 328,
            state: "open",
            title: "Candidate pull request",
            url: "https://example.com/pull/328",
            baseBranch: "main",
            isDraft: false,
            checksStatus: "FAILURE",
            updatedAt: "2026-07-16T00:00:00.000Z",
          },
        },
      });
    });

    renderCard({ isCreatingPr: false, isMerging: false });

    expect(screen.queryByText("Create PR")).not.toBeInTheDocument();
    const prButton = screen.getByRole("button", { name: "Open PR #328" });
    expect(prButton.querySelector(".lucide-git-pull-request")).toHaveClass("text-danger");
  });
});
