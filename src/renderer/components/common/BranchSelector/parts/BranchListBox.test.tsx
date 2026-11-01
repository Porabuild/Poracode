import { createRef } from "react";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { msg } from "@lingui/core/macro";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrData, Thread } from "@/shared/contracts";
import { buildBranchNamePrKey } from "@/renderer/state/gitSelectors";
import { useGitStore } from "@/renderer/state/gitStore";
import { BranchListBox, type BranchListBoxHandle, type OpenPrReviewArgs } from "./BranchListBox";

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
    listboxId: "branch-listbox",
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
    onActiveChange: vi.fn<(branchName: string | null) => void>(),
  };
}

afterEach(() => {
  cleanup();
  useGitStore.setState({ prData: {} });
});

describe("BranchListBox", () => {
  it("toggles the default worktree base and pin-to-top without selecting the row", () => {
    const props = baseProps();
    const onDefaultWorktreeBranchChange = vi.fn<(branchName: string | undefined) => void>();
    const onTogglePinned = vi.fn<(branchName: string) => void>();
    const main = { name: "main", current: true, commit: "a", isRemote: false };
    const develop = { name: "develop", current: false, commit: "b", isRemote: false };
    const items = [
      { type: "header" as const, id: "header-local", name: msg`Local` },
      { type: "branch" as const, id: main.name, branch: main },
      { type: "branch" as const, id: develop.name, branch: develop },
    ];

    render(
      <BranchListBox
        {...props}
        hasLocal
        items={items}
        defaultWorktreeBranch="main"
        onDefaultWorktreeBranchChange={onDefaultWorktreeBranchChange}
        pinnedBranches={new Set(["develop"])}
        onTogglePinned={onTogglePinned}
      />,
    );

    const isDefault = screen.getByRole("button", {
      name: "Use main as default worktree base",
    });
    expect(isDefault).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(isDefault);
    expect(onDefaultWorktreeBranchChange).toHaveBeenLastCalledWith(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Use develop as default worktree base" }));
    expect(onDefaultWorktreeBranchChange).toHaveBeenLastCalledWith("develop");

    const pinned = screen.getByRole("button", { name: "Pin develop to top" });
    expect(pinned).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(pinned);
    expect(onTogglePinned).toHaveBeenLastCalledWith("develop");
    fireEvent.click(screen.getByRole("button", { name: "Pin main to top" }));
    expect(onTogglePinned).toHaveBeenLastCalledWith("main");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("hides the row toggles when the picker does not offer them", () => {
    const branch = { name: "main", current: true, commit: "a", isRemote: false };
    render(
      <BranchListBox
        {...baseProps()}
        hasLocal
        items={[{ type: "branch", id: branch.name, branch }]}
        defaultWorktreeBranch="main"
        pinnedBranches={new Set(["main"])}
      />,
    );
    expect(screen.queryByRole("button", { name: /default worktree base|to top/ })).toBeNull();
  });

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
          { type: "header", id: "header-remote", name: msg`Remote` },
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
          { type: "header", id: "header-remote", name: msg`Remote` },
          { type: "branch", id: branch.name, branch },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review PR #42 for feature/x" }));

    expect(props.onOpenPrReview).toHaveBeenCalledWith({ branch: "feature/x", prNumber: 42 });
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("highlights the local row when the worktree base is the origin ref", () => {
    const props = baseProps();
    const branch = {
      name: "main",
      current: true,
      commit: "abc123",
      isRemote: false,
    };

    render(
      <BranchListBox
        {...props}
        hasLocal
        hasRemote={false}
        worktreeMode
        value="origin/main"
        baseBranch="origin/main"
        items={[
          { type: "header", id: "header-local", name: msg`Local` },
          { type: "branch", id: branch.name, branch },
        ]}
      />,
    );

    expect(screen.getByRole("option", { name: "main" })).toHaveAttribute("aria-selected", "true");
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
          { type: "header", id: "header-local", name: msg`Local` },
          { type: "branch", id: branch.name, branch },
        ]}
      />,
    );

    // Worktree kind is conveyed by the leading fork glyph, not a "worktree" label.
    expect(container.querySelector(".lucide-git-fork")).not.toBeNull();
    expect(screen.queryByText("worktree")).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("scrolls the keyboard-active row into view in both directions", () => {
    const props = baseProps();
    const ref = createRef<BranchListBoxHandle>();
    const branches = [
      { name: "main", current: true, commit: "abc123", isRemote: false },
      { name: "feature/x", current: false, commit: "def456", isRemote: false },
      { name: "feature/y", current: false, commit: "ghi789", isRemote: false },
    ];

    render(
      <BranchListBox
        {...props}
        ref={ref}
        hasLocal
        hasRemote={false}
        items={[
          { type: "header", id: "header-local", name: msg`Local` },
          ...branches.map((branch) => ({
            type: "branch" as const,
            id: branch.name,
            branch,
          })),
        ]}
      />,
    );

    const listbox = screen.getByRole("listbox", { name: "Branches" });
    Object.defineProperty(listbox, "clientHeight", { configurable: true, value: 56 });
    listbox.scrollTop = 0;

    act(() => ref.current?.moveActive(1));
    expect(listbox.scrollTop).toBe(36);

    listbox.scrollTop = 100;
    act(() => ref.current?.moveActive(-1));
    expect(listbox.scrollTop).toBe(36);
  });
});
