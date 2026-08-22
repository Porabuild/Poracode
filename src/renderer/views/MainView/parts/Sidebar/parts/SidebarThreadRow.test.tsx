import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { SidebarRow } from "./sidebarProjectRows";
import { SidebarThreadRow } from "./SidebarThreadRow";

const threadActions = vi.hoisted(() => ({
  archiveThread: vi.fn<(threadId: string) => void>(),
  deleteThread: vi.fn<(threadId: string) => void>(),
}));
const worktreeActions = vi.hoisted(() => ({
  deleteWorktreeGroup:
    vi.fn<(projectId: string, worktreePath: string, threadIds: string[]) => void>(),
}));

vi.mock("@/renderer/actions/threadActions", () => threadActions);
vi.mock("@/renderer/actions/worktreeActions", () => worktreeActions);
vi.mock("./SidebarThreadGroup", () => ({ SidebarThreadGroup: () => null }));
vi.mock("./SidebarWorktreeGroup", () => ({ SidebarWorktreeGroup: () => null }));
vi.mock("./SortableThreadItem/SortableThreadItem", () => ({ SortableThreadItem: () => null }));

const project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-08-21T00:00:00.000Z",
} satisfies Project;

function makeThread(id: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    projectId: project.id,
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: true,
    starred: false,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

function renderDoneRow(options?: {
  hasProtectedDoneThreads?: boolean;
  doneThreads?: Thread[];
  allThreads?: Thread[];
}) {
  const doneThreads = options?.doneThreads ?? [makeThread("done-1"), makeThread("done-2")];
  const row: Extract<SidebarRow, { kind: "section-label" }> = {
    kind: "section-label",
    key: "done-label",
    label: { id: "Done", message: "Done" },
    doneThreads,
    hasProtectedDoneThreads: options?.hasProtectedDoneThreads ?? false,
  };
  useAppStore.setState({ threads: options?.allThreads ?? doneThreads });
  render(
    <SidebarThreadRow
      row={row}
      project={project}
      editingThreadId={null}
      setEditingThreadId={() => undefined}
    />,
  );
}

describe("SidebarThreadRow Done section action", () => {
  beforeEach(() => {
    threadActions.archiveThread.mockReset();
    threadActions.deleteThread.mockReset();
    worktreeActions.deleteWorktreeGroup.mockReset();
    useSharedSettings.setState({ threadRemoveAction: "archive" });
  });

  it("confirms and archives every done thread", () => {
    renderDoneRow();

    const trigger = screen.getByRole("button", { name: "Archive done threads" });
    expect(trigger).toHaveClass(
      "opacity-0",
      "group-hover:opacity-100",
      "focus-visible:opacity-100",
    );
    fireEvent.click(trigger);
    expect(screen.getByText("All threads in Done will be archived.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("All threads in Done will be archived.")).not.toBeInTheDocument();
    expect(threadActions.archiveThread).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(threadActions.archiveThread.mock.calls).toEqual([["done-1"], ["done-2"]]);
    expect(threadActions.deleteThread).not.toHaveBeenCalled();
  });

  it("confirms and permanently deletes every done thread", () => {
    useSharedSettings.setState({ threadRemoveAction: "delete" });
    renderDoneRow();

    fireEvent.click(screen.getByRole("button", { name: "Delete done threads" }));
    expect(
      screen.getByText("All threads in Done will be permanently deleted."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(threadActions.deleteThread.mock.calls).toEqual([["done-1"], ["done-2"]]);
    expect(threadActions.archiveThread).not.toHaveBeenCalled();
  });

  it("removes a worktree owned only by one done thread", () => {
    useSharedSettings.setState({ threadRemoveAction: "delete" });
    const thread = makeThread("done-1", {
      worktreePath: "C:\\repo\\.poracode\\worktrees\\feature",
    });
    renderDoneRow({ doneThreads: [thread] });

    fireEvent.click(screen.getByRole("button", { name: "Delete done threads" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(worktreeActions.deleteWorktreeGroup).toHaveBeenCalledWith(
      project.id,
      thread.worktreePath,
      [thread.id],
    );
    expect(threadActions.deleteThread).not.toHaveBeenCalled();
  });

  it("removes a worktree when every sibling is done", () => {
    useSharedSettings.setState({ threadRemoveAction: "delete" });
    const worktreePath = "C:\\repo\\.poracode\\worktrees\\feature";
    const threads = [
      makeThread("done-1", { worktreePath }),
      makeThread("done-2", { worktreePath }),
    ];
    renderDoneRow({ doneThreads: threads });

    fireEvent.click(screen.getByRole("button", { name: "Delete done threads" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(worktreeActions.deleteWorktreeGroup).toHaveBeenCalledWith(project.id, worktreePath, [
      "done-1",
      "done-2",
    ]);
    expect(threadActions.deleteThread).not.toHaveBeenCalled();
  });

  it("preserves a worktree that still has a retained sibling", () => {
    useSharedSettings.setState({ threadRemoveAction: "delete" });
    const worktreePath = "C:\\repo\\.poracode\\worktrees\\feature";
    const doneThread = makeThread("done-1", { worktreePath });
    const activeThread = makeThread("active-1", { worktreePath, done: false });
    renderDoneRow({ doneThreads: [doneThread], allThreads: [doneThread, activeThread] });

    fireEvent.click(screen.getByRole("button", { name: "Delete done threads" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(threadActions.deleteThread).toHaveBeenCalledWith(doneThread.id);
    expect(worktreeActions.deleteWorktreeGroup).not.toHaveBeenCalled();
  });

  it("uses one visible keyboard trigger and restores focus after Escape", async () => {
    renderDoneRow();

    const triggers = screen.getAllByRole("button", { name: "Archive done threads" });
    expect(triggers).toHaveLength(1);
    const trigger = triggers[0]!;
    act(() => trigger.focus());
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
    fireEvent.keyUp(trigger, { key: "Enter", code: "Enter" });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await vi.waitFor(() => expect(trigger).toHaveFocus());
  });

  it("explains that experiment candidates remain outside the batch", () => {
    renderDoneRow({ hasProtectedDoneThreads: true });

    fireEvent.click(screen.getByRole("button", { name: "Archive done threads" }));
    expect(
      screen.getByText(
        "Experiment candidates will remain; all other threads in Done will be archived.",
      ),
    ).toBeInTheDocument();
  });

  it("hides the action when Done contains only protected experiment candidates", () => {
    renderDoneRow({ hasProtectedDoneThreads: true, doneThreads: [] });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
