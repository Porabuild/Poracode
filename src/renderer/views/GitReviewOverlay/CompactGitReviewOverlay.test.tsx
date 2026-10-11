import { fireEvent, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { CompactGitReviewOverlay } from "./CompactGitReviewOverlay";
import { GitReviewPanel } from "./parts/GitReviewPanel";

vi.mock("@/renderer/components/layout/PageLayout", () => ({
  PageLayout: (props: { onCompactBack?: () => void; content: ReactNode }) => (
    <div>
      <button type="button" onClick={props.onCompactBack}>
        Back
      </button>
      {props.content}
    </div>
  ),
}));

vi.mock("./parts/GitReviewPanel", () => ({
  GitReviewPanel: vi.fn<(props: ComponentProps<typeof GitReviewPanel>) => ReactNode>(() => (
    <div data-testid="compact-git-review" />
  )),
}));

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-08-15T00:00:00.000Z",
};

describe("CompactGitReviewOverlay", () => {
  it("renders the review panel as a full page and closes through mobile back", () => {
    const onClose = vi.fn<() => void>();

    render(
      <CompactGitReviewOverlay
        project={project}
        worktreePath="/repo/.poracode/worktrees/mobile-git"
        worktreeBranch="feature/mobile-git"
        statusKey="/repo/.poracode/worktrees/mobile-git"
        onClose={onClose}
      />,
    );

    expect(screen.getByTestId("compact-git-review")).toBeInTheDocument();
    expect(vi.mocked(GitReviewPanel)).toHaveBeenCalledWith(
      expect.objectContaining<Partial<ComponentProps<typeof GitReviewPanel>>>({
        project,
        worktreePath: "/repo/.poracode/worktrees/mobile-git",
        worktreeBranch: "feature/mobile-git",
        statusKey: "/repo/.poracode/worktrees/mobile-git",
        hideHeader: true,
      }),
      undefined,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
