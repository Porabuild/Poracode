import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbReplaceThreadRuntimeItems } from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { readHistoryCacheRevision } from "./historyCacheRevision";

describe.skipIf(!sqliteAvailable)("durable history cache revisions", () => {
  let dir: string;
  let path: string;
  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-history-revision-"));
    path = join(dir, "state.sqlite");
    initDatabase(path);
    dbUpsertProject(
      {
        id: "project-1",
        name: "Test",
        location: { kind: "posix", path: "/tmp/test" },
        createdAt: "2026-01-01T00:00:00Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "reply",
        type: "assistant_message",
        state: "started",
        streams: { assistant_text: "before" },
      },
    ]);
  });
  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("survives restart and rolls back atomically with a failed history write", () => {
    const before = readHistoryCacheRevision("thread-1");
    expect(before).toEqual(expect.any(String));
    expect(() =>
      getSqlite().transaction(() => {
        getSqlite()
          .prepare("UPDATE thread_runtime_items SET streams = '{}' WHERE thread_id = ?")
          .run("thread-1");
        expect(readHistoryCacheRevision("thread-1")).not.toBe(before);
        throw new Error("rollback");
      })(),
    ).toThrow("rollback");
    expect(readHistoryCacheRevision("thread-1")).toBe(before);
    closeDatabase();
    initDatabase(path);
    expect(readHistoryCacheRevision("thread-1")).toBe(before);
  });

  it("invalidates stream-only, turn and context writes without invalidating other threads", () => {
    dbUpsertThread({ ...testThread(), id: "other" }, 1);
    const other = readHistoryCacheRevision("other");
    const mutate = (sql: string) => {
      const previous = readHistoryCacheRevision("thread-1");
      getSqlite().exec(sql);
      expect(readHistoryCacheRevision("thread-1")).not.toBe(previous);
      expect(readHistoryCacheRevision("other")).toBe(other);
    };
    mutate(
      "INSERT INTO thread_runtime_item_stream_chunks VALUES ('thread-1', 'reply', 'assistant_text', 0, 5, 'after')",
    );
    mutate(
      "UPDATE thread_runtime_item_stream_chunks SET text = 'other' WHERE thread_id = 'thread-1'",
    );
    mutate("DELETE FROM thread_runtime_item_stream_chunks WHERE thread_id = 'thread-1'");
    mutate("INSERT INTO thread_completed_turns VALUES ('thread-1', 0, 'start', 'end', 'reply')");
    mutate("INSERT INTO thread_context_usage VALUES ('thread-1', '{}')");
    mutate("DELETE FROM thread_runtime_items WHERE thread_id = 'thread-1'");
  });

  it("does not reuse a proof after deleting and recreating the same thread id", async () => {
    const before = readHistoryCacheRevision("thread-1");
    getSqlite().prepare("DELETE FROM threads WHERE id = ?").run("thread-1");
    expect(readHistoryCacheRevision("thread-1")).toBeUndefined();
    dbUpsertThread(testThread(), 0);
    await dbReplaceThreadRuntimeItems("thread-1", [
      { id: "reply", type: "assistant_message", state: "completed", streams: {} },
    ]);
    expect(readHistoryCacheRevision("thread-1")).not.toBe(before);
  });

  it("upgrades a schema72 database without rewriting its transcript", () => {
    const sqlite = getSqlite();
    const triggers = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'history_revision_%'",
      )
      .all() as { name: string }[];
    for (const { name } of triggers) sqlite.exec(`DROP TRIGGER ${name}`);
    sqlite.exec(
      "DROP TABLE thread_history_revisions; UPDATE app_state SET value = '72' WHERE key = 'schema_version'",
    );
    const before = sqlite.prepare("SELECT * FROM thread_runtime_items").all();
    closeDatabase();
    initDatabase(path);
    expect(readHistoryCacheRevision("thread-1")).toEqual(expect.any(String));
    expect(getSqlite().prepare("SELECT * FROM thread_runtime_items").all()).toEqual(before);
    const revision = readHistoryCacheRevision("thread-1");
    getSqlite().exec("UPDATE thread_runtime_items SET state = 'completed'");
    expect(readHistoryCacheRevision("thread-1")).not.toBe(revision);
  });
});
