import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BranchSelector } from "./BranchSelector";

const bridge = vi.hoisted(() => ({
  gitAddWorktree:
    vi.fn<(payload: unknown) => Promise<{ path: string; changesTransferred?: boolean }>>(),
}));

const refreshGitProject = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());
const prefetchBranchPrData = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>());
const openNewThreadInWorktree = vi.hoisted(() => vi.fn<(input: unknown) => void>());
const deleteWorktreeGroup = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>());
const useBranchListMock = vi.hoisted(() =>
  vi.fn<(params: { projectId: string; search: string }) => unknown>(),
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/state/gitRefresh", () => ({
  refreshGitProject,
  prefetchBranchPrData,
}));

vi.mock("@/renderer/actions/threadActions", () => ({
  openNewThreadInWorktree,
}));

vi.mock("@/renderer/actions/worktreeActions", () => ({
  deleteWorktreeGroup,
}));

vi.mock("./parts/useBranchList", () => ({
  useBranchList: useBranchListMock,
}));

const emptyBranchList = {
  items: [],
  hasLocal: false,
  hasRemote: false,
  worktreeBranches: new Set<string>(),
  branchWorktreePath: new Map<string, string>(),
  threadsByBranch: new Map<string, unknown>(),
  projectLocation: { kind: "windows", path: "C:\\repo" },
};

describe("BranchSelector", () => {
  beforeEach(() => {
    bridge.gitAddWorktree.mockReset();
    bridge.gitAddWorktree.mockResolvedValue({
      path: "C:\\Users\\demo\\.lightcode\\worktrees\\repo\\feature-x",
      changesTransferred: true,
    });
    refreshGitProject.mockReset();
    refreshGitProject.mockResolvedValue(undefined);
    prefetchBranchPrData.mockReset();
    prefetchBranchPrData.mockResolvedValue(undefined);
    openNewThreadInWorktree.mockReset();
    deleteWorktreeGroup.mockReset();
    useBranchListMock.mockReset();
    useBranchListMock.mockReturnValue(emptyBranchList);
  });

  it("moves the current changes into a new worktree, leaving the current branch clean", async () => {
    render(
      <BranchSelector
        projectId="project-1"
        currentBranch="feature/x"
        value="feature/x"
        showMoveBranchAction
        moveBranchCopyIgnoredPatterns={[".env", ".env.*"]}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select branch"));
    fireEvent.click(await screen.findByText("Move changes to a new worktree"));

    await waitFor(() => {
      expect(bridge.gitAddWorktree).toHaveBeenCalledWith(
        expect.objectContaining({
          projectLocation: { kind: "windows", path: "C:\\repo" },
          // A new branch is forked from the current branch and the work is moved
          // into it (transferUncommitted), leaving the current branch clean.
          branch: expect.any(String),
          createBranch: true,
          startPoint: "feature/x",
          transferUncommitted: true,
          copyIgnoredPatterns: [".env", ".env.*"],
        }),
      );
    });
  });

  it("confirms before removing a worktree branch, then reuses deleteWorktreeGroup", async () => {
    useBranchListMock.mockReturnValue({
      ...emptyBranchList,
      hasLocal: true,
      items: [
        { type: "header", id: "header-local", name: "Local" },
        {
          type: "branch",
          id: "feature/x",
          branch: { name: "feature/x", current: false, commit: "abc123", isRemote: false },
        },
      ],
      worktreeBranches: new Set(["feature/x"]),
      branchWorktreePath: new Map([["feature/x", "/wt/feature-x"]]),
      threadsByBranch: new Map([
        ["feature/x", [{ id: "t1", projectId: "project-1", status: "idle", done: false }]],
      ]),
    });

    render(<BranchSelector projectId="project-1" currentBranch="main" value="main" />);

    fireEvent.click(screen.getByLabelText("Select branch"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete feature/x" }));

    // Removal does not run until the confirmation is accepted.
    expect(deleteWorktreeGroup).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(deleteWorktreeGroup).toHaveBeenCalledWith("project-1", "/wt/feature-x", ["t1"]);
    });
  });
});
