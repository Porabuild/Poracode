import { screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { GitStatusResult, PrData, ProjectLocation } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { buildBranchPrKey } from "@/renderer/state/gitSelectors";
import { getWorktreeActionVisibility } from "./useWorktreeActions";
import { GitBadge } from "./GitBadge";

const ghGetPrForBranchMock = vi.hoisted(() =>
  vi.fn<
    (payload: { projectLocation: ProjectLocation; branch: string }) => Promise<PrData | null>
  >(),
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    ghGetPrForBranch: ghGetPrForBranchMock,
  }),
}));

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

const basePr: PrData = {
  number: 1,
  state: "open",
  title: "PR",
  url: "https://github.com/o/r/pull/1",
  baseBranch: "main",
  isDraft: false,
  updatedAt: "2026-06-02T00:00:00.000Z",
};

describe("GitBadge", () => {
  beforeEach(() => {
    ghGetPrForBranchMock.mockReset();
    useAppStore.setState({
      projects: [],
    });
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

  it("shows a branch-tone PR icon when a pushed worktree can create a PR", () => {
    useGitStore.setState({
      worktreeStatuses: { "/wt/feature": makeStatus() },
      ghAvailable: { "project-1": true },
    });

    render(<GitBadge projectId="project-1" projectName="feature/pr" worktreePath="/wt/feature" />);

    const badge = screen.getByRole("button", { name: "Git status for feature/pr" });
    const icon = badge.querySelector("svg");

    expect(icon).not.toBeNull();
    expect(icon).toHaveClass("text-[color:var(--git-branch-tone)]");
    expect(icon).toHaveClass("lucide-git-pull-request");
  });

  it("keeps the latest merged PR status visible while allowing another PR", () => {
    useGitStore.setState({
      worktreeStatuses: { "/wt/feature": makeStatus() },
      ghAvailable: { "project-1": true },
      prData: {
        "/wt/feature": { ...basePr, number: 2, state: "merged" },
      },
    });

    render(<GitBadge projectId="project-1" projectName="feature/pr" worktreePath="/wt/feature" />);

    const badge = screen.getByRole("button", { name: "Git status for feature/pr" });
    const icon = badge.querySelector(".lucide-git-pull-request");
    const actions = getWorktreeActionVisibility("project-1", "/wt/feature");

    expect(icon).toHaveClass("text-[color:var(--pr-merged)]");
    expect(actions.showCreatePr).toBe(true);
    expect(actions.showOpenPr).toBe(false);
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

  it("shows a hover affordance for a clean worktree without the fallback", () => {
    useGitStore.setState({
      worktreeStatuses: { "/wt/feature": makeStatus() },
    });

    render(<GitBadge projectId="project-1" projectName="feature/pr" worktreePath="/wt/feature" />);

    const badge = screen.getByRole("button", { name: "Git status for feature/pr" });
    const icon = badge.querySelector("svg");

    expect(badge).toHaveClass("opacity-0");
    expect(badge).toHaveClass("p-[3px]");
    expect(badge).not.toHaveClass("w-[18px]");
    expect(badge).not.toHaveClass("w-0");
    expect(icon).not.toBeNull();
    expect(icon).toHaveClass("lucide-git-branch");
    expect(screen.getByText("Open Git panel")).toBeInTheDocument();
  });

  it("shows a not-repo badge after git status reports a non-repo", () => {
    useGitStore.setState({
      statuses: {
        "project-1": makeStatus({
          isRepo: false,
          branch: "",
          tracking: "",
          hasRemote: false,
          remoteInfo: null,
        }),
      },
    });

    render(<GitBadge projectId="project-1" projectName="Project" />);

    const badge = screen.getByRole("button", {
      name: "Git status for Project: not a Git repository",
    });
    const icon = badge.querySelector("svg");

    expect(icon).not.toBeNull();
    expect(icon).toHaveClass("lucide-git-branch-minus");
    expect(screen.getByText("Not a Git repository")).toBeInTheDocument();
  });

  it("shows a hover affordance before git status loads", () => {
    render(<GitBadge projectId="project-1" projectName="Project" />);

    const badge = screen.getByRole("button", { name: "Git status for Project" });
    const icon = badge.querySelector("svg");

    expect(badge).toHaveClass("opacity-0");
    expect(badge).toHaveClass("p-[3px]");
    expect(badge).not.toHaveClass("w-[18px]");
    expect(badge).not.toHaveClass("w-0");
    expect(icon).not.toBeNull();
    expect(icon).toHaveClass("lucide-git-branch");
  });

  it("pads a glyph-only badge into a square, and only widens one carrying diff counts", () => {
    useGitStore.setState({
      worktreeStatuses: { "/wt/feature": makeStatus() },
      prData: { "/wt/feature": basePr },
    });

    const { unmount } = render(
      <GitBadge projectId="project-1" projectName="feature/pr" worktreePath="/wt/feature" />,
    );

    // PR icon only: an 18px square, matching the row's other icon buttons.
    expect(screen.getByRole("button", { name: "Git status for feature/pr" })).toHaveClass(
      "p-[3px]",
    );
    unmount();

    useGitStore.setState({
      worktreeStatuses: {
        "/wt/feature": makeStatus({ totalInsertions: 12, totalDeletions: 3 }),
      },
      prData: { "/wt/feature": basePr },
    });
    render(<GitBadge projectId="project-1" projectName="feature/pr" worktreePath="/wt/feature" />);

    const withCounts = screen.getByRole("button", { name: "Git status for feature/pr" });
    expect(withCounts).toHaveClass("px-1");
    expect(withCounts).not.toHaveClass("p-[3px]");
  });

  it("renders diff stats before the PR icon so the icon stays aligned with the timestamp", () => {
    useGitStore.setState({
      worktreeStatuses: {
        "/wt/feature": makeStatus({ totalInsertions: 12, totalDeletions: 3 }),
      },
      prData: {
        "/wt/feature": basePr,
      },
    });

    render(<GitBadge projectId="project-1" projectName="feature/pr" worktreePath="/wt/feature" />);

    const badge = screen.getByRole("button", { name: "Git status for feature/pr" });
    const insertion = screen.getByText("+12");
    const prIcon = badge.querySelector(".lucide-git-pull-request");

    expect(prIcon).not.toBeNull();
    expect(
      insertion.compareDocumentPosition(prIcon!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not show a stale project PR while fetching the current branch PR", async () => {
    let resolvePr: (pr: PrData | null) => void = () => {};
    ghGetPrForBranchMock.mockReturnValue(
      new Promise<PrData | null>((resolve) => {
        resolvePr = resolve;
      }),
    );
    useAppStore.setState({
      projects: [
        {
          id: "project-1",
          name: "Project",
          location: { kind: "posix", path: "/repo" },
          createdAt: "2026-06-02T00:00:00.000Z",
        },
      ],
    });
    useGitStore.setState({
      statuses: {
        "project-1": makeStatus({
          branch: "feature/current",
          remoteInfo: { platform: "github", owner: "o", repo: "r", url: "https://github.com/o/r" },
        }),
      },
      ghAvailable: { "project-1": true },
      prData: {
        [buildBranchPrKey("project-1")]: { ...basePr, number: 99, title: "Stale PR" },
      },
    });

    render(<GitBadge projectId="project-1" projectName="Project" />);

    const loadingBadge = screen.getByRole("button", { name: "Git status for Project" });
    expect(loadingBadge.querySelector(".lucide-git-pull-request")).toBeNull();
    expect(loadingBadge.querySelector(".lucide-git-branch")).not.toBeNull();
    expect(ghGetPrForBranchMock).toHaveBeenCalledWith({
      projectLocation: { kind: "posix", path: "/repo" },
      branch: "feature/current",
    });

    resolvePr({ ...basePr, number: 2, title: "Current PR" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Git status for Project" })).toBeInTheDocument();
    });
    expect(useGitStore.getState().prData[buildBranchPrKey("project-1")]?.number).toBe(2);
  });

  it("shares one PR lookup across concurrent badges for the same project branch", async () => {
    let resolvePr: (pr: PrData | null) => void = () => {};
    ghGetPrForBranchMock.mockReturnValue(
      new Promise<PrData | null>((resolve) => {
        resolvePr = resolve;
      }),
    );
    useAppStore.setState({
      projects: [
        {
          id: "project-1",
          name: "Project",
          location: { kind: "posix", path: "/repo" },
          createdAt: "2026-06-02T00:00:00.000Z",
        },
      ],
    });
    useGitStore.setState({
      statuses: {
        "project-1": makeStatus({
          branch: "feature/current",
          remoteInfo: { platform: "github", owner: "o", repo: "r", url: "https://github.com/o/r" },
        }),
      },
      ghAvailable: { "project-1": true },
    });

    render(
      <>
        <GitBadge projectId="project-1" projectName="Project" />
        <GitBadge projectId="project-1" projectName="Project" />
      </>,
    );

    expect(ghGetPrForBranchMock).toHaveBeenCalledTimes(1);

    resolvePr({ ...basePr, number: 2, title: "Current PR" });

    await waitFor(() => {
      const badges = screen.getAllByRole("button", { name: "Git status for Project" });
      expect(badges).toHaveLength(2);
      for (const badge of badges) {
        expect(badge.querySelector(".lucide-git-pull-request")).not.toBeNull();
      }
    });
    expect(useGitStore.getState().prData[buildBranchPrKey("project-1")]?.number).toBe(2);
  });
});
