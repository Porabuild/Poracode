import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrData, Thread } from "@/shared/contracts";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { BranchListBox, type OpenPrReviewArgs } from "./BranchListBox";

function makePr(overrides: Partial<PrData> & Pick<PrData, "number" | "state">): PrData {
  return {
    title: "Some PR",
    url: "https://example.com/pr",
    baseBranch: "main",
    isDraft: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeThread(overrides: Partial<Thread> & Pick<Thread, "id" | "projectId">): Thread {
  return {
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseProps() {
  return {
    projectId: "p1",
    hasLocal: false,
    hasRemote: true,
    currentBranch: "main",
    value: "main",
    baseBranch: undefined,
    isWorktree: false,
    worktreeMode: false,
    deletingBranch: null,
    worktreeBranches: new Set<string>(),
    branchWorktreePath: new Map<string, string>(),
    threadsByBranch: new Map<string, Thread[]>(),
    onSelect: vi.fn<(branchName: string) => void>(),
    onDelete: vi.fn<(branch: { name: string; remote?: string; isRemote?: boolean }) => void>(),
    onOpenPrReview: vi.fn<(args: OpenPrReviewArgs) => void>(),
  };
}

afterEach(() => {
  useGitStore.setState({ prData: {} });
});

describe("BranchListBox", () => {
  it("fires delete for a remote branch row", () => {
    const props = baseProps();
    const branch = {
      name: "feature/x",
      current: false,
      commit: "abc123",
      isRemote: true,
      remote: "origin",
    };

    render(
      <BranchListBox
        {...props}
        items={[
          { type: "header", id: "header-remote", name: "Remote" },
          { type: "branch", id: branch.name, branch },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete feature/x" }));

    expect(props.onDelete).toHaveBeenCalledWith(branch);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("renders a PR icon and opens review on click for a branch without a worktree", () => {
    const props = baseProps();
    const branch = {
      name: "feature/x",
      current: false,
      commit: "abc123",
      isRemote: true,
      remote: "origin",
    };
    useGitStore
      .getState()
      .setPrData(buildBranchNamePrKey("p1", "feature/x"), makePr({ number: 42, state: "open" }));

    render(
      <BranchListBox
        {...props}
        items={[
          { type: "header", id: "header-remote", name: "Remote" },
          { type: "branch", id: branch.name, branch },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review PR #42 for feature/x" }));

    expect(props.onOpenPrReview).toHaveBeenCalledWith({ branch: "feature/x", prNumber: 42 });
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("marks worktree branches with a fork icon and a thread-count badge", () => {
    const props = baseProps();
    const branch = {
      name: "feature/x",
      current: false,
      commit: "abc123",
      isRemote: false,
    };

    const { container } = render(
      <BranchListBox
        {...props}
        hasLocal
        hasRemote={false}
        worktreeBranches={new Set(["feature/x"])}
        branchWorktreePath={new Map([["feature/x", "/wt/feature-x"]])}
        threadsByBranch={new Map([["feature/x", [makeThread({ id: "t1", projectId: "p1" })]]])}
        items={[
          { type: "header", id: "header-local", name: "Local" },
          { type: "branch", id: branch.name, branch },
        ]}
      />,
    );

    // Worktree kind is conveyed by the leading fork glyph, not a "worktree" label.
    expect(container.querySelector(".lucide-git-fork")).not.toBeNull();
    expect(screen.queryByText("worktree")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
