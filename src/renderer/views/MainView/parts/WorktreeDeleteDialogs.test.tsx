import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useWorktreeDeleteStore } from "@/renderer/state/worktreeDeleteStore";
import { WorktreeDeleteDialogs } from "./WorktreeDeleteDialogs";

const { bridge, toast, deleteThread } = vi.hoisted(() => ({
  bridge: {
    closeThread: vi.fn<() => Promise<void>>(),
    gitDeleteBranch: vi.fn<() => Promise<void>>(),
    gitListBranches: vi.fn<() => Promise<never[]>>(),
  },
  toast: {
    danger: vi.fn<(message: string) => void>(),
  },
  deleteThread: vi.fn<(threadId: string, worktreePath?: string, projectId?: string) => void>(),
}));

vi.mock("@/renderer/actions/threadActions", () => ({ deleteThread }));

vi.mock("@heroui/react", () => ({ toast }));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("@/renderer/views/MainView/parts/Sidebar/parts/DeleteThreadPopover", () => ({
  DeleteThreadPopover: (props: {
    anchorPosition: { x: number; y: number };
    worktreeBranch?: string;
    onDelete: () => void;
  }) => (
    <div>
      <span data-testid="delete-anchor">
        {props.anchorPosition.x},{props.anchorPosition.y}
      </span>
      <span data-testid="delete-branch">{props.worktreeBranch ?? "none"}</span>
      <button type="button" onClick={props.onDelete}>
        delete
      </button>
    </div>
  ),
}));

vi.mock("@/renderer/views/MainView/parts/Sidebar/parts/ForceDeleteBranchDialog", () => ({
  ForceDeleteBranchDialog: (props: { onForceDelete: () => void }) => (
    <button type="button" onClick={props.onForceDelete}>
      force delete
    </button>
  ),
}));

const project: Project = {
  id: "project-1",
  name: "Remote project",
  location: {
    kind: "posix",
    path: "/repo",
    remoteServerId: "desktop-1",
  },
  remoteServerId: "desktop-1",
  remoteId: "remote-project",
  createdAt: "2026-08-02T00:00:00.000Z",
};

describe("WorktreeDeleteDialogs", () => {
  beforeEach(() => {
    bridge.closeThread.mockReset().mockResolvedValue(undefined);
    bridge.gitDeleteBranch.mockReset().mockResolvedValue(undefined);
    bridge.gitListBranches.mockReset().mockResolvedValue([]);
    toast.danger.mockReset();
    deleteThread.mockReset();
    useAppStore.setState({ projects: [project] });
    useWorktreeDeleteStore.getState().setDialog({
      kind: "branch-unmerged",
      projectId: project.id,
      worktreeBranch: "feature/remote",
      error: "not fully merged",
    });
  });

  const worktreeThread: Thread = {
    id: "thread-1",
    projectId: project.id,
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    worktreePath: "/repo/.worktrees/feature",
    worktreeBranch: "feature/popover",
  };

  it("anchors the confirmation and hands the worktree context to the delete action", () => {
    useAppStore.setState({ threads: [worktreeThread] });
    useWorktreeDeleteStore.getState().setDialog({
      kind: "single-thread",
      threadId: worktreeThread.id,
      projectId: project.id,
      worktreePath: worktreeThread.worktreePath!,
      worktreeBranch: worktreeThread.worktreeBranch!,
      anchorPosition: { x: 320, y: 140 },
    });
    render(<WorktreeDeleteDialogs />);

    expect(screen.getByTestId("delete-anchor")).toHaveTextContent("320,140");
    expect(screen.getByTestId("delete-branch")).toHaveTextContent("feature/popover");
    fireEvent.click(screen.getByRole("button", { name: "delete" }));

    expect(deleteThread).toHaveBeenCalledWith(
      worktreeThread.id,
      worktreeThread.worktreePath,
      project.id,
    );
    expect(useWorktreeDeleteStore.getState().dialog).toBeNull();
  });

  it("confirms a thread with no worktree to remove", () => {
    const thread: Thread = { ...worktreeThread };
    delete thread.worktreePath;
    delete thread.worktreeBranch;
    useAppStore.setState({ threads: [thread] });
    useWorktreeDeleteStore.getState().setDialog({
      kind: "single-thread",
      threadId: thread.id,
      projectId: project.id,
      anchorPosition: { x: 320, y: 140 },
    });
    render(<WorktreeDeleteDialogs />);

    expect(screen.getByTestId("delete-branch")).toHaveTextContent("none");
    fireEvent.click(screen.getByRole("button", { name: "delete" }));

    expect(deleteThread).toHaveBeenCalledWith(thread.id, undefined, project.id);
    expect(useWorktreeDeleteStore.getState().dialog).toBeNull();
  });

  it("keeps the force-delete dialog open when the remote command fails", async () => {
    bridge.gitDeleteBranch.mockRejectedValueOnce(new Error("remote server offline"));
    render(<WorktreeDeleteDialogs />);

    fireEvent.click(screen.getByRole("button", { name: "force delete" }));

    await vi.waitFor(() => expect(toast.danger).toHaveBeenCalledWith("remote server offline"));
    expect(useWorktreeDeleteStore.getState().dialog).not.toBeNull();
    expect(bridge.gitListBranches).not.toHaveBeenCalled();
  });

  it("closes the force-delete dialog after the remote command succeeds", async () => {
    render(<WorktreeDeleteDialogs />);

    fireEvent.click(screen.getByRole("button", { name: "force delete" }));

    await vi.waitFor(() => expect(useWorktreeDeleteStore.getState().dialog).toBeNull());
    expect(bridge.gitDeleteBranch).toHaveBeenCalledWith({
      projectLocation: project.location,
      branch: "feature/remote",
      force: true,
    });
  });
});
