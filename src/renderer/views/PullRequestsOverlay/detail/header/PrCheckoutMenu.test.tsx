// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, GitWorktreeInfo, Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import {
  makeTestDetails,
  makeTestPrData,
  renderInPrDetail,
  TEST_PROJECT_ID,
} from "../../testing/prDetailTestScope";
import { PrCheckoutMenu } from "./PrCheckoutMenu";

const project: Project = {
  id: TEST_PROJECT_ID,
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-01-01T00:00:00Z",
};
const mainWorktree: GitWorktreeInfo = { path: "/repo", branch: "main", commit: "a", isMain: true };
const featureWorktree: GitWorktreeInfo = {
  path: "/wt/feature",
  branch: "feature/login",
  commit: "b",
  isMain: false,
};
const cleanStatus: GitStatusResult = {
  isRepo: true,
  branch: "main",
  tracking: "origin/main",
  hasRemote: true,
  remoteInfo: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
};
function renderMenu(options: { worktrees?: GitWorktreeInfo[]; crossRepository?: boolean }) {
  useAppStore.setState({ projects: [project] });
  useGitStore.setState({
    worktrees: { [project.id]: options.worktrees ?? [mainWorktree] },
    statuses: { [project.id]: cleanStatus },
  });
  return renderInPrDetail(
    <PrCheckoutMenu />,
    {},
    {
      details: makeTestDetails({ headBranch: "feature/login" }),
      prData: makeTestPrData(options.crossRepository ? { isCrossRepository: true } : {}),
    },
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Check out" }));
}

describe("PrCheckoutMenu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers a new worktree and the repository checkout", () => {
    renderMenu({});
    openMenu();
    expect(screen.queryByText("Open existing worktree")).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Check out in a new worktree/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /Check out in this repository/ })).toBeEnabled();
  });

  it("lists the existing worktree and the thread shortcut", () => {
    renderMenu({ worktrees: [mainWorktree, featureWorktree] });
    openMenu();
    expect(screen.getByRole("menuitem", { name: /Open existing worktree/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /Start a thread in this worktree/ })).toBeEnabled();
  });

  it("explains why a cross-repository pull request cannot be checked out", () => {
    renderMenu({ crossRepository: true });
    openMenu();
    expect(screen.getByRole("menuitem", { name: /Check out in a new worktree/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitem", { name: /Check out in this repository/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getAllByText("Cross-repository pull requests cannot be checked out here"),
    ).not.toHaveLength(0);
  });
});
