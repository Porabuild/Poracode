import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrWatch } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "./connection";
import { dbUpsertProject } from "./projectsThreads";
import { dbDeletePrWatch, dbGetPrWatch, dbGetPrWatches, dbUpsertPrWatch } from "./prWatches";

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBindingEnv: string | undefined;
let sqliteAvailable = true;
try {
  new Database(":memory:").close();
} catch {
  if (existsSync(serverNativeBinding)) {
    nativeBindingEnv = serverNativeBinding;
  } else {
    sqliteAvailable = false;
  }
}

function watch(overrides: Partial<PrWatch> = {}): PrWatch {
  return {
    projectId: "project-1",
    prNumber: 42,
    headBranch: "feature/pr-watch",
    watchEnabled: true,
    autoMerge: false,
    agentKind: "codex",
    config: { model: "gpt-5.6", effort: "high" },
    lastCommentCursor: null,
    lastReviewCommentCursor: null,
    lastReviewCursor: null,
    lastCheckKey: null,
    activeThreadId: null,
    lastError: null,
    ...overrides,
  };
}

describe.skipIf(!sqliteAvailable)("prWatches (real sqlite round-trip)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-pr-watch-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Poracode",
        location: { kind: "posix", path: "/repo" },
        createdAt: "2026-07-25T00:00:00.000Z",
      },
      0,
    );
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("persists, updates, lists, and deletes a PR watch", () => {
    dbUpsertPrWatch(watch());
    expect(dbGetPrWatch("project-1", 42)).toEqual(watch());

    dbUpsertPrWatch(watch({ autoMerge: true }));
    expect(dbGetPrWatches()).toEqual([watch({ autoMerge: true })]);

    dbDeletePrWatch("project-1", 42);
    expect(dbGetPrWatch("project-1", 42)).toBeNull();
  });
});
