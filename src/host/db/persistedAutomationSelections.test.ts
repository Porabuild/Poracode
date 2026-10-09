import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrWatch, ScheduledTask } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";
import { dbUpsertProject } from "./projectsThreads";
import { dbGetSchedule, dbGetSchedules, dbUpsertSchedule } from "./schedules";
import { dbGetPrWatch, dbGetPrWatches, dbUpsertPrWatch } from "./prWatches";

const controls = {
  model: "opaque-member",
  effort: "",
  fast: false,
  thinking: false,
  contextSize: "default",
};
const task: ScheduledTask = {
  id: randomUUID(),
  name: "Task",
  prompt: "Prompt",
  agentKind: "fixture:profile",
  config: controls,
  recurrence: { kind: "hourly", minute: 0 },
  enabled: true,
  projectId: "p1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  nextRunAt: null,
  lastRunAt: null,
  lastCompletedAt: null,
  lastStatus: "never",
  lastResult: null,
  lastError: null,
};
const watch: PrWatch = {
  projectId: "p1",
  prNumber: 1,
  headBranch: "main",
  watchEnabled: true,
  autoMerge: false,
  agentKind: "fixture:profile",
  config: controls,
  lastCommentCursor: null,
  lastReviewCommentCursor: null,
  lastReviewCursor: null,
  lastCheckKey: null,
  activeThreadId: null,
  lastError: null,
  blockedReason: null,
};
let root: string;
const priorBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
beforeEach(() => {
  mkdirSync("tmp", { recursive: true });
  root = mkdtempSync(join("tmp", "persisted-automation-selection-"));
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(join(root, "state.sqlite"));
  dbUpsertProject(
    {
      id: "p1",
      name: "Project",
      location: { kind: "posix", path: "/fixture" },
      createdAt: "2026-01-01T00:00:00Z",
    },
    0,
  );
  dbUpsertSchedule(task);
  dbUpsertPrWatch(watch);
});
afterEach(() => {
  closeDatabase();
  rmSync(root, { recursive: true, force: true });
  if (priorBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorBinding;
});
function snapshot() {
  return {
    schedules: getSqlite().prepare("SELECT * FROM scheduled_tasks ORDER BY id").all(),
    watches: getSqlite().prepare("SELECT * FROM pr_watches ORDER BY pr_number").all(),
  };
}
function protect(binding: unknown) {
  const raw = ` {"model":"opaque-member","effort":"","fast":false,"thinking":false,"contextSize":"default","selectionBinding":${JSON.stringify(binding)}}\n`;
  getSqlite().prepare("UPDATE scheduled_tasks SET config = ? WHERE id = ?").run(raw, task.id);
  getSqlite()
    .prepare("UPDATE pr_watches SET config = ? WHERE project_id = ? AND pr_number = ?")
    .run(raw, watch.projectId, watch.prNumber);
  return raw;
}
describe("persisted automation selection custody", () => {
  it.each([null, {}, { version: 200 }, { version: 1, kind: "unknown" }, "future"])(
    "reads unsupported metadata %j without changing controls or original bytes",
    (binding) => {
      protect(binding);
      const before = snapshot();
      expect(dbGetSchedule(task.id)?.config).toEqual(controls);
      expect(dbGetSchedules()[0]?.config).toEqual(controls);
      expect(dbGetPrWatch(watch.projectId, watch.prNumber)?.config).toEqual(controls);
      expect(dbGetPrWatches()[0]?.config).toEqual(controls);
      expect(snapshot()).toEqual(before);
    },
  );
  it("refuses projected schedule rename/status and owner changes without touching either row", () => {
    protect({ version: 200 });
    const projected = dbGetSchedule(task.id)!;
    const before = snapshot();
    expect(() => dbUpsertSchedule({ ...projected, name: "Renamed" })).toThrow(
      "unsupported selection data",
    );
    expect(() => dbUpsertSchedule({ ...projected, lastStatus: "running" })).toThrow(
      "unsupported selection data",
    );
    expect(() => dbUpsertSchedule({ ...projected, agentKind: "fixture:other" })).toThrow(
      "unsupported selection data",
    );
    expect(snapshot()).toEqual(before);
  });
  it("refuses projected watch replacement, clearing config and changing owner", () => {
    protect({ version: 200 });
    const projected = dbGetPrWatch(watch.projectId, watch.prNumber)!;
    const before = snapshot();
    const { config: _ignored, ...withoutConfig } = projected;
    expect(() => dbUpsertPrWatch({ ...projected, lastError: "Echo" })).toThrow(
      "unsupported selection data",
    );
    expect(() => dbUpsertPrWatch({ ...withoutConfig, watchEnabled: false })).toThrow(
      "unsupported selection data",
    );
    expect(() => dbUpsertPrWatch({ ...projected, agentKind: "fixture:other" })).toThrow(
      "unsupported selection data",
    );
    expect(snapshot()).toEqual(before);
  });
  it("rereads raw metadata introduced after a clean client snapshot", () => {
    const staleTask = dbGetSchedule(task.id)!;
    const staleWatch = dbGetPrWatch(watch.projectId, watch.prNumber)!;
    protect({ version: 200 });
    const before = snapshot();
    expect(() => dbUpsertSchedule(staleTask)).toThrow("unsupported selection data");
    expect(() => dbUpsertPrWatch(staleWatch)).toThrow("unsupported selection data");
    expect(snapshot()).toEqual(before);
  });
  it("keeps absent controls absent and retains a valid nullable legacy watch", () => {
    const raw = JSON.stringify({ model: "opaque-member", selectionBinding: { version: 200 } });
    getSqlite().prepare("UPDATE scheduled_tasks SET config = ? WHERE id = ?").run(raw, task.id);
    expect(dbGetSchedule(task.id)?.config).toEqual({ model: "opaque-member" });
    const { config: _ignored, agentKind: _owner, ...nullable } = watch;
    dbUpsertPrWatch({ ...nullable, watchEnabled: false });
    expect(dbGetPrWatch(watch.projectId, watch.prNumber)).toEqual({
      ...nullable,
      watchEnabled: false,
    });
  });
  it("allows healthy sibling schedule/watch writes despite protected rows", () => {
    protect({ version: 200 });
    const id = randomUUID();
    dbUpsertSchedule({ ...task, id, name: "Healthy" });
    dbUpsertPrWatch({ ...watch, prNumber: 2 });
    expect(dbGetSchedule(id)?.name).toBe("Healthy");
    expect(dbGetPrWatch(watch.projectId, 2)?.config).toEqual(controls);
  });
});
