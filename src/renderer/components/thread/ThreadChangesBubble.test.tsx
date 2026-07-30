import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadChangesBubble } from "./ThreadChangesBubble";

vi.mock("@heroui/react", () => {
  const Tooltip = Object.assign((props: { children: ReactNode }) => <>{props.children}</>, {
    Trigger: (props: { children: ReactNode }) => <>{props.children}</>,
    Content: (props: { children: ReactNode }) => <div role="tooltip">{props.children}</div>,
  });
  return { Tooltip };
});

function makeStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    isRepo: true,
    branch: "poracode/fix-pwa-worktree-setup",
    tracking: "origin/poracode/fix-pwa-worktree-setup",
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

describe("ThreadChangesBubble", () => {
  beforeEach(() => {
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {},
    });
    usePanelStore.setState({
      gitReviewContext: null,
      gitReviewAsPanel: false,
      gitOverlayOpen: false,
      rightPanelTab: "git",
    });
  });

  it("keeps a clean worktree visible as an icon-only glass control with its name in a tooltip", () => {
    const worktreePath = "/repo/.poracode/worktrees/poracode-fix-pwa-worktree-setup";
    useGitStore.setState({
      worktreeStatuses: {
        [worktreePath]: makeStatus(),
      },
    });

    render(
      <ThreadChangesBubble
        projectId="project-1"
        worktreePath={worktreePath}
        worktreeName="poracode/fix-pwa-worktree-setup"
      />,
    );

    const bubble = screen.getByRole("button", { name: "Review changes" });

    expect(bubble).toHaveClass("poracode-floating-chrome", "w-7");
    expect(bubble).not.toHaveClass("absolute");
    expect(bubble.parentElement).toHaveClass("absolute", "right-3", "bottom-full");
    expect(bubble.querySelector(".lucide-git-fork")).not.toBeNull();
    expect(screen.getByRole("tooltip")).toHaveTextContent("poracode/fix-pwa-worktree-setup");
  });

  it("shows worktree changes beside the icon and opens Git review for that worktree", () => {
    const worktreePath = "C:\\repo-worktrees\\calm-viper";
    useGitStore.setState({
      worktreeStatuses: {
        [worktreePath]: makeStatus({ totalInsertions: 42, totalDeletions: 7 }),
      },
    });

    render(<ThreadChangesBubble projectId="project-1" worktreePath={worktreePath} />);

    const bubble = screen.getByRole("button", { name: "Review changes" });

    expect(bubble).toHaveTextContent("+42");
    expect(bubble).toHaveTextContent("-7");
    expect(screen.getByRole("tooltip")).toHaveTextContent("calm-viper");

    fireEvent.click(bubble);

    expect(usePanelStore.getState().gitReviewContext).toEqual({
      projectId: "project-1",
      worktreePath,
    });
    expect(usePanelStore.getState().gitReviewAsPanel).toBe(true);
  });

  it("stays hidden for a clean root project", () => {
    useGitStore.setState({
      statuses: {
        "project-1": makeStatus(),
      },
    });

    render(<ThreadChangesBubble projectId="project-1" />);

    expect(screen.queryByRole("button", { name: "Review changes" })).not.toBeInTheDocument();
  });
});
