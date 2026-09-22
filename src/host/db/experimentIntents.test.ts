import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  MAX_EXPERIMENT_STATE_BYTES,
  type Experiment,
  type ExperimentCandidate,
  type ExperimentCandidateThreadCreation,
  type Project,
} from "@/shared/contracts";
import { getSqlite, closeDatabase, initDatabase } from "./connection";
import {
  dbApplyExperimentIntent,
  dbPreflightExperimentIntent,
  dbReconcileExperimentIntent,
  dbRemoveProjectExperiments,
  type DbExperimentIntentCommand,
} from "./experimentIntents";
import {
  dbProjectExists,
  dbReadExperimentState,
  experimentStoreRevision,
  readExperimentStoreSnapshot,
} from "./experimentStore";
import {
  beginProjectRemoval,
  isProjectRemoving,
  resetProjectLifecycleGuardForTests,
} from "./projectLifecycleGuard";
import { noteMainCreatedThread, isMainCreatedThreadUnmirrored } from "./mainCreatedThreads";
import { dbGetState, dbSetState, dbUpsertProject } from "./projectsThreads";
import { onProjectThreadDataChanged } from "./projectThreadChanges";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

function testProject(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function candidate(
  threadId: string,
  branch = `poracode/experiment-${threadId}`,
): ExperimentCandidate {
  return {
    threadId,
    agentKind: "claude",
    worktreeBranch: branch,
    worktreeOwnerToken: `owner:${threadId}`,
    worktreeState: "pending",
  };
}

function experimentRecord(
  id: string,
  projectId = "p1",
  overrides: Partial<Experiment> = {},
): Experiment {
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
    ...overrides,
  };
}

function threadSpec(
  record: Experiment,
  threadId: string,
  overrides: Partial<ExperimentCandidateThreadCreation> = {},
): ExperimentCandidateThreadCreation {
  const recordCandidate = record.candidates.find((entry) => entry.threadId === threadId)!;
  return {
    threadId,
    projectId: record.projectId,
    title: `Candidate ${threadId}`,
    agentKind: "claude",
    config: { model: "opus" },
    worktreeBranch: recordCandidate.worktreeBranch,
    ...overrides,
  };
}

function createCommand(
  record: Experiment,
  threads?: readonly ExperimentCandidateThreadCreation[],
): DbExperimentIntentCommand {
  return {
    kind: "create",
    experimentId: record.id,
    record,
    threads: threads ?? record.candidates.map((entry) => threadSpec(record, entry.threadId)),
  };
}

function replaceCommand(
  record: Experiment,
  revision: string,
  rows: Extract<DbExperimentIntentCommand, { kind: "replace" }>["rows"] = [],
): DbExperimentIntentCommand {
  return { kind: "replace", experimentId: record.id, revision, record, rows };
}

function removeCommand(
  experimentId: string,
  revision: string,
  candidateDisposition: "delete" | "release" = "delete",
): DbExperimentIntentCommand {
  return { kind: "remove", experimentId, revision, candidateDisposition };
}

function threadRow(threadId: string): Record<string, unknown> | undefined {
  return getSqlite().prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as
    | Record<string, unknown>
    | undefined;
}

function rowSnapshot(threadId: string): string {
  return JSON.stringify(threadRow(threadId));
}

function threadOrder(projectId: string): string[] {
  return (
    getSqlite()
      .prepare("SELECT id FROM threads WHERE project_id = ? ORDER BY sort_order ASC, id ASC")
      .all(projectId) as { id: string }[]
  ).map((row) => row.id);
}

function storedExperiments(): Record<string, unknown> {
  const raw = dbGetState(EXPERIMENT_STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state: { experiments: Record<string, unknown> } };
  return parsed.state.experiments;
}

function writeRawStore(experiments: Record<string, unknown>): void {
  dbSetState(
    EXPERIMENT_STORE_KEY,
    JSON.stringify({ state: { experiments }, version: EXPERIMENT_STORE_VERSION }),
  );
}

function seedLegacyThreadRows(): void {
  const sqlite = getSqlite();
  for (const [index, id] of ["old-1", "old-2", "old-3"].entries()) {
    sqlite
      .prepare(
        `INSERT INTO threads (
           id, project_id, title, agent_kind, config, status, attention, thread_status_source,
           can_resume_with_config, session_ref, sort_order, created_at, updated_at
         ) VALUES (?, 'p1', ?, 'claude', '{"model":"opus"}', 'inactive', 'none', 'server',
                   0, NULL, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run(id, id, index);
  }
}

describe.skipIf(!sqliteAvailable)("experimentIntents (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-experiment-intents-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertProject(testProject("p2"), 1);
    seedLegacyThreadRows();
  });

  afterEach(() => {
    resetProjectLifecycleGuardForTests();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  describe("create", () => {
    it("inserts only creation fields with host defaults and a head order block", () => {
      const record = experimentRecord("E1");
      const existing = new Map(["old-1", "old-2", "old-3"].map((id) => [id, rowSnapshot(id)]));
      const outcome = dbApplyExperimentIntent(createCommand(record));
      expect(outcome).toMatchObject({ status: "applied", stage: "created" });
      if (outcome.status !== "applied") return;
      expect(outcome.revision.startsWith("xh1:")).toBe(true);
      expect(outcome.touchedThreadIds).toEqual(["c1", "c2"]);

      expect(threadOrder("p1")).toEqual(["c1", "c2", "old-1", "old-2", "old-3"]);
      for (const [id, snapshot] of existing) expect(rowSnapshot(id)).toBe(snapshot);

      const c1 = threadRow("c1")!;
      expect(c1).toMatchObject({
        project_id: "p1",
        title: "Candidate c1",
        agent_kind: "claude",
        config: JSON.stringify({ model: "opus" }),
        status: "inactive",
        attention: "none",
        thread_status_source: null,
        can_resume_with_config: 0,
        session_ref: null,
        worktree_path: null,
        worktree_branch: "poracode/experiment-c1",
        group_id: "E1",
        group_name: "Experiment E1",
        presentation_mode: "terminal",
        archived: 0,
        done: 0,
        starred: 0,
      });

      const state = dbReadExperimentState();
      expect(state).toMatchObject({
        status: "ok",
        revision: outcome.revision,
        experiments: [expect.objectContaining({ id: "E1" })],
      });
    });

    it("is idempotent for the exact record and refuses a different one with zero effect", () => {
      const record = experimentRecord("E1");
      expect(dbApplyExperimentIntent(createCommand(record)).status).toBe("applied");

      const before = new Map(["c1", "c2"].map((id) => [id, rowSnapshot(id)]));
      const repeated = dbApplyExperimentIntent(createCommand(record));
      expect(repeated).toMatchObject({ status: "applied", stage: "unchanged" });
      for (const [id, snapshot] of before) expect(rowSnapshot(id)).toBe(snapshot);

      const conflicting = dbApplyExperimentIntent(
        createCommand(experimentRecord("E1", "p1", { title: "Different" })),
      );
      expect(conflicting).toEqual({ status: "already_exists" });
    });

    it("rolls back the whole transaction on a thread id conflict", () => {
      getSqlite()
        .prepare(
          `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention,
             can_resume_with_config, sort_order, created_at, updated_at)
           VALUES ('c2', 'p2', 'foreign', 'claude', '{}', 'inactive', 'none', 0, 0,
                   '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
        )
        .run();
      const outcome = dbApplyExperimentIntent(createCommand(experimentRecord("E1")));
      expect(outcome).toEqual({ status: "thread_exists", threadIds: ["c2"] });
      expect(threadRow("c1")).toBeUndefined();
      expect(storedExperiments()).toEqual({});
    });

    it("refuses a missing project before any effect", () => {
      const outcome = dbApplyExperimentIntent(createCommand(experimentRecord("E1", "missing")));
      expect(outcome).toEqual({ status: "project_missing" });
      expect(storedExperiments()).toEqual({});
    });
  });

  describe("replace", () => {
    it("updates only allowlisted row columns and never re-inserts a missing row", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      const before = rowSnapshot("c1");

      const updated: Experiment = { ...record, updatedAt: "2026-01-02T00:00:00.000Z" };
      const outcome = dbApplyExperimentIntent(
        replaceCommand(updated, created.revision, [
          { threadId: "c1", worktree: { path: "/wt/c1", branch: "poracode/experiment-c1" } },
        ]),
      );
      expect(outcome).toMatchObject({ status: "applied", stage: "replaced" });

      const beforeColumns = JSON.parse(before) as Record<string, unknown>;
      const after = threadRow("c1")!;
      const changed = Object.keys(after).filter(
        (column) => after[column] !== beforeColumns[column],
      );
      // Only the allowlisted narrow columns may ever change on this path.
      const allowlisted = new Set(["worktree_path", "worktree_branch", "updated_at"]);
      expect(changed.filter((column) => !allowlisted.has(column))).toEqual([]);
      expect(changed).toContain("worktree_path");

      // A missing candidate row is a truthful conflict, never a re-insert.
      getSqlite().prepare("DELETE FROM threads WHERE id = 'c1'").run();
      const current = readExperimentStoreSnapshot()!.revision;
      const missing = dbApplyExperimentIntent(
        replaceCommand(updated, current, [{ threadId: "c1", groupName: "renamed" }]),
      );
      expect(missing).toEqual({ status: "candidate_row_missing", threadIds: ["c1"] });
      expect(threadRow("c1")).toBeUndefined();
    });

    it("refuses immutable ownership changes and non-candidate rows", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");

      const changedBranch: Experiment = {
        ...record,
        candidates: [candidate("c1", "poracode/experiment-other"), candidate("c2")],
      };
      expect(dbApplyExperimentIntent(replaceCommand(changedBranch, created.revision))).toEqual({
        status: "candidate_ownership_changed",
        threadIds: ["c1", "c2"],
      });

      const changedOwner: Experiment = {
        ...record,
        candidates: [{ ...candidate("c1"), worktreeOwnerToken: "other" }, candidate("c2")],
      };
      expect(dbApplyExperimentIntent(replaceCommand(changedOwner, created.revision)).status).toBe(
        "candidate_ownership_changed",
      );

      const addedCandidate: Experiment = {
        ...record,
        candidates: [candidate("c1"), candidate("c2"), candidate("c3")],
      };
      expect(dbApplyExperimentIntent(replaceCommand(addedCandidate, created.revision)).status).toBe(
        "candidate_ownership_changed",
      );

      const foreignRow = replaceCommand(record, created.revision, [
        { threadId: "old-1", groupName: "x" },
      ]);
      expect(dbPreflightExperimentIntent(foreignRow)).toEqual({
        status: "thread_not_candidate",
        threadIds: ["old-1"],
      });

      const rowBranchMismatch = replaceCommand(record, created.revision, [
        { threadId: "c1", worktree: { path: "/wt/c1", branch: "poracode/other" } },
      ]);
      expect(dbApplyExperimentIntent(rowBranchMismatch)).toEqual({
        status: "candidate_ownership_changed",
        threadIds: ["c1"],
      });
    });

    it("never fails a candidate that carries a session and skips re-stamped retire timestamps", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");

      getSqlite()
        .prepare(
          `UPDATE threads SET status = 'working', session_ref = '{"providerSessionId":"s1"}' WHERE id = 'c1'`,
        )
        .run();
      expect(
        dbApplyExperimentIntent(
          replaceCommand(record, created.revision, [{ threadId: "c1", fail: true }]),
        ),
      ).toEqual({ status: "candidate_session_present", threadIds: ["c1"] });
      expect(threadRow("c1")!.status).toBe("working");

      // A launching candidate with no session reference IS the never-launched
      // failure target (the route confirms retirement first).
      getSqlite()
        .prepare(`UPDATE threads SET status = 'launching', session_ref = NULL WHERE id = 'c1'`)
        .run();
      const failed = dbApplyExperimentIntent(
        replaceCommand(record, created.revision, [{ threadId: "c1", fail: true }]),
      );
      expect(failed.status).toBe("applied");
      expect(threadRow("c1")).toMatchObject({
        status: "error",
        attention: "error",
        can_resume_with_config: 0,
        done: 1,
      });

      // retire applies once; an idempotent retry with the old token keeps the
      // original timestamp.
      const beforeRetire = readExperimentStoreSnapshot()!.revision;
      expect(
        dbApplyExperimentIntent(
          replaceCommand(record, beforeRetire, [{ threadId: "c2", retire: "done" }]),
        ).status,
      ).toBe("applied");
      const doneAt = threadRow("c2")!.done_at;
      expect(doneAt).toBeTruthy();
      const retried = dbApplyExperimentIntent(
        replaceCommand(record, beforeRetire, [{ threadId: "c2", retire: "done" }]),
      );
      expect(retried).toMatchObject({ status: "applied", stage: "unchanged" });
      expect(threadRow("c2")!.done_at).toBe(doneAt);
    });

    it("rejects a stale store-wide token and rebases only the intended change", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");

      // A different experiment's write invalidates the store-wide token; an
      // unknown future field on its raw record must survive every later splice.
      const otherRecord = {
        ...experimentRecord("E2", "p2"),
        futureField: { nested: [1, 2, 3] },
      };
      writeRawStore({ E1: record, E2: otherRecord });

      const stale = dbApplyExperimentIntent(
        replaceCommand({ ...record, title: "Renamed" }, created.revision),
      );
      expect(stale).toEqual({ status: "revision_conflict" });

      const current = readExperimentStoreSnapshot()!.revision;
      const rebased = dbApplyExperimentIntent(
        replaceCommand({ ...record, title: "Renamed" }, current),
      );
      expect(rebased).toMatchObject({ status: "applied", stage: "replaced" });
      expect(storedExperiments().E2).toEqual(otherRecord);
      expect((storedExperiments().E1 as Experiment).title).toBe("Renamed");

      // Idempotent retry after the rebase: record equals the intent, no rows
      // requested, and the current token is the stale one — it must not fail.
      const again = dbApplyExperimentIntent(
        replaceCommand({ ...record, title: "Renamed" }, created.revision),
      );
      expect(again).toMatchObject({ status: "applied", stage: "unchanged" });
    });

    it("refuses a replace for a missing record or a removed project", () => {
      expect(
        dbApplyExperimentIntent(replaceCommand(experimentRecord("E1"), "xh1:whatever")),
      ).toEqual({ status: "not_found" });

      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      getSqlite().prepare("DELETE FROM projects WHERE id = 'p1'").run();
      const command = replaceCommand({ ...record, title: "Renamed" }, created.revision);
      expect(dbPreflightExperimentIntent(command)).toEqual({ status: "project_missing" });
      expect(dbApplyExperimentIntent(command)).toEqual({ status: "project_missing" });
      expect((storedExperiments().E1 as Experiment).title).toBe(record.title);
    });
  });

  describe("remove", () => {
    it("rolls the whole command back on a running checkpoint revert, then succeeds", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      noteMainCreatedThread("c1");

      getSqlite()
        .prepare(
          `INSERT INTO checkpoint_revert_operations (
             operation_key, thread_id, checkpoint_item_id, num_turns, provider_phase, files_phase,
             truncate_phase, outcome, created_at, updated_at
           ) VALUES ('op-1', 'c1', 'item-1', 1, 'pending', 'pending', 'pending', 'running', 1, 1)`,
        )
        .run();

      const blocked = dbApplyExperimentIntent(removeCommand("E1", created.revision));
      expect(blocked).toEqual({ status: "checkpoint_revert_running", threadIds: ["c1", "c2"] });
      expect(threadRow("c1")).toBeDefined();
      expect(threadRow("c2")).toBeDefined();
      expect(storedExperiments().E1).toBeDefined();
      // The refused command forgot nothing: the live obligation remains.
      expect(isMainCreatedThreadUnmirrored("c1")).toBe(true);

      getSqlite()
        .prepare(
          "UPDATE checkpoint_revert_operations SET outcome = 'ambiguous' WHERE operation_key = 'op-1'",
        )
        .run();
      const applied = dbApplyExperimentIntent(removeCommand("E1", created.revision));
      expect(applied).toMatchObject({ status: "applied", stage: "removed" });
      expect(threadRow("c1")).toBeUndefined();
      expect(threadRow("c2")).toBeUndefined();
      expect(storedExperiments().E1).toBeUndefined();
      // Committed: the deleted rows' obligations are released.
      expect(isMainCreatedThreadUnmirrored("c1")).toBe(false);
      expect(threadRow("old-1")).toBeDefined();
    });

    it("publishes exactly one change notification per applied command", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      const changed = vi.fn<() => void>();
      const unsubscribe = onProjectThreadDataChanged(changed);
      try {
        dbApplyExperimentIntent(removeCommand("E1", "xh1:stale"));
        expect(changed).not.toHaveBeenCalled();
        dbApplyExperimentIntent(removeCommand("E1", created.revision));
        expect(changed).toHaveBeenCalledTimes(1);
      } finally {
        unsubscribe();
      }
    });

    it("is an idempotent success for a fully removed record and truthful when rows remain", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      dbApplyExperimentIntent(removeCommand("E1", created.revision));

      const repeated = dbApplyExperimentIntent(removeCommand("E1", "xh1:anything"));
      expect(repeated).toMatchObject({ status: "applied", stage: "unchanged" });

      getSqlite()
        .prepare(
          `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention,
             can_resume_with_config, group_id, sort_order, created_at, updated_at)
           VALUES ('z1', 'p1', 'z1', 'claude', '{}', 'inactive', 'none', 0, 'E9', 9,
                   '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
        )
        .run();
      expect(dbApplyExperimentIntent(removeCommand("E9", "xh1:anything"))).toEqual({
        status: "not_found",
      });
    });

    it("release clears only group fields and refuses a missing candidate row", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      const before = JSON.parse(rowSnapshot("c1")!) as Record<string, unknown>;

      const released = dbApplyExperimentIntent(removeCommand("E1", created.revision, "release"));
      expect(released).toMatchObject({ status: "applied", stage: "removed" });
      const after = threadRow("c1")!;
      expect(after.group_id).toBeNull();
      expect(after.group_name).toBeNull();
      const changed = Object.keys(after).filter((column) => after[column] !== before[column]);
      const allowlisted = new Set(["group_id", "group_name", "updated_at"]);
      expect(changed.filter((column) => !allowlisted.has(column))).toEqual([]);
      expect(changed).toEqual(expect.arrayContaining(["group_id", "group_name"]));
      expect(storedExperiments().E1).toBeUndefined();
    });

    it("refuses release when a candidate row is missing", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      getSqlite().prepare("DELETE FROM threads WHERE id = 'c2'").run();
      expect(dbApplyExperimentIntent(removeCommand("E1", created.revision, "release"))).toEqual({
        status: "candidate_row_missing",
        threadIds: ["c2"],
      });
      expect(storedExperiments().E1).toBeDefined();
    });
  });

  describe("preflight and reconcile", () => {
    it("returns the same typed refusal as the transaction without any effect", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");

      const conflicting = experimentRecord("E1", "p1", { title: "Different" });
      expect(dbPreflightExperimentIntent(createCommand(conflicting))).toEqual({
        status: "already_exists",
      });
      expect(storedExperiments().E1).toEqual(record);

      const plan = dbPreflightExperimentIntent(
        replaceCommand(record, created.revision, [{ threadId: "c2", retire: "done" }]),
      );
      expect(plan).toEqual({ status: "plan", retiringThreadIds: ["c2"] });
      expect(threadRow("c2")!.done).toBe(0);

      const noRetire = dbPreflightExperimentIntent(
        replaceCommand(record, created.revision, [
          { threadId: "c2", worktree: { path: "/wt", branch: "poracode/experiment-c2" } },
        ]),
      );
      expect(noRetire).toEqual({ status: "plan", retiringThreadIds: [] });
    });

    it("resumes only when the full post-state is proven or nothing changed", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");

      expect(dbReconcileExperimentIntent(removeCommand("E1", created.revision))).toEqual({
        kind: "resume",
      });
      expect(dbReconcileExperimentIntent(removeCommand("E1", "xh1:stale"))).toEqual({
        kind: "unresolved",
      });

      const replaceWithRow = replaceCommand(record, created.revision, [
        { threadId: "c1", retire: "done" },
      ]);
      // A row-only replace leaves the store token untouched, so an uncertain
      // receipt cannot prove non-application before the row postcondition
      // holds: unresolved, never a blind re-apply.
      expect(dbReconcileExperimentIntent(replaceWithRow)).toEqual({ kind: "unresolved" });
      dbApplyExperimentIntent(replaceWithRow);
      // Applied and fully postconditioned: resume so a re-execution is an
      // idempotent no-op.
      expect(dbReconcileExperimentIntent(replaceWithRow)).toEqual({ kind: "resume" });
      // A newer baseline that overwrote the row postcondition is unresolved.
      getSqlite().prepare("UPDATE threads SET done = 0, done_at = NULL WHERE id = 'c1'").run();
      expect(dbReconcileExperimentIntent(replaceWithRow)).toEqual({ kind: "unresolved" });
    });

    it("refuses every kind for a project that is being removed, with zero effect", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      const release = beginProjectRemoval("p1");
      try {
        expect(isProjectRemoving("p1")).toBe(true);
        expect(dbApplyExperimentIntent(createCommand(experimentRecord("E2")))).toEqual({
          status: "project_removing",
        });
        expect(
          dbApplyExperimentIntent(replaceCommand({ ...record, title: "x" }, created.revision)),
        ).toEqual({ status: "project_removing" });
        expect(dbApplyExperimentIntent(removeCommand("E1", created.revision))).toEqual({
          status: "project_removing",
        });
        expect(dbPreflightExperimentIntent(removeCommand("E1", created.revision))).toEqual({
          status: "project_removing",
        });
        expect(storedExperiments().E1).toEqual(record);
      } finally {
        release();
      }
      expect(isProjectRemoving("p1")).toBe(false);
    });
  });

  describe("review correction regressions", () => {
    function overBudgetSurvivor(): Record<string, unknown> {
      return {
        ...experimentRecord("E2", "p2"),
        futureField: "x".repeat(MAX_EXPERIMENT_STATE_BYTES + 1024),
      };
    }

    it("refuses an over-budget commit with a typed zero-effect outcome and no partial rows", () => {
      const survivor = overBudgetSurvivor();
      writeRawStore({ E2: survivor });
      const before = dbGetState(EXPERIMENT_STORE_KEY)!;
      expect(Buffer.byteLength(before, "utf8")).toBeGreaterThan(MAX_EXPERIMENT_STATE_BYTES);

      // The served read refuses the over-budget value before parsing it.
      expect(dbReadExperimentState()).toEqual({ status: "too_large" });

      // Preflight predicts the refusal, so no custody/retirement can start.
      expect(dbPreflightExperimentIntent(createCommand(experimentRecord("E1")))).toEqual({
        status: "experiment_state_too_large",
      });

      // The commit re-checks and rolls back every candidate row it inserted.
      expect(dbApplyExperimentIntent(createCommand(experimentRecord("E1")))).toEqual({
        status: "experiment_state_too_large",
      });
      expect(dbGetState(EXPERIMENT_STORE_KEY)).toBe(before);
      expect(threadRow("c1")).toBeUndefined();
      expect(threadRow("c2")).toBeUndefined();
      expect(storedExperiments()).toEqual({ E2: survivor });
    });

    it("re-checks the byte budget at commit after a concurrent store growth", () => {
      const record = experimentRecord("E1");
      expect(dbPreflightExperimentIntent(createCommand(record))).toMatchObject({ status: "plan" });
      writeRawStore({ E2: overBudgetSurvivor() });
      expect(dbApplyExperimentIntent(createCommand(record))).toEqual({
        status: "experiment_state_too_large",
      });
      expect(threadRow("c1")).toBeUndefined();
      expect(storedExperiments().E1).toBeUndefined();
    });

    it("preserves the shrink/removal recovery path for an already over-budget store", () => {
      writeRawStore({ E1: experimentRecord("E1"), E2: overBudgetSurvivor() });
      const raw = dbGetState(EXPERIMENT_STORE_KEY)!;
      const beforeBytes = Buffer.byteLength(raw, "utf8");
      expect(beforeBytes).toBeGreaterThan(MAX_EXPERIMENT_STATE_BYTES);

      const removed = dbApplyExperimentIntent(removeCommand("E2", experimentStoreRevision(raw)));
      expect(removed).toMatchObject({ status: "applied", stage: "removed" });
      const after = dbGetState(EXPERIMENT_STORE_KEY)!;
      expect(Buffer.byteLength(after, "utf8")).toBeLessThan(beforeBytes);
      expect(Buffer.byteLength(after, "utf8")).toBeLessThanOrEqual(MAX_EXPERIMENT_STATE_BYTES);
      expect(dbReadExperimentState().status).toBe("ok");
      expect(storedExperiments().E1).toEqual(experimentRecord("E1"));
    });

    it("validates the immutable branch before skipping a matching row postcondition", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      getSqlite()
        .prepare(
          `UPDATE threads SET worktree_path = '/wt/foreign', worktree_branch = 'poracode/foreign'
           WHERE id = 'c1'`,
        )
        .run();
      const before = rowSnapshot("c1");
      const requested: DbExperimentIntentCommand = {
        kind: "replace",
        experimentId: "E1",
        revision: created.revision,
        record,
        rows: [{ threadId: "c1", worktree: { path: "/wt/foreign", branch: "poracode/foreign" } }],
      };

      expect(dbPreflightExperimentIntent(requested)).toEqual({
        status: "candidate_ownership_changed",
        threadIds: ["c1"],
      });
      expect(dbApplyExperimentIntent(requested)).toEqual({
        status: "candidate_ownership_changed",
        threadIds: ["c1"],
      });
      expect(rowSnapshot("c1")).toBe(before);
    });

    it("refuses destructive removal when a candidate row belongs to another project", () => {
      const record = experimentRecord("E1");
      const created = dbApplyExperimentIntent(createCommand(record));
      if (created.status !== "applied") throw new Error("create failed");
      getSqlite().prepare("UPDATE threads SET project_id = 'p2' WHERE id = 'c1'").run();
      const beforeC1 = rowSnapshot("c1");
      const beforeC2 = rowSnapshot("c2");

      expect(dbPreflightExperimentIntent(removeCommand("E1", created.revision))).toEqual({
        status: "thread_project_mismatch",
        threadIds: ["c1"],
      });
      expect(dbApplyExperimentIntent(removeCommand("E1", created.revision))).toEqual({
        status: "thread_project_mismatch",
        threadIds: ["c1"],
      });
      expect(storedExperiments().E1).toEqual(record);
      expect(rowSnapshot("c1")).toBe(beforeC1);
      expect(rowSnapshot("c2")).toBe(beforeC2);
    });
  });

  describe("project removal and store integrity", () => {
    it("removes exactly the captured ids and preserves unknown values on survivors", () => {
      const p1Record = experimentRecord("E1");
      const p2Record = { ...experimentRecord("E2", "p2"), futureField: { keep: true } };
      const p1Other = experimentRecord("E3");
      writeRawStore({ E1: p1Record, E2: p2Record, E3: p1Other });

      const result = dbRemoveProjectExperiments("p1", ["E1", "E2"]);
      expect(result).toEqual({ status: "ok", removedIds: ["E1"] });
      expect(storedExperiments()).toEqual({ E2: p2Record, E3: p1Other });

      const p2Row = { ...experimentRecord("E4", "p2"), futureField: "value" };
      writeRawStore({ E2: p2Record, E4: p2Row });
      expect(dbRemoveProjectExperiments("p2", ["E4"]).status).toBe("ok");
      expect(storedExperiments().E2).toEqual(p2Record);
      expect(dbProjectExists("p2")).toBe(true);
    });

    it("fails the canonical read closed on an unparseable stored record", () => {
      writeRawStore({
        E1: { ...experimentRecord("E1"), winnerThreadId: "not-a-candidate", status: "running" },
      });
      expect(dbReadExperimentState()).toEqual({ status: "unavailable" });
    });
  });
});
