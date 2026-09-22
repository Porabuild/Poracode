import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  type CreateExperimentWorktreesPayload,
  type Experiment,
  type ExperimentCandidateThreadCreation,
  type Project,
  type RemoveExperimentWorktreesPayload,
} from "@/shared/contracts";
import {
  beginProjectExperimentWorktreePreparation,
  beginProjectRemoval,
  dbApplyExperimentIntent,
  dbDeleteProject,
  dbGetProjects,
  dbGetState,
  dbGetThreads,
  dbPreflightExperimentIntent,
  dbReadExperimentState,
  dbSetState,
  dbUpsertProject,
  initDatabase,
  closeDatabase,
  isProjectRemoving,
  ProjectRemovingError,
  resetProjectLifecycleGuardForTests,
  type DbExperimentIntentCommand,
} from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import { applyRemoteProjectCommand, type RemoteProjectCommandDeps } from "./projectCommands";
import {
  claimExperimentWorktreePreparation,
  discardPersistedProjectExperiments,
  readPersistedExperiments,
  runOwnedExperimentWorktreePreparation,
} from "./experimentOwnership";

/**
 * Experiment authority lifecycle races against a REAL migrated SQLite and the
 * REAL production functions:
 *
 * - probe A corrected: a record committed while the project-removal worktree
 *   await is held survives exact-id removal with its unknown JSON values;
 * - probe B corrected: a project removal holds the shared guard across the
 *   worktree await, the thread-close awaits, and the cascade, so a same-project
 *   experiment intent refuses (`project_removing`) with zero effect;
 * - the worktree preparation boundary refuses a DELAYED preparation whose
 *   ownership is gone, and an IN-FLIGHT preparation is drained before the
 *   removal's own worktree teardown, in both orderings.
 */

function testProject(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
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
    candidates: [
      {
        threadId: `${id}-c1`,
        agentKind: "claude",
        worktreeBranch: `poracode/experiment-${id}-c1`,
        worktreeOwnerToken: `${id}:${id}-c1`,
        worktreeState: "pending",
      },
      {
        threadId: `${id}-c2`,
        agentKind: "claude",
        worktreeBranch: `poracode/experiment-${id}-c2`,
        worktreeOwnerToken: `${id}:${id}-c2`,
        worktreeState: "pending",
      },
    ],
    status: "running",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function threadSpec(record: Experiment, threadId: string): ExperimentCandidateThreadCreation {
  const candidate = record.candidates.find((entry) => entry.threadId === threadId)!;
  return {
    threadId,
    projectId: record.projectId,
    title: `Candidate ${threadId}`,
    agentKind: "claude",
    config: { model: "opus" },
    worktreeBranch: candidate.worktreeBranch,
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

function storedExperiments(): Record<string, unknown> {
  const raw = dbGetState(EXPERIMENT_STORE_KEY);
  if (!raw) return {};
  return (JSON.parse(raw) as { state: { experiments: Record<string, unknown> } }).state.experiments;
}

function writeRawStore(experiments: Record<string, unknown>): void {
  dbSetState(
    EXPERIMENT_STORE_KEY,
    JSON.stringify({ state: { experiments }, version: EXPERIMENT_STORE_VERSION }),
  );
}

function preparationPayload(record: Experiment): CreateExperimentWorktreesPayload {
  return {
    projectLocation: { kind: "posix", path: "/tmp/p1" },
    sourceBranch: "main",
    baseCommit: "a".repeat(40),
    candidates: record.candidates.map((candidate) => ({
      threadId: candidate.threadId,
      branch: candidate.worktreeBranch,
      ownerToken: candidate.worktreeOwnerToken,
    })),
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for condition");
}

describe.skipIf(!sqliteAvailable)("experiment authority lifecycle (real sqlite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-experiment-lifecycle-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertProject(testProject("p2"), 1);
  });

  afterEach(() => {
    resetProjectLifecycleGuardForTests();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("keeps a record committed during the held worktree await (exact-id removal)", async () => {
    const p1Record = experimentRecord("E1");
    const p2Record = { ...experimentRecord("E2", "p2"), futureField: { keep: ["a", 1] } };
    writeRawStore({ E1: p1Record, E2: p2Record });

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;
    const removeWorktrees = vi.fn<
      (payload: RemoveExperimentWorktreesPayload) => Promise<{
        candidates: { threadId: string; branch: string }[];
      }>
    >(async (payload) => {
      entered = true;
      await gate;
      return {
        candidates: payload.candidates.map((candidate) => ({
          threadId: candidate.threadId,
          branch: candidate.branch,
        })),
      };
    });

    const removal = discardPersistedProjectExperiments(testProject("p1"), removeWorktrees);
    await waitFor(() => entered);

    const concurrentRecord = { ...experimentRecord("NEW"), futureField: 42 };
    writeRawStore({ E1: p1Record, E2: p2Record, NEW: concurrentRecord });

    release();
    await removal;

    expect(Object.keys(storedExperiments()).sort()).toEqual(["E2", "NEW"]);
    expect(storedExperiments().E2).toEqual(p2Record);
    expect(storedExperiments().NEW).toEqual(concurrentRecord);
    expect(removeWorktrees).toHaveBeenCalledTimes(1);
  });

  it("fails the cleanup closed when the store is unreadable", async () => {
    dbSetState(EXPERIMENT_STORE_KEY, "{not json");
    await expect(
      discardPersistedProjectExperiments(testProject("p1"), async () => ({ candidates: [] })),
    ).rejects.toMatchObject({ code: "experiment_state_unavailable", status: 503 });
    expect(dbGetState(EXPERIMENT_STORE_KEY)).toBe("{not json");
  });

  it("holds the removal guard across the close awaits and blocks intents (probe B)", async () => {
    writeRawStore({ E1: experimentRecord("E1") });
    getSqlite()
      .prepare(
        `INSERT INTO threads (id, project_id, title, agent_kind, config, status, attention,
           can_resume_with_config, sort_order, created_at, updated_at)
         VALUES ('c-held', 'p1', 'held', 'claude', '{}', 'inactive', 'none', 0, 0,
                 '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      .run();

    let releaseClose: () => void = () => undefined;
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    let closeEntered = false;
    const timeline: string[] = [];

    const deps: RemoteProjectCommandDeps = {
      getProjects: () => dbGetProjects(),
      getProject: (projectId) =>
        dbGetProjects().find((project) => project.id === projectId) ?? null,
      beginProjectRemoval,
      removeProjectExperiments: async (project) => {
        await discardPersistedProjectExperiments(project, async (payload) => ({
          candidates: payload.candidates.map((candidate) => ({
            threadId: candidate.threadId,
            branch: candidate.branch,
          })),
        }));
        timeline.push("experiments_removed");
      },
      hasRunningProjectThread: () => false,
      listProjectThreadIds: (projectId) =>
        dbGetThreads()
          .filter((thread) => thread.projectId === projectId)
          .map((thread) => thread.id),
      upsertProject: () => undefined,
      updateProject: () => undefined,
      reorderProject: () => {
        throw new Error("not used");
      },
      setProjectWorkspace: () => false,
      setProjectLastDraftConfig: () => false,
      closeThread: async (threadId) => {
        if (threadId === "c-held") {
          closeEntered = true;
          timeline.push("close_await_started");
          await closeGate;
        }
      },
      deleteProject: (projectId) => {
        timeline.push("delete_project");
        dbDeleteProject(projectId);
      },
      cloneRepo: async () => ({ path: "/tmp" }),
      makeDirectory: () => undefined,
      platform: process.platform,
      now: () => new Date().toISOString(),
    };

    const removal = applyRemoteProjectCommand({ kind: "remove", projectId: "p1" }, deps);
    await waitFor(() => closeEntered);

    // A same-project experiment intent during the close await is refused with
    // zero effect: no record, no candidate rows, no worktree preparation.
    expect(isProjectRemoving("p1")).toBe(true);
    const concurrent = experimentRecord("CONCURRENT");
    expect(dbApplyExperimentIntent(createCommand(concurrent))).toEqual({
      status: "project_removing",
    });
    expect(dbPreflightExperimentIntent(createCommand(concurrent))).toEqual({
      status: "project_removing",
    });
    expect(storedExperiments().CONCURRENT).toBeUndefined();
    expect(
      getSqlite().prepare("SELECT 1 FROM threads WHERE id = ?").get("CONCURRENT-c1"),
    ).toBeUndefined();
    expect(() => beginProjectExperimentWorktreePreparation("p1")).toThrow(ProjectRemovingError);

    releaseClose();
    await removal;

    expect(timeline).toEqual(["experiments_removed", "close_await_started", "delete_project"]);
    expect(isProjectRemoving("p1")).toBe(false);
    expect(storedExperiments().E1).toBeUndefined();
    expect(dbGetProjects().some((project) => project.id === "p1")).toBe(false);
  });

  it("refuses a delayed worktree preparation whose ownership was removed", async () => {
    const record = experimentRecord("E1");
    expect(dbApplyExperimentIntent(createCommand(record)).status).toBe("applied");
    expect(claimExperimentWorktreePreparation(preparationPayload(record))).toEqual({
      experimentId: "E1",
      projectId: "p1",
    });

    const revision = dbReadExperimentState();
    if (revision.status !== "ok") throw new Error("state unavailable");
    const removal = dbApplyExperimentIntent({
      kind: "remove",
      experimentId: "E1",
      revision: revision.revision,
      candidateDisposition: "release",
    });
    expect(removal.status).toBe("applied");

    expect(() => claimExperimentWorktreePreparation(preparationPayload(record))).toThrow(
      /not owned by a current experiment/,
    );
    const preparation = vi.fn<() => Promise<string>>(async () => "prepared");
    await expect(
      runOwnedExperimentWorktreePreparation(preparationPayload(record), preparation),
    ).rejects.toThrow(/not owned by a current experiment/);
    expect(preparation).not.toHaveBeenCalled();
  });

  it("refuses mismatched owner tokens, branches, and removed candidate states", async () => {
    const record = experimentRecord("E1");
    expect(dbApplyExperimentIntent(createCommand(record)).status).toBe("applied");
    const payload = preparationPayload(record);

    expect(() =>
      claimExperimentWorktreePreparation({
        ...payload,
        candidates: payload.candidates.map((candidate, index) =>
          index === 0 ? { ...candidate, ownerToken: "foreign" } : candidate,
        ),
      }),
    ).toThrow(/not owned/);

    expect(() =>
      claimExperimentWorktreePreparation({
        ...payload,
        candidates: payload.candidates.map((candidate, index) =>
          index === 0 ? { ...candidate, branch: "poracode/other" } : candidate,
        ),
      }),
    ).toThrow(/not owned/);

    const removedState: Experiment = {
      ...record,
      candidates: record.candidates.map((candidate, index) =>
        index === 0 ? { ...candidate, worktreeState: "removed" } : candidate,
      ),
    };
    writeRawStore({ E1: removedState });
    expect(() => claimExperimentWorktreePreparation(payload)).toThrow(/not owned/);
    expect(readPersistedExperiments()[0]!.candidates[0]!.worktreeState).toBe("removed");
  });

  it("drains an in-flight preparation before the removal's worktree teardown", async () => {
    const record = experimentRecord("E1");
    expect(dbApplyExperimentIntent(createCommand(record)).status).toBe("applied");

    const events: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const preparation = runOwnedExperimentWorktreePreparation(
      preparationPayload(record),
      async () => {
        events.push("prep_start");
        await gate;
        events.push("prep_end");
        return "prepared";
      },
    );
    await waitFor(() => events.includes("prep_start"));

    const removal = discardPersistedProjectExperiments(testProject("p1"), async () => {
      events.push("worktrees_removed");
      return { candidates: [] };
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    // The removal is parked on the in-flight preparation and its teardown has
    // not run yet.
    expect(events).toEqual(["prep_start"]);

    release();
    await Promise.all([preparation, removal]);

    expect(events.indexOf("worktrees_removed")).toBeGreaterThan(events.indexOf("prep_end"));
    expect(storedExperiments().E1).toBeUndefined();
  });
});
