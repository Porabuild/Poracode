import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { describe, expect, it, vi } from "vitest";
import { BranchFooterActions } from "./BranchFooterActions";
import type { BranchSelection } from "./types";

describe("BranchFooterActions", () => {
  it("keeps a selected existing worktree when disabling new-worktree mode from the row", async () => {
    const onSelect = vi.fn<(selection: BranchSelection) => void>();
    const onWorktreeModeChange = vi.fn<(value: boolean) => void>();

    render(
      <BranchFooterActions
        isCreating={false}
        setIsCreating={vi.fn<(value: boolean) => void>()}
        newBranchName=""
        setNewBranchName={vi.fn<(value: string) => void>()}
        createRef={{ current: null }}
        searchRef={{ current: null }}
        handleCreateBranch={vi.fn<() => void>()}
        hideWorktreeToggle={false}
        worktreeMode
        onWorktreeModeChange={onWorktreeModeChange}
        baseBranch="feature/x"
        value="feature/x"
        isWorktree
        branchWorktreePath={
          new Map([["feature/x", "C:\\Users\\demo\\.lightcode\\worktrees\\repo\\feature-x"]])
        }
        onSelect={onSelect}
        showMoveBranch={false}
        isMovingBranch={false}
        onMoveBranchToWorktree={vi.fn<() => void>()}
      />,
    );

    fireEvent.click(screen.getByText("New worktree"));

    await waitFor(() => {
      expect(onWorktreeModeChange).toHaveBeenCalledWith(false);
      expect(onSelect).toHaveBeenCalledWith({
        branch: "feature/x",
        baseBranch: "feature/x",
        isWorktree: true,
        worktreePath: "C:\\Users\\demo\\.lightcode\\worktrees\\repo\\feature-x",
      });
    });
  });
});
