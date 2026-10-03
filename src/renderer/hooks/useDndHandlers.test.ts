import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { FLAT_THREAD_LIST_SORT_GROUP } from "@/renderer/views/MainView/parts/Sidebar/parts/sidebarProjectRows";
import { resolveProjectReorder, resolveThreadReorder, useDndHandlers } from "./useDndHandlers";

const showFilesPanel = vi.fn<(projectId: string, worktreePath?: string) => void>();
const showGitReviewPanel = vi.fn<(projectId: string, worktreePath?: string) => void>();
const showTerminalPanel = vi.fn<(projectId: string, worktreePath?: string) => void>();

vi.mock("@/renderer/actions/panelActions", () => ({
  showFilesPanel: (projectId: string, worktreePath?: string) =>
    showFilesPanel(projectId, worktreePath),
  showGitReviewPanel: (projectId: string, worktreePath?: string) =>
    showGitReviewPanel(projectId, worktreePath),
}));
vi.mock("@/renderer/actions/terminalActions", () => ({
  showTerminalPanel: (projectId: string, worktreePath?: string) =>
    showTerminalPanel(projectId, worktreePath),
}));

function makeThread(id: string, starred = false, projectId = "project-1"): Thread {
  return {
    id,
    projectId,
    title: id,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred,
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
  };
}

function makeProject(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-03-21T10:00:00.000Z",
  };
}

describe("resolveProjectReorder", () => {
  it("uses the hovered project when the sortable final index did not move", () => {
    expect(
      resolveProjectReorder({
        projects: [makeProject("a"), makeProject("b"), makeProject("c")],
        source: { type: "project", projectId: "a" },
        target: { type: "project", projectId: "c" },
        initialIndex: 0,
        finalIndex: 0,
      }),
    ).toEqual({ targetId: "c", placement: "after" });
  });

  it("falls back to the sortable final index when no hovered project is available", () => {
    expect(
      resolveProjectReorder({
        projects: [makeProject("a"), makeProject("b"), makeProject("c")],
        source: { type: "project", projectId: "c" },
        target: null,
        initialIndex: 2,
        finalIndex: 0,
      }),
    ).toEqual({ targetId: "a", placement: "before" });
  });
});

describe("resolveThreadReorder", () => {
  it("uses the hovered thread instead of the virtualized final index", () => {
    const threads = [makeThread("a"), makeThread("b", true), makeThread("c")];

    expect(
      resolveThreadReorder({
        threads,
        source: {
          type: "thread",
          threadId: "b",
          projectId: "project-1",
          sortGroup: "project-entries:project-1",
          sortIndex: 0,
        },
        target: {
          type: "thread",
          threadId: "c",
          projectId: "project-1",
          sortGroup: "project-entries:project-1",
          sortIndex: 2,
        },
        initialIndex: 0,
        finalIndex: 1,
      }),
    ).toEqual({ targetId: "c", placement: "after" });
  });

  it("falls back to the manual rendered order when no hovered thread is available", () => {
    const threads = [makeThread("a"), makeThread("b", true), makeThread("c")];

    expect(
      resolveThreadReorder({
        threads,
        source: {
          type: "thread",
          threadId: "b",
          projectId: "project-1",
          sortGroup: "project-entries:project-1",
          sortIndex: 0,
        },
        target: null,
        initialIndex: 0,
        finalIndex: 2,
      }),
    ).toEqual({ targetId: "c", placement: "after" });
  });
});

describe("manual index fallback with done threads", () => {
  it("skips done threads, which sit in the locked Done section", () => {
    const threads = [makeThread("a"), makeThread("done"), makeThread("b"), makeThread("c")];
    threads[1] = { ...threads[1]!, done: true };

    expect(
      resolveThreadReorder({
        threads,
        source: {
          type: "thread",
          threadId: "a",
          projectId: "project-1",
          sortGroup: "project-entries:project-1",
          sortIndex: 0,
        },
        target: null,
        initialIndex: 0,
        finalIndex: 1,
      }),
    ).toEqual({ targetId: "b", placement: "after" });
  });
});

describe("flat list thread reorder", () => {
  function flatSource(threadId: string, projectId: string, sortIndex: number) {
    return {
      type: "thread" as const,
      threadId,
      projectId,
      sortGroup: FLAT_THREAD_LIST_SORT_GROUP,
      sortIndex,
    };
  }

  it("accepts a hovered thread from another project", () => {
    expect(
      resolveThreadReorder({
        threads: [makeThread("a"), makeThread("b", false, "project-2")],
        source: flatSource("a", "project-1", 0),
        target: flatSource("b", "project-2", 1),
        initialIndex: 0,
        finalIndex: 1,
      }),
    ).toEqual({ targetId: "b", placement: "after" });
  });

  it("drops the move when no thread was hovered", () => {
    expect(
      resolveThreadReorder({
        threads: [makeThread("a"), makeThread("b", false, "project-2")],
        source: flatSource("a", "project-1", 0),
        target: null,
        initialIndex: 0,
        finalIndex: 1,
      }),
    ).toBeNull();
  });

  it("moves the thread in the global order on drop", () => {
    useAppStore.setState({
      threads: [
        makeThread("a1"),
        makeThread("b1", false, "project-2"),
        makeThread("a2"),
        makeThread("b2", false, "project-2"),
      ],
    });
    const { result } = renderHook(() => useDndHandlers());

    result.current.handleSortEnd(
      flatSource("b2", "project-2", 3),
      3,
      2,
      FLAT_THREAD_LIST_SORT_GROUP,
      FLAT_THREAD_LIST_SORT_GROUP,
      flatSource("a2", "project-1", 2),
    );

    expect(useAppStore.getState().threads.map((thread) => thread.id)).toEqual([
      "a1",
      "b1",
      "b2",
      "a2",
    ]);
  });
});

describe("useDndHandlers.handleMainPanelDrop", () => {
  function getHandler() {
    const { result } = renderHook(() => useDndHandlers());
    return result.current.handleMainPanelDrop;
  }

  function resetMocks() {
    showFilesPanel.mockReset();
    showGitReviewPanel.mockReset();
    showTerminalPanel.mockReset();
  }

  it("opens the files panel for a project drop (no worktree)", () => {
    resetMocks();
    getHandler()({ type: "project", projectId: "project-1" });
    expect(showFilesPanel).toHaveBeenCalledWith("project-1", undefined);
    expect(showGitReviewPanel).not.toHaveBeenCalled();
    expect(showTerminalPanel).not.toHaveBeenCalled();
  });

  it("opens the files panel for a worktree-group drop with worktreePath", () => {
    resetMocks();
    getHandler()({
      type: "worktree-group",
      projectId: "project-1",
      worktreePath: "/repo/.worktrees/feature",
      threadIds: [],
    });
    expect(showFilesPanel).toHaveBeenCalledWith("project-1", "/repo/.worktrees/feature");
  });

  it("dispatches sidebar-panel `files` to showFilesPanel", () => {
    resetMocks();
    getHandler()({
      type: "sidebar-panel",
      panel: "files",
      projectId: "project-1",
      worktreePath: "/repo/.worktrees/feature",
    });
    expect(showFilesPanel).toHaveBeenCalledWith("project-1", "/repo/.worktrees/feature");
    expect(showGitReviewPanel).not.toHaveBeenCalled();
  });

  it("dispatches sidebar-panel `git` to showGitReviewPanel", () => {
    resetMocks();
    getHandler()({
      type: "sidebar-panel",
      panel: "git",
      projectId: "project-1",
    });
    expect(showGitReviewPanel).toHaveBeenCalledWith("project-1", undefined);
    expect(showFilesPanel).not.toHaveBeenCalled();
  });

  it("dispatches sidebar-panel `terminal` to showTerminalPanel", () => {
    resetMocks();
    getHandler()({
      type: "sidebar-panel",
      panel: "terminal",
      projectId: "project-1",
      worktreePath: "/repo/.worktrees/feature",
    });
    expect(showTerminalPanel).toHaveBeenCalledWith("project-1", "/repo/.worktrees/feature");
    expect(showFilesPanel).not.toHaveBeenCalled();
    expect(showGitReviewPanel).not.toHaveBeenCalled();
  });
});
