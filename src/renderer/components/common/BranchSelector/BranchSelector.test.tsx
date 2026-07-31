import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrData } from "@/shared/contracts";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { BranchSelector } from "./BranchSelector";

const bridge = vi.hoisted(() => ({
  isRemoteSession: vi.fn<() => boolean>(() => false),
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
  isRemoteSession: bridge.isRemoteSession,
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

describe("BranchSelector", () => {
  beforeEach(() => {
    bridge.isRemoteSession.mockReturnValue(false);
    bridge.gitAddWorktree.mockReset();
    bridge.gitAddWorktree.mockResolvedValue({
      path: "C:\\Users\\demo\\.poracode\\worktrees\\repo\\feature-x",
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
    useGitStore.setState({ prData: {} });
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

  it("keeps plain branch delete reachable on touch devices", async () => {
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
    });

    render(<BranchSelector projectId="project-1" currentBranch="main" value="main" />);

    fireEvent.click(screen.getByLabelText("Select branch"));

    const deleteButton = await screen.findByRole("button", { name: "Delete feature/x" });
    expect(deleteButton).toHaveClass("[@media(hover:none)]:opacity-100");
    expect(deleteButton).toHaveClass("[@media(pointer:coarse)]:opacity-100");
  });

  it("lets embedded mobile shells override PR badge navigation", async () => {
    const onOpenPrReview =
      vi.fn<(args: { branch: string; prNumber: number; worktreePath?: string }) => void>();
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
    });
    useGitStore
      .getState()
      .setPrData(
        buildBranchNamePrKey("project-1", "feature/x"),
        makePr({ number: 42, state: "open" }),
      );

    render(
      <BranchSelector
        projectId="project-1"
        currentBranch="main"
        value="main"
        onOpenPrReview={onOpenPrReview}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select branch"));
    fireEvent.click(await screen.findByRole("button", { name: "Review PR #42 for feature/x" }));

    expect(onOpenPrReview).toHaveBeenCalledWith({ branch: "feature/x", prNumber: 42 });
  });

  it("hides desktop-scoped worktree management actions in remote sessions", async () => {
    bridge.isRemoteSession.mockReturnValue(true);
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

    render(
      <BranchSelector
        projectId="project-1"
        currentBranch="main"
        value="main"
        showMoveBranchAction
      />,
    );

    fireEvent.click(screen.getByLabelText("Select branch"));

    expect(await screen.findByText("feature/x")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete feature/x" })).not.toBeInTheDocument();
    expect(screen.queryByText("Move changes to a new worktree")).not.toBeInTheDocument();
  });

  it("keeps selection-only menus free of branch management and PR actions", async () => {
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
    });

    render(
      <BranchSelector projectId="project-1" currentBranch="main" value="main" selectionOnly />,
    );

    fireEvent.click(screen.getByLabelText("Select branch"));

    expect(await screen.findByText("feature/x")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete feature/x" })).not.toBeInTheDocument();
    expect(screen.queryByText("Create branch")).not.toBeInTheDocument();
    expect(prefetchBranchPrData).not.toHaveBeenCalled();
  });
});
