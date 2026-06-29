// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { __resetCollapsedGroupCache, ThreadsView } from "./ThreadsView";

// Keep these tests focused on grouping: stub the provider icon/status helpers
// (which pull in the full provider manifest). The git badges become testid
// markers so we can assert *where* each is mounted (row vs group header).
vi.mock("@/renderer/components/providers", () => ({
  ThreadProviderIcon: () => null,
  getStatusTone: () => "inactive",
}));

vi.mock("../GitSummaryParts", () => ({
  GitSummaryBadge: ({ threadId }: { threadId: string }) => (
    <span data-testid={`row-git-${threadId}`} />
  ),
  WorktreeGitSummaryBadge: ({ threadIds }: { threadIds: readonly string[] }) => (
    <span data-testid="group-git" data-threads={threadIds.join(",")} />
  ),
}));

// The common barrel pulls in fileIcons' `~file-icons/*.svg` glob, which the
// test transform can't resolve; only OptionMenu is needed here.
vi.mock("@/renderer/components/common", () => ({
  OptionMenu: () => null,
}));

const PROJECT: Project = { id: "p1", name: "Proj" } as unknown as Project;

function makeThread(overrides: Partial<Thread> & Pick<Thread, "id" | "title">): Thread {
  return {
    projectId: "p1",
    agentKind: "claude",
    status: "inactive",
    done: false,
    starred: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    config: { model: "x" },
    ...overrides,
  } as unknown as Thread;
}

function renderView(
  threads: Thread[],
  handlers?: {
    onThreadAction?: (thread: Thread, action: unknown) => void;
    onNewThreadInWorktree?: (input: {
      projectId: string;
      worktreePath: string;
      worktreeBranch: string;
    }) => void;
    onDeleteWorktreeGroup?: (input: {
      projectId: string;
      worktreePath: string;
      threadIds: readonly string[];
    }) => void;
    onOpenTerminal?: (input: { projectId: string; worktreePath?: string }) => void;
    onRunProjectAction?: (input: {
      projectId: string;
      actionId: string;
      worktreePath?: string;
    }) => void;
    projects?: Project[];
  },
) {
  return render(
    <ThreadsView
      projects={handlers?.projects ?? [PROJECT]}
      threads={threads}
      selectedThreadId={null}
      projectFilter={null}
      onProjectFilterChange={() => {}}
      onOpenThread={() => {}}
      onThreadAction={handlers?.onThreadAction ?? (() => {})}
      onNew={() => {}}
      onNewThreadInWorktree={handlers?.onNewThreadInWorktree ?? (() => {})}
      onDeleteWorktreeGroup={handlers?.onDeleteWorktreeGroup ?? (() => {})}
      onOpenTerminal={handlers?.onOpenTerminal ?? (() => {})}
      onRunProjectAction={handlers?.onRunProjectAction ?? (() => {})}
    />,
  );
}

describe("ThreadsView grouping", () => {
  // Collapse state lives in a module-level cache; reset it so cases don't leak.
  beforeEach(__resetCollapsedGroupCache);

  it("collects threads sharing a worktree under one group header", () => {
    const { container } = renderView([
      makeThread({
        id: "a",
        title: "Alpha",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({
        id: "b",
        title: "Bravo",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({ id: "c", title: "Charlie" }),
    ]);

    // The shared worktree becomes a labelled, count-bearing group header...
    const header = screen.getByRole("button", { expanded: true });
    expect(header.textContent).toContain("feature/x");
    expect(container.querySelector(".m-thread-group__count")?.textContent).toBe("2");

    // ...and its members render (expanded by default), alongside the lone thread.
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.getByText("Charlie")).toBeTruthy();
  });

  it("leaves a single-thread worktree as a plain row (no group header)", () => {
    const { container } = renderView([
      makeThread({
        id: "a",
        title: "Alpha",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({ id: "c", title: "Charlie" }),
    ]);

    expect(container.querySelector("[aria-expanded]")).toBeNull();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Charlie")).toBeTruthy();
  });

  it("offers a new-thread handoff from a single-thread worktree row menu", () => {
    const onNewThreadInWorktree =
      vi.fn<(input: { projectId: string; worktreePath: string; worktreeBranch: string }) => void>();
    renderView(
      [
        makeThread({
          id: "a",
          title: "Alpha",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
      ],
      { onNewThreadInWorktree },
    );

    fireEvent.contextMenu(screen.getByText("Alpha").closest("button")!);
    fireEvent.click(screen.getByText("New thread in worktree"));

    expect(onNewThreadInWorktree).toHaveBeenCalledTimes(1);
    expect(onNewThreadInWorktree).toHaveBeenCalledWith({
      projectId: "p1",
      worktreePath: "/repo/wt",
      worktreeBranch: "feature/x",
    });
  });

  it("deletes a single-thread worktree from its row menu with the linked thread id", () => {
    const onDeleteWorktreeGroup =
      vi.fn<
        (input: { projectId: string; worktreePath: string; threadIds: readonly string[] }) => void
      >();
    renderView(
      [
        makeThread({
          id: "a",
          title: "Alpha",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
      ],
      { onDeleteWorktreeGroup },
    );

    fireEvent.contextMenu(screen.getByText("Alpha").closest("button")!);
    fireEvent.click(screen.getByText("Delete Worktree"));

    expect(onDeleteWorktreeGroup).toHaveBeenCalledTimes(1);
    expect(onDeleteWorktreeGroup).toHaveBeenCalledWith({
      projectId: "p1",
      worktreePath: "/repo/wt",
      threadIds: ["a"],
    });
  });

  it("collapses and re-expands the group when its header is tapped", () => {
    renderView([
      makeThread({
        id: "a",
        title: "Alpha",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({
        id: "b",
        title: "Bravo",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({ id: "c", title: "Charlie" }),
    ]);

    fireEvent.click(screen.getByRole("button", { expanded: true }));

    // Members are hidden; the lone thread and the (now collapsed) header remain.
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.queryByText("Bravo")).toBeNull();
    expect(screen.getByText("Charlie")).toBeTruthy();
    const header = screen.getByRole("button", { expanded: false });

    fireEvent.click(header);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
  });

  it("shows the worktree's git badge on the header instead of each member row", () => {
    renderView([
      makeThread({
        id: "a",
        title: "Alpha",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({
        id: "b",
        title: "Bravo",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({ id: "c", title: "Charlie" }),
    ]);

    // The group header carries the worktree's git summary...
    const groupGit = screen.getByTestId("group-git");
    expect(groupGit.getAttribute("data-threads")).toBe("a,b");
    // ...so its member rows drop their own badge, while the lone row keeps it.
    expect(screen.queryByTestId("row-git-a")).toBeNull();
    expect(screen.queryByTestId("row-git-b")).toBeNull();
    expect(screen.getByTestId("row-git-c")).toBeTruthy();
  });

  it("keeps per-row git badges for a provider (groupId) group", () => {
    renderView([
      makeThread({ id: "d", title: "Delta", groupId: "g1", groupName: "Compare providers" }),
      makeThread({ id: "e", title: "Echo", groupId: "g1", groupName: "Compare providers" }),
    ]);

    // groupId groups can span worktrees, so the header has no shared badge...
    expect(screen.queryByTestId("group-git")).toBeNull();
    // ...and each member keeps its own.
    expect(screen.getByTestId("row-git-d")).toBeTruthy();
    expect(screen.getByTestId("row-git-e")).toBeTruthy();
  });

  it("filters threads from the touch search box", () => {
    renderView([
      makeThread({ id: "a", title: "Alpha" }),
      makeThread({
        id: "b",
        title: "Bravo",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/mobile",
      }),
    ]);

    fireEvent.change(screen.getByLabelText("Search threads"), {
      target: { value: "mobile" },
    });

    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.getByText("Bravo")).toBeTruthy();
  });

  it("shows a recoverable empty state when search has no matches", () => {
    renderView([makeThread({ id: "a", title: "Alpha" }), makeThread({ id: "b", title: "Bravo" })]);

    fireEvent.change(screen.getByLabelText("Search threads"), {
      target: { value: "zzz" },
    });

    expect(screen.getByText("No matching threads")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear search"));
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
  });

  it("remembers a collapsed group across a remount within the session", () => {
    const threads = [
      makeThread({
        id: "a",
        title: "Alpha",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({
        id: "b",
        title: "Bravo",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
    ];
    const first = renderView(threads);
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    first.unmount();

    // A fresh mount (e.g. tabbing back to the list) keeps the group collapsed.
    renderView(threads);
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("opens a bulk-action menu from the group header and fans out per thread", () => {
    const onThreadAction = vi.fn<(thread: Thread, action: unknown) => void>();
    renderView(
      [
        makeThread({
          id: "a",
          title: "Alpha",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
        makeThread({
          id: "b",
          title: "Bravo",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
        makeThread({ id: "c", title: "Charlie" }),
      ],
      { onThreadAction },
    );

    // Right-click / long-press the group header opens the group actions sheet.
    fireEvent.contextMenu(screen.getByRole("button", { expanded: true }));
    expect(screen.getByText("Mark all done")).toBeTruthy();

    fireEvent.click(screen.getByText("Mark all done"));
    // Only the two worktree members are touched — not the standalone "Charlie".
    expect(onThreadAction.mock.calls.map((call) => call[0].id).sort()).toEqual(["a", "b"]);
    expect(
      onThreadAction.mock.calls.every((call) => {
        const action = call[1] as { kind: string; done?: boolean };
        return action.kind === "set-done" && action.done === true;
      }),
    ).toBe(true);
  });

  it("offers 'Unmark all done' when every group thread is already done", () => {
    renderView([
      makeThread({
        id: "a",
        title: "Alpha",
        done: true,
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({
        id: "b",
        title: "Bravo",
        done: true,
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
    ]);

    fireEvent.contextMenu(screen.getByRole("button", { expanded: true }));
    expect(screen.getByText("Unmark all done")).toBeTruthy();
    expect(screen.queryByText("Mark all done")).toBeNull();
  });

  it("still opens the per-thread menu for a thread inside a group", () => {
    renderView([
      makeThread({
        id: "a",
        title: "Alpha",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({
        id: "b",
        title: "Bravo",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
    ]);

    const row = screen.getByText("Alpha").closest("button");
    expect(row).not.toBeNull();
    fireEvent.contextMenu(row!);
    // The single-thread sheet (rename/delete/etc.), not the group sheet.
    expect(screen.getByText("Delete Thread")).toBeTruthy();
  });

  it("offers 'New thread in worktree' from a worktree group and passes its identity", () => {
    const onNewThreadInWorktree =
      vi.fn<(input: { projectId: string; worktreePath: string; worktreeBranch: string }) => void>();
    renderView(
      [
        makeThread({
          id: "a",
          title: "Alpha",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
        makeThread({
          id: "b",
          title: "Bravo",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
      ],
      { onNewThreadInWorktree },
    );

    fireEvent.contextMenu(screen.getByRole("button", { expanded: true }));
    fireEvent.click(screen.getByText("New thread in worktree"));

    expect(onNewThreadInWorktree).toHaveBeenCalledTimes(1);
    expect(onNewThreadInWorktree).toHaveBeenCalledWith({
      projectId: "p1",
      worktreePath: "/repo/wt",
      worktreeBranch: "feature/x",
    });
  });

  it("omits 'New thread in worktree' for a provider (groupId) group", () => {
    renderView([
      makeThread({ id: "d", title: "Delta", groupId: "g1", groupName: "Compare providers" }),
      makeThread({ id: "e", title: "Echo", groupId: "g1", groupName: "Compare providers" }),
    ]);

    fireEvent.contextMenu(screen.getByRole("button", { expanded: true }));
    expect(screen.queryByText("New thread in worktree")).toBeNull();
    // The generic bulk actions still appear.
    expect(screen.getByText("Mark all done")).toBeTruthy();
  });

  it("opens a terminal for a worktree from the group menu", () => {
    const onOpenTerminal = vi.fn<(input: { projectId: string; worktreePath?: string }) => void>();
    renderView(
      [
        makeThread({
          id: "a",
          title: "Alpha",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
        makeThread({
          id: "b",
          title: "Bravo",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
      ],
      { onOpenTerminal },
    );

    fireEvent.contextMenu(screen.getByRole("button", { expanded: true }));
    fireEvent.click(screen.getByText("Open terminal"));
    expect(onOpenTerminal).toHaveBeenCalledWith({ projectId: "p1", worktreePath: "/repo/wt" });
  });

  it("deletes a worktree through the group menu with all linked thread ids", () => {
    const onDeleteWorktreeGroup =
      vi.fn<
        (input: { projectId: string; worktreePath: string; threadIds: readonly string[] }) => void
      >();
    renderView(
      [
        makeThread({
          id: "a",
          title: "Alpha",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
        makeThread({
          id: "b",
          title: "Bravo",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
      ],
      { onDeleteWorktreeGroup },
    );

    fireEvent.contextMenu(screen.getByRole("button", { expanded: true }));
    fireEvent.click(screen.getByText("Delete Worktree"));

    expect(onDeleteWorktreeGroup).toHaveBeenCalledWith({
      projectId: "p1",
      worktreePath: "/repo/wt",
      threadIds: ["a", "b"],
    });
  });

  it("runs a configured project action in a worktree terminal from the group menu", () => {
    const onRunProjectAction =
      vi.fn<(input: { projectId: string; actionId: string; worktreePath?: string }) => void>();
    const projectWithAction = {
      ...PROJECT,
      scripts: {
        actions: [{ id: "test", name: "Run Tests", command: "pnpm test", icon: "test-tube" }],
      },
    } as Project;
    renderView(
      [
        makeThread({
          id: "a",
          title: "Alpha",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
        makeThread({
          id: "b",
          title: "Bravo",
          worktreePath: "/repo/wt",
          worktreeBranch: "feature/x",
        }),
      ],
      { projects: [projectWithAction], onRunProjectAction },
    );

    fireEvent.contextMenu(screen.getByRole("button", { expanded: true }));
    fireEvent.click(screen.getByText("Run Tests"));

    expect(onRunProjectAction).toHaveBeenCalledWith({
      projectId: "p1",
      actionId: "test",
      worktreePath: "/repo/wt",
    });
  });

  it("runs a configured project action from a standalone thread menu", () => {
    const onRunProjectAction =
      vi.fn<(input: { projectId: string; actionId: string; worktreePath?: string }) => void>();
    const projectWithAction = {
      ...PROJECT,
      scripts: {
        actions: [{ id: "build", name: "Build", command: "pnpm build", icon: "hammer" }],
      },
    } as Project;
    renderView([makeThread({ id: "c", title: "Charlie" })], {
      projects: [projectWithAction],
      onRunProjectAction,
    });

    fireEvent.contextMenu(screen.getByText("Charlie").closest("button")!);
    fireEvent.click(screen.getByText("Build"));

    expect(onRunProjectAction).toHaveBeenCalledWith({
      projectId: "p1",
      actionId: "build",
    });
  });

  it("opens a terminal for a standalone thread's project from its row menu", () => {
    const onOpenTerminal = vi.fn<(input: { projectId: string; worktreePath?: string }) => void>();
    renderView([makeThread({ id: "c", title: "Charlie" })], { onOpenTerminal });

    fireEvent.contextMenu(screen.getByText("Charlie").closest("button")!);
    fireEvent.click(screen.getByText("Open terminal"));
    // No worktree on the thread → project-root terminal (no worktreePath key).
    expect(onOpenTerminal).toHaveBeenCalledWith({ projectId: "p1" });
  });
});
