import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import { inactivateLiveThreads } from "./inactivateLiveThreads";

function thread(id: string, status: Thread["status"]): Thread {
  return {
    id,
    projectId: "project-1",
    title: id,
    agentKind: "fixture",
    config: { model: "model" },
    status,
    attention: "none",
    canResumeWithConfig: true,
    presentationMode: "gui",
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-10-21T10:00:00Z",
    updatedAt: "2026-10-21T10:00:00Z",
  };
}

describe.skipIf(!sqliteAvailable)("inactivateLiveThreads", () => {
  let directory: string;
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-inactivate-"));
    initDatabase(join(directory, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Fixture",
        location: { kind: "posix", path: "/fixture" },
        createdAt: "2026-10-21T10:00:00Z",
      },
      0,
    );
  });
  afterEach(() => {
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("remembers a turn the reset cut off, and only that one", () => {
    dbUpsertThread(thread("running", "working"), 0);
    dbUpsertThread(thread("settled", "idle"), 1);

    const { inactiveEvents } = inactivateLiveThreads();

    expect(inactiveEvents).toEqual([
      {
        type: "thread-state",
        threadId: "running",
        status: "inactive",
        attention: "none",
        canResumeWithConfig: true,
        interruptedTurn: "restart",
      },
    ]);
    expect(dbGetThread("running")).toMatchObject({
      status: "inactive",
      interruptedTurn: "restart",
    });
    expect(dbGetThread("settled")).toMatchObject({ status: "inactive" });
    expect(dbGetThread("settled")).not.toHaveProperty("interruptedTurn");
  });
});
