import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExperimentCandidate,
  GetExperimentCandidateStatsResult,
  GitStatusResult,
  ProjectLocation,
  Thread,
} from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ExperimentCandidateCard } from "./ExperimentCandidateCard";
import { __resetExperimentCandidateStatsCacheForTest } from "./useExperimentCandidateStats";

const getExperimentCandidateStats =
  vi.fn<
    (payload: {
      projectLocation: ProjectLocation;
      baseRef: string;
    }) => Promise<GetExperimentCandidateStatsResult>
  >();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

const worktreeStatus: GitStatusResult = {
  isRepo: true,
  branch: candidate.worktreeBranch,
  tracking: "",
  hasRemote: false,
  remoteInfo: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
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
  beforeEach(() => {
    getExperimentCandidateStats.mockReset();
    __resetExperimentCandidateStatsCacheForTest();
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        getExperimentCandidateStats,
      },
    });
  });

  afterEach(() => {
    act(() => {
      useAppStore.setState({ projects: [], threads: [] });
      useGitStore.setState({ prData: {}, worktreeStatuses: {} });
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

  it("shows completed stats while a fresher worktree refresh is pending", async () => {
    const first = deferred<GetExperimentCandidateStatsResult>();
    const second = deferred<GetExperimentCandidateStatsResult>();
    getExperimentCandidateStats
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    act(() => {
      useAppStore.setState({
        projects: [
          {
            id: thread.projectId,
            name: "Candidate project",
            location: { kind: "posix", path: "/repo" },
            createdAt: "2026-07-16T00:00:00.000Z",
          },
        ],
        threads: [thread],
      });
      useGitStore.getState().setWorktreeStatus(thread.worktreePath!, worktreeStatus);
    });

    renderCard({ isCreatingPr: false, isMerging: false });
    await waitFor(() => expect(getExperimentCandidateStats).toHaveBeenCalledTimes(1));

    act(() => {
      useGitStore.getState().setWorktreeStatus(thread.worktreePath!, {
        ...worktreeStatus,
        unstaged: [
          {
            path: "bench/new.ts",
            status: "?",
            staged: false,
            insertions: 4_436,
            deletions: 0,
          },
        ],
        totalInsertions: 4_436,
      });
    });
    await waitFor(() => expect(getExperimentCandidateStats).toHaveBeenCalledTimes(2));

    first.resolve({ insertions: 261, deletions: 0, files: 3 });
    await waitFor(() => expect(screen.getByText("+261")).toBeInTheDocument());
    expect(
      screen
        .getByRole("button", { name: "Review candidate 1 (GPT-5) changes" })
        .querySelector(".animate-spin"),
    ).not.toBe(null);

    second.resolve({ insertions: 4_436, deletions: 0, files: 267 });
    await waitFor(() => expect(screen.getByText("+4436")).toBeInTheDocument());
    expect(
      screen
        .getByRole("button", { name: "Review candidate 1 (GPT-5) changes" })
        .querySelector(".animate-spin"),
    ).toBe(null);
  });

  it("retries a failed stats refresh while the candidate is active", async () => {
    getExperimentCandidateStats
      .mockRejectedValueOnce(new Error("candidate changed"))
      .mockResolvedValueOnce({ insertions: 12, deletions: 1, files: 2 });
    act(() => {
      useAppStore.setState({
        projects: [
          {
            id: thread.projectId,
            name: "Candidate project",
            location: { kind: "posix", path: "/repo" },
            createdAt: "2026-07-16T00:00:00.000Z",
          },
        ],
        threads: [{ ...thread, status: "working" }],
      });
      useGitStore.getState().setWorktreeStatus(thread.worktreePath!, worktreeStatus);
    });

    renderCard({ isCreatingPr: false, isMerging: false });

    await waitFor(() => expect(getExperimentCandidateStats).toHaveBeenCalledTimes(2), {
      timeout: 2_000,
    });
    expect(await screen.findByText("+12")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
  });
});
