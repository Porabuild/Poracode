import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Experiment,
  type ExperimentCandidate,
  type ExperimentCandidateThreadCreation,
  type Project,
} from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { onThreadsDeleted } from "./deletedThreadNotifications";
import { dbApplyExperimentIntent, type DbExperimentIntentCommand } from "./experimentIntents";
import { resetProjectLifecycleGuardForTests } from "./projectLifecycleGuard";
import {
  dbDeleteProject,
  dbDeleteThread,
  dbUpsertProject,
  dbUpsertThread,
} from "./projectsThreads";
import { dbSyncAll, dbSyncChanges } from "./sync";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { resetRuntimePersistenceForTests } from "./runtimePersistenceRuntime";

function testProject(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function candidate(threadId: string): ExperimentCandidate {
  return {
    threadId,
    agentKind: "claude",
    worktreeBranch: `poracode/experiment-${threadId}`,
    worktreeOwnerToken: `owner:${threadId}`,
    worktreeState: "pending",
  };
}

function experimentRecord(id: string, projectId = "p1"): Experiment {
  return {
    id,
    projectId,
    title: `Experiment ${id}`,
    prompt: `compare ${id}`,
    baseBranch: "main",
    baseCommit: "a".repeat(40),
    candidates: [candidate("c1"), candidate("c2")],
    status: "running",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function threadSpec(record: Experiment, threadId: string): ExperimentCandidateThreadCreation {
  const recordCandidate = record.candidates.find((entry) => entry.threadId === threadId)!;
  return {
    threadId,
    projectId: record.projectId,
    title: `Candidate ${threadId}`,
    agentKind: "claude",
    config: { model: "opus" },
    worktreeBranch: recordCandidate.worktreeBranch,
  };
}

function createCommand(record: Experiment): DbExperimentIntentCommand {
  return {
    kind: "create",
    experimentId: record.id,
    record,
    threads: record.candidates.map((entry) => threadSpec(record, entry.threadId)),
  };
}

function removeCommand(
  experimentId: string,
  revision: string,
  candidateDisposition: "delete" | "release",
): DbExperimentIntentCommand {
  return { kind: "remove", experimentId, revision, candidateDisposition };
}

describe.skipIf(!sqliteAvailable)("deleted-thread notification seam (real sqlite)", () => {
  let directory: string;
  let previousBinding: string | undefined;

  beforeEach(() => {
    previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-deleted-threads-"));
    initDatabase(join(directory, "state.sqlite"));
    resetRuntimePersistenceForTests();
  });

  afterEach(() => {
    resetProjectLifecycleGuardForTests();
    resetRuntimePersistenceForTests();
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    if (previousBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
  });

  it("announces a committed thread deletion with its id", () => {
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread(testThread(), 0);
    const seen: string[][] = [];
    const unsubscribe = onThreadsDeleted((ids) => seen.push([...ids]));
    try {
      dbDeleteThread("thread-1");
    } finally {
      unsubscribe();
    }
    expect(seen).toEqual([["thread-1"]]);
    expect(
      getSqlite().prepare("SELECT id FROM threads WHERE id = ?").get("thread-1"),
    ).toBeUndefined();
  });

  it("announces a committed project deletion with the project's thread ids", () => {
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread({ ...testThread(), id: "thread-1" }, 0);
    dbUpsertThread({ ...testThread(), id: "thread-2" }, 1);
    const seen: string[][] = [];
    const unsubscribe = onThreadsDeleted((ids) => seen.push([...ids]));
    try {
      dbDeleteProject("project-1");
    } finally {
      unsubscribe();
    }
    expect(seen).toEqual([["thread-1", "thread-2"]]);
  });

  it("announces the explicit deletions of a change-sync commit", () => {
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread(testThread(), 0);
    const seen: string[][] = [];
    const unsubscribe = onThreadsDeleted((ids) => seen.push([...ids]));
    try {
      dbSyncChanges({
        projects: [],
        threads: [],
        deletedProjectIds: [],
        deletedThreadIds: ["thread-1"],
        viewJson: "{}",
      });
    } finally {
      unsubscribe();
    }
    expect(seen).toEqual([["thread-1"]]);
  });

  it("announces the project-cascaded thread deletions of a change-sync commit", () => {
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread(testThread(), 0);
    dbUpsertThread({ ...testThread(), id: "thread-2" }, 1);
    const seen: string[][] = [];
    const unsubscribe = onThreadsDeleted((ids) => seen.push([...ids]));
    try {
      // A deletedProjectIds-only snapshot removes the threads through the
      // foreign-key cascade; the announcement must include their ids.
      dbSyncChanges({
        projects: [],
        threads: [],
        deletedProjectIds: ["project-1"],
        deletedThreadIds: ["thread-2"],
        viewJson: "{}",
      });
    } finally {
      unsubscribe();
    }
    expect(seen).toEqual([["thread-2", "thread-1"]]);
    expect(getSqlite().prepare("SELECT id FROM threads").all()).toEqual([]);
  });

  it("announces project-cascaded deletions as a candidate even under an outer rollback", () => {
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread(testThread(), 0);
    const seen: string[][] = [];
    const unsubscribe = onThreadsDeleted((ids) => seen.push([...ids]));
    try {
      expect(() =>
        getSqlite().transaction(() => {
          dbSyncChanges({
            projects: [],
            threads: [],
            deletedProjectIds: ["project-1"],
            deletedThreadIds: [],
            viewJson: "{}",
          });
          throw new Error("outer rollback");
        })(),
      ).toThrow("outer rollback");
    } finally {
      unsubscribe();
    }
    // The announcement fired as a commit candidate, but the outer rollback
    // restored the row — listeners must recheck live rows (the reclaimer
    // tests prove the directory survives this shape).
    expect(seen).toEqual([["thread-1"]]);
    expect(getSqlite().prepare("SELECT id FROM threads WHERE id = ?").get("thread-1")).toBeTruthy();
  });

  it("isolates a throwing listener from the SQL caller and from later listeners", () => {
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread(testThread(), 0);
    const reported: unknown[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((error: unknown) => {
      reported.push(error);
    });
    const after: string[][] = [];
    const unsubscribeThrowing = onThreadsDeleted(() => {
      throw new Error("listener boom");
    });
    const unsubscribeAfter = onThreadsDeleted((ids) => after.push([...ids]));
    try {
      expect(() => dbDeleteThread("thread-1")).not.toThrow();
    } finally {
      unsubscribeThrowing();
      unsubscribeAfter();
      errorSpy.mockRestore();
    }
    // The committed delete stays committed, the later listener still ran, and
    // the failure was reported instead of escaping into the SQL caller.
    expect(
      getSqlite().prepare("SELECT id FROM threads WHERE id = ?").get("thread-1"),
    ).toBeUndefined();
    expect(after).toEqual([["thread-1"]]);
    expect(reported.length).toBeGreaterThan(0);
  });

  it("announces the diffed deletions of a full-snapshot sync commit", () => {
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread(testThread(), 0);
    // The first snapshot mirrors the row, so a later snapshot that drops it is
    // a real deletion (the unmirrored main-created-thread guard no longer
    // protects it).
    dbSyncAll([testProject("project-1")], [testThread()], "{}");
    const seen: string[][] = [];
    const unsubscribe = onThreadsDeleted((ids) => seen.push([...ids]));
    try {
      dbSyncAll([testProject("project-1")], [], "{}");
    } finally {
      unsubscribe();
    }
    expect(seen).toEqual([["thread-1"]]);
  });

  it("announces experiment retirement deletions after the intent commits", () => {
    dbUpsertProject(testProject("p1"), 0);
    const record = experimentRecord("E1");
    const created = dbApplyExperimentIntent(createCommand(record));
    expect(created).toMatchObject({ status: "applied" });
    if (created.status !== "applied") return;
    const seen: string[][] = [];
    const unsubscribe = onThreadsDeleted((ids) => seen.push([...ids]));
    try {
      const outcome = dbApplyExperimentIntent(removeCommand("E1", created.revision, "delete"));
      expect(outcome).toMatchObject({ status: "applied", deletedThreadIds: ["c1", "c2"] });
    } finally {
      unsubscribe();
    }
    expect(seen).toEqual([["c1", "c2"]]);
  });

  it("never announces an outer-rolled-back deletion, and the row survives", () => {
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread(testThread(), 0);
    const seen: string[][] = [];
    const unsubscribe = onThreadsDeleted((ids) => seen.push([...ids]));
    try {
      // An outer transaction turns the inner delete into a savepoint; the
      // notification may have fired inside it, so the reclaimer's live-row
      // recheck (not the notification) is what protects the directory.
      expect(() =>
        getSqlite().transaction(() => {
          dbDeleteThread("thread-1");
          throw new Error("outer rollback");
        })(),
      ).toThrow("outer rollback");
    } finally {
      unsubscribe();
    }
    expect(getSqlite().prepare("SELECT id FROM threads WHERE id = ?").get("thread-1")).toBeTruthy();
  });

  it("never announces a refused project deletion (mid-transaction abort rolls back)", () => {
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread(testThread(), 0);
    getSqlite()
      .prepare("INSERT INTO project_notes (project_id, doc, todos, updated_at) VALUES (?, ?, ?, ?)")
      .run("project-1", "notes", "[]", "2026-01-01T00:00:00.000Z");
    getSqlite().exec(`
      CREATE TRIGGER refuse_project_notes_delete BEFORE DELETE ON project_notes
      BEGIN SELECT RAISE(ABORT, 'notes deletion refused'); END;
    `);
    const seen: string[][] = [];
    const unsubscribe = onThreadsDeleted((ids) => seen.push([...ids]));
    try {
      expect(() => dbDeleteProject("project-1")).toThrow("notes deletion refused");
    } finally {
      unsubscribe();
      getSqlite().exec("DROP TRIGGER IF EXISTS refuse_project_notes_delete");
    }
    expect(seen).toEqual([]);
    expect(getSqlite().prepare("SELECT id FROM threads WHERE id = ?").get("thread-1")).toBeTruthy();
  });

  it("keeps notifying later subscribers after a listener is removed", () => {
    const firstSeen: string[][] = [];
    const secondSeen: string[][] = [];
    const unsubscribeFirst = onThreadsDeleted((ids) => firstSeen.push([...ids]));
    dbUpsertProject(testProject("project-1"), 0);
    dbUpsertThread(testThread(), 0);
    unsubscribeFirst();
    const unsubscribeSecond = onThreadsDeleted((ids) => secondSeen.push([...ids]));
    try {
      dbDeleteThread("thread-1");
    } finally {
      unsubscribeSecond();
    }
    expect(firstSeen).toEqual([]);
    expect(secondSeen).toEqual([["thread-1"]]);
  });
});
