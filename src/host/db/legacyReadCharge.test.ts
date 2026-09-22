import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSqlite, initDatabase, closeDatabase } from "./connection";
import { dbMeasureLegacyHistoryCharge, dbMeasureLegacySnapshotCharge } from "./legacyReadCharge";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";

const bytes = (value: string) => Buffer.byteLength(value, "utf8");

function materializedStoredBytes(rows: readonly Record<string, unknown>[]): number {
  let total = 0;
  for (const row of rows) {
    for (const value of Object.values(row)) {
      if (typeof value === "string") total += bytes(value);
      else if (value instanceof Uint8Array) total += value.byteLength;
    }
  }
  return total;
}

describe.skipIf(!sqliteAvailable)("legacy read charges", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-legacy-charge-"));
    initDatabase(join(dir, "state.sqlite"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("charges the exact stored bytes of the full-row snapshot projection", () => {
    expect(dbMeasureLegacySnapshotCharge()).toEqual({
      threadsStoredBytes: 0,
      projectsStoredBytes: 0,
    });
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, scripts, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("project-1", "Project", "posix", "/tmp/p", '{"build":"x"}', "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        `INSERT INTO threads
           (id, project_id, title, agent_kind, config, status, attention, terminal_prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "thread-1",
        "project-1",
        "T",
        "claude",
        '{"model":"sonnet"}',
        "idle",
        "none",
        "prompt",
        "2026-01-01T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
      );
    // Both tables are read with `SELECT *`, so every column the row carries is
    // materialized: the defaulted `presentation_mode` text is charged, numeric
    // columns (disabled/sort_order/can_resume_with_config/...) are not, and
    // `terminal_prompt` is charged even though `rowToThread` never reads it.
    expect(dbMeasureLegacySnapshotCharge()).toEqual({
      threadsStoredBytes:
        bytes("thread-1") +
        bytes("project-1") +
        bytes("T") +
        bytes("claude") +
        bytes('{"model":"sonnet"}') +
        bytes("idle") +
        bytes("none") +
        bytes("prompt") +
        bytes("terminal") +
        bytes("2026-01-01T00:00:00.000Z") +
        bytes("2026-01-02T00:00:00.000Z"),
      projectsStoredBytes:
        bytes("project-1") +
        bytes("Project") +
        bytes("posix") +
        bytes("/tmp/p") +
        bytes('{"build":"x"}') +
        bytes("2026-01-01T00:00:00.000Z"),
    });
  });

  it("charges a real 68 MiB icon the legacy mapper materializes", () => {
    const sqlite = getSqlite();
    const icon = "i".repeat(68 * 1024 * 1024);
    const before = dbMeasureLegacySnapshotCharge();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, icon, location_kind, location_path, created_at, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "project-icon",
        "icon-project",
        icon,
        "posix",
        "/tmp/icon",
        "2026-01-01T00:00:00.000Z",
        1,
      );
    const after = dbMeasureLegacySnapshotCharge();
    // The icon is part of the `SELECT *` projection the legacy snapshot
    // materializes (`dbGetProjects` parses it), so it must be charged in full.
    expect(after.projectsStoredBytes - before.projectsStoredBytes).toBeGreaterThanOrEqual(
      bytes(icon),
    );
    expect(after.projectsStoredBytes).toBeGreaterThan(64 * 1024 * 1024);
  });

  it("charges every column of the threads/projects SELECT * projection", () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("project-1", "Project", "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
    const value = "x".repeat(64 * 1024);
    const projectColumns = (
      sqlite.prepare("PRAGMA table_info(projects)").all() as {
        name: string;
      }[]
    ).map((column) => column.name);
    const threadColumns = (
      sqlite.prepare("PRAGMA table_info(threads)").all() as {
        name: string;
      }[]
    ).map((column) => column.name);
    expect(projectColumns.length).toBeGreaterThan(0);
    expect(threadColumns.length).toBeGreaterThan(0);

    for (const column of projectColumns) {
      const row: Record<string, string> = {
        id: `probe-project-${column}`,
        name: "probe",
        location_kind: "posix",
        location_path: "/tmp/probe",
        created_at: "2026-01-01T00:00:00.000Z",
      };
      row[column] = value;
      const columns = Object.keys(row);
      const before = dbMeasureLegacySnapshotCharge().projectsStoredBytes;
      sqlite
        .prepare(
          `INSERT INTO projects (${columns.map((name) => `"${name}"`).join(", ")})
           VALUES (${columns.map(() => "?").join(", ")})`,
        )
        .run(...columns.map((name) => row[name]!));
      const after = dbMeasureLegacySnapshotCharge().projectsStoredBytes;
      // SQLite's dynamic typing lets the probe put text in any column; the
      // charge must count it wherever the full-row projection carries it.
      expect(after - before, `projects.${column}`).toBeGreaterThanOrEqual(bytes(value));
      sqlite.prepare("DELETE FROM projects WHERE id = ?").run(row.id!);
    }

    for (const column of threadColumns) {
      // `project_id` is FK-constrained, so the probe project itself carries the
      // large value; every other column is probed on a normal project row.
      const projectId = column === "project_id" ? value : "project-1";
      if (column === "project_id") {
        sqlite
          .prepare(
            `INSERT INTO projects (id, name, location_kind, location_path, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(value, "probe-project", "posix", "/tmp/probe-project", "2026-01-01T00:00:00.000Z");
      }
      const row: Record<string, string> = {
        id: `probe-thread-${column}`,
        project_id: projectId,
        title: "probe",
        agent_kind: "claude",
        config: "{}",
        status: "idle",
        attention: "none",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };
      row[column] = value;
      const columns = Object.keys(row);
      const before = dbMeasureLegacySnapshotCharge().threadsStoredBytes;
      sqlite
        .prepare(
          `INSERT INTO threads (${columns.map((name) => `"${name}"`).join(", ")})
           VALUES (${columns.map(() => "?").join(", ")})`,
        )
        .run(...columns.map((name) => row[name]!));
      const after = dbMeasureLegacySnapshotCharge().threadsStoredBytes;
      expect(after - before, `threads.${column}`).toBeGreaterThanOrEqual(bytes(value));
      sqlite.prepare("DELETE FROM threads WHERE id = ?").run(row.id!);
      if (column === "project_id") {
        sqlite.prepare("DELETE FROM projects WHERE id = ?").run(value);
      }
    }
  });

  it("charges item payloads, stream tails, turns, scrollback and context usage", () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("project-1", "Project", "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        `INSERT INTO threads
           (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "project-1", "T", "claude", "{}", "idle", "none", "a", "b");
    sqlite
      .prepare(
        `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "item-1", 0, "assistant", "completed", '{"text":"hi"}', '{"stdout":[]}');
    sqlite
      .prepare(
        `INSERT INTO thread_runtime_item_stream_chunks (thread_id, item_id, stream, seq, chars, text)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "item-1", "stdout", 0, 5, "chunk");
    sqlite
      .prepare(
        `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("thread-1", 0, "s", "e", "item-1");
    sqlite
      .prepare(`INSERT INTO thread_terminal_scrollback (thread_id, transcript, output_length)
                VALUES (?, ?, ?)`)
      .run("thread-1", "scrollback", 10);
    sqlite
      .prepare(`INSERT INTO thread_context_usage (thread_id, usage) VALUES (?, ?)`)
      .run("thread-1", '{"tokens":1}');
    expect(dbMeasureLegacyHistoryCharge("thread-1")).toEqual({
      itemsStoredBytes:
        bytes("item-1") +
        bytes("assistant") +
        bytes("completed") +
        bytes('{"text":"hi"}') +
        bytes('{"stdout":[]}'),
      // The tail reader selects the chunk key columns alongside the text.
      streamTailStoredBytes: bytes("item-1") + bytes("stdout") + bytes("chunk"),
      completedTurnsStoredBytes: bytes("s") + bytes("e") + bytes("item-1"),
      scrollbackStoredBytes: bytes("scrollback"),
      contextUsageStoredBytes: bytes('{"tokens":1}'),
    });
    expect(dbMeasureLegacyHistoryCharge("missing-thread")).toEqual({
      itemsStoredBytes: 0,
      streamTailStoredBytes: 0,
      completedTurnsStoredBytes: 0,
      scrollbackStoredBytes: 0,
      contextUsageStoredBytes: 0,
    });
  });

  it("charges only the threadLimit page window and its one-row lookahead", () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("project-1", "Project", "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
    const insertThread = sqlite.prepare(
      `INSERT INTO threads
         (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (let index = 0; index < 4; index += 1) {
      insertThread.run(
        `thread-page-${index}`,
        "project-1",
        `t${index}`,
        "claude",
        "{}",
        "idle",
        "none",
        "a",
        "b",
        index,
      );
    }
    const selected = (ids: readonly string[]) => {
      const rows = sqlite
        .prepare(`SELECT * FROM threads WHERE id IN (${ids.map(() => "?").join(", ")})`)
        .all(...ids) as Record<string, unknown>[];
      return materializedStoredBytes(rows);
    };
    // Page 1 materializes the requested row plus the dbGetThreadsPage lookahead
    // row; the two older rows are never loaded.
    expect(dbMeasureLegacySnapshotCharge({ threadListLimit: 1 }).threadsStoredBytes).toBe(
      selected(["thread-page-0", "thread-page-1"]),
    );
    expect(dbMeasureLegacySnapshotCharge({ threadListLimit: 2 }).threadsStoredBytes).toBe(
      selected(["thread-page-0", "thread-page-1", "thread-page-2"]),
    );
    // The final page materializes the whole table (page 3 + the exhausted
    // lookahead).
    expect(dbMeasureLegacySnapshotCharge({ threadListLimit: 3 }).threadsStoredBytes).toBe(
      selected(["thread-page-0", "thread-page-1", "thread-page-2", "thread-page-3"]),
    );
    // The unbounded variant still charges every row.
    expect(dbMeasureLegacySnapshotCharge().threadsStoredBytes).toBe(
      selected(["thread-page-0", "thread-page-1", "thread-page-2", "thread-page-3"]),
    );
    // A row past the page lookahead is invisible to the paged charge.
    sqlite
      .prepare(`UPDATE threads SET terminal_prompt = ? WHERE id = ?`)
      .run("x".repeat(2 * 1024 * 1024), "thread-page-3");
    expect(dbMeasureLegacySnapshotCharge({ threadListLimit: 1 }).threadsStoredBytes).toBe(
      selected(["thread-page-0", "thread-page-1"]),
    );
    expect(
      dbMeasureLegacySnapshotCharge({ threadListLimit: 3 }).threadsStoredBytes,
    ).toBeGreaterThan(2 * 1024 * 1024);
  });

  it("keeps the full project table charged when the thread list is paged", () => {
    const sqlite = getSqlite();
    const name = "p".repeat(4 * 1024 * 1024);
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("project-1", name, "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        `INSERT INTO threads
           (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "project-1", "small", "claude", "{}", "idle", "none", "a", "b");
    const paged = dbMeasureLegacySnapshotCharge({ threadListLimit: 1 });
    expect(paged.threadsStoredBytes).toBeLessThan(bytes(name));
    expect(paged.projectsStoredBytes).toBeGreaterThanOrEqual(bytes(name));
  });

  it("charges only the runtimePage item window and its one-row lookahead", () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("project-1", "Project", "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        `INSERT INTO threads
           (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "project-1", "T", "claude", "{}", "idle", "none", "a", "b");
    const insertItem = sqlite.prepare(
      `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (let index = 0; index < 502; index += 1) {
      insertItem.run(
        "thread-1",
        `item-${index}`,
        index,
        "assistant",
        "completed",
        `{"text":"${index}"}`,
      );
    }
    const oldPayload = "o".repeat(4 * 1024 * 1024);
    const lookaheadPayload = "n".repeat(1024 * 1024);
    const setPayload = sqlite.prepare(
      `UPDATE thread_runtime_items SET payload = ? WHERE thread_id = ? AND item_id = ?`,
    );
    setPayload.run(oldPayload, "thread-1", "item-0");
    setPayload.run(lookaheadPayload, "thread-1", "item-1");

    const paged = dbMeasureLegacyHistoryCharge("thread-1", { runtimePage: true });
    const windowRows = sqlite
      .prepare(
        `SELECT item_id, type, state, payload, streams, parent_item_id
         FROM thread_runtime_items WHERE thread_id = ? ORDER BY position DESC LIMIT 501`,
      )
      .all("thread-1") as Record<string, unknown>[];
    // The window is the newest 501 rows: the oldest selected row is excluded,
    // and the 501st row (the one-row lookahead) is charged.
    expect(paged.itemsStoredBytes).toBe(materializedStoredBytes(windowRows));
    expect(paged.itemsStoredBytes).toBeGreaterThanOrEqual(bytes(lookaheadPayload));
    expect(paged.itemsStoredBytes).toBeLessThan(bytes(oldPayload));
    const full = dbMeasureLegacyHistoryCharge("thread-1");
    expect(full.itemsStoredBytes).toBeGreaterThanOrEqual(
      paged.itemsStoredBytes + bytes(oldPayload),
    );
  });

  it("charges appended stream tails only for the guaranteed runtimePage target prefix", () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("project-1", "Project", "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        `INSERT INTO threads
           (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "project-1", "T", "claude", "{}", "idle", "none", "a", "b");
    const insertItem = sqlite.prepare(
      `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertChunk = sqlite.prepare(
      `INSERT INTO thread_runtime_item_stream_chunks (thread_id, item_id, stream, seq, chars, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (let index = 0; index < 42; index += 1) {
      insertItem.run("thread-1", `item-${index}`, index, "assistant", "completed", "{}");
    }
    const prefixTail = "a".repeat(1024 * 1024);
    const beyondTail = "b".repeat(2 * 1024 * 1024);
    // Newest-first rows are item-41 … item-0. The default 40-entry target
    // guarantees the newest 40 rows (item-41 … item-2); item-1 is the first row
    // outside that guarantee and its tail is not charged.
    insertChunk.run("thread-1", "item-2", "stdout", 0, prefixTail.length, prefixTail);
    insertChunk.run("thread-1", "item-1", "stdout", 0, beyondTail.length, beyondTail);

    const paged = dbMeasureLegacyHistoryCharge("thread-1", { runtimePage: true });
    expect(paged.streamTailStoredBytes).toBeGreaterThanOrEqual(bytes(prefixTail));
    expect(paged.streamTailStoredBytes).toBeLessThan(bytes(beyondTail));
    const widened = dbMeasureLegacyHistoryCharge("thread-1", {
      runtimePage: true,
      targetTimelineEntryCount: 41,
    });
    expect(widened.streamTailStoredBytes).toBeGreaterThanOrEqual(bytes(beyondTail));
    const full = dbMeasureLegacyHistoryCharge("thread-1");
    expect(full.streamTailStoredBytes).toBeGreaterThanOrEqual(
      bytes(prefixTail) + bytes(beyondTail),
    );
  });

  it("does not charge explicitly omitted scrollback", () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("project-1", "Project", "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        `INSERT INTO threads
           (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "project-1", "T", "claude", "{}", "idle", "none", "a", "b");
    const transcript = "x".repeat(68 * 1024 * 1024);
    sqlite
      .prepare(
        `INSERT INTO thread_terminal_scrollback (thread_id, transcript, output_length)
         VALUES (?, ?, ?)`,
      )
      .run("thread-1", transcript, transcript.length);

    const omitted = dbMeasureLegacyHistoryCharge("thread-1", {
      runtimePage: true,
      omitScrollback: true,
    });
    expect(omitted.scrollbackStoredBytes).toBe(0);
    expect(omitted.itemsStoredBytes + omitted.completedTurnsStoredBytes).toBeLessThan(
      64 * 1024 * 1024,
    );
    const kept = dbMeasureLegacyHistoryCharge("thread-1", { runtimePage: true });
    expect(kept.scrollbackStoredBytes).toBe(bytes(transcript));
  });

  it("keeps every completed turn charged for the runtimePage variant", () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("project-1", "Project", "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        `INSERT INTO threads
           (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "project-1", "T", "claude", "{}", "idle", "none", "a", "b");
    const startedAt = "s".repeat(2 * 1024 * 1024);
    sqlite
      .prepare(
        `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("thread-1", 0, startedAt, "e", "item-0");
    const paged = dbMeasureLegacyHistoryCharge("thread-1", {
      runtimePage: true,
      omitScrollback: true,
    });
    expect(paged.completedTurnsStoredBytes).toBeGreaterThanOrEqual(bytes(startedAt));
  });

  it("charges the parent_item_id and stream-chunk key columns the history readers materialize", () => {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        `INSERT INTO projects (id, name, location_kind, location_path, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("project-1", "Project", "posix", "/tmp/p", "2026-01-01T00:00:00.000Z");
    sqlite
      .prepare(
        `INSERT INTO threads
           (id, project_id, title, agent_kind, config, status, attention, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", "project-1", "T", "claude", "{}", "idle", "none", "a", "b");
    const before = dbMeasureLegacyHistoryCharge("thread-1");
    const parentItemId = "p".repeat(64 * 1024);
    const chunkItemId = "i".repeat(64 * 1024);
    const streamName = "s".repeat(1024);
    sqlite
      .prepare(
        `INSERT INTO thread_runtime_items
           (thread_id, item_id, position, type, state, payload, parent_item_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", chunkItemId, 0, "tool_call", "completed", "{}", parentItemId);
    sqlite
      .prepare(
        `INSERT INTO thread_runtime_item_stream_chunks (thread_id, item_id, stream, seq, chars, text)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", chunkItemId, streamName, 0, 5, "chunk");
    const afterChunks = dbMeasureLegacyHistoryCharge("thread-1");
    // `dbReadThreadRuntimeItems` projects parent_item_id; the tail reader
    // projects the chunk's item_id and stream columns next to its text.
    expect(afterChunks.itemsStoredBytes - before.itemsStoredBytes).toBe(
      bytes(parentItemId) +
        bytes(chunkItemId) +
        bytes("tool_call") +
        bytes("completed") +
        bytes("{}"),
    );
    expect(afterChunks.streamTailStoredBytes - before.streamTailStoredBytes).toBe(
      bytes(chunkItemId) + bytes(streamName) + bytes("chunk"),
    );

    // The tail reader also projects `item_id`/`stream` from the elided-stream
    // state rows, but only for rows with `elided_chars > 0`.
    const elidedStream = "e".repeat(1024);
    sqlite
      .prepare(
        `INSERT INTO thread_runtime_item_stream_state
           (thread_id, item_id, stream, next_seq, tail_chars, elided_chars)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", chunkItemId, streamName, 1, 5, 7);
    sqlite
      .prepare(
        `INSERT INTO thread_runtime_item_stream_state
           (thread_id, item_id, stream, next_seq, tail_chars, elided_chars)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", chunkItemId, elidedStream, 2, 0, 3);
    sqlite
      .prepare(
        `INSERT INTO thread_runtime_item_stream_state
           (thread_id, item_id, stream, next_seq, tail_chars, elided_chars)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("thread-1", chunkItemId, "z".repeat(1024), 3, 0, 0);
    const afterState = dbMeasureLegacyHistoryCharge("thread-1");
    expect(afterState.streamTailStoredBytes - afterChunks.streamTailStoredBytes).toBe(
      bytes(chunkItemId) + bytes(streamName) + bytes(chunkItemId) + bytes(elidedStream),
    );
  });
});
