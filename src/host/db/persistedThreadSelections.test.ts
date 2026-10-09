import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { nativeBindingEnv } from "./runtimeItems.testFixtures";
import {
  dbGetProject,
  dbGetThread,
  dbSetThreadGroup,
  dbUpdateProject,
  dbUpsertProject,
  dbUpsertThread,
} from "./projectsThreads";
import { dbSetProjectLastDraftConfig } from "./catalogIntents";
import { onProjectThreadDataChanged } from "./projectThreadChanges";
import { dbSyncAll, dbSyncChanges } from "./sync";
import { repairDuplicateProjects } from "./projectDeduplication";

const controls = {
  model: "opaque-member",
  effort: "",
  fast: false,
  thinking: false,
  contextSize: "default",
};
const project: Project = {
  id: "p1",
  name: "Project",
  location: { kind: "posix", path: "/fixture" },
  createdAt: "2026-01-01T00:00:00Z",
};
const thread: Thread = {
  id: "t1",
  projectId: project.id,
  title: "Thread",
  agentKind: "fixture:profile",
  agentInstanceId: "route-1",
  config: controls,
  status: "inactive",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  presentationMode: "gui",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const future = { version: 200, unknown: "keep" };
let root: string;
let stop: (() => void) | undefined;
const priorBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
beforeEach(() => {
  mkdirSync("tmp", { recursive: true });
  root = mkdtempSync(join("tmp", "persisted-thread-selection-"));
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(join(root, "state.sqlite"));
  dbUpsertProject(project, 0);
  dbUpsertThread(thread, 0);
});
afterEach(() => {
  stop?.();
  stop = undefined;
  closeDatabase();
  rmSync(root, { recursive: true, force: true });
  if (priorBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorBinding;
});

function protectThread(binding: unknown = future) {
  const raw = ` { "model" : "opaque-member", "effort":"", "fast":false, "thinking":false, "contextSize":"default", "selectionBinding":${JSON.stringify(binding)} }\n`;
  getSqlite().prepare("UPDATE threads SET config = ? WHERE id = ?").run(raw, thread.id);
  return raw;
}
function protectDraft() {
  const raw = ` {"agentKind":"fixture:profile", "model":"opaque-member", "effort":"", "fast":false, "thinking":false, "contextSize":"default", "selectionBinding":${JSON.stringify(future)}}\n`;
  getSqlite()
    .prepare("UPDATE projects SET last_draft_config = ? WHERE id = ?")
    .run(raw, project.id);
  return raw;
}
function rows() {
  return {
    projects: getSqlite().prepare("SELECT * FROM projects ORDER BY id").all(),
    threads: getSqlite().prepare("SELECT * FROM threads ORDER BY id").all(),
    state: getSqlite().prepare("SELECT * FROM app_state ORDER BY key").all(),
    ownership: getSqlite().prepare("SELECT * FROM main_created_threads ORDER BY thread_id").all(),
  };
}
function expectRefused(operation: () => unknown) {
  const before = rows();
  const changed = vi.fn<() => void>();
  stop = onProjectThreadDataChanged(changed);
  expect(operation).toThrow("unsupported selection data");
  expect(rows()).toEqual(before);
  expect(changed).not.toHaveBeenCalled();
}

describe("authoritative thread/project selection custody", () => {
  it.each([null, {}, { version: 200 }, { version: 1, kind: "unknown" }, "unknown"])(
    "reads a projected thread for %j without changing raw bytes or any actual controls",
    (binding) => {
      const raw = protectThread(binding);
      expect(dbGetThread(thread.id)?.config).toEqual(controls);
      expect(getSqlite().prepare("SELECT config FROM threads WHERE id = ?").get(thread.id)).toEqual(
        { config: raw },
      );
    },
  );
  it("preserves omitted controls and legacy opaque properties while validating actual fields", () => {
    const raw = JSON.stringify({
      model: "opaque-member",
      opaque: { keep: true },
      selectionBinding: future,
    });
    getSqlite().prepare("UPDATE threads SET config = ? WHERE id = ?").run(raw, thread.id);
    expect(dbGetThread(thread.id)?.config).toEqual({
      model: "opaque-member",
      opaque: { keep: true },
    });
    expect(getSqlite().prepare("SELECT config FROM threads WHERE id = ?").get(thread.id)).toEqual({
      config: raw,
    });
  });
  it("keeps a recognized record with full owner and exact control presence", () => {
    const binding = {
      version: 1,
      kind: "family-member",
      owner: { agentKind: thread.agentKind, agentInstanceId: "route-1", presentationMode: "gui" },
      model: controls.model,
      inertValues: { effort: "", fast: false, thinking: false, contextSize: "default" },
    };
    const raw = protectThread(binding);
    expect(dbGetThread(thread.id)?.config).toEqual({ ...controls, selectionBinding: binding });
    expect(getSqlite().prepare("SELECT config FROM threads WHERE id = ?").get(thread.id)).toEqual({
      config: raw,
    });
  });
  it("refuses a same-value projected full-row echo or rename", () => {
    expect.assertions(3);
    protectThread();
    const projected = dbGetThread(thread.id)!;
    expectRefused(() => dbUpsertThread({ ...projected, title: "Renamed" }, 4));
  });
  it.each([
    { agentKind: "fixture:other" },
    { agentInstanceId: "route-2" },
    { presentationMode: "terminal" as const },
  ])("refuses actual owner replacement %j", (patch) => {
    expect.assertions(3);
    protectThread();
    expectRefused(() => dbUpsertThread({ ...dbGetThread(thread.id)!, ...patch }, 0));
  });
  it("rereads authoritative metadata changed after the client snapshot", () => {
    expect.assertions(3);
    const stale = dbGetThread(thread.id)!;
    const external = new Database(
      join(root, "state.sqlite"),
      nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : undefined,
    );
    try {
      external
        .prepare("UPDATE threads SET config = ? WHERE id = ?")
        .run(JSON.stringify({ ...controls, selectionBinding: future }), thread.id);
      expectRefused(() => dbUpsertThread({ ...stale, title: "Stale" }, 0));
    } finally {
      external.close();
    }
  });
  it("projects draft controls exactly and refuses full-row replacement with draft omitted", () => {
    const raw = protectDraft();
    expect(dbGetProject(project.id)?.lastDraftConfig).toEqual({
      ...controls,
      agentKind: thread.agentKind,
    });
    expectRefused(() => dbUpdateProject({ ...project, name: "Renamed" }));
    expect(
      getSqlite().prepare("SELECT last_draft_config FROM projects WHERE id = ?").get(project.id),
    ).toEqual({ last_draft_config: raw });
  });
  it("refuses explicit draft clearing and does not publish a commit signal", () => {
    protectDraft();
    const committed = vi.fn<() => void>();
    expectRefused(() => dbSetProjectLastDraftConfig(project.id, null, committed));
    expect(committed).not.toHaveBeenCalled();
  });
  it("allows independently stored group changes and healthy sibling rows without touching protected config", () => {
    const raw = protectThread();
    dbSetThreadGroup(thread.id, "group", "Group");
    dbUpsertThread({ ...thread, id: "healthy", title: "Healthy" }, 1);
    expect(dbGetThread(thread.id)?.groupId).toBe("group");
    expect(dbGetThread("healthy")?.title).toBe("Healthy");
    expect(getSqlite().prepare("SELECT config FROM threads WHERE id = ?").get(thread.id)).toEqual({
      config: raw,
    });
  });
  it("rolls back every earlier row in a rejected incremental sync", () => {
    expect.assertions(3);
    protectThread();
    expectRefused(() =>
      dbSyncChanges({
        projects: [{ project: { ...project, name: "Changed" }, sortOrder: 3 }],
        threads: [{ thread: dbGetThread(thread.id)!, sortOrder: 9 }],
        deletedProjectIds: [],
        deletedThreadIds: [],
        viewJson: '{"changed":true}',
      }),
    );
  });
  it("refuses a protected full sync atomically", () => {
    expect.assertions(3);
    protectThread();
    expectRefused(() =>
      dbSyncAll([{ ...project, name: "Changed" }], [dbGetThread(thread.id)!], '{"changed":true}'),
    );
  });
  it.each(["startup repair", "full sync"])(
    "refuses borrowing a stripped duplicate draft during %s before deleting its source",
    (kind) => {
      expect.assertions(3);
      dbUpsertProject({ ...project, id: "duplicate", createdAt: "2026-01-02T00:00:00Z" }, 1);
      const raw = JSON.stringify({
        ...controls,
        agentKind: thread.agentKind,
        selectionBinding: future,
      });
      getSqlite()
        .prepare("UPDATE projects SET last_draft_config = ? WHERE id = 'duplicate'")
        .run(raw);
      expectRefused(() =>
        kind === "startup repair"
          ? repairDuplicateProjects(getSqlite())
          : dbSyncAll([dbGetProject(project.id)!, dbGetProject("duplicate")!], [thread], "{}"),
      );
    },
  );
});
