import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, PrWatch, Thread } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { nativeBindingEnv, testThread } from "./runtimeItems.testFixtures";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbSyncAll, dbSyncChanges } from "./sync";
import { dbUpsertPrWatch } from "./prWatches";
import { repairDuplicateProjects } from "./projectDeduplication";
import { onProjectThreadDataChanged } from "./projectThreadChanges";

const project: Project = {
  id: "project-1",
  name: "Project",
  location: { kind: "posix", path: "/fixture" },
  createdAt: "2026-01-01T00:00:00Z",
};
const raw = ' {"model":"opaque-member","selectionBinding":{"version":200,"keep":true}}\n';
let root: string;
const priorBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
beforeEach(() => {
  mkdirSync("tmp", { recursive: true });
  root = mkdtempSync(join("tmp", "selection-repair-"));
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(join(root, "state.sqlite"));
  dbUpsertProject(project, 0);
  dbUpsertThread(testThread(), 0);
});
afterEach(() => {
  closeDatabase();
  rmSync(root, { recursive: true, force: true });
  if (priorBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorBinding;
});
function snapshot() {
  return {
    projects: getSqlite().prepare("SELECT * FROM projects ORDER BY id").all(),
    threads: getSqlite().prepare("SELECT * FROM threads ORDER BY id").all(),
    watches: getSqlite().prepare("SELECT * FROM pr_watches ORDER BY project_id, pr_number").all(),
    state: getSqlite().prepare("SELECT * FROM app_state ORDER BY key").all(),
  };
}
function refused(operation: () => unknown) {
  const before = snapshot();
  const changed = vi.fn<() => void>();
  const stop = onProjectThreadDataChanged(changed);
  try {
    expect(operation).toThrow("unsupported selection data");
    expect(snapshot()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
  } finally {
    stop();
  }
}
function watch(projectId: string, enabled: boolean): PrWatch {
  return {
    projectId,
    prNumber: 1,
    headBranch: "main",
    watchEnabled: enabled,
    autoMerge: false,
    agentKind: "fixture",
    config: { model: "opaque-member" },
    lastCommentCursor: null,
    lastReviewCommentCursor: null,
    lastReviewCursor: null,
    lastCheckKey: null,
    activeThreadId: null,
    lastError: null,
    blockedReason: null,
  };
}
describe("original selection custody through destructive repair", () => {
  it.each(["full", "incremental"])("refuses cascade-before-reinsert in %s sync", (kind) => {
    expect.assertions(3);
    const other = { ...project, id: "other", location: { kind: "posix" as const, path: "/other" } };
    dbUpsertProject(other, 1);
    getSqlite().prepare("UPDATE threads SET config = ? WHERE id = 'thread-1'").run(raw);
    const replacement: Thread = { ...dbGetThread("thread-1")!, projectId: other.id };
    refused(() =>
      kind === "full"
        ? dbSyncAll([other], [replacement], "{}")
        : dbSyncChanges({
            projects: [],
            threads: [{ thread: replacement, sortOrder: 0 }],
            deletedProjectIds: [project.id],
            deletedThreadIds: [],
            viewJson: "{}",
          }),
    );
  });
  it("refuses same-id thread delete plus projected reinsert", () => {
    expect.assertions(3);
    getSqlite().prepare("UPDATE threads SET config = ? WHERE id = 'thread-1'").run(raw);
    refused(() =>
      dbSyncChanges({
        projects: [],
        threads: [{ thread: dbGetThread("thread-1")!, sortOrder: 0 }],
        deletedProjectIds: [],
        deletedThreadIds: ["thread-1"],
        viewJson: "{}",
      }),
    );
  });
  it("refuses same-id project delete plus draft-omitting reinsert", () => {
    expect.assertions(3);
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = ? WHERE id = ?")
      .run(
        JSON.stringify({
          model: "opaque-member",
          agentKind: "fixture",
          selectionBinding: { version: 200 },
        }),
        project.id,
      );
    refused(() =>
      dbSyncChanges({
        projects: [{ project, sortOrder: 0 }],
        threads: [],
        deletedProjectIds: [project.id],
        deletedThreadIds: [],
        viewJson: "{}",
      }),
    );
  });
  it.each([
    ["repair", "canonical"],
    ["repair", "duplicate"],
    ["full", "canonical"],
    ["full", "duplicate"],
  ])("refuses %s collision retirement of protected %s watch", (kind, loser) => {
    expect.assertions(3);
    const duplicate = { ...project, id: "duplicate", createdAt: "2026-01-02T00:00:00Z" };
    dbUpsertProject(duplicate, 1);
    dbUpsertPrWatch(watch(project.id, loser !== "canonical"));
    dbUpsertPrWatch(watch(duplicate.id, loser !== "duplicate"));
    getSqlite()
      .prepare("UPDATE pr_watches SET config = ? WHERE project_id = ?")
      .run(raw, loser === "canonical" ? project.id : duplicate.id);
    refused(() =>
      kind === "repair"
        ? repairDuplicateProjects(getSqlite())
        : dbSyncAll([project, duplicate], [testThread()], "{}"),
    );
  });
  it("permits a non-colliding scalar watch rehome without altering protected bytes", () => {
    const duplicate = { ...project, id: "duplicate", createdAt: "2026-01-02T00:00:00Z" };
    dbUpsertProject(duplicate, 1);
    dbUpsertPrWatch(watch(duplicate.id, false));
    getSqlite()
      .prepare("UPDATE pr_watches SET config = ? WHERE project_id = ?")
      .run(raw, duplicate.id);
    repairDuplicateProjects(getSqlite());
    expect(getSqlite().prepare("SELECT project_id, config FROM pr_watches").all()).toEqual([
      { project_id: project.id, config: raw },
    ]);
  });
});
