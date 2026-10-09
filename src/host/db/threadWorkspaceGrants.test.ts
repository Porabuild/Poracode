import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  dbDeleteProject,
  dbDeleteThread,
  dbGetProject,
  dbGetThread,
  dbUpsertProject,
  dbUpsertThread,
} from "./projectsThreads";
import { dbSyncAll, dbSyncChanges } from "./sync";
import { nativeBindingEnv, testThread } from "./runtimeItems.testFixtures";
import { MAX_THREAD_WORKSPACE_GRANT_OPERATIONS } from "./threadWorkspaceGrantsSchema";
import {
  dbBeginThreadWorkspaceGrantOperation,
  dbCommitThreadWorkspaceGrants,
  dbGetThreadWorkspaceGrantOperation,
  dbGetUnresolvedThreadWorkspaceGrantOperation,
  dbMarkThreadWorkspaceGrantDispatched,
  dbReadThreadWorkspaceGrantOwner,
  dbSettleThreadWorkspaceGrantFailure,
} from "./threadWorkspaceGrants";
import { onProjectThreadDataChanged } from "./projectThreadChanges";
import type { ProjectLocation } from "@/shared/contracts";

const roots: ProjectLocation[] = [
  { kind: "posix", path: "/extra" },
  { kind: "posix", path: "/second" },
];
function begin(operationToken = "op-1", candidate = roots, threadId = "thread-1") {
  const current = dbReadThreadWorkspaceGrantOwner(threadId);
  return dbBeginThreadWorkspaceGrantOperation({
    threadId,
    operationToken,
    expectedRevision: current.revision,
    owner: current.owner,
    candidate,
  });
}
function commit(operationToken = "op-1", candidate = roots, threadId = "thread-1") {
  begin(operationToken, candidate, threadId);
  dbMarkThreadWorkspaceGrantDispatched(threadId, operationToken);
  return dbCommitThreadWorkspaceGrants(threadId, operationToken);
}

beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(":memory:");
  dbUpsertProject(
    {
      id: "project-1",
      name: "Project",
      location: { kind: "posix", path: "/primary" },
      createdAt: "2026-01-01",
    },
    0,
  );
  dbUpsertThread(testThread(), 0);
  dbUpsertThread({ ...testThread(), id: "thread-2" }, 1);
});
afterEach(() => {
  closeDatabase();
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});

describe("host-only workspace grant store", () => {
  it("publishes only committed columns and notifies only after atomic commit", () => {
    let publications = 0;
    const unsubscribe = onProjectThreadDataChanged(() => publications++);
    try {
      begin();
      expect(dbGetThread("thread-1")).toMatchObject({
        additionalDirectories: [],
        workspaceGrantRevision: 0,
      });
      expect(() => dbCommitThreadWorkspaceGrants("thread-1", "op-1")).toThrow(/not dispatched/);
      dbMarkThreadWorkspaceGrantDispatched("thread-1", "op-1");
      expect(dbGetThread("thread-1")?.additionalDirectories).toEqual([]);
      expect(publications).toBe(0);
      expect(dbCommitThreadWorkspaceGrants("thread-1", "op-1")).toBe(1);
      expect(publications).toBe(1);
      expect(dbGetThread("thread-1")).toMatchObject({
        additionalDirectories: roots,
        workspaceGrantRevision: 1,
      });
      expect(dbGetThread("thread-2")).toMatchObject({
        additionalDirectories: [],
        workspaceGrantRevision: 0,
      });
      expect(dbGetThreadWorkspaceGrantOperation("thread-1", "op-1")?.state).toBe("committed");
      expect(commit("clear", [])).toBe(2);
      expect(dbGetThread("thread-1")?.additionalDirectories).toEqual([]);
    } finally {
      unsubscribe();
    }
  });

  it("ignores absent, empty and forged scope/revision on single, delta and full replica writes", () => {
    commit();
    for (const forged of [
      {},
      { additionalDirectories: [], workspaceGrantRevision: 0 },
      {
        additionalDirectories: [{ kind: "posix" as const, path: "/forged" }],
        workspaceGrantRevision: 900,
      },
    ]) {
      const incoming = { ...testThread(), ...forged };
      dbUpsertThread(incoming, 0);
      dbSyncChanges({
        projects: [],
        threads: [{ thread: incoming, sortOrder: 0 }],
        deletedProjectIds: [],
        deletedThreadIds: [],
        viewJson: "{}",
      });
      dbSyncAll(
        [dbGetProject("project-1")!],
        [incoming, { ...testThread(), id: "thread-2" }],
        "{}",
      );
      expect(dbGetThread("thread-1")).toMatchObject({
        additionalDirectories: roots,
        workspaceGrantRevision: 1,
      });
      dbUpsertThread({ ...incoming, id: `legacy-${Object.keys(forged).length}` }, 2);
      expect(dbGetThread(`legacy-${Object.keys(forged).length}`)).toMatchObject({
        additionalDirectories: [],
        workspaceGrantRevision: 0,
      });
      dbDeleteThread(`legacy-${Object.keys(forged).length}`);
    }
  });

  it("fences expected owner, revision and exact operation token; sibling operations are independent", () => {
    const original = begin();
    expect(begin()).toEqual(original);
    expect(() => begin("op-1", [])).toThrow(/token conflict/);
    expect(() => begin("op-2")).toThrow(Error);
    expect(() => dbMarkThreadWorkspaceGrantDispatched("thread-1", "foreign")).toThrow(/token/);
    commit("op-1", [], "thread-2");
    expect(dbGetThread("thread-2")?.workspaceGrantRevision).toBe(1);
    dbMarkThreadWorkspaceGrantDispatched("thread-1", "op-1");
    dbCommitThreadWorkspaceGrants("thread-1", "op-1");
    expect(dbBeginThreadWorkspaceGrantOperation(original).state).toBe("committed");
    expect(() =>
      dbBeginThreadWorkspaceGrantOperation({ ...original, operationToken: "stale" }),
    ).toThrow(/revision conflict/);
    expect(() =>
      dbBeginThreadWorkspaceGrantOperation({
        ...original,
        operationToken: "foreign",
        expectedRevision: 1,
        owner: "{}",
      }),
    ).toThrow(/owner/);
    expect(() => dbCommitThreadWorkspaceGrants("thread-1", "op-1")).toThrow(/not dispatched/);
  });

  it("preserves old grants on failure and retains exclusive ambiguous custody until confirmed retirement", () => {
    commit();
    begin("pending-failure", []);
    dbSettleThreadWorkspaceGrantFailure("thread-1", "pending-failure", "failed");
    begin("uncertain", []);
    dbMarkThreadWorkspaceGrantDispatched("thread-1", "uncertain");
    dbSettleThreadWorkspaceGrantFailure("thread-1", "uncertain", "ambiguous");
    expect(dbGetUnresolvedThreadWorkspaceGrantOperation("thread-1")?.state).toBe("ambiguous");
    expect(() => begin("blocked")).toThrow(Error);
    expect(() => dbCommitThreadWorkspaceGrants("thread-1", "uncertain")).toThrow(Error);
    expect(() => dbMarkThreadWorkspaceGrantDispatched("thread-1", "uncertain")).toThrow(Error);
    dbSettleThreadWorkspaceGrantFailure("thread-1", "uncertain", "failed");
    expect(dbGetUnresolvedThreadWorkspaceGrantOperation("thread-1")).toBeNull();
    expect(dbGetThread("thread-1")).toMatchObject({
      additionalDirectories: roots,
      workspaceGrantRevision: 1,
    });
    expect(() => dbSettleThreadWorkspaceGrantFailure("thread-1", "op-1", "failed")).toThrow(Error);
  });

  it.each(["pending", "committed"])(
    "guards %s owner from deletes, reuse and primary/environment retarget",
    (phase) => {
      if (phase === "pending") begin();
      else commit();
      expect(() => dbDeleteThread("thread-1")).toThrow(Error);
      expect(() => dbDeleteProject("project-1")).toThrow(Error);
      expect(() => dbSyncAll([], [], "{}")).toThrow(Error);
      expect(() =>
        dbSyncChanges({
          projects: [],
          threads: [],
          deletedThreadIds: ["thread-1"],
          deletedProjectIds: [],
          viewJson: "{}",
        }),
      ).toThrow(Error);
      for (const patch of [
        { worktreePath: "/retarget" },
        {
          config: {
            model: "auto",
            executionEnvironment: { kind: "wsl" as const, distro: "Other" },
          },
        },
        { agentKind: "other" },
        { presentationMode: "terminal" as const },
      ]) {
        expect(() => dbUpsertThread({ ...testThread(), ...patch }, 0)).toThrow(/retarget/);
      }
      expect(() =>
        dbUpsertProject(
          { ...dbGetProject("project-1")!, location: { kind: "posix", path: "/retarget" } },
          0,
        ),
      ).toThrow(/retarget/);
      expect(() =>
        getSqlite().prepare("UPDATE threads SET created_at = 'new' WHERE id = 'thread-1'").run(),
      ).toThrow(/retarget/);
      expect(() =>
        getSqlite()
          .prepare("INSERT OR REPLACE INTO threads SELECT * FROM threads WHERE id = 'thread-1'")
          .run(),
      ).toThrow(Error);
    },
  );

  it("rolls back failed commit and refuses stale CAS without publishing the candidate", () => {
    begin();
    dbMarkThreadWorkspaceGrantDispatched("thread-1", "op-1");
    getSqlite().exec(
      `CREATE TEMP TRIGGER fail_grant_commit BEFORE UPDATE ON thread_workspace_grant_operations WHEN NEW.state = 'committed' BEGIN SELECT RAISE(ABORT, 'forced'); END;`,
    );
    expect(() => dbCommitThreadWorkspaceGrants("thread-1", "op-1")).toThrow(/forced/);
    expect(dbGetThread("thread-1")).toMatchObject({
      additionalDirectories: [],
      workspaceGrantRevision: 0,
    });
    expect(dbGetThreadWorkspaceGrantOperation("thread-1", "op-1")?.state).toBe("dispatched");
    getSqlite().exec(
      "DROP TRIGGER fail_grant_commit; UPDATE threads SET workspace_grant_revision = 1 WHERE id = 'thread-1'",
    );
    expect(() => dbCommitThreadWorkspaceGrants("thread-1", "op-1")).toThrow(/revision conflict/);
    expect(dbGetThread("thread-1")?.additionalDirectories).toEqual([]);
  });

  it("rechecks primary ownership at commit even after an external writer bypasses the guard", () => {
    begin();
    dbMarkThreadWorkspaceGrantDispatched("thread-1", "op-1");
    getSqlite().exec(
      "DROP TRIGGER workspace_grant_thread_retarget; UPDATE threads SET worktree_path = '/changed' WHERE id = 'thread-1'",
    );
    expect(() => dbCommitThreadWorkspaceGrants("thread-1", "op-1")).toThrow(
      /owner or revision conflict/,
    );
    expect(dbGetThread("thread-1")?.additionalDirectories).toEqual([]);
    expect(dbGetThreadWorkspaceGrantOperation("thread-1", "op-1")?.state).toBe("dispatched");
  });

  it("detaches caller-owned candidates and read projections from saved custody", () => {
    const candidate: ProjectLocation[] = [{ kind: "posix", path: "/approved" }];
    const operation = begin("snapshot", candidate);
    candidate.length = 0;
    operation.candidate.length = 0;
    const projected = dbGetThreadWorkspaceGrantOperation("thread-1", "snapshot")!;
    projected.candidate.length = 0;
    dbMarkThreadWorkspaceGrantDispatched("thread-1", "snapshot");
    dbCommitThreadWorkspaceGrants("thread-1", "snapshot");
    dbGetThread("thread-1")!.additionalDirectories!.length = 0;
    expect(dbGetThread("thread-1")?.additionalDirectories).toEqual([
      { kind: "posix", path: "/approved" },
    ]);
  });

  it("refuses corrupt persisted grants instead of clearing them", () => {
    for (const value of ["{", "null", '[{"kind":"posix","path":""}]']) {
      getSqlite()
        .prepare("UPDATE threads SET additional_directories = ? WHERE id = 'thread-1'")
        .run(value);
      expect(() => dbGetThread("thread-1")).toThrow(Error);
      expect(() => begin()).toThrow(Error);
    }
  });

  it("bounds input and journal history without silently forgetting operation tokens", () => {
    expect(() => begin("x".repeat(129))).toThrow(Error);
    expect(() => begin("too-many", Array(17).fill(roots[0]))).toThrow(Error);
    expect(() => begin("too-long", [{ kind: "posix", path: "x".repeat(4097) }])).toThrow(Error);
    for (let i = 0; i < MAX_THREAD_WORKSPACE_GRANT_OPERATIONS; i++) {
      begin(`op-${i}`, []);
      dbSettleThreadWorkspaceGrantFailure("thread-1", `op-${i}`, "failed");
    }
    expect(() => begin("overflow", [])).toThrow(/journal is full/);
    expect(begin("op-0", []).state).toBe("failed");
    expect(
      getSqlite().prepare("SELECT count(*) AS count FROM thread_workspace_grant_operations").get(),
    ).toEqual({ count: MAX_THREAD_WORKSPACE_GRANT_OPERATIONS });
  });
});
