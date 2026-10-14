import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbArchiveDoneThreads,
  dbIsThreadPurgeEligible,
  dbSelectPurgeCandidateThreadIds,
} from "./threadHousekeeping";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

function testProject(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function testThread(id: string, overrides: Partial<Thread> = {}): Thread {
  return {
    id,
    projectId: "p1",
    title: id,
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = "2026-09-21T00:00:00.000Z";
const PURGE_CUTOFF = "2026-08-22T00:00:00.000Z"; // NOW - 30d

function daysBeforeNow(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

function threadRowSnapshot(threadId: string): string {
  return JSON.stringify(getSqlite().prepare("SELECT * FROM threads WHERE id = ?").get(threadId));
}

describe.skipIf(!sqliteAvailable)("thread housekeeping predicates (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-thread-housekeeping-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(testProject("p1"), 0);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("archives exactly the done, unarchived, unstarred rows past the cutoff", () => {
    const rows: Thread[] = [
      testThread("t-old-done", { done: true, doneAt: daysBeforeNow(5) }),
      testThread("t-recent-done", { done: true, doneAt: daysBeforeNow(1) }),
      testThread("t-starred-done", { done: true, doneAt: daysBeforeNow(5), starred: true }),
      testThread("t-archived-done", {
        done: true,
        doneAt: daysBeforeNow(5),
        archived: true,
        archivedAt: daysBeforeNow(5),
      }),
      testThread("t-not-done", { done: false }),
      testThread("t-fallback-updated", {
        done: true,
        updatedAt: daysBeforeNow(5),
      }),
      testThread("t-boundary-done", { done: true, doneAt: daysBeforeNow(3) }),
    ];
    rows.forEach((row, index) => dbUpsertThread(row, index));
    const untouched = threadRowSnapshot("t-starred-done");

    const archived = dbArchiveDoneThreads({
      now: NOW,
      cutoff: daysBeforeNow(3),
      excludeThreadIds: [],
    });
    // `<= cutoff` is inclusive: exactly-three-days-old archives.
    expect(archived).toEqual(["t-boundary-done", "t-fallback-updated", "t-old-done"]);

    const snapshot = (id: string) =>
      getSqlite()
        .prepare("SELECT archived, archived_at, updated_at FROM threads WHERE id = ?")
        .get(id) as { archived: number; archived_at: string | null; updated_at: string };
    expect(snapshot("t-old-done")).toEqual({
      archived: 1,
      archived_at: NOW,
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    // The fallback timestamp is the row's updated_at, and the flip does not
    // bump updated_at (renderer parity).
    expect(snapshot("t-fallback-updated").archived_at).toBe(NOW);
    expect(snapshot("t-recent-done").archived).toBe(0);
    expect(threadRowSnapshot("t-starred-done")).toBe(untouched);
    expect(snapshot("t-archived-done").archived_at).toBe(daysBeforeNow(5));
  });

  it("excludes owned rows from archiving without touching them", () => {
    dbUpsertThread(testThread("t-owned", { done: true, doneAt: daysBeforeNow(9) }), 0);
    dbUpsertThread(testThread("t-free", { done: true, doneAt: daysBeforeNow(9) }), 1);
    const before = threadRowSnapshot("t-owned");

    const archived = dbArchiveDoneThreads({
      now: NOW,
      cutoff: daysBeforeNow(3),
      excludeThreadIds: ["t-owned"],
    });
    expect(archived).toEqual(["t-free"]);
    expect(threadRowSnapshot("t-owned")).toBe(before);
  });

  it("selects and rechecks purge eligibility with the archivedAt fallback", () => {
    dbUpsertThread(
      testThread("t-old-archived", {
        archived: true,
        archivedAt: daysBeforeNow(31),
        updatedAt: daysBeforeNow(31),
      }),
      0,
    );
    dbUpsertThread(
      testThread("t-recent-archived", {
        archived: true,
        archivedAt: daysBeforeNow(1),
        updatedAt: daysBeforeNow(1),
      }),
      1,
    );
    dbUpsertThread(
      testThread("t-fallback-archived", {
        archived: true,
        updatedAt: daysBeforeNow(40),
      }),
      2,
    );
    dbUpsertThread(
      testThread("t-not-archived", { archived: false, updatedAt: daysBeforeNow(40) }),
      3,
    );
    dbUpsertThread(
      testThread("t-boundary-archived", {
        archived: true,
        archivedAt: PURGE_CUTOFF,
        updatedAt: PURGE_CUTOFF,
      }),
      4,
    );

    expect(dbSelectPurgeCandidateThreadIds(PURGE_CUTOFF)).toEqual([
      "t-boundary-archived",
      "t-fallback-archived",
      "t-old-archived",
    ]);
    expect(dbIsThreadPurgeEligible("t-old-archived", PURGE_CUTOFF)).toBe(true);
    expect(dbIsThreadPurgeEligible("t-recent-archived", PURGE_CUTOFF)).toBe(false);
    expect(dbIsThreadPurgeEligible("t-missing", PURGE_CUTOFF)).toBe(false);

    // A concurrent unarchive wins over a stale candidate list.
    getSqlite().prepare("UPDATE threads SET archived = 0 WHERE id = 't-old-archived'").run();
    expect(dbIsThreadPurgeEligible("t-old-archived", PURGE_CUTOFF)).toBe(false);
    // A refreshed archived_at (unarchive + rearchive) also wins.
    getSqlite()
      .prepare("UPDATE threads SET archived = 1, archived_at = ? WHERE id = 't-old-archived'")
      .run(daysBeforeNow(1));
    expect(dbIsThreadPurgeEligible("t-old-archived", PURGE_CUTOFF)).toBe(false);
  });
});
