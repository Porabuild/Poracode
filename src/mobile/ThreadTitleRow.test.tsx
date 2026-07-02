// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadTitleRow } from "./ThreadTitleRow";

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    title: "Worktree thread",
    projectId: "project-1",
    agentKind: "codex",
    status: "idle",
    attention: "none",
    config: { model: "gpt-5" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    done: false,
    starred: false,
    ...overrides,
  } as Thread;
}

describe("ThreadTitleRow", () => {
  it("offers a new-thread handoff for a worktree thread", () => {
    const onNewThreadInWorktree =
      vi.fn<(input: { projectId: string; worktreePath: string; worktreeBranch: string }) => void>();

    render(
      <ThreadTitleRow
        thread={makeThread({ worktreePath: "/repo/wt", worktreeBranch: "feature/x" })}
        onAction={() => undefined}
        onNewThreadInWorktree={onNewThreadInWorktree}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Thread actions" }));
    fireEvent.click(screen.getByText("New thread in worktree"));

    expect(onNewThreadInWorktree).toHaveBeenCalledWith({
      projectId: "project-1",
      worktreePath: "/repo/wt",
      worktreeBranch: "feature/x",
    });
  });

  it("deletes a worktree from the thread header without hiding delete-thread", () => {
    const onDeleteWorktreeGroup =
      vi.fn<
        (input: { projectId: string; worktreePath: string; threadIds: readonly string[] }) => void
      >();
    const onAction = vi.fn<(action: unknown) => void>();

    render(
      <ThreadTitleRow
        thread={makeThread({ worktreePath: "/repo/wt", worktreeBranch: "feature/x" })}
        onAction={onAction}
        onDeleteWorktreeGroup={onDeleteWorktreeGroup}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Thread actions" }));
    expect(screen.getByText("Delete Thread")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete Worktree"));

    expect(onDeleteWorktreeGroup).toHaveBeenCalledWith({
      projectId: "project-1",
      worktreePath: "/repo/wt",
      threadIds: ["thread-1"],
    });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("includes every sibling thread id when deleting a shared worktree", () => {
    // Given the full thread list, deleting a worktree must gather all threads
    // pointing at that path/project — not just the header's own thread.
    const onDeleteWorktreeGroup =
      vi.fn<
        (input: { projectId: string; worktreePath: string; threadIds: readonly string[] }) => void
      >();
    const active = makeThread({
      id: "thread-1",
      worktreePath: "/repo/wt",
      worktreeBranch: "feature/x",
    });
    const sibling = makeThread({
      id: "thread-2",
      worktreePath: "/repo/wt",
      worktreeBranch: "feature/x",
    });
    // An unrelated worktree in the same project must be excluded.
    const other = makeThread({
      id: "thread-3",
      worktreePath: "/repo/other",
      worktreeBranch: "feature/y",
    });

    render(
      <ThreadTitleRow
        thread={active}
        threads={[active, sibling, other]}
        onAction={() => undefined}
        onDeleteWorktreeGroup={onDeleteWorktreeGroup}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Thread actions" }));
    fireEvent.click(screen.getByText("Delete Worktree"));

    expect(onDeleteWorktreeGroup).toHaveBeenCalledTimes(1);
    const input = onDeleteWorktreeGroup.mock.calls[0]![0];
    expect(input.projectId).toBe("project-1");
    expect(input.worktreePath).toBe("/repo/wt");
    expect([...input.threadIds].sort()).toEqual(["thread-1", "thread-2"]);
  });

  it("keeps worktree-only actions hidden for a project-root thread", () => {
    render(<ThreadTitleRow thread={makeThread()} onAction={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Thread actions" }));

    expect(screen.queryByText("New thread in worktree")).toBeNull();
    expect(screen.queryByText("Delete Worktree")).toBeNull();
    expect(screen.getByText("Delete Thread")).toBeInTheDocument();
  });
});
