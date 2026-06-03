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
});
