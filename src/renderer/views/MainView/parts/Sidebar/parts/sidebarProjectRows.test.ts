// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { Thread, ThreadStatus } from "@/shared/contracts";
import {
  buildSidebarProjectRows,
  SIDEBAR_THREAD_LIST_PAGE_SIZE,
  type SidebarRow,
} from "./sidebarProjectRows";

const RECENT = new Date().toISOString();
const OLD = "2020-01-01T00:00:00.000Z";

function makeThread(overrides: Partial<Thread> & { id: string }): Thread {
  return {
    projectId: "project-1",
    title: overrides.id,
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: RECENT,
    updatedAt: RECENT,
    ...overrides,
  };
}

function makeThreads(count: number, status: ThreadStatus = "idle"): Thread[] {
  return Array.from({ length: count }, (_, i) => makeThread({ id: `t-${i}`, status }));
}

function build(threads: Thread[], visibleLimit: number, sortMode: "manual" | "updated" = "manual") {
  return buildSidebarProjectRows({
    projectId: "project-1",
    projectThreads: threads,
    sortMode,
    collapsedWorktrees: {},
    visibleLimit,
  });
}

const threadRows = (rows: SidebarRow[]) => rows.filter((r) => r.kind === "thread");
const seeMore = (rows: SidebarRow[]) => rows.find((r) => r.kind === "see-more");

describe("buildSidebarProjectRows — See more cap (manual)", () => {
  it("shows no See more when the list fits the limit", () => {
    const rows = build(makeThreads(SIDEBAR_THREAD_LIST_PAGE_SIZE), SIDEBAR_THREAD_LIST_PAGE_SIZE);
    expect(threadRows(rows)).toHaveLength(SIDEBAR_THREAD_LIST_PAGE_SIZE);
    expect(seeMore(rows)).toBeUndefined();
  });

  it("caps to the limit and reports the hidden count", () => {
    const rows = build(makeThreads(15), 10);
    expect(threadRows(rows)).toHaveLength(10);
    expect(seeMore(rows)).toMatchObject({ kind: "see-more", hiddenCount: 5 });
  });

  it("keeps pinned threads visible past the limit", () => {
    const threads = makeThreads(15);
    threads[14] = makeThread({ id: "pinned", starred: true });
    const rows = build(threads, 10);
    // Starred sorts to the top in manual mode, so it stays visible.
    expect(threadRows(rows).some((r) => r.kind === "thread" && r.thread.id === "pinned")).toBe(
      true,
    );
  });

  it("keeps actively-running threads visible past the limit", () => {
    const threads = makeThreads(15);
    threads[12] = makeThread({ id: "running", status: "working" });
    const rows = build(threads, 10);
    const visible = threadRows(rows);
    expect(visible).toHaveLength(10);
    expect(visible.some((r) => r.kind === "thread" && r.thread.id === "running")).toBe(true);
    expect(seeMore(rows)).toMatchObject({ hiddenCount: 5 });
  });

  it("keeps threads with live background activity visible past the limit", () => {
    const threads = makeThreads(15);
    threads[12] = makeThread({ id: "background" });
    const rows = buildSidebarProjectRows({
      projectId: "project-1",
      projectThreads: threads,
      sortMode: "manual",
      collapsedWorktrees: {},
      visibleLimit: 10,
      liveBackgroundThreadIds: new Set(["background"]),
    });

    expect(
      threadRows(rows).some((row) => row.kind === "thread" && row.thread.id === "background"),
    ).toBe(true);
    expect(seeMore(rows)).toMatchObject({ hiddenCount: 5 });
  });

  it("reveals the next chunk when the limit grows", () => {
    const rows = build(makeThreads(15), 20);
    expect(threadRows(rows)).toHaveLength(15);
    expect(seeMore(rows)).toBeUndefined();
  });
});

describe("buildSidebarProjectRows — See more cap (date sort)", () => {
  it("hides older idle threads behind See more before recent ones", () => {
    const threads = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeThread({ id: `recent-${i}`, updatedAt: RECENT, createdAt: RECENT }),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        makeThread({ id: `old-${i}`, updatedAt: OLD, createdAt: OLD }),
      ),
    ];
    const rows = build(threads, 10, "updated");
    expect(threadRows(rows)).toHaveLength(10);
    expect(seeMore(rows)).toMatchObject({ hiddenCount: 3 });
    // Every recent thread survives; the cap eats into the older bucket only.
    for (let i = 0; i < 5; i++) {
      expect(
        threadRows(rows).some((r) => r.kind === "thread" && r.thread.id === `recent-${i}`),
      ).toBe(true);
    }
  });

  it("sinks done threads into a trailing Done section ordered by last update", () => {
    const rows = build(
      [
        makeThread({ id: "done-old", done: true, updatedAt: "2026-07-01T00:00:00.000Z" }),
        makeThread({ id: "live", updatedAt: "2026-07-10T00:00:00.000Z" }),
        makeThread({ id: "done-new", done: true, updatedAt: "2026-07-20T00:00:00.000Z" }),
      ],
      10,
      "updated",
    );

    expect(rows.map((row) => (row.kind === "thread" ? row.thread.id : row.kind))).toEqual([
      "live",
      "section-label",
      "done-new",
      "done-old",
    ]);
    const label = rows.find((row) => row.kind === "section-label");
    expect(label).toMatchObject({ key: "done-label" });
  });

  it("keeps a worktree group in the live list until every member is done", () => {
    const worktree = { worktreePath: "/repo/wt", worktreeBranch: "feature" };
    const mixed = build(
      [
        makeThread({ id: "wt-done", done: true, ...worktree }),
        makeThread({ id: "wt-live", ...worktree }),
      ],
      10,
      "updated",
    );
    expect(mixed.some((row) => row.kind === "section-label")).toBe(false);

    const allDone = build(
      [
        makeThread({ id: "wt-done-1", done: true, ...worktree }),
        makeThread({ id: "wt-done-2", done: true, ...worktree }),
      ],
      10,
      "updated",
    );
    expect(allDone[0]).toMatchObject({ kind: "section-label", key: "done-label" });
    expect(allDone[1]).toMatchObject({ kind: "worktree-group" });
  });

  it("hides done threads behind See more before live ones", () => {
    const threads = [
      ...Array.from({ length: 8 }, (_, i) => makeThread({ id: `live-${i}` })),
      ...Array.from({ length: 5 }, (_, i) => makeThread({ id: `done-${i}`, done: true })),
    ];
    const rows = build(threads, 10, "updated");
    const visibleIds = threadRows(rows).map((r) => r.thread.id);
    expect(visibleIds).toHaveLength(10);
    expect(seeMore(rows)).toMatchObject({ hiddenCount: 3 });
    for (let i = 0; i < 8; i++) expect(visibleIds).toContain(`live-${i}`);
  });

  it("hides candidate rows when the experiment group collapse key is set", () => {
    const groupedThreads = [
      makeThread({ id: "candidate-1", groupId: "experiment-1", groupName: "Experiment" }),
      makeThread({ id: "candidate-2", groupId: "experiment-1", groupName: "Experiment" }),
    ];
    const expanded = buildSidebarProjectRows({
      projectId: "project-1",
      projectThreads: groupedThreads,
      sortMode: "updated",
      collapsedWorktrees: {},
      visibleLimit: 10,
    });
    expect(expanded.some((r) => r.kind === "thread-group")).toBe(true);
    expect(threadRows(expanded)).toHaveLength(2);

    const collapsed = buildSidebarProjectRows({
      projectId: "project-1",
      projectThreads: groupedThreads,
      sortMode: "updated",
      collapsedWorktrees: { "group:experiment-1": true },
      visibleLimit: 10,
    });
    expect(collapsed.some((r) => r.kind === "thread-group")).toBe(true);
    expect(threadRows(collapsed)).toHaveLength(0);
  });

  it("keeps worktree controls on threads nested in a thread group", () => {
    const rows = build(
      [
        makeThread({
          id: "candidate-1",
          groupId: "experiment-1",
          worktreePath: "/repo/candidate-1",
          worktreeBranch: "experiment/candidate-1",
        }),
        makeThread({
          id: "candidate-2",
          groupId: "experiment-1",
          worktreePath: "/repo/candidate-2",
          worktreeBranch: "experiment/candidate-2",
        }),
      ],
      10,
      "updated",
    );

    expect(threadRows(rows)).toHaveLength(2);
    expect(threadRows(rows).every((row) => row.showWorktreeFilesButton === true)).toBe(true);
  });

  it("uses experiment candidate order instead of thread recency inside the group", () => {
    const rows = buildSidebarProjectRows({
      projectId: "project-1",
      projectThreads: [
        makeThread({
          id: "candidate-3",
          groupId: "experiment-1",
          groupName: "Experiment",
          updatedAt: "2026-07-15T00:03:00.000Z",
        }),
        makeThread({
          id: "candidate-2",
          groupId: "experiment-1",
          groupName: "Experiment",
          updatedAt: "2026-07-15T00:02:00.000Z",
        }),
        makeThread({
          id: "candidate-1",
          groupId: "experiment-1",
          groupName: "Experiment",
          updatedAt: "2026-07-15T00:01:00.000Z",
        }),
      ],
      sortMode: "updated",
      collapsedWorktrees: {},
      visibleLimit: 10,
      experimentCandidateOrder: new Map([
        ["candidate-1", 0],
        ["candidate-2", 1],
        ["candidate-3", 2],
      ]),
    });

    expect(threadRows(rows).map((row) => row.thread.id)).toEqual([
      "candidate-1",
      "candidate-2",
      "candidate-3",
    ]);
  });

  it("preserves experiment candidate order in manual mode", () => {
    const rows = buildSidebarProjectRows({
      projectId: "project-1",
      projectThreads: [
        makeThread({ id: "candidate-3", groupId: "experiment-1", groupName: "Experiment" }),
        makeThread({ id: "candidate-2", groupId: "experiment-1", groupName: "Experiment" }),
        makeThread({ id: "candidate-1", groupId: "experiment-1", groupName: "Experiment" }),
      ],
      sortMode: "manual",
      collapsedWorktrees: {},
      visibleLimit: 10,
      experimentCandidateOrder: new Map([
        ["candidate-1", 0],
        ["candidate-2", 1],
        ["candidate-3", 2],
      ]),
    });

    expect(threadRows(rows).map((row) => row.thread.id)).toEqual([
      "candidate-1",
      "candidate-2",
      "candidate-3",
    ]);
  });
});
