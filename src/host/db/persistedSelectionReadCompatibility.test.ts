import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { projectDraftConfigSchema, threadConfigSchema } from "@/shared/contracts/config";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import {
  dbGetProject,
  dbGetProjects,
  dbGetThread,
  dbGetThreads,
  dbUpdateProject,
  dbUpsertProject,
  dbUpsertThread,
} from "./projectsThreads";
import { dbReadCatalogProjectPhase2, dbReadCatalogThreadPhase2 } from "./catalogReads";
import { onProjectThreadDataChanged } from "./projectThreadChanges";

const project: Project = {
  id: "p-valid",
  name: "Project",
  location: { kind: "posix", path: "/fixture" },
  createdAt: "2026-01-01T00:00:00Z",
};
const thread: Thread = {
  id: "t-valid",
  projectId: project.id,
  title: "Thread",
  agentKind: "fixture:profile",
  config: { model: "opaque-member" },
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
// Historical stored configs the pre-binding reader accepted verbatim.
const legacyConfigs: Record<string, string> = {
  "t-valid": JSON.stringify({ model: "opaque-member", effort: "high" }),
  "t-empty": "{}",
  "t-model-empty": ` {"model":"", "opaque":{"keep":[1,true,null]}}\n`,
  "t-model-less": JSON.stringify({ effort: "", legacyFlag: 7 }),
  "t-model-non-string": JSON.stringify({ model: 42, extra: "x" }),
};
const legacyDrafts: Record<string, string> = {
  "p-valid": JSON.stringify({ agentKind: "fixture:profile", model: "opaque-member" }),
  "p-empty": "{}",
  "p-model-empty": JSON.stringify({ agentKind: "fixture:profile", model: "", opaque: 1 }),
  "p-model-less": JSON.stringify({ legacyOnly: true }),
};

let root: string;
let stop: (() => void) | undefined;
const priorBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;

function storedThreadConfig(id: string) {
  return getSqlite().prepare("SELECT config FROM threads WHERE id = ?").get(id);
}
function storedDraft(id: string) {
  return getSqlite().prepare("SELECT last_draft_config FROM projects WHERE id = ?").get(id);
}
function rows() {
  return {
    projects: getSqlite().prepare("SELECT * FROM projects ORDER BY id").all(),
    threads: getSqlite().prepare("SELECT * FROM threads ORDER BY id").all(),
  };
}

describe.skipIf(!sqliteAvailable)("historical persisted selection read compatibility", () => {
  beforeEach(() => {
    mkdirSync("tmp", { recursive: true });
    root = mkdtempSync(join("tmp", "persisted-selection-read-compat-"));
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    initDatabase(join(root, "state.sqlite"));
    let order = 0;
    for (const [id, raw] of Object.entries(legacyDrafts)) {
      dbUpsertProject({ ...project, id }, order++);
      getSqlite().prepare("UPDATE projects SET last_draft_config = ? WHERE id = ?").run(raw, id);
    }
    order = 0;
    for (const [id, raw] of Object.entries(legacyConfigs)) {
      dbUpsertThread({ ...thread, id }, order++);
      getSqlite().prepare("UPDATE threads SET config = ? WHERE id = ?").run(raw, id);
    }
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    closeDatabase();
    rmSync(root, { recursive: true, force: true });
    if (priorBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorBinding;
  });

  it("keeps fresh request schemas strict for the same legacy shapes", () => {
    expect(threadConfigSchema.safeParse({}).success).toBe(false);
    expect(threadConfigSchema.safeParse({ model: "" }).success).toBe(false);
    expect(projectDraftConfigSchema.safeParse({}).success).toBe(false);
  });

  it("lists, gets and catalog-reads every legacy thread row losslessly", () => {
    const ids = Object.keys(legacyConfigs);
    const expected = Object.fromEntries(ids.map((id) => [id, JSON.parse(legacyConfigs[id]!)]));
    const listed = new Map(dbGetThreads().map((entry) => [entry.id, entry]));
    expect(Object.fromEntries(ids.map((id) => [id, listed.get(id)?.config]))).toEqual(expected);
    expect(Object.fromEntries(ids.map((id) => [id, dbGetThread(id)?.config]))).toEqual(expected);
    expect(dbReadCatalogThreadPhase2(ids)).toEqual(ids.map((id) => listed.get(id)));
    expect(ids.map(storedThreadConfig)).toEqual(ids.map((id) => ({ config: legacyConfigs[id] })));
  });

  it("lists, gets and catalog-reads every legacy project draft losslessly", () => {
    const ids = Object.keys(legacyDrafts);
    const expected = Object.fromEntries(ids.map((id) => [id, JSON.parse(legacyDrafts[id]!)]));
    const listed = new Map(dbGetProjects().map((entry) => [entry.id, entry]));
    expect(Object.fromEntries(ids.map((id) => [id, listed.get(id)?.lastDraftConfig]))).toEqual(
      expected,
    );
    expect(Object.fromEntries(ids.map((id) => [id, dbGetProject(id)?.lastDraftConfig]))).toEqual(
      expected,
    );
    expect(dbReadCatalogProjectPhase2(ids)).toEqual(ids.map((id) => listed.get(id)));
    expect(ids.map(storedDraft)).toEqual(
      ids.map((id) => ({ last_draft_config: legacyDrafts[id] })),
    );
  });

  it("projects unsupported metadata inert on a model-less legacy row and still refuses overwrite", () => {
    expect.assertions(8);
    const raw = ` {"effort":"", "opaque":{"keep":true}, "selectionBinding":${JSON.stringify(future)}}\n`;
    getSqlite().prepare("UPDATE threads SET config = ? WHERE id = 't-empty'").run(raw);
    const draftRaw = JSON.stringify({ legacyOnly: true, selectionBinding: future });
    getSqlite()
      .prepare("UPDATE projects SET last_draft_config = ? WHERE id = 'p-empty'")
      .run(draftRaw);

    const listed = dbGetThreads().find((entry) => entry.id === "t-empty")!;
    expect(listed.config).toEqual({ effort: "", opaque: { keep: true } });
    expect(dbReadCatalogThreadPhase2(["t-empty"])).toEqual([listed]);
    const draft = dbGetProjects().find((entry) => entry.id === "p-empty")!;
    expect(draft.lastDraftConfig).toEqual({ legacyOnly: true });

    const before = rows();
    const changed = vi.fn<() => void>();
    stop = onProjectThreadDataChanged(changed);
    expect(() => dbUpsertThread({ ...listed, title: "Renamed" }, 0)).toThrow(
      "unsupported selection data",
    );
    expect(() => dbUpdateProject({ ...draft, name: "Renamed" })).toThrow(
      "unsupported selection data",
    );
    expect(rows()).toEqual(before);
    expect(changed).not.toHaveBeenCalled();
    expect([storedThreadConfig("t-empty"), storedDraft("p-empty")]).toEqual([
      { config: raw },
      { last_draft_config: draftRaw },
    ]);
  });
});
