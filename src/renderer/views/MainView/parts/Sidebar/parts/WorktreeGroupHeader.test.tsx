import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { getWorktreeGroupStatusTone, WorktreeGroupHeader } from "./WorktreeGroupHeader";

vi.mock("@/renderer/components/common/SidebarButton", () => ({
  SidebarButton: (props: { icon: React.ReactNode }) => <div>{props.icon}</div>,
}));

function renderHeader(props: {
  isCollapsed: boolean;
  isDone?: boolean;
  childTones: Parameters<typeof getWorktreeGroupStatusTone>[0];
}) {
  const collapsedStatusTone = getWorktreeGroupStatusTone(props.childTones);
  return render(
    <WorktreeGroupHeader
      worktreePath="C:\\repo\\worktree"
      worktreeBranch="feature/status"
      projectId="project-1"
      isCollapsed={props.isCollapsed}
      {...(props.isDone !== undefined ? { isDone: props.isDone } : {})}
      hasTerminal={false}
      isActiveTerminal={false}
      isActiveGit={false}
      onToggleCollapse={vi.fn<() => void>()}
      onOpenFiles={vi.fn<() => void>()}
      onOpenGitReview={vi.fn<() => void>()}
      onOpenTerminal={vi.fn<() => void>()}
      onDeleteWorktree={vi.fn<() => void>()}
      updatedAt="2026-08-08T00:00:00.000Z"
      {...(collapsedStatusTone !== undefined ? { collapsedStatusTone } : {})}
    />,
  );
}

describe("WorktreeGroupHeader", () => {
  it("prioritizes moonlight over green when collapsed", () => {
    const { container } = renderHeader({
      isCollapsed: true,
      childTones: ["working", "finished"],
    });

    expect(container.querySelector(".lucide-git-fork")).toHaveClass("text-[oklch(0.82_0.12_260)]");
  });

  it("shows green for a working child when no child is finished", () => {
    const { container } = renderHeader({
      isCollapsed: true,
      childTones: ["inactive", "working"],
    });

    expect(container.querySelector(".lucide-git-fork")).toHaveClass("text-success");
  });

  it("stays white while expanded", () => {
    const { container } = renderHeader({
      isCollapsed: false,
      childTones: ["finished", "working"],
    });

    expect(container.querySelector(".lucide-git-fork")).toHaveClass("text-foreground");
  });

  it("stays white while expanded when every child is done", () => {
    const { container } = renderHeader({
      isCollapsed: false,
      isDone: true,
      childTones: ["done", "done"],
    });

    expect(container.querySelector(".lucide-git-fork")).toHaveClass("text-foreground");
    expect(container.querySelector(".lucide-check")).not.toBeInTheDocument();
  });
});
