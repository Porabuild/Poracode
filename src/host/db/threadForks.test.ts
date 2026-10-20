import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbDeleteThread, dbGetThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbAppendThreadCompletedTurn,
  dbGetThreadCompletedTurns,
  dbGetThreadRuntimeItems,
  dbReplaceThreadRuntimeSnapshot,
} from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import {
  acknowledgeThreadForkInitialInstructions,
  dbForkThread,
  isInheritedThreadForkItem,
  readThreadForkInitialInstructions,
} from "./threadForks";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { saveUploadedAttachmentFile } from "@/host/attachments/attachmentStorage";
import { assertRequiredDatabaseSchema } from "./migrations";

describe.skipIf(!sqliteAvailable)("independent thread forks", () => {
  let dir: string;
  const turns = ["a1", "a2"].map((anchorItemId, index) => ({
    anchorItemId,
    startedAt: `2026-10-20T10:0${index}:00Z`,
    endedAt: `2026-10-20T10:0${index}:10Z`,
  }));
  const command = {
    kind: "fork" as const,
    sourceThreadId: "thread-1",
    threadId: "fork",
    throughItemId: "a1",
    title: "Try another approach",
  };

  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-thread-forks-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Project",
        location: { kind: "windows", path: dir },
        createdAt: "2026-10-20T10:00:00Z",
      },
      0,
    );
    dbUpsertThread(
      {
        ...testThread(),
        status: "idle",
        attention: "none",
        done: true,
        starred: true,
        sessionRef: {
          providerSessionId: "original-provider-session",
          discoveredAt: "2026-10-20T10:00:00Z",
        },
        worktreePath: dir,
        worktreeBranch: "source-branch",
      },
      0,
    );
    await dbReplaceThreadRuntimeSnapshot(
      "thread-1",
      [
        {
          id: "u1",
          type: "user_message",
          state: "completed",
          payload: { content: [{ kind: "text", text: "Compare designs" }] },
          streams: {},
        },
        {
          id: "a1",
          type: "assistant_message",
          state: "completed",
          streams: { assistant_text: "First answer" },
        },
        { id: "u2", type: "user_message", state: "completed", streams: {} },
        {
          id: "a2",
          type: "assistant_message",
          state: "completed",
          streams: { assistant_text: "Later answer" },
        },
      ],
      turns,
      null,
    );
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("copies the inclusive boundary atomically and preserves the source session", async () => {
    const source = dbGetThread("thread-1");
    const committed = vi.fn<() => void>();
    const fork = await dbForkThread(command, committed);
    expect(committed).toHaveBeenCalledOnce();
    expect(fork).toMatchObject({
      status: "inactive",
      attention: "none",
      canResumeWithConfig: true,
      done: false,
      starred: false,
      worktreePath: dir,
      worktreeBranch: "source-branch",
      forkedFrom: { version: 1, threadId: "thread-1", throughItemId: "a1", inheritedTurnCount: 1 },
    });
    expect(fork.sessionRef).toBeUndefined();
    expect(dbGetThread("thread-1")).toEqual(source);
    expect((await dbGetThreadRuntimeItems("fork")).map((item) => item.id)).toEqual(["u1", "a1"]);
    expect(dbGetThreadCompletedTurns("fork")).toEqual([turns[0]]);
    expect(readThreadForkInitialInstructions("fork")).toContain("First answer");
    expect(readThreadForkInitialInstructions("fork")).not.toContain("Later answer");
  });

  it("keeps history and first-turn context after deleting the source and restarting", async () => {
    await dbForkThread(command);
    dbDeleteThread("thread-1");
    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));
    expect(dbGetThread("fork")?.forkedFrom?.title).toBe("Runtime persistence");
    expect(await dbGetThreadRuntimeItems("fork")).toHaveLength(2);
    expect(readThreadForkInitialInstructions("fork")).toContain("First answer");
    const fork = dbGetThread("fork")!;
    dbUpsertThread(
      {
        ...fork,
        sessionRef: { providerSessionId: "load-only-open", discoveredAt: fork.createdAt },
      },
      0,
    );
    expect(readThreadForkInitialInstructions("fork")).toContain("First answer");
    dbAppendThreadCompletedTurn("fork", {
      startedAt: "2026-10-20T11:00:00Z",
      endedAt: "2026-10-20T11:00:10Z",
      anchorItemId: "new-answer",
    });
    expect(readThreadForkInitialInstructions("fork")).toContain("First answer");
    acknowledgeThreadForkInitialInstructions("fork");
    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));
    expect(readThreadForkInitialInstructions("fork")).toBeUndefined();
  });

  it("refuses active sources and invalid boundaries without creating a row", async () => {
    dbUpsertThread({ ...dbGetThread("thread-1")!, status: "working" }, 0);
    await expect(dbForkThread(command)).rejects.toThrow("finish before forking");
    expect(dbGetThread("fork")).toBeNull();
    dbUpsertThread({ ...dbGetThread("thread-1")!, status: "idle" }, 0);
    await expect(dbForkThread({ ...command, throughItemId: "u2" })).rejects.toThrow(
      "completed turn",
    );
    expect(dbGetThread("fork")).toBeNull();
  });

  it("rolls back the row and snapshot together when persistence fails", async () => {
    getSqlite().exec(`CREATE TRIGGER refuse_fork_context BEFORE INSERT ON thread_fork_contexts
      BEGIN SELECT RAISE(ABORT, 'forced fork context failure'); END`);
    const committed = vi.fn<() => void>();
    await expect(dbForkThread(command, committed)).rejects.toThrow("forced fork context failure");
    expect(dbGetThread("fork")).toBeNull();
    expect(committed).not.toHaveBeenCalled();
  });

  it("owns inherited uploads independently and protects inherited checkpoints", async () => {
    const path = saveUploadedAttachmentFile(resolvePoracodePaths(dir), {
      threadId: "thread-1",
      fileName: "design.txt",
      data: Buffer.from("three blue squares"),
    });
    await dbReplaceThreadRuntimeSnapshot(
      "thread-1",
      [
        {
          id: "u1",
          type: "user_message",
          state: "completed",
          streams: {},
          payload: { content: [{ kind: "file", path, source: "attachment" }] },
        },
        {
          id: "a1",
          type: "assistant_message",
          state: "completed",
          streams: { assistant_text: "Read design" },
        },
      ],
      [turns[0]!],
      null,
    );
    await dbForkThread(command);
    const items = await dbGetThreadRuntimeItems("fork");
    const copiedPath = (items[0]!.payload as { content: { path: string }[] }).content[0]!.path;
    expect(copiedPath).not.toBe(path);
    dbDeleteThread("thread-1");
    rmSync(path);
    expect(existsSync(copiedPath)).toBe(true);
    expect(readFileSync(copiedPath, "utf8")).toBe("three blue squares");
    expect(readThreadForkInitialInstructions("fork")).toContain(JSON.stringify(copiedPath));
    expect(isInheritedThreadForkItem("fork", "a1")).toBe(true);
    expect(isInheritedThreadForkItem("fork", "new-message")).toBe(false);
  });

  it("migrates a previous-version database without changing its conversations", () => {
    const sqlite = getSqlite();
    sqlite.exec("DROP TABLE thread_fork_contexts; ALTER TABLE threads DROP COLUMN forked_from");
    expect(() => assertRequiredDatabaseSchema(sqlite)).toThrow("schema");
    sqlite.prepare("UPDATE app_state SET value = '63' WHERE key = 'schema_version'").run();
    const source = dbGetThread("thread-1");
    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));
    expect(dbGetThread("thread-1")).toEqual(source);
    expect(
      getSqlite()
        .prepare("SELECT name FROM sqlite_master WHERE name = 'thread_fork_contexts'")
        .get(),
    ).toBeDefined();
  });
});
