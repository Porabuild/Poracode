import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "./connection";
import {
  dbGetThread,
  dbGetProject,
  dbGetThreads,
  dbMarkLiveThreadsInactive,
  dbUpsertProject,
  dbUpsertThread,
} from "./projectsThreads";
import {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
} from "./remoteCommandReceipts";

// node_modules/better-sqlite3 may be compiled for Electron's ABI; fall back to
// the Node-ABI binding `pnpm run prepare:server-native` places in dist (the
// same one the headless server uses). Skip only when neither can open.
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

function testThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Test thread",
    agentKind: "claude",
    config: { model: "sonnet" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe.skipIf(!sqliteAvailable)("projectsThreads (real sqlite round-trip)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "lc-db-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("round-trips threadStatusSource through the threads table", () => {
    dbUpsertThread(testThread({ threadStatusSource: "server" }), 0);
    expect(dbGetThread("thread-1")?.threadStatusSource).toBe("server");

    dbUpsertThread(testThread({ threadStatusSource: "cli_hook" }), 0);
    expect(dbGetThread("thread-1")?.threadStatusSource).toBe("cli_hook");

    dbUpsertThread(testThread(), 0);
    expect(dbGetThread("thread-1")?.threadStatusSource).toBeUndefined();
  });

  it("round-trips project MCP servers through the projects table", () => {
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test project",
        location: { kind: "posix", path: "/tmp/project" },
        mcpServers: [
          {
            id: "memory-id",
            name: "memory",
            description: "Memory tools",
            enabled: true,
            timeoutMs: 30_000,
            transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
          },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );

    expect(dbGetProject("project-1")?.mcpServers?.[0]).toMatchObject({
      id: "memory-id",
      name: "memory",
    });
  });

  it("replays durable remote command receipts without reclaiming them", () => {
    expect(dbClaimRemoteCommand("command-1", "/api/threads/start")).toEqual({
      state: "claimed",
    });
    dbCompleteRemoteCommand("command-1", { threadId: "thread-1" });
    expect(dbClaimRemoteCommand("command-1", "/api/threads/start")).toEqual({
      state: "completed",
      response: { threadId: "thread-1" },
    });
    expect(dbClaimRemoteCommand("command-1", "/api/threads/thread-1/send")).toEqual({
      state: "conflict",
    });

    expect(dbClaimRemoteCommand("command-2", "/api/threads/thread-1/send")).toEqual({
      state: "claimed",
    });
    dbFailRemoteCommand("command-2");
    expect(dbClaimRemoteCommand("command-2", "/api/threads/thread-1/send")).toEqual({
      state: "failed",
    });
  });

  it("marks live threads inactive on launch but leaves settled ones alone", () => {
    dbUpsertThread(
      testThread({
        id: "t-working",
        status: "working",
        attention: "working",
        activeTurnStartedAt: "2026-01-01T00:00:00.000Z",
      }),
      0,
    );
    dbUpsertThread(testThread({ id: "t-launching", status: "launching" }), 1);
    dbUpsertThread(testThread({ id: "t-inactive", status: "inactive" }), 2);
    dbUpsertThread(testThread({ id: "t-error", status: "error" }), 3);

    dbMarkLiveThreadsInactive();

    const byId = new Map(dbGetThreads().map((thread) => [thread.id, thread]));
    expect(byId.get("t-working")).toMatchObject({ status: "inactive", attention: "none" });
    expect(byId.get("t-working")?.activeTurnStartedAt).toBeUndefined();
    expect(byId.get("t-launching")?.status).toBe("inactive");
    expect(byId.get("t-inactive")?.status).toBe("inactive");
    expect(byId.get("t-error")?.status).toBe("error");
  });
});
