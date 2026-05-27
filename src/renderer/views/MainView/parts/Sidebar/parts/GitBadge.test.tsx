import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import { GitBadge } from "./GitBadge";

vi.mock("@dnd-kit/react", () => ({
  useDraggable: () => undefined,
}));

vi.mock("@heroui/react", () => {
  const Tooltip = Object.assign((props: { children: ReactNode }) => <>{props.children}</>, {
    Trigger: (props: { children: ReactNode }) => <>{props.children}</>,
    Content: (props: { children: ReactNode }) => <div>{props.children}</div>,
  });
  return { Tooltip };
});

function makeStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    isRepo: true,
    branch: "feature/pr",
    tracking: "origin/feature/pr",
    hasRemote: true,
    remoteInfo: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
    ...overrides,
  };
}

describe("GitBadge", () => {
  beforeEach(() => {
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: {},
      prData: {},
      worktreeSourceInfo: {},
      prFiles: {},
      prDiffs: {},
      prDetails: {},
    });
  });

  it("shows a muted PR icon when a pushed worktree can create a PR", () => {
    useGitStore.setState({
      worktreeStatuses: { "/wt/feature": makeStatus() },
      ghAvailable: { "project-1": true },
    });

    render(<GitBadge projectId="project-1" projectName="feature/pr" worktreePath="/wt/feature" />);

    const badge = screen.getByRole("button", { name: "Git status for feature/pr" });
    const icon = badge.querySelector("svg");

    expect(icon).not.toBeNull();
    expect(icon).toHaveClass("text-muted/60");
    expect(icon).toHaveClass("lucide-git-pull-request");
  });

  it("falls back to a worktree fork icon when a clean worktree has no PR", () => {
    useGitStore.setState({
      worktreeStatuses: { "/wt/feature": makeStatus() },
    });

    render(
      <GitBadge
        projectId="project-1"
        projectName="feature/pr"
        worktreePath="/wt/feature"
        fallbackToWorktreeIcon
      />,
    );

    const badge = screen.getByRole("button", { name: "Git status for feature/pr" });
    const icon = badge.querySelector("svg");

    expect(icon).not.toBeNull();
    expect(icon).toHaveClass("lucide-git-fork");
  });

  it("renders nothing for a clean worktree without the fallback", () => {
    useGitStore.setState({
      worktreeStatuses: { "/wt/feature": makeStatus() },
    });

    render(<GitBadge projectId="project-1" projectName="feature/pr" worktreePath="/wt/feature" />);

    expect(screen.queryByRole("button", { name: "Git status for feature/pr" })).toBeNull();
  });
});
