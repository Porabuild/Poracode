import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { EXPERIMENT_STORE_KEY, EXPERIMENT_STORE_VERSION } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import {
  dbDeleteThread,
  dbGetThread,
  dbSetState,
  dbUpsertProject,
  dbUpsertThread,
} from "@/host/db";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import {
  ARCHIVED_THREAD_PURGE_AFTER_DAYS,
  runThreadHousekeeping,
  type ThreadHousekeepingDependencies,
} from "./ThreadHousekeepingService";

const NOW = "2026-09-21T00:00:00.000Z";

function daysBeforeNow(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

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

function archivedOld(id: string): Thread {
  return testThread(id, {
    archived: true,
    archivedAt: daysBeforeNow(ARCHIVED_THREAD_PURGE_AFTER_DAYS + 1),
    updatedAt: daysBeforeNow(ARCHIVED_THREAD_PURGE_AFTER_DAYS + 1),
  });
}

function experimentStore(threadIds: readonly string[]): string {
  return JSON.stringify({
    state: {
      experiments: {
        "exp-1": {
          id: "exp-1",
          projectId: "p1",
          title: "Experiment",
          prompt: "Try both approaches",
          baseBranch: "main",
          baseCommit: "a".repeat(40),
          candidates: threadIds.map((threadId, index) => ({
            threadId,
            agentKind: "claude",
            worktreeBranch: `worktree-${index}`,
            worktreeOwnerToken: `owner-${index}`,
            worktreeState: "owned",
          })),
          status: "running",
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    },
    version: EXPERIMENT_STORE_VERSION,
  });
}

function createDependencies(
  overrides: Partial<ThreadHousekeepingDependencies> = {},
): ThreadHousekeepingDependencies {
  return {
    getAutoArchiveDoneAfterDays: () => 3,
    now: () => NOW,
    runThreadMutation: (_threadId, operation) => operation(),
    closeThreadConfirmed: async () => true,
    deleteThread: dbDeleteThread,
    publishThreadsChanged: () => {},
    ...overrides,
  };
}

describe.skipIf(!sqliteAvailable)("host thread housekeeping service (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-thread-sweep-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(testProject("p1"), 0);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("archives with the configured window and purges confirmed old archived rows", async () => {
    dbUpsertThread(testThread("t-done-old", { done: true, doneAt: daysBeforeNow(5) }), 0);
    dbUpsertThread(testThread("t-done-recent", { done: true, doneAt: daysBeforeNow(1) }), 1);
    dbUpsertThread(archivedOld("t-purge-1"), 2);
    dbUpsertThread(archivedOld("t-purge-2"), 3);
    dbUpsertThread(
      testThread("t-archived-recent", {
        archived: true,
        archivedAt: daysBeforeNow(1),
        updatedAt: daysBeforeNow(1),
      }),
      4,
    );
    const published: string[][] = [];
    const deleted: string[] = [];

    const report = await runThreadHousekeeping(
      createDependencies({
        publishThreadsChanged: (threadIds) => published.push([...threadIds]),
        deleteThread: (threadId) => {
          deleted.push(threadId);
          dbDeleteThread(threadId);
        },
      }),
    );

    expect(report.experimentStateUnavailable).toBe(false);
    expect(report.archivedThreadIds).toEqual(["t-done-old"]);
    expect([...report.purgedThreadIds].sort()).toEqual(["t-purge-1", "t-purge-2"]);
    expect(report.skipped).toEqual([]);
    expect(deleted.sort()).toEqual(["t-purge-1", "t-purge-2"]);
    expect(dbGetThread("t-purge-1")).toBeNull();
    expect(dbGetThread("t-purge-2")).toBeNull();
    expect(dbGetThread("t-archived-recent")).not.toBeNull();
    expect(dbGetThread("t-done-old")).toMatchObject({ archived: true });
    expect(dbGetThread("t-done-recent")).toMatchObject({ archived: false });
    // One bounded membership event carrying both archived and purged ids.
    expect(published).toHaveLength(1);
    expect([...published[0]!].sort()).toEqual(["t-done-old", "t-purge-1", "t-purge-2"]);
  });

  it("disables autoarchive when the setting is 0 and never re-triggers on its own", async () => {
    dbUpsertThread(testThread("t-done-old", { done: true, doneAt: daysBeforeNow(5) }), 0);
    const report = await runThreadHousekeeping(
      createDependencies({ getAutoArchiveDoneAfterDays: () => 0 }),
    );
    expect(report.archivedThreadIds).toEqual([]);
    expect(dbGetThread("t-done-old")).toMatchObject({ archived: false });
  });

  it("never archives or purges experiment-owned candidates", async () => {
    dbUpsertThread(testThread("t-experiment-done", { done: true, doneAt: daysBeforeNow(9) }), 0);
    dbUpsertThread(archivedOld("t-experiment-archived"), 1);
    dbUpsertThread(archivedOld("t-free"), 2);
    dbSetState(
      EXPERIMENT_STORE_KEY,
      experimentStore(["t-experiment-done", "t-experiment-archived"]),
    );

    const report = await runThreadHousekeeping(createDependencies());

    expect(report.archivedThreadIds).toEqual([]);
    expect(report.purgedThreadIds).toEqual(["t-free"]);
    // The archive predicate excludes owned rows in SQL (nothing to skip); the
    // purge loop rechecks and records the ownership skip.
    expect(report.skipped).toEqual([
      { threadId: "t-experiment-archived", reason: "experiment_owned" },
    ]);
    expect(dbGetThread("t-experiment-done")).toMatchObject({ archived: false });
    expect(dbGetThread("t-experiment-archived")).not.toBeNull();
    expect(dbGetThread("t-free")).toBeNull();
  });

  it("fails closed when the experiment store is unreadable", async () => {
    dbUpsertThread(testThread("t-done-old", { done: true, doneAt: daysBeforeNow(9) }), 0);
    dbUpsertThread(archivedOld("t-purge"), 1);
    dbSetState(EXPERIMENT_STORE_KEY, "not-json");
    const reportError = vi.fn<(error: unknown) => void>();

    const report = await runThreadHousekeeping(createDependencies({ reportError }));

    expect(report.experimentStateUnavailable).toBe(true);
    expect(report.archivedThreadIds).toEqual([]);
    expect(report.purgedThreadIds).toEqual([]);
    expect(dbGetThread("t-purge")).not.toBeNull();
    expect(dbGetThread("t-done-old")).toMatchObject({ archived: false });
    expect(reportError).toHaveBeenCalled();
  });

  it("skips a purge when a concurrent unarchive lands during the close await", async () => {
    dbUpsertThread(archivedOld("t-race"), 0);
    const deleteThread = vi.fn<(threadId: string) => void>();
    const report = await runThreadHousekeeping(
      createDependencies({
        closeThreadConfirmed: async (threadId) => {
          // A second client (or command) wins the race while the runtime is
          // being retired: the recheck must retain the row.
          getSqlite().prepare("UPDATE threads SET archived = 0 WHERE id = ?").run(threadId);
          return true;
        },
        deleteThread,
      }),
    );
    expect(report.purgedThreadIds).toEqual([]);
    expect(report.skipped).toEqual([{ threadId: "t-race", reason: "predicate_changed" }]);
    expect(deleteThread).not.toHaveBeenCalled();
    expect(dbGetThread("t-race")).not.toBeNull();
  });

  it("skips a purge when ownership appears during the close await", async () => {
    dbUpsertThread(archivedOld("t-owned-late"), 0);
    const deleteThread = vi.fn<(threadId: string) => void>();
    const report = await runThreadHousekeeping(
      createDependencies({
        closeThreadConfirmed: async () => {
          dbSetState(EXPERIMENT_STORE_KEY, experimentStore(["t-owned-late", "t-other"]));
          return true;
        },
        deleteThread,
      }),
    );
    expect(report.purgedThreadIds).toEqual([]);
    expect(report.skipped).toEqual([{ threadId: "t-owned-late", reason: "experiment_owned" }]);
    expect(deleteThread).not.toHaveBeenCalled();
  });

  it("does not delete when the close is unconfirmed or fails, and keeps sweeping", async () => {
    dbUpsertThread(archivedOld("t-unconfirmed"), 0);
    dbUpsertThread(archivedOld("t-close-throws"), 1);
    dbUpsertThread(archivedOld("t-healthy"), 2);
    const reportError = vi.fn<(error: unknown) => void>();
    const closeThreadConfirmed = vi.fn<(threadId: string) => Promise<boolean>>(async (threadId) => {
      if (threadId === "t-unconfirmed") return false;
      if (threadId === "t-close-throws") throw new Error("supervisor stopped");
      return true;
    });

    const report = await runThreadHousekeeping(
      createDependencies({ closeThreadConfirmed, reportError }),
    );

    expect(report.purgedThreadIds).toEqual(["t-healthy"]);
    expect(report.skipped).toEqual(
      expect.arrayContaining([
        { threadId: "t-close-throws", reason: "retirement_failed" },
        { threadId: "t-unconfirmed", reason: "retirement_unconfirmed" },
      ]),
    );
    expect(dbGetThread("t-unconfirmed")).not.toBeNull();
    expect(dbGetThread("t-close-throws")).not.toBeNull();
    expect(reportError).toHaveBeenCalled();
  });

  it("isolates a delete blocked by a running checkpoint revert", async () => {
    dbUpsertThread(archivedOld("t-revert"), 0);
    dbUpsertThread(archivedOld("t-healthy"), 1);
    getSqlite()
      .prepare(
        `INSERT INTO checkpoint_revert_operations
           (operation_key, thread_id, checkpoint_item_id, num_turns, provider_phase,
            files_phase, truncate_phase, outcome, created_at, updated_at)
         VALUES ('revert-op-1', 't-revert', 'item-1', 1, 'pending', 'pending', 'pending',
                 'running', 1, 1)`,
      )
      .run();
    const reportError = vi.fn<(error: unknown) => void>();

    const report = await runThreadHousekeeping(createDependencies({ reportError }));

    expect(report.purgedThreadIds).toEqual(["t-healthy"]);
    expect(report.skipped).toEqual([{ threadId: "t-revert", reason: "delete_blocked" }]);
    expect(dbGetThread("t-revert")).not.toBeNull();
    expect(reportError).toHaveBeenCalled();
  });

  it("isolates a refused per-thread mutation and reports publication failures", async () => {
    dbUpsertThread(archivedOld("t-locked"), 0);
    dbUpsertThread(archivedOld("t-healthy"), 1);
    const reportError = vi.fn<(error: unknown) => void>();
    const report = await runThreadHousekeeping(
      createDependencies({
        runThreadMutation: (threadId, operation) =>
          threadId === "t-locked"
            ? Promise.reject(new Error("cancelled by a control operation"))
            : operation(),
        publishThreadsChanged: () => {
          throw new Error("no remote server");
        },
        reportError,
      }),
    );

    // Both rows committed; the publication failure is reported, not rolled back.
    expect(report.purgedThreadIds).toEqual(["t-healthy"]);
    expect(report.skipped).toEqual([{ threadId: "t-locked", reason: "retirement_failed" }]);
    expect(dbGetThread("t-healthy")).toBeNull();
    expect(dbGetThread("t-locked")).not.toBeNull();
    // One error for the refused mutation, one for the failed publication.
    expect(reportError).toHaveBeenCalledTimes(2);
  });

  it("cancels before any read when the owner is already disposing (H4)", async () => {
    dbUpsertThread(archivedOld("t-cold"), 0);
    const published: string[][] = [];
    const deleted: string[] = [];
    const report = await runThreadHousekeeping(
      createDependencies({
        isCancelled: () => true,
        deleteThread: (threadId) => deleted.push(threadId),
        publishThreadsChanged: (threadIds) => published.push([...threadIds]),
      }),
    );
    expect(report.cancelled).toBe(true);
    expect(report.archivedThreadIds).toEqual([]);
    expect(report.purgedThreadIds).toEqual([]);
    expect(deleted).toEqual([]);
    expect(published).toEqual([]);
    // The row is untouched: cancellation happened before the custody delete.
    expect(dbGetThread("t-cold")).not.toBeNull();
  });

  it("stops after a held retirement when the owner cancels, with no later read/delete/publication (H4)", async () => {
    dbUpsertThread(archivedOld("t-held"), 0);
    const entered = Promise.withResolvers<void>();
    const held = Promise.withResolvers<boolean>();
    let cancelled = false;
    const published: string[][] = [];
    const deleted: string[] = [];
    const run = runThreadHousekeeping(
      createDependencies({
        isCancelled: () => cancelled,
        closeThreadConfirmed: async () => {
          entered.resolve();
          return held.promise;
        },
        deleteThread: (threadId) => deleted.push(threadId),
        publishThreadsChanged: (threadIds) => published.push([...threadIds]),
      }),
    );
    await entered.promise;
    // The owner cancels and would close the database right after joining.
    cancelled = true;
    held.resolve(true);
    const report = await run;
    expect(report.cancelled).toBe(true);
    expect(report.purgedThreadIds).toEqual([]);
    expect(report.skipped).toEqual([{ threadId: "t-held", reason: "cancelled" }]);
    expect(deleted).toEqual([]);
    expect(published).toEqual([]);
    expect(dbGetThread("t-held")).not.toBeNull();
  });
});
