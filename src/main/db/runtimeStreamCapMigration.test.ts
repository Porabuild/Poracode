import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbApplyThreadRuntimeEvents, dbGetThreadRuntimeItems } from "./runtimeItems";
import { HEAD_CHARS, TAIL_CHARS } from "./runtimeStreamCap";

const MAX_PERSISTED_STREAM_CHARS = HEAD_CHARS + TAIL_CHARS;

const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");
let nativeBindingEnv: string | undefined;
let sqliteAvailable = true;
try {
  new Database(":memory:").close();
} catch {
  if (existsSync(serverNativeBinding)) nativeBindingEnv = serverNativeBinding;
  else sqliteAvailable = false;
}

/**
 * Rows written before the stream cap shipped can hold tens of megabytes, and
 * they stay slow forever unless the upgrade compacts them: every later append
 * re-reads and rewrites the whole blob. This is the pre-upgrade regression
 * guard for that migration — it builds a database at the previous schema
 * version and opens it with the current code.
 */
describe.skipIf(!sqliteAvailable)("runtime stream chunks migration", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-stream-cap-migration-"));
    dbPath = join(dir, "state.sqlite");
  });

  afterEach(() => {
    closeDatabase();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can still hold the -wal handle briefly; the temp dir is disposable.
    }
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function seedPreCapDatabase(streams: Record<string, string>): void {
    // Build the last released schema with the normal writers, then remove the
    // new tables before seeding the legacy runtime row.
    initDatabase(dbPath);
    dbUpsertProject(
      {
        id: "project-1",
        name: "Legacy",
        location: { kind: "posix", path: "/tmp/p" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(
      {
        id: "thread-1",
        projectId: "project-1",
        title: "Legacy",
        agentKind: "claude",
        config: { model: "opus" },
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    closeDatabase();

    const sqlite = new Database(dbPath, {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
    });
    sqlite.exec(`
      DROP TABLE thread_runtime_item_stream_state;
      DROP TABLE thread_runtime_item_stream_chunks;
    `);
    sqlite
      .prepare(
        `INSERT INTO thread_runtime_items
           (thread_id, item_id, position, type, state, payload, streams, parent_item_id)
         VALUES ('thread-1', 'cmd-1', 0, 'command_execution', 'completed', NULL, ?, NULL)`,
      )
      .run(JSON.stringify(streams));
    sqlite
      .prepare(
        "INSERT INTO app_state (key, value) VALUES ('schema_version', '35') " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run();
    sqlite.close();
  }

  it("compacts an oversized stream on upgrade, keeping head and tail", () => {
    const head = "FIRST-LINE";
    const tail = "LAST-LINE";
    const oversized = `${head}${"x".repeat(MAX_PERSISTED_STREAM_CHARS * 2)}${tail}`;
    seedPreCapDatabase({ command_output: oversized, assistant_text: "kept" });

    initDatabase(dbPath);

    const item = dbGetThreadRuntimeItems("thread-1")[0]!;
    const output = item.streams.command_output!;
    expect(output.length).toBeLessThanOrEqual(MAX_PERSISTED_STREAM_CHARS);
    expect(output.startsWith(head)).toBe(true);
    expect(output.endsWith(tail)).toBe(true);
    expect(output).toContain("poracode elided");
    // Streams that already fit are untouched.
    expect(item.streams.assistant_text).toBe("kept");
    const tables = getTables();
    expect(tables).toContain("thread_runtime_item_stream_chunks");
    expect(tables).toContain("thread_runtime_item_stream_state");
  });

  function getTables(): string[] {
    const sqlite = new Database(dbPath, {
      ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
      readonly: true,
    });
    try {
      return (
        sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string;
        }>
      ).map((row) => row.name);
    } finally {
      sqlite.close();
    }
  }

  it("leaves transcripts that already fit byte for byte", () => {
    seedPreCapDatabase({ command_output: "small output" });

    initDatabase(dbPath);

    expect(dbGetThreadRuntimeItems("thread-1")[0]!.streams).toEqual({
      command_output: "small output",
    });
  });

  it("migrates astral text measured as oversized UTF-16", () => {
    const oversized = "😀".repeat(MAX_PERSISTED_STREAM_CHARS / 2 + 10);
    seedPreCapDatabase({ command_output: oversized });

    initDatabase(dbPath);

    const output = dbGetThreadRuntimeItems("thread-1")[0]!.streams.command_output!;
    expect(output.length).toBeLessThanOrEqual(MAX_PERSISTED_STREAM_CHARS + 256_000);
    expect(output).not.toContain("�");
  });

  it("keeps one bounded stream layout when a large legacy item resumes", () => {
    seedPreCapDatabase({
      command_output: `LEGACY-HEAD ${"x".repeat(MAX_PERSISTED_STREAM_CHARS * 2)}`,
    });

    initDatabase(dbPath);
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "cmd-1",
        stream: "command_output",
        delta: `${"y".repeat(TAIL_CHARS + 500_000)} APPENDED-TAIL`,
      },
    ]);

    const output = dbGetThreadRuntimeItems("thread-1")[0]!.streams.command_output!;
    expect(output.startsWith("LEGACY-HEAD ")).toBe(true);
    expect(output.endsWith(" APPENDED-TAIL")).toBe(true);
    expect(output.match(/poracode elided/g)).toHaveLength(1);
    expect(output.length).toBeLessThanOrEqual(HEAD_CHARS + TAIL_CHARS + 256_000);
  });
});
