// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, screen } from "@testing-library/react";
import type { Project, Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { __resetCollapsedGroupCache, ThreadsView, type ThreadsViewProps } from "./ThreadsView";

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

// Keep the common barrel out of these grouping tests; only OptionMenu is needed.
vi.mock("@/renderer/components/common", () => ({
  OptionMenu: () => null,
}));

// Drive the desktop-pointer branch of the shared context menu wrapper: `false`
// (default) keeps the touch bottom-sheet presentation, `true` switches to the
// pointer-anchored popover.
const media = vi.hoisted(() => ({ desktopPointer: false }));
vi.mock("../useMediaQuery", () => ({
  DESKTOP_POINTER_QUERY: "desktop-pointer",
  WIDE_SHELL_QUERY: "wide-shell",
  DESKTOP_RIGHT_PANEL_QUERY: "desktop-right",
  useMediaQuery: () => media.desktopPointer,
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
    onMoveThreadToWorktree?: (thread: Thread, withChanges: boolean) => void;
    onOpenTerminal?: (input: {
      projectId: string;
      worktreePath?: string;
      sourceThreadId?: string;
    }) => void;
    onRunProjectAction?: (input: {
      projectId: string;
      actionId: string;
      worktreePath?: string;
      sourceThreadId?: string;
    }) => void;
    projects?: Project[];
    emptyStateOverride?: ThreadsViewProps["emptyStateOverride"];
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
      onMoveThreadToWorktree={handlers?.onMoveThreadToWorktree ?? (() => {})}
      onOpenTerminal={handlers?.onOpenTerminal ?? (() => {})}
      onRunProjectAction={handlers?.onRunProjectAction ?? (() => {})}
      {...(handlers?.emptyStateOverride ? { emptyStateOverride: handlers.emptyStateOverride } : {})}
    />,
  );
}

describe("ThreadsView grouping", () => {
  // Collapse state lives in a module-level cache; reset it so cases don't leak.
  beforeEach(() => {
    __resetCollapsedGroupCache();
    media.desktopPointer = false;
  });

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
    expect(header.querySelector(".m-thread-group__kind-icon")).not.toBeNull();
    expect(header.querySelector(".m-thread-group__chevron")).toBeNull();

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

  it("deletes a worktree from a member row menu with every sibling thread id", () => {
    // Two threads share the worktree; deleting from ONE row must still hand the
    // desktop both ids, or the untold sibling is orphaned on a deleted path.
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

    // Open the per-thread menu for one member (not the group header).
    fireEvent.contextMenu(screen.getByText("Alpha").closest("button")!);
    fireEvent.click(screen.getByText("Delete Worktree"));

    expect(onDeleteWorktreeGroup).toHaveBeenCalledTimes(1);
    const input = onDeleteWorktreeGroup.mock.calls[0]![0];
    expect(input.projectId).toBe("p1");
    expect(input.worktreePath).toBe("/repo/wt");
    expect([...input.threadIds].sort()).toEqual(["a", "b"]);
  });

  it("moves a main-checkout thread with its changes from the row menu", () => {
    const onMoveThreadToWorktree = vi.fn<(thread: Thread, withChanges: boolean) => void>();
    renderView([makeThread({ id: "a", title: "Alpha" })], { onMoveThreadToWorktree });

    fireEvent.contextMenu(screen.getByText("Alpha").closest("button")!);
    fireEvent.click(screen.getByText("Move to Worktree"));
    fireEvent.click(screen.getByText("Bring Uncommitted Changes"));

    expect(onMoveThreadToWorktree).toHaveBeenCalledTimes(1);
    expect(onMoveThreadToWorktree.mock.calls[0]![0].id).toBe("a");
    expect(onMoveThreadToWorktree.mock.calls[0]![1]).toBe(true);
  });

  it("moves a main-checkout thread to a clean worktree from the row menu", () => {
    const onMoveThreadToWorktree = vi.fn<(thread: Thread, withChanges: boolean) => void>();
    renderView([makeThread({ id: "a", title: "Alpha" })], { onMoveThreadToWorktree });

    fireEvent.contextMenu(screen.getByText("Alpha").closest("button")!);
    fireEvent.click(screen.getByText("Move to Worktree"));
    fireEvent.click(screen.getByText("Clean Worktree"));

    expect(onMoveThreadToWorktree).toHaveBeenCalledTimes(1);
    expect(onMoveThreadToWorktree.mock.calls[0]![0].id).toBe("a");
    expect(onMoveThreadToWorktree.mock.calls[0]![1]).toBe(false);
  });

  it("omits Move to Worktree for threads already in a worktree", () => {
    renderView([
      makeThread({
        id: "a",
        title: "Alpha",
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
    ]);

    fireEvent.contextMenu(screen.getByText("Alpha").closest("button")!);

    expect(screen.queryByText("Move to Worktree")).toBeNull();
  });

  it("offers Move to Worktree as a desktop submenu entry", () => {
    media.desktopPointer = true;
    renderView([makeThread({ id: "a", title: "Alpha" })]);

    fireEvent.contextMenu(screen.getByText("Alpha").closest("button")!, {
      clientX: 120,
      clientY: 80,
    });

    expect(screen.getByRole("menuitem", { name: "Move to Worktree" })).toBeTruthy();
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
    const { container } = renderView([
      makeThread({ id: "d", title: "Delta", groupId: "g1", groupName: "Compare providers" }),
      makeThread({ id: "e", title: "Echo", groupId: "g1", groupName: "Compare providers" }),
    ]);

    // groupId groups can span worktrees, so the header has no shared badge...
    expect(screen.queryByTestId("group-git")).toBeNull();
    // ...and each member keeps its own.
    expect(screen.getByTestId("row-git-d")).toBeTruthy();
    expect(screen.getByTestId("row-git-e")).toBeTruthy();
    expect(container.querySelector(".m-thread-group__chevron")).not.toBeNull();
    expect(container.querySelector(".m-thread-group__kind-icon")).toBeNull();
  });

  // Timestamps resolved against real wall-clock so `isRecent` (< 24h) is stable.
  const recentIso = () => new Date(Date.now() - 60_000).toISOString();
  const oldIso = () => new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  function rowTitles(container: HTMLElement): (string | null)[] {
    return [...container.querySelectorAll(".m-thread-row__title")].map((el) => el.textContent);
  }

  it("floats a pinned thread above more recent unpinned ones", () => {
    // As in the bug report: the pinned thread is older, yet must sit on top.
    const { container } = renderView([
      makeThread({ id: "a", title: "Recent", updatedAt: recentIso() }),
      makeThread({ id: "b", title: "Pinned", starred: true, updatedAt: oldIso() }),
    ]);

    expect(rowTitles(container)).toEqual(["Pinned", "Recent"]);
  });

  it("floats a group holding a pinned thread above unpinned rows", () => {
    const { container } = renderView([
      makeThread({ id: "a", title: "Recent", updatedAt: recentIso() }),
      makeThread({
        id: "b",
        title: "Bravo",
        starred: true,
        updatedAt: oldIso(),
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
      makeThread({
        id: "c",
        title: "Charlie",
        updatedAt: oldIso(),
        worktreePath: "/repo/wt",
        worktreeBranch: "feature/x",
      }),
    ]);

    // Pinning any member floats the whole worktree group ahead of the unpinned row.
    const titles = rowTitles(container);
    expect(titles.indexOf("Bravo")).toBeLessThan(titles.indexOf("Recent"));
  });

  it("labels the Pinned / Current / Older sections when all three are present", () => {
    const { container } = renderView([
      makeThread({ id: "c", title: "Current one", updatedAt: recentIso() }),
      makeThread({ id: "o", title: "Old one", updatedAt: oldIso() }),
      makeThread({ id: "p", title: "Pinned one", starred: true, updatedAt: oldIso() }),
    ]);

    expect(
      [...container.querySelectorAll(".m-thread-section")].map((el) => el.textContent),
    ).toEqual(["Pinned", "Current", "Older"]);
    // Rows follow the labeled order: pinned, then current, then older.
    expect(rowTitles(container)).toEqual(["Pinned one", "Current one", "Old one"]);
  });

  it("omits section labels when every thread lands in one section", () => {
    const { container } = renderView([
      makeThread({ id: "a", title: "Alpha", updatedAt: recentIso() }),
      makeThread({ id: "b", title: "Bravo", updatedAt: recentIso() }),
    ]);

    // Two recent, unpinned threads → a single "Current" section; a lone label
    // over the whole list would be noise, so none renders.
    expect(container.querySelector(".m-thread-section")).toBeNull();
  });

  it("sinks done threads into a trailing Done section ordered by last update", () => {
    const { container } = renderView([
      makeThread({ id: "done-old", title: "Done old", done: true, updatedAt: oldIso() }),
      makeThread({ id: "live", title: "Live", updatedAt: recentIso() }),
      makeThread({ id: "done-new", title: "Done new", done: true, updatedAt: recentIso() }),
    ]);

    expect(rowTitles(container)).toEqual(["Live", "Done new", "Done old"]);
    expect(
      [...container.querySelectorAll(".m-thread-section")].map((el) => el.textContent),
    ).toEqual(["Done"]);
  });

  it("keeps a mixed worktree group live until every member is done", () => {
    const worktree = { worktreePath: "/repo/wt", worktreeBranch: "feature/x" };
    const mixed = renderView([
      makeThread({ id: "done", title: "Done member", done: true, ...worktree }),
      makeThread({ id: "live", title: "Live member", ...worktree }),
    ]);

    expect(mixed.container.querySelector(".m-thread-section")).toBeNull();
    mixed.unmount();

    const allDone = renderView([
      makeThread({ id: "done-a", title: "Done A", done: true, ...worktree }),
      makeThread({ id: "done-b", title: "Done B", done: true, ...worktree }),
    ]);
    expect(
      [...allDone.container.querySelectorAll(".m-thread-section")].map((el) => el.textContent),
    ).toEqual(["Done"]);
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

  it("does not render a center new-thread button for the empty list", () => {
    renderView([]);

    expect(screen.getByText("No threads yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New thread" })).toBeNull();
  });

  it("can replace the no-threads content with setup guidance", () => {
    renderView([], {
      emptyStateOverride: (
        <div>
          <span>Connect desktop</span>
          <button type="button">Connect</button>
        </div>
      ),
    });

    expect(screen.getByText("Connect desktop")).toBeTruthy();
    expect(screen.queryByText("No threads yet")).toBeNull();
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
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

  it("prevents native touch-hold behavior on rows with long-press menus", () => {
    renderView([makeThread({ id: "c", title: "Charlie" })]);
    const row = screen.getByText("Charlie").closest("button");
    expect(row).toBeTruthy();

    const touchStart = createEvent.pointerDown(row!, {
      pointerType: "touch",
      isPrimary: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent(row!, touchStart);
    expect(touchStart.defaultPrevented).toBe(true);

    const mouseStart = createEvent.pointerDown(row!, {
      pointerType: "mouse",
      isPrimary: true,
      clientX: 0,
      clientY: 0,
    });
    fireEvent(row!, mouseStart);
    expect(mouseStart.defaultPrevented).toBe(false);
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

  it("opens the row menu as a right-click Dropdown (no bottom sheet) on desktop pointers", () => {
    media.desktopPointer = true;
    const { baseElement } = renderView([makeThread({ id: "c", title: "Charlie" })]);

    fireEvent.contextMenu(screen.getByText("Charlie").closest("button")!, {
      clientX: 120,
      clientY: 80,
    });

    // Actions render in a HeroUI Dropdown menu, not the touch bottom sheet.
    const menu = screen.getByRole("menu");
    expect(menu).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    // The destructive entry carries the danger variant.
    expect(screen.getByRole("menuitem", { name: "Delete Thread" })).toBeTruthy();
    expect(baseElement.querySelector(".m-sheet-backdrop")).toBeNull();
  });

  it("opens the group header menu as a right-click Dropdown on desktop pointers", () => {
    media.desktopPointer = true;
    const { baseElement } = renderView([
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

    fireEvent.contextMenu(screen.getByRole("button", { expanded: true }), {
      clientX: 40,
      clientY: 200,
    });

    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Mark all done" })).toBeTruthy();
    expect(baseElement.querySelector(".m-sheet-backdrop")).toBeNull();
  });

  it("exposes the group's project 'Run' actions as a desktop submenu entry", () => {
    media.desktopPointer = true;
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
      {
        projects: [
          { id: "p1", name: "Proj", scripts: { actions: [{ id: "build", name: "Build" }] } },
        ] as unknown as Project[],
      },
    );

    fireEvent.contextMenu(screen.getByRole("button", { expanded: true }), {
      clientX: 40,
      clientY: 200,
    });

    // The "Run" submenu trigger is a menu item (its children reveal on open).
    expect(screen.getByRole("menuitem", { name: /Run/ })).toBeTruthy();
  });

  it("moves the desktop menu to another row on right-click (ContextMenu singleton)", () => {
    media.desktopPointer = true;
    const onThreadAction = vi.fn<(thread: Thread, action: unknown) => void>();
    renderView([makeThread({ id: "a", title: "Alpha" }), makeThread({ id: "b", title: "Bravo" })], {
      onThreadAction,
    });

    // Open on row A, then right-click row B: the module-level closeActiveMenu
    // dismisses A and the menu re-opens anchored on B.
    fireEvent.contextMenu(screen.getByText("Alpha").closest("button")!, {
      clientX: 10,
      clientY: 10,
    });
    const rowB = screen.getByText("Bravo").closest("button")!;
    const evt = createEvent.contextMenu(rowB, { clientX: 30, clientY: 40 });
    fireEvent(rowB, evt);

    // Our handler suppressed the native menu and exactly one menu is open.
    expect(evt.defaultPrevented).toBe(true);
    expect(screen.getAllByRole("menu")).toHaveLength(1);

    // Acting on the menu targets row B, proving it moved.
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Thread" }));
    expect(onThreadAction).toHaveBeenCalledTimes(1);
    expect(onThreadAction.mock.calls[0]![0].id).toBe("b");
  });

  it("still opens the row menu as a bottom sheet on touch devices", () => {
    // Default (no desktop pointer): the long-press / context menu must keep the
    // full-width bottom sheet, backdrop and all.
    const { baseElement } = renderView([makeThread({ id: "c", title: "Charlie" })]);

    fireEvent.contextMenu(screen.getByText("Charlie").closest("button")!);

    expect(screen.getByText("Rename")).toBeTruthy();
    expect(baseElement.querySelector(".m-sheet-backdrop")).not.toBeNull();
    // No desktop Dropdown menu on touch.
    expect(screen.queryByRole("menu")).toBeNull();
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
      vi.fn<
        (input: {
          projectId: string;
          actionId: string;
          worktreePath?: string;
          sourceThreadId?: string;
        }) => void
      >();
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
    const pageStack = document.querySelector(".m-sheet-page-stack");
    expect(pageStack).toHaveAttribute("data-page", "main");
    expect(screen.queryByRole("button", { name: "Run Tests" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(pageStack).toHaveAttribute("data-page", "submenu");
    expect(screen.getByRole("button", { name: "Run Tests" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(pageStack).toHaveAttribute("data-page", "main");
    expect(screen.queryByRole("button", { name: "Run Tests" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Run Tests" }));

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
    expect(screen.queryByRole("button", { name: "Build" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Build" }));

    expect(onRunProjectAction).toHaveBeenCalledWith({
      projectId: "p1",
      actionId: "build",
      sourceThreadId: "c",
    });
  });

  it("opens a terminal for a standalone thread's project from its row menu", () => {
    const onOpenTerminal =
      vi.fn<
        (input: { projectId: string; worktreePath?: string; sourceThreadId?: string }) => void
      >();
    renderView([makeThread({ id: "c", title: "Charlie" })], { onOpenTerminal });

    fireEvent.contextMenu(screen.getByText("Charlie").closest("button")!);
    fireEvent.click(screen.getByText("Open terminal"));
    // No worktree on the thread → project-root terminal (no worktreePath key).
    expect(onOpenTerminal).toHaveBeenCalledWith({ projectId: "p1", sourceThreadId: "c" });
  });
});

describe("ThreadsView header-driven (floating) search", () => {
  beforeEach(__resetCollapsedGroupCache);

  function renderFloating(input: {
    searchOpen: boolean;
    onSearchOpenChange?: (open: boolean) => void;
    projects?: readonly Project[];
    searchContainer?: HTMLElement;
  }) {
    return render(
      <ThreadsView
        projects={input.projects ?? [PROJECT]}
        threads={[makeThread({ id: "a", title: "Alpha" }), makeThread({ id: "b", title: "Bravo" })]}
        selectedThreadId={null}
        projectFilter={null}
        searchOpen={input.searchOpen}
        {...(input.searchContainer ? { searchContainer: input.searchContainer } : {})}
        onSearchOpenChange={input.onSearchOpenChange ?? (() => {})}
        onProjectFilterChange={() => {}}
        onOpenThread={() => {}}
        onThreadAction={() => {}}
        onNew={() => {}}
        onNewThreadInWorktree={() => {}}
        onDeleteWorktreeGroup={() => {}}
        onMoveThreadToWorktree={() => {}}
        onOpenTerminal={() => {}}
        onRunProjectAction={() => {}}
      />,
    );
  }

  it("hides the search box until the header toggles it open", () => {
    renderFloating({ searchOpen: false });
    expect(screen.queryByLabelText("Search threads")).not.toBeInTheDocument();
  });

  it("portals the project picker into the shared mobile header", () => {
    const host = document.createElement("div");
    document.body.append(host);
    try {
      const { container } = renderFloating({
        searchOpen: false,
        projects: [PROJECT, { ...PROJECT, id: "p2", name: "Other" }],
        searchContainer: host,
      });

      expect(host.querySelector(".m-threads__picker")).not.toBeNull();
      expect(host).toHaveTextContent("All projects");
      expect(container.querySelector(".m-threads__picker")).toBeNull();
    } finally {
      host.remove();
    }
  });

  it("shows a floating search box that filters and closes via its X button", () => {
    const onSearchOpenChange = vi.fn<(open: boolean) => void>();
    renderFloating({ searchOpen: true, onSearchOpenChange });

    fireEvent.change(screen.getByLabelText("Search threads"), { target: { value: "alp" } });
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close search"));
    expect(onSearchOpenChange).toHaveBeenCalledWith(false);
  });

  it("drops the query when the header closes the search", () => {
    const view = renderFloating({ searchOpen: true });
    fireEvent.change(screen.getByLabelText("Search threads"), { target: { value: "alp" } });
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();

    // Simulate the header toggling search off: the filter must not linger.
    view.rerender(
      <ThreadsView
        projects={[PROJECT]}
        threads={[makeThread({ id: "a", title: "Alpha" }), makeThread({ id: "b", title: "Bravo" })]}
        selectedThreadId={null}
        projectFilter={null}
        searchOpen={false}
        onSearchOpenChange={() => {}}
        onProjectFilterChange={() => {}}
        onOpenThread={() => {}}
        onThreadAction={() => {}}
        onNew={() => {}}
        onNewThreadInWorktree={() => {}}
        onDeleteWorktreeGroup={() => {}}
        onMoveThreadToWorktree={() => {}}
        onOpenTerminal={() => {}}
        onRunProjectAction={() => {}}
      />,
    );
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });

  it("keeps the closing box mounted for its exit animation, then unmounts it", () => {
    vi.useFakeTimers();
    try {
      const view = renderFloating({ searchOpen: true });
      expect(screen.getByLabelText("Search threads")).toBeInTheDocument();

      view.rerender(
        <ThreadsView
          projects={[PROJECT]}
          threads={[
            makeThread({ id: "a", title: "Alpha" }),
            makeThread({ id: "b", title: "Bravo" }),
          ]}
          selectedThreadId={null}
          projectFilter={null}
          searchOpen={false}
          onSearchOpenChange={() => {}}
          onProjectFilterChange={() => {}}
          onOpenThread={() => {}}
          onThreadAction={() => {}}
          onNew={() => {}}
          onNewThreadInWorktree={() => {}}
          onDeleteWorktreeGroup={() => {}}
          onMoveThreadToWorktree={() => {}}
          onOpenTerminal={() => {}}
          onRunProjectAction={() => {}}
        />,
      );

      // The box lingers, marked as closing, while its shrink-into-the-icon
      // animation plays…
      expect(view.container.querySelector(".m-search-float")).toHaveAttribute("data-closing");
      expect(screen.getByLabelText("Search threads")).toBeInTheDocument();

      // …and unmounts once the exit timer fires.
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.queryByLabelText("Search threads")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes the search when focus leaves it (tap outside)", () => {
    const onSearchOpenChange = vi.fn<(open: boolean) => void>();
    renderFloating({ searchOpen: true, onSearchOpenChange });

    fireEvent.focusOut(screen.getByLabelText("Search threads"));
    expect(onSearchOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the search open when focus moves within it", () => {
    const onSearchOpenChange = vi.fn<(open: boolean) => void>();
    renderFloating({ searchOpen: true, onSearchOpenChange });

    fireEvent.focusOut(screen.getByLabelText("Search threads"), {
      relatedTarget: screen.getByLabelText("Close search"),
    });
    expect(onSearchOpenChange).not.toHaveBeenCalled();
  });

  it("closes the search when the on-screen keyboard is dismissed", () => {
    // Minimal visualViewport stand-in (jsdom has none): the keyboard offset is
    // window.innerHeight - viewport.height, driven by the resize listener.
    const listeners = new Set<() => void>();
    const viewport = {
      height: window.innerHeight,
      offsetTop: 0,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    try {
      const onSearchOpenChange = vi.fn<(open: boolean) => void>();
      renderFloating({ searchOpen: true, onSearchOpenChange });

      // The keyboard sliding up must not close anything…
      viewport.height = window.innerHeight - 300;
      act(() => listeners.forEach((listener) => listener()));
      expect(onSearchOpenChange).not.toHaveBeenCalled();

      // …dismissing it closes the search.
      viewport.height = window.innerHeight;
      act(() => listeners.forEach((listener) => listener()));
      expect(onSearchOpenChange).toHaveBeenCalledWith(false);
    } finally {
      Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
    }
  });
});
