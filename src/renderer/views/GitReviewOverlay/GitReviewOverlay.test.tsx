// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useGitStore } from "@/renderer/state/gitStore";
import { useGitReviewActionStore } from "@/renderer/state/gitReviewActionStore";
import { useSidebarOverlayStore } from "@/renderer/state/sidebarOverlayStore";

const layout = vi.hoisted(() => ({ compact: false }));

const bridge = vi.hoisted(() => ({
  getGitStatus: vi.fn<() => Promise<GitStatusResult>>(),
  getGitDiffBatch: vi.fn<() => Promise<{ staged: unknown[]; unstaged: unknown[] }>>(),
  gitFetch: vi.fn<() => Promise<void>>(),
  gitSwitchBranch: vi.fn<() => Promise<void>>(),
  gitStage: vi.fn<() => Promise<void>>(),
  gitUnstage: vi.fn<() => Promise<void>>(),
  gitRevert: vi.fn<() => Promise<void>>(),
  gitStageAll: vi.fn<() => Promise<void>>(),
  gitUnstageAll: vi.fn<() => Promise<void>>(),
  gitRevertAll: vi.fn<() => Promise<void>>(),
  gitCommit: vi.fn<() => Promise<void>>(),
  gitGetWorktreeSourceBranch: vi.fn<() => Promise<unknown>>(),
  ghGetPrForBranch: vi.fn<() => Promise<null>>(),
  generateCommitMessage: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isRemoteSession: () => false,
  isMac: () => false,
  isWindows: () => false,
}));

vi.mock("@/renderer/state/gitRefresh", () => ({
  refreshGitProject: vi.fn<() => Promise<void>>(),
}));

import { GitReviewOverlay } from "./GitReviewOverlay";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  createdAt: "2026-07-25T10:00:00.000Z",
  location: { kind: "windows", path: "C:\\repo" },
};

const gitStatus: GitStatusResult = {
  isRepo: true,
  branch: "feature/worktree",
  tracking: "",
  hasRemote: false,
  remoteInfo: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [
    {
      path: "src/worktree-only.ts",
      status: "M",
      staged: false,
      insertions: 8,
      deletions: 3,
    },
  ],
  totalInsertions: 8,
  totalDeletions: 3,
};

describe("GitReviewOverlay", () => {
  beforeEach(() => {
    layout.compact = false;
    bridge.getGitStatus.mockReset().mockResolvedValue(gitStatus);
    bridge.getGitDiffBatch.mockReset().mockResolvedValue({ staged: [], unstaged: [] });
    bridge.gitFetch.mockReset().mockResolvedValue(undefined);
    bridge.gitGetWorktreeSourceBranch.mockReset().mockImplementation(() => new Promise(() => {}));
    bridge.ghGetPrForBranch.mockReset().mockResolvedValue(null);
    useGitStore.setState({
      ghAvailable: {},
      prData: {},
      worktreeSourceInfo: {},
      statuses: { [project.id]: gitStatus },
      worktreeStatuses: {},
    });
    useGitReviewActionStore.setState({ panels: {} });
    useSidebarOverlayStore.setState({ isCollapsed: false, isAutoCollapsed: false });
  });

  it("uses the touch Git layout in the compact overlay", async () => {
    layout.compact = true;
    useSidebarOverlayStore.setState({ isCollapsed: true, isAutoCollapsed: true });

    render(<GitReviewOverlay project={project} onClose={() => {}} />);

    const main = screen.getByRole("main");
    const file = within(main).getByText("worktree-only.ts");
    expect(file.closest(".invisible")).toBeNull();
    expect(within(main).getByText("worktree-only.ts")).toBeInTheDocument();
    expect(within(main).getByPlaceholderText("Commit message (Ctrl+Enter)")).toBeInTheDocument();
    expect(within(main).queryByText("No changes to display")).not.toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toHaveClass("m-home-compose-action");

    fireEvent.click(within(main).getByText("worktree-only.ts"));
    expect(await within(main).findByText("Unable to load diff.")).toBeInTheDocument();
    expect(within(main).getByPlaceholderText("Commit message (Ctrl+Enter)")).toBeInTheDocument();
  });

  it("stages a file from the compact long-press drawer while the shell sidebar is collapsed", async () => {
    layout.compact = true;
    useSidebarOverlayStore.setState({ isCollapsed: true, isAutoCollapsed: true });
    bridge.gitStage.mockResolvedValue(undefined);

    render(<GitReviewOverlay project={project} onClose={() => {}} />);

    const main = screen.getByRole("main");
    const file = within(main).getByRole("button", { name: /worktree-only\.ts/ });
    expect(file.closest(".invisible")).toBeNull();
    expect(within(main).queryByTitle("Stage")).not.toBeInTheDocument();

    fireEvent.contextMenu(file);
    const drawer = await screen.findByRole("dialog", { name: "worktree-only.ts" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Stage" }));

    await waitFor(() =>
      expect(bridge.gitStage).toHaveBeenCalledWith({
        projectLocation: project.location,
        filePath: "src/worktree-only.ts",
      }),
    );
  });
});
