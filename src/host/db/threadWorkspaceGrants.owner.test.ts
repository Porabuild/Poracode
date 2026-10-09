import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  dbDeleteThread,
  dbGetProject,
  dbGetThread,
  dbUpsertProject,
  dbUpsertThread,
} from "./projectsThreads";
import { dbSyncAll, dbSyncChanges } from "./sync";
import { nativeBindingEnv, testThread } from "./runtimeItems.testFixtures";
import {
  dbBeginThreadWorkspaceGrantOperation,
  dbCommitThreadWorkspaceGrants,
  dbMarkThreadWorkspaceGrantDispatched,
  dbReadThreadWorkspaceGrantOwner,
  dbSettleThreadWorkspaceGrantFailure,
} from "./threadWorkspaceGrants";

const read = () => dbReadThreadWorkspaceGrantOwner("thread-1");
function request(operationToken = "approval") {
  const { owner, revision } = read();
  return { threadId: "thread-1", operationToken, expectedRevision: revision, owner, candidate: [] };
}
function commitClear() {
  dbBeginThreadWorkspaceGrantOperation(request());
  dbMarkThreadWorkspaceGrantDispatched("thread-1", "approval");
  dbCommitThreadWorkspaceGrants("thread-1", "approval");
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

describe("persisted workspace owner fencing", () => {
  it.each([
    ["created_at", "other-time"],
    ["worktree_path", "/other"],
    ["agent_kind", "other"],
    ["agent_instance_id", "other-instance"],
    ["presentation_mode", "terminal"],
    ["config", '{"executionEnvironment":{"kind":"wsl","distro":"Other"}}'],
  ])("fences empty thread %s ABA in both owner and public revision", (column, value) => {
    const before = read();
    const approval = request();
    const original = getSqlite()
      .prepare(`SELECT ${column} AS value FROM threads WHERE id = 'thread-1'`)
      .get() as { value: string | null };
    const update = getSqlite().prepare(`UPDATE threads SET ${column} = ? WHERE id = 'thread-1'`);
    update.run(value);
    expect(read()).toMatchObject({ revision: 1, hasCommittedScope: false });
    update.run(original.value);
    expect(read()).toMatchObject({
      revision: 2,
      hasCommittedScope: false,
      additionalDirectories: [],
    });
    expect(read().owner).not.toBe(before.owner);
    // Either precondition independently fences the old approval, including a UI
    // request whose owner is resolved anew by the host but revision is still old.
    expect(() =>
      dbBeginThreadWorkspaceGrantOperation({ ...approval, owner: read().owner }),
    ).toThrow(/conflict/);
    expect(() =>
      dbBeginThreadWorkspaceGrantOperation({ ...approval, expectedRevision: 2 }),
    ).toThrow(/conflict/);
    expect(dbGetThread("thread-1")?.workspaceGrantRevision).toBe(2);
    expect(dbReadThreadWorkspaceGrantOwner("thread-2").revision).toBe(0);
  });

  it.each([
    ["created_at", "other-time"],
    ["location_kind", "windows"],
    ["location_path", "/other"],
    ["location_distro", "Other"],
    ["location_linux_path", "/other"],
    ["location_unc_path", "other"],
  ])("fences project %s ABA and advances every affected thread", (column, value) => {
    const before = request();
    const original = getSqlite()
      .prepare(`SELECT ${column} AS value FROM projects WHERE id = 'project-1'`)
      .get() as { value: string | null };
    const update = getSqlite().prepare(`UPDATE projects SET ${column} = ? WHERE id = 'project-1'`);
    update.run(value);
    update.run(original.value);
    expect(read().owner).not.toBe(before.owner);
    expect(read()).toMatchObject({ revision: 2, hasCommittedScope: false });
    expect(dbReadThreadWorkspaceGrantOwner("thread-2").revision).toBe(2);
    expect(() => dbBeginThreadWorkspaceGrantOperation({ ...before, owner: read().owner })).toThrow(
      /conflict/,
    );
    expect(() => dbBeginThreadWorkspaceGrantOperation({ ...before, expectedRevision: 2 })).toThrow(
      /conflict/,
    );
  });

  it("fences thread project reassignment ABA", () => {
    dbUpsertProject(
      {
        ...dbGetProject("project-1")!,
        id: "project-2",
        location: { kind: "posix", path: "/second" },
      },
      1,
    );
    const before = request();
    getSqlite().exec(`UPDATE threads SET project_id = 'project-2' WHERE id = 'thread-1';
      UPDATE threads SET project_id = 'project-1' WHERE id = 'thread-1';`);
    expect(read().revision).toBe(2);
    expect(() => dbBeginThreadWorkspaceGrantOperation(before)).toThrow(/conflict/);
  });

  it.each([false, true])(
    "fences unprotected legacy id ABA with recursive triggers=%s",
    (recursive) => {
      getSqlite().pragma(`recursive_triggers = ${recursive ? "ON" : "OFF"}`);
      getSqlite().exec(`INSERT INTO threads
      (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
      VALUES ('legacy', 'project-1', 'Legacy', 'other', '{}', 'idle', 'none', '2026', '2026');`);
      const before = dbReadThreadWorkspaceGrantOwner("legacy");
      getSqlite().exec(`UPDATE threads SET id = 'renamed' WHERE id = 'legacy';
      UPDATE threads SET id = 'legacy' WHERE id = 'renamed';`);
      const after = dbReadThreadWorkspaceGrantOwner("legacy");
      expect(after.revision).toBe(2);
      expect(after.owner).not.toBe(before.owner);
      expect(after.hasCommittedScope).toBe(false);
      expect((JSON.parse(after.owner) as unknown[]).at(-2)).toBe(
        (JSON.parse(before.owner) as unknown[]).at(-2),
      );
    },
  );

  it("mints a fresh immutable incarnation on same-id/timestamp legacy recreation", () => {
    const before = request();
    const incarnation = () => (JSON.parse(read().owner) as unknown[]).at(-2);
    const first = incarnation();
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(() =>
      getSqlite().exec(
        "UPDATE threads SET workspace_owner_incarnation = '00000000000000000000000000000000' WHERE id = 'thread-1'",
      ),
    ).toThrow(/immutable/);
    dbDeleteThread("thread-1");
    dbUpsertThread(testThread(), 0);
    expect(incarnation()).not.toBe(first);
    expect(read().revision).toBe(0);
    expect(() => dbBeginThreadWorkspaceGrantOperation(before)).toThrow(/conflict/);
  });

  it("keeps normal replica owner changes uninitialized and unrelated changes revision-neutral", () => {
    dbUpsertThread({ ...testThread(), agentKind: "other", presentationMode: "terminal" }, 0);
    dbUpsertThread(testThread(), 0);
    const project = dbGetProject("project-1")!;
    dbUpsertProject({ ...project, location: { kind: "posix", path: "/other" } }, 0);
    dbUpsertProject(project, 0);
    const before = read();
    expect(before).toMatchObject({ revision: 4, hasCommittedScope: false });
    dbUpsertThread({ ...testThread(), title: "Renamed", config: { model: "other" } }, 9);
    dbUpsertProject({ ...project, name: "Renamed" }, 9);
    expect(read()).toEqual(before);
    commitClear();
    expect(read()).toMatchObject({
      revision: 5,
      additionalDirectories: [],
      hasCommittedScope: true,
    });
    dbUpsertThread({ ...testThread(), agentKind: "other" }, 0);
    expect(read()).toMatchObject({ revision: 6, hasCommittedScope: true });
  });

  it("sets initialized only after successful commit, rolling it back on journal failure", () => {
    dbBeginThreadWorkspaceGrantOperation(request());
    expect(read().hasCommittedScope).toBe(false);
    dbMarkThreadWorkspaceGrantDispatched("thread-1", "approval");
    expect(read().hasCommittedScope).toBe(false);
    getSqlite().exec(
      `CREATE TEMP TRIGGER fail_commit BEFORE UPDATE ON thread_workspace_grant_operations WHEN NEW.state = 'committed' BEGIN SELECT RAISE(ABORT, 'failure'); END;`,
    );
    expect(() => dbCommitThreadWorkspaceGrants("thread-1", "approval")).toThrow(/failure/);
    expect(read()).toMatchObject({ revision: 0, hasCommittedScope: false });
    getSqlite().exec("DROP TRIGGER fail_commit");
    dbCommitThreadWorkspaceGrants("thread-1", "approval");
    expect(read()).toMatchObject({ revision: 1, hasCommittedScope: true });
    expect(() =>
      getSqlite().exec("UPDATE threads SET workspace_grants_initialized = 0 WHERE id = 'thread-1'"),
    ).toThrow(/metadata/);
    expect(() =>
      getSqlite().exec("UPDATE threads SET workspace_grant_revision = 0 WHERE id = 'thread-1'"),
    ).toThrow(/metadata/);
  });

  it.each(["failed", "committed"] as const)(
    "replays historical %s receipts after owner changes without new effects",
    (state) => {
      const original = request();
      if (state === "committed") commitClear();
      else {
        dbBeginThreadWorkspaceGrantOperation(original);
        dbSettleThreadWorkspaceGrantFailure("thread-1", "approval", "failed");
      }
      dbUpsertThread({ ...testThread(), agentKind: "other" }, 0);
      dbUpsertThread(testThread(), 0);
      const before = read();
      expect(dbBeginThreadWorkspaceGrantOperation(original).state).toBe(state);
      expect(() => dbMarkThreadWorkspaceGrantDispatched("thread-1", "approval")).toThrow(
        /not pending/,
      );
      expect(() => dbCommitThreadWorkspaceGrants("thread-1", "approval")).toThrow(/not dispatched/);
      expect(read()).toEqual(before);
    },
  );

  it("ignores forged private metadata on every replica write and never exposes it on Thread", () => {
    const before = read();
    const incoming = {
      ...testThread(),
      workspace_owner_incarnation: "f".repeat(32),
      workspaceOwnerIncarnation: "f".repeat(32),
      workspace_grants_initialized: 1,
      workspaceGrantsInitialized: true,
      hasCommittedScope: true,
      workspaceGrantRevision: 88,
    };
    dbUpsertThread(incoming, 0);
    dbSyncChanges({
      projects: [],
      threads: [{ thread: incoming, sortOrder: 0 }],
      deletedThreadIds: [],
      deletedProjectIds: [],
      viewJson: "{}",
    });
    dbSyncAll([dbGetProject("project-1")!], [incoming, { ...testThread(), id: "thread-2" }], "{}");
    expect(read()).toEqual(before);
    dbUpsertThread({ ...incoming, id: "new" }, 2);
    expect(dbReadThreadWorkspaceGrantOwner("new")).toMatchObject({
      revision: 0,
      hasCommittedScope: false,
    });
    expect(dbReadThreadWorkspaceGrantOwner("new").owner).not.toContain("f".repeat(32));
    const publicThread = dbGetThread("thread-1")!;
    for (const key of [
      "workspace_owner_incarnation",
      "workspaceOwnerIncarnation",
      "workspace_grants_initialized",
      "workspaceGrantsInitialized",
      "hasCommittedScope",
    ])
      expect(publicThread).not.toHaveProperty(key);
  });

  it("refuses exhaustion atomically for a project batch, a thread change and grant admission", () => {
    getSqlite()
      .prepare("UPDATE threads SET workspace_grant_revision = ? WHERE id = 'thread-2'")
      .run(Number.MAX_SAFE_INTEGER);
    const before = read();
    const project = dbGetProject("project-1")!;
    expect(() =>
      dbUpsertProject({ ...project, location: { kind: "posix", path: "/other" } }, 0),
    ).toThrow(/exhausted/);
    expect(read()).toEqual(before);
    expect(dbGetProject("project-1")).toEqual(project);
    getSqlite()
      .prepare("UPDATE threads SET workspace_grant_revision = ? WHERE id = 'thread-1'")
      .run(Number.MAX_SAFE_INTEGER - 1);
    commitClear();
    expect(read().revision).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => dbBeginThreadWorkspaceGrantOperation(request("overflow"))).toThrow(Error);
    expect(() => dbUpsertThread({ ...testThread(), agentKind: "other" }, 0)).toThrow(/exhausted/);
    expect(dbGetThread("thread-1")?.agentKind).toBe(testThread().agentKind);
    expect(() =>
      getSqlite().exec(
        "UPDATE threads SET workspace_grant_revision = workspace_grant_revision + 1 WHERE id = 'thread-1'",
      ),
    ).toThrow(/metadata/);
  });

  it.each([
    ["workspace_owner_incarnation", "bad"],
    ["workspace_owner_incarnation", Buffer.from("f".repeat(32))],
    ["workspace_grants_initialized", 2],
    ["workspace_grants_initialized", 1],
    ["workspace_grant_revision", -1],
    ["workspace_grant_revision", Number.MAX_SAFE_INTEGER + 1],
    ["additional_directories", '[{"kind":"posix","path":"/uncommitted"}]'],
  ])("refuses inconsistent saved metadata %s=%s", (column, value) => {
    getSqlite().exec(
      "DROP TRIGGER workspace_grant_owner_immutable; DROP TRIGGER workspace_grant_metadata_update;",
    );
    getSqlite().prepare(`UPDATE threads SET ${column} = ? WHERE id = 'thread-1'`).run(value);
    expect(() => read()).toThrow(Error);
  });
});
