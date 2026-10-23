import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ForgeReviewScope, PrWatch } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject } from "./projectsThreads";
import { dbGetPrWatch, dbPatchPrWatchRuntime, dbUpsertPrWatch } from "./prWatches";
import {
  dbAdmitPrWatchExecution,
  dbReadPrWatchExecutionSnapshot,
} from "./prWatchExecutionAdmission";
import { DATABASE_MIGRATIONS } from "./migrations";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import {
  captureSchema53PayloadOriginEvidence,
  createSchema53PayloadOriginDatabase,
  migrateSchema53FixtureThrough,
} from "./runtimePayloadOrigins.testFixtures";

const scope: ForgeReviewScope = {
  version: 1,
  forge: "gitlab",
  host: "https://git.example/gitlab",
  repository: "team/subgroup/app",
  account: { forge: "gitlab", host: "https://git.example/gitlab", login: "alice" },
};
const watch: PrWatch = {
  projectId: "project-1",
  prNumber: 7,
  headBranch: "feature",
  watchEnabled: true,
  autoMerge: true,
  agentKind: "fixture",
  config: { model: "fixture" },
  reviewScope: scope,
  lastCommentCursor: null,
  lastReviewCommentCursor: null,
  lastReviewCursor: null,
  lastCheckKey: null,
  activeThreadId: null,
  lastError: null,
  blockedReason: null,
};

describe.skipIf(!sqliteAvailable)("persisted review watch scope schema65", () => {
  let root: string;
  const previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  beforeEach(() => {
    mkdirSync("tmp", { recursive: true });
    root = mkdtempSync(join("tmp", "review-watch-scope-"));
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  });
  afterEach(() => {
    closeDatabase();
    rmSync(root, { recursive: true, force: true });
    if (previousBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
  });
  function fresh() {
    initDatabase(join(root, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Fixture",
        location: { kind: "posix", path: "/repo" },
        createdAt: "now",
      },
      0,
    );
    dbUpsertPrWatch(watch);
  }
  function rawScope(): string | null {
    return (
      getSqlite()
        .prepare("SELECT review_scope FROM pr_watches WHERE project_id=? AND pr_number=?")
        .get(watch.projectId, watch.prNumber) as { review_scope: string | null }
    ).review_scope;
  }

  it("upgrades a real schema 61 artifact without binding old watches", () => {
    const path = join(root, "legacy.sqlite");
    const old = createSchema53PayloadOriginDatabase(path);
    migrateSchema53FixtureThrough(old, 61);
    old
      .prepare(
        "INSERT INTO pr_watches(project_id,pr_number,head_branch,watch_enabled,auto_merge,agent_kind,config,last_check_key) VALUES ('project-1',7,'feature',1,1,'fixture',?,'old-checkpoint')",
      )
      .run('{ "model": "fixture", "fast": false }');
    const before = old.prepare("SELECT * FROM pr_watches").get();
    const history = captureSchema53PayloadOriginEvidence(old);
    expect(
      DATABASE_MIGRATIONS.filter(
        (migration) => migration.version > 61 && migration.version <= 65,
      ).map((migration) => migration.version),
    ).toEqual([62, 63, 64, 65]);
    old.close();
    const upgraded = initDatabase(path);
    expect(upgraded.prepare("SELECT * FROM pr_watches").get()).toEqual({
      ...(before as object),
      review_scope: null,
    });
    expect(captureSchema53PayloadOriginEvidence(upgraded)).toEqual(history);
    expect(dbGetPrWatch("project-1", 7)).not.toHaveProperty("reviewScope");
    expect(() => dbReadPrWatchExecutionSnapshot("project-1", 7)).toThrow(/no source scope/);
    expect(rawScope()).toBeNull();
    expect(
      upgraded.prepare("SELECT value FROM app_state WHERE key='schema_version'").get(),
    ).toEqual({ value: "66" });
  });

  it.each(["account", "repository"])(
    "treats a changed %s as execution state and never lets runtime patches replace it",
    (field) => {
      fresh();
      const captured = dbReadPrWatchExecutionSnapshot(watch.projectId, watch.prNumber)!;
      expect(() =>
        dbAdmitPrWatchExecution(watch.projectId, watch.prNumber, captured),
      ).not.toThrow();
      const changed =
        field === "account"
          ? { ...scope, account: { ...scope.account, login: "bob" } }
          : { ...scope, repository: "other/app" };
      dbUpsertPrWatch({ ...watch, reviewScope: changed });
      expect(() => dbAdmitPrWatchExecution(watch.projectId, watch.prNumber, captured)).toThrow(
        /changed/,
      );
      const bytes = rawScope();
      dbPatchPrWatchRuntime(watch.projectId, watch.prNumber, {
        lastError: "status only",
        reviewScope: scope,
      } as never);
      expect(rawScope()).toBe(bytes);
      const { reviewScope: previousScope, ...legacyWrite } = watch;
      expect(previousScope).toEqual(scope);
      dbUpsertPrWatch(legacyWrite);
      expect(rawScope()).toBe(bytes);
    },
  );

  it.each(['{ "version": 999, "opaque": "keep exact bytes" }', "{invalid-json"])(
    "refuses unknown/malformed scope without discarding bytes (%s)",
    (bytes) => {
      fresh();
      const captured = dbReadPrWatchExecutionSnapshot(watch.projectId, watch.prNumber)!;
      getSqlite().prepare("UPDATE pr_watches SET review_scope=?").run(bytes);
      const projected = dbGetPrWatch(watch.projectId, watch.prNumber)!;
      expect(projected.reviewScopeUnsupported).toBe(true);
      expect(projected.reviewScope).toBeUndefined();
      expect(() => dbReadPrWatchExecutionSnapshot(watch.projectId, watch.prNumber)).toThrow(
        /unsupported source-scope version/,
      );
      expect(() => dbAdmitPrWatchExecution(watch.projectId, watch.prNumber, captured)).toThrow(
        /unsupported source-scope version/,
      );
      expect(() => dbUpsertPrWatch({ ...projected, reviewScope: scope })).toThrow(
        /unsupported source-scope version/,
      );
      dbPatchPrWatchRuntime(watch.projectId, watch.prNumber, { lastError: "paused" });
      expect(rawScope()).toBe(bytes);
    },
  );
});
