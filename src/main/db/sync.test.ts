import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "./connection";
import {
  dbGetState,
  dbGetThread,
  dbSetState,
  dbUpsertProject,
  dbUpsertThread,
} from "./projectsThreads";
import { dbApplyThreadRuntimeEvents, dbGetThreadRuntimeItems } from "./runtimeItems";
import { dbSyncAll } from "./sync";

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

const project: Project = {
  id: "project-1",
  name: "Test project",
  location: { kind: "posix", path: "/tmp/project" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function remoteStartedThread(): Thread {
  return {
    id: "thread-remote",
    projectId: project.id,
    title: "Started from a remote client",
    agentKind: "claude",
    config: { model: "claude-opus-5" },
    status: "launching",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function persistLaunchUserMessage(threadId: string): void {
  dbApplyThreadRuntimeEvents(threadId, [
    { type: "turn.started", threadId, turnId: "turn-1" },
    {
      type: "item.started",
      threadId,
      itemId: "user-1",
      itemType: "user_message",
      payload: { content: [{ kind: "text", text: "fix the sidebar" }] },
    },
    { type: "item.completed", threadId, itemId: "user-1" },
  ]);
}

describe.skipIf(!sqliteAvailable)("dbSyncAll thread ownership", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-sync-db-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(project, 0);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("keeps a main-created thread (and its launch transcript) that the renderer has not mirrored yet", () => {
    dbUpsertThread(remoteStartedThread(), 0);
    persistLaunchUserMessage("thread-remote");

    // Renderer flushes its store before the forwarded `start` command lands.
    dbSyncAll([project], [], JSON.stringify({ kind: "home" }));

    expect(dbGetThread("thread-remote")).not.toBeNull();
    expect(dbGetThreadRuntimeItems("thread-remote").map((item) => item.type)).toEqual([
      "user_message",
    ]);
  });

  it("keeps the ownership marker across database connection lifetimes", () => {
    dbUpsertThread(remoteStartedThread(), 0);
    persistLaunchUserMessage("thread-remote");

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));
    dbSyncAll([project], [], JSON.stringify({ kind: "home" }));

    expect(dbGetThread("thread-remote")).not.toBeNull();
    expect(dbGetThreadRuntimeItems("thread-remote")).toHaveLength(1);
  });

  it("validates an already-migrated desktop database without taking migration ownership", () => {
    const databasePath = join(dir, "state.sqlite");
    dbSetState("schema_version", "31");

    closeDatabase();
    initDatabase(databasePath, { schemaMode: "validate" });

    expect(dbGetState("schema_version")).toBe("31");
  });

  it("still deletes a thread the renderer dropped after it had mirrored it", () => {
    dbUpsertThread(remoteStartedThread(), 0);
    persistLaunchUserMessage("thread-remote");

    // Renderer applied the command: its snapshot now carries the thread.
    dbSyncAll([project], [remoteStartedThread()], JSON.stringify({ kind: "home" }));
    expect(dbGetThreadRuntimeItems("thread-remote")).toHaveLength(1);

    // The user deletes it in the renderer.
    dbSyncAll([project], [], JSON.stringify({ kind: "home" }));

    expect(dbGetThread("thread-remote")).toBeNull();
    expect(dbGetThreadRuntimeItems("thread-remote")).toEqual([]);
  });
});
