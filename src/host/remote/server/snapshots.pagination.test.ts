import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteServerContext } from "./context";
import { buildShellSnapshot, buildThreadListPage } from "./snapshots";
import { encodeDbThreadPageCursor } from "@/host/db/projectsThreads";

/**
 * Gate 4 hazard #3 acceptance fixture: 1,000 realistic thread rows. Row sizes
 * mirror the measured host (ids, varied titles, worktree paths, groups,
 * timestamps ≈ 350 B/row serialized) so the 64 KiB per-response bound is
 * exercised against the real shape, not a shrunken stub.
 */
const THREAD_COUNT = 1000;

function realisticThread(index: number): Thread {
  const id = `t${index.toString().padStart(4, "0")}-a7c3e9`;
  const hasWorktree = index % 3 === 0;
  return {
    id,
    projectId: `project-${index % 5}`,
    title: `Fix login regression (case ${index})`,
    agentKind: "claude",
    config: { model: index % 2 === 0 ? "sonnet" : "opus" },
    status: index % 7 === 0 ? "working" : "idle",
    attention: "none",
    canResumeWithConfig: index % 4 === 0,
    ...(index % 10 === 0
      ? {
          sessionRef: {
            providerSessionId: `sess-${index}`,
            discoveredAt: "2026-01-01T00:00:00.000Z",
          },
        }
      : {}),
    ...(hasWorktree
      ? {
          worktreePath: `/home/u/.poracode/worktrees/r${index % 5}/b-${index}`,
          worktreeBranch: `poracode/fix-${index}`,
        }
      : {}),
    ...(index % 6 === 0 ? { groupId: `group-${index % 3}`, groupName: "In review" } : {}),
    archived: index % 97 === 0,
    done: index % 5 === 0,
    starred: index % 41 === 0,
    presentationMode: index % 2 === 0 ? "gui" : "terminal",
    createdAt: `2026-08-${String((index % 28) + 1).padStart(2, "0")}T09:00:00.000Z`,
    updatedAt: `2026-09-${String((index % 15) + 1).padStart(2, "0")}T14:30:00.000Z`,
  };
}

const ALL_THREADS: Thread[] = Array.from({ length: THREAD_COUNT }, (_, index) =>
  realisticThread(index),
);

/** Cursor paging over the fixture with the production cursor codec; the array index is the row's sort_order. */
function pageOver(
  threads: readonly Thread[],
  query: { limit: number; cursor?: string },
): { threads: Thread[]; nextCursor: string | null } {
  let start = 0;
  if (query.cursor !== undefined) {
    const parsed = decodeCursor(query.cursor);
    start = threads.findIndex((thread) => thread.id === parsed.i) + 1;
  }
  const page = threads.slice(start, start + query.limit);
  const lastIndex = start + page.length - 1;
  const last = page.at(-1);
  return {
    threads: page,
    nextCursor:
      page.length === query.limit && last !== undefined
        ? encodeDbThreadPageCursor({ sortOrder: lastIndex, id: last.id })
        : null,
  };
}

function decodeCursor(cursor: string): { s: number; i: string } {
  return JSON.parse(Buffer.from(cursor.replace(/^tp1\./, ""), "base64url").toString("utf8")) as {
    s: number;
    i: string;
  };
}

vi.mock("@/host/db", () => ({
  dbGetProjects: vi.fn<() => never[]>(() => []),
  dbGetThreads: vi.fn<() => Thread[]>(() => ALL_THREADS),
  dbGetThreadsPage: vi.fn<
    (query: { limit: number; cursor?: string }) => { threads: Thread[]; nextCursor: string | null }
  >((query) => pageOver(ALL_THREADS, query)),
  dbGetThreadRuntimeSummaries: vi.fn<
    (ids: string[]) => Record<string, { itemCount: number; latestItemId: string }>
  >((ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, { itemCount: 3, latestItemId: `${id}-latest` }])),
  ),
}));

function context(): RemoteServerContext {
  return {
    options: {
      gitSummaries: () =>
        Object.fromEntries(
          ALL_THREADS.map((thread) => [
            thread.id,
            {
              isRepo: true,
              branch: "main",
              totalInsertions: 12,
              totalDeletions: 4,
              ahead: 1,
              behind: 0,
              pr: null,
            },
          ]),
        ),
    },
    seq: 42,
  } as unknown as RemoteServerContext;
}

const PAGE_LIMIT = 100;
const KIB = 1024;

describe("bounded shell thread list (hazard #3)", () => {
  it("keeps every response of a full page walk under the 64 KiB wire bound", () => {
    const ctx = context();
    const snapshot = buildShellSnapshot(ctx, { threadListLimit: PAGE_LIMIT });
    expect(snapshot.threads).toHaveLength(PAGE_LIMIT);
    expect(snapshot.threadsNextCursor).toBeTruthy();
    expect(Buffer.byteLength(JSON.stringify(snapshot), "utf8")).toBeLessThanOrEqual(64 * KIB);

    const walked: Thread[] = [...snapshot.threads];
    const gitSummaryIds = new Set(Object.keys(snapshot.gitSummariesByThread ?? {}));
    let cursor: string | null = snapshot.threadsNextCursor ?? null;
    let pages = 1;
    while (cursor !== null) {
      const page = buildThreadListPage(ctx, { limit: PAGE_LIMIT, cursor });
      pages += 1;
      expect(Buffer.byteLength(JSON.stringify(page), "utf8")).toBeLessThanOrEqual(64 * KIB);
      walked.push(...page.threads);
      for (const id of Object.keys(page.gitSummariesByThread ?? {})) {
        gitSummaryIds.add(id);
      }
      cursor = page.nextCursor;
    }
    expect(pages).toBeGreaterThan(1);
    expect(walked).toHaveLength(THREAD_COUNT);
    expect(new Set(walked.map((thread) => thread.id)).size).toBe(THREAD_COUNT);
    // Every thread-keyed git summary arrives across the pages, sliced per page.
    expect(gitSummaryIds.size).toBe(THREAD_COUNT);
  });

  it("serves per-page runtime summaries only for the page's visible threads", () => {
    const ctx = context();
    const snapshot = buildShellSnapshot(ctx, { threadListLimit: PAGE_LIMIT });
    const visibleOnPage = snapshot.threads.filter((thread) => !thread.archived).length;
    expect(Object.keys(snapshot.runtimeSummariesByThread)).toHaveLength(visibleOnPage);
  });

  it("leaves the unbounded snapshot complete with no cursor, still the measured hazard", () => {
    const ctx = context();
    const snapshot = buildShellSnapshot(ctx);
    expect(snapshot.threads).toHaveLength(THREAD_COUNT);
    expect(snapshot.threadsNextCursor).toBeUndefined();
    // The unbounded list is the measured hazard: far above the bound.
    expect(Buffer.byteLength(JSON.stringify(snapshot), "utf8")).toBeGreaterThan(128 * KIB);
    expect(Object.keys(snapshot.runtimeSummariesByThread)).toHaveLength(
      ALL_THREADS.filter((thread) => !thread.archived).length,
    );
  });

  it("refuses a cursor the host did not issue", () => {
    const ctx = context();
    expect(() => buildThreadListPage(ctx, { limit: PAGE_LIMIT, cursor: "bogus" })).toThrow(
      /cursor/i,
    );
  });
});
