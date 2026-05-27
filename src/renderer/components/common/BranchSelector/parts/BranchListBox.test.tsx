import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BranchListBox } from "./BranchListBox";

describe("BranchListBox", () => {
  it("fires delete for a remote branch row", () => {
    const onDelete =
      vi.fn<(branch: { name: string; remote?: string; isRemote?: boolean }) => void>();
    const onSelect = vi.fn<(branchName: string) => void>();
    const branch = {
      name: "feature/x",
      current: false,
      commit: "abc123",
      isRemote: true,
      remote: "origin",
    };

    render(
      <BranchListBox
        items={[
          { type: "header", id: "header-remote", name: "Remote" },
          { type: "branch", id: branch.name, branch },
        ]}
        hasLocal={false}
        hasRemote
        currentBranch="main"
        value="main"
        baseBranch={undefined}
        isWorktree={false}
        worktreeMode={false}
        deletingBranch={null}
        activeWorktreeBranches={new Set()}
        worktreeBranches={new Set()}
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete feature/x" }));

    expect(onDelete).toHaveBeenCalledWith(branch);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
