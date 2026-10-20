import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { keyDownAt } from "@/renderer/testUtils/keyboard";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrData } from "@/shared/contracts";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { BranchSelector, type BranchSelection } from "./BranchSelector";

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

function localBranchItems(names: string[]) {
  return [
    { type: "header" as const, id: "header-local", name: "Local" },
    ...names.map((name, index) => ({
      type: "branch" as const,
      id: name,
      branch: { name, current: index === 0, commit: `commit-${index}`, isRemote: false },
    })),
  ];
}

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

  it("keeps focus in search while arrowing through branches and selects with Enter", async () => {
    useBranchListMock.mockReturnValue({
      ...emptyBranchList,
      hasLocal: true,
      items: [
        { type: "header", id: "header-local", name: "Local" },
        {
          type: "branch",
          id: "main",
          branch: { name: "main", current: true, commit: "abc123", isRemote: false },
        },
        {
          type: "branch",
          id: "feature/x",
          branch: { name: "feature/x", current: false, commit: "def456", isRemote: false },
        },
      ],
    });
    const onSelect = vi.fn<(selection: BranchSelection) => void>();

    render(
      <BranchSelector
        projectId="project-1"
        currentBranch="main"
        value="main"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select branch"));
    const search = await screen.findByRole("combobox");
    const listbox = screen.getByRole("listbox", { name: "Branches" });
    await waitFor(() => expect(search).toHaveFocus());

    expect(search).toHaveAttribute("aria-controls", listbox.id);
    await waitFor(() =>
      expect(
        document.getElementById(search.getAttribute("aria-activedescendant") ?? ""),
      ).toHaveTextContent("main"),
    );

    fireEvent.keyDown(search, { key: "ArrowDown" });

    expect(search).toHaveFocus();
    const activeBranch = document.getElementById(
      search.getAttribute("aria-activedescendant") ?? "",
    );
    expect(activeBranch).toHaveTextContent("feature/x");
    expect(activeBranch).toHaveAttribute("data-active", "true");

    fireEvent.keyDown(search, { key: "ArrowDown", shiftKey: true });
    expect(
      document.getElementById(search.getAttribute("aria-activedescendant") ?? ""),
    ).toHaveTextContent("feature/x");

    fireEvent.keyDown(search, { key: "ArrowUp" });
    expect(
      document.getElementById(search.getAttribute("aria-activedescendant") ?? ""),
    ).toHaveTextContent("main");

    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith({ branch: "feature/x", isWorktree: false });
  });

  it("selects the first matching branch when Enter follows typing immediately", async () => {
    useBranchListMock.mockImplementation(({ search }) => {
      const branches = [
        {
          type: "branch" as const,
          id: "main",
          branch: { name: "main", current: true, commit: "abc123", isRemote: false },
        },
        {
          type: "branch" as const,
          id: "feature/x",
          branch: { name: "feature/x", current: false, commit: "def456", isRemote: false },
        },
      ];
      const filtered = search ? branches.filter((b) => b.id.includes(search)) : branches;
      return {
        ...emptyBranchList,
        hasLocal: filtered.length > 0,
        items: [
          ...(filtered.length > 0
            ? [{ type: "header" as const, id: "header-local", name: "Local" }]
            : []),
          ...filtered,
        ],
      };
    });
    const onSelect = vi.fn<(selection: BranchSelection) => void>();

    render(
      <BranchSelector
        projectId="project-1"
        currentBranch="main"
        value="main"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select branch"));
    const search = await screen.findByRole("combobox");

    fireEvent.change(search, { target: { value: "feature" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith({ branch: "feature/x", isWorktree: false });
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "leaves IME Enter to the input method (%j)",
    async (keyEvent) => {
      useBranchListMock.mockReturnValue({
        ...emptyBranchList,
        hasLocal: true,
        items: localBranchItems(["main", "feature/x"]),
      });
      const onSelect = vi.fn<(selection: BranchSelection) => void>();

      render(
        <BranchSelector
          projectId="project-1"
          currentBranch="main"
          value="main"
          onSelect={onSelect}
        />,
      );

      fireEvent.click(screen.getByLabelText("Select branch"));
      const search = await screen.findByRole("combobox");
      await waitFor(() => expect(search).toHaveFocus());

      fireEvent(search, keyDownAt(search, { key: "Enter", ...keyEvent }, 100));

      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.getByRole("combobox")).toBeInTheDocument();

      fireEvent(search, keyDownAt(search, { key: "Enter" }, 101));
      expect(onSelect).toHaveBeenCalledWith({ branch: "main", isWorktree: false });
    },
  );

  it("does not select a branch on an IME-replayed Enter", async () => {
    useBranchListMock.mockReturnValue({
      ...emptyBranchList,
      hasLocal: true,
      items: localBranchItems(["main", "feature/x"]),
    });
    const onSelect = vi.fn<(selection: BranchSelection) => void>();

    render(
      <BranchSelector
        projectId="project-1"
        currentBranch="main"
        value="main"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select branch"));
    const search = await screen.findByRole("combobox");
    await waitFor(() => expect(search).toHaveFocus());

    fireEvent(search, keyDownAt(search, { key: "Enter", isComposing: true, keyCode: 229 }, 100));
    fireEvent.compositionEnd(search, { data: "feat" });
    const replay = keyDownAt(search, { key: "Enter", keyCode: 13 }, 100);
    fireEvent(search, replay);

    expect(replay.defaultPrevented).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toBeInTheDocument();

    fireEvent(search, keyDownAt(search, { key: "Enter", keyCode: 13 }, 101));
    expect(onSelect).toHaveBeenCalledWith({ branch: "main", isWorktree: false });
  });

  it("syncs the active row when the pointer moves over another branch", async () => {
    useBranchListMock.mockReturnValue({
      ...emptyBranchList,
      hasLocal: true,
      items: localBranchItems(["main", "feature/x"]),
    });
    const onSelect = vi.fn<(selection: BranchSelection) => void>();

    render(
      <BranchSelector
        projectId="project-1"
        currentBranch="main"
        value="main"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText("Select branch"));
    const search = await screen.findByRole("combobox");
    const listbox = screen.getByRole("listbox", { name: "Branches" });
    await waitFor(() => expect(search).toHaveFocus());
    await waitFor(() =>
      expect(
        document.getElementById(search.getAttribute("aria-activedescendant") ?? ""),
      ).toHaveTextContent("main"),
    );

    const featureOption = document.getElementById(`${listbox.id}-option-feature/x`);
    expect(featureOption).not.toBeNull();
    fireEvent.pointerMove(featureOption!, { movementX: 1, movementY: 1 });

    const activeBranch = document.getElementById(
      search.getAttribute("aria-activedescendant") ?? "",
    );
    expect(activeBranch).toHaveTextContent("feature/x");
    expect(activeBranch).toHaveAttribute("data-active", "true");

    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ branch: "feature/x", isWorktree: false });
  });

  it("drops the listbox relationship when the filter matches nothing", async () => {
    useBranchListMock.mockImplementation(({ search }) =>
      search
        ? { ...emptyBranchList }
        : { ...emptyBranchList, hasLocal: true, items: localBranchItems(["main"]) },
    );

    render(<BranchSelector projectId="project-1" currentBranch="main" value="main" />);

    fireEvent.click(screen.getByLabelText("Select branch"));
    const search = await screen.findByRole("combobox");
    expect(search).toHaveAttribute("aria-controls");

    fireEvent.change(search, { target: { value: "zzz" } });

    expect(await screen.findByText("No branches found")).toBeInTheDocument();
    expect(search).not.toHaveAttribute("aria-controls");
    await waitFor(() => expect(search).not.toHaveAttribute("aria-activedescendant"));
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
