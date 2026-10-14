import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { MobileWorkspacePage } from "./MobileWorkspacePage";

vi.mock("@/renderer/components/layout/PageLayout", () => ({
  PageLayout: (props: {
    compactTitle?: string;
    compactHeaderChildren?: ReactNode;
    onCompactBack?: () => void;
    content: ReactNode;
  }) => (
    <div>
      <button type="button" onClick={props.onCompactBack}>
        Back from {props.compactTitle}
      </button>
      {props.compactHeaderChildren}
      {props.content}
    </div>
  ),
}));

vi.mock("./RightPanel/parts/GitReviewPanelContent", () => ({
  GitReviewPanelContent: (props: {
    hideToolbar?: boolean;
    touchMode?: boolean;
    compactHeaderActions?: boolean;
  }) => (
    <div
      data-testid="git-workspace-pane"
      data-hide-toolbar={props.hideToolbar}
      data-touch-mode={props.touchMode}
      data-header-actions={props.compactHeaderActions}
    >
      Git pane
    </div>
  ),
}));

vi.mock("@/renderer/views/FileEditorOverlay/parts/ProjectFilesPanel", () => ({
  ProjectFilesPanel: (props: {
    rootContext: { rootLabel: string };
    compact?: boolean;
    compactActionsVisible?: boolean;
  }) => (
    <div
      data-testid="files-workspace-pane"
      data-compact={props.compact}
      data-compact-actions-visible={props.compactActionsVisible}
    >
      {props.rootContext.rootLabel}
    </div>
  ),
}));

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-08-15T00:00:00.000Z",
};

describe("MobileWorkspacePage", () => {
  beforeEach(() => {
    useFileEditorStore.getState().clearSession();
    useGitStore.setState({
      statuses: {},
      worktreeStatuses: {
        "/repo/.poracode/worktrees/mobile-git": {
          isRepo: true,
          branch: "feature/mobile-git",
          tracking: "",
          hasRemote: false,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          totalInsertions: 0,
          totalDeletions: 0,
          detail: "full",
        },
      },
    });
    useAppStore.setState({ projects: [project] });
    usePanelStore.setState({
      gitReviewContext: {
        projectId: project.id,
        worktreePath: "/repo/.poracode/worktrees/mobile-git",
      },
      gitReviewAsPanel: true,
      gitOverlayOpen: false,
      filesPanelContext: null,
      rightPanelTab: "git",
      mobileUtilityPage: "workspace",
    });
  });

  it("switches between the dedicated Git and Files panes", () => {
    render(<MobileWorkspacePage />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Files", "Git"]);
    expect(screen.getByRole("tablist", { name: "Workspace view" })).toHaveClass(
      "m-floating-selector",
      "rounded-full",
    );
    expect(screen.getByRole("tab", { name: "Git" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("git-workspace-pane")).toBeInTheDocument();
    expect(screen.getByTestId("git-workspace-pane")).toHaveAttribute("data-hide-toolbar", "true");
    expect(screen.getByTestId("git-workspace-pane")).toHaveAttribute("data-touch-mode", "true");
    expect(screen.getByTestId("git-workspace-pane")).toHaveAttribute("data-header-actions", "true");
    expect(screen.getByTestId("files-workspace-pane")).toBeInTheDocument();
    expect(screen.getByTestId("files-workspace-pane")).toHaveAttribute("data-compact", "true");
    const filesPanel = document.getElementById("mobile-workspace-files-panel");
    expect(filesPanel).not.toBeNull();
    expect(
      filesPanel!.compareDocumentPosition(screen.getByRole("tablist", { name: "Workspace view" })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("files-workspace-pane")).toHaveAttribute(
      "data-compact-actions-visible",
      "true",
    );
    expect(usePanelStore.getState()).toMatchObject({
      rightPanelTab: "files",
      filesPanelContext: {
        projectId: project.id,
        worktreePath: "/repo/.poracode/worktrees/mobile-git",
      },
    });
    expect(screen.getByTestId("git-workspace-pane")).toHaveAttribute(
      "data-header-actions",
      "false",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Git" }));
    expect(usePanelStore.getState().rightPanelTab).toBe("git");
  });

  it("closes the compact page without leaving the desktop panel visible", () => {
    render(<MobileWorkspacePage />);

    fireEvent.click(screen.getByRole("button", { name: "Back from Git" }));

    expect(usePanelStore.getState()).toMatchObject({
      gitReviewContext: null,
      filesPanelContext: null,
      gitOverlayOpen: false,
      mobileUtilityPage: null,
    });
  });
});
