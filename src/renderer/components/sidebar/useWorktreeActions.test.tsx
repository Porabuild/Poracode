import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useGitStore } from "../../state/gitStore";
import { type GitMenuIcons, useWorktreeGitItems } from "./useWorktreeActions";

const WORKTREE_PATH = "C:\\repo\\wt";

const icons: GitMenuIcons = {
  review: null,
  sync: null,
  push: null,
  pull: null,
  pullFromSource: null,
  merge: null,
  openPr: null,
  createPr: null,
};

function WorktreeGitItemsProbe() {
  const items = useWorktreeGitItems("project-1", WORKTREE_PATH, icons);
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.label}</li>
      ))}
    </ul>
  );
}

describe("useWorktreeGitItems", () => {
  beforeEach(() => {
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
      worktrees: {},
      branches: {},
      ghAvailable: {},
      prData: {},
      worktreeSourceInfo: {},
    });
  });

  it("adds merge actions when source info arrives after the initial render", () => {
    render(<WorktreeGitItemsProbe />);

    expect(screen.queryByText("Merge to Source")).not.toBeInTheDocument();
    expect(screen.queryByText("Merge & Remove")).not.toBeInTheDocument();

    act(() => {
      useGitStore.getState().setWorktreeSourceInfoBatch({
        [WORKTREE_PATH]: {
          sourceBranch: "master",
          commitsAhead: 2,
          sourceAhead: 0,
        },
      });
    });

    expect(screen.getByText("Merge to Source")).toBeInTheDocument();
    expect(screen.getByText("Merge & Remove")).toBeInTheDocument();
  });

  it("shows pull from source with the source-ahead count", () => {
    render(<WorktreeGitItemsProbe />);

    expect(screen.queryByText("Pull from Source (3)")).not.toBeInTheDocument();

    act(() => {
      useGitStore.getState().setWorktreeSourceInfoBatch({
        [WORKTREE_PATH]: {
          sourceBranch: "master",
          commitsAhead: 0,
          sourceAhead: 3,
        },
      });
    });

    expect(screen.getByText("Pull from Source (3)")).toBeInTheDocument();
  });

  it("hides pull from source when the source branch is not ahead", () => {
    render(<WorktreeGitItemsProbe />);

    act(() => {
      useGitStore.getState().setWorktreeSourceInfoBatch({
        [WORKTREE_PATH]: {
          sourceBranch: "master",
          commitsAhead: 0,
          sourceAhead: 0,
        },
      });
    });

    expect(screen.queryByText(/^Pull from Source/)).not.toBeInTheDocument();
  });
});
