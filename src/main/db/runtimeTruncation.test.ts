import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbAppendThreadCompletedTurn,
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetThreadCompletedTurns,
  dbGetThreadRuntimeItems,
  dbTruncateThreadRuntimeAfter,
} from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";

describe.skipIf(!sqliteAvailable)("dbTruncateThreadRuntimeAfter mutation contract", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-truncate-db-test-"));
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
    dbUpsertThread(testThread(), 0);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function seedItems(ids: string[]): void {
    dbApplyThreadRuntimeEvents(
      "thread-1",
      ids.map((itemId) => ({
        type: "item.started" as const,
        threadId: "thread-1",
        itemId,
        itemType: "assistant_message" as const,
      })),
    );
  }

  function appendTurn(anchorItemId: string | null, index: number): void {
    dbAppendThreadCompletedTurn("thread-1", {
      startedAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
      endedAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}.500Z`,
      anchorItemId,
    });
  }

  it("is an absolute no-op when the checkpoint does not exist", () => {
    seedItems(["item-a", "item-b"]);
    appendTurn("item-b", 0);

    expect(dbTruncateThreadRuntimeAfter("thread-1", "missing-item")).toEqual({
      truncated: false,
      removedCompletedTurnAnchors: [],
    });
    expect(dbGetThreadRuntimeItems("thread-1").map((item) => item.id)).toEqual([
      "item-a",
      "item-b",
    ]);
    expect(dbGetThreadCompletedTurns("thread-1")).toHaveLength(1);
  });

  it("is an absolute no-op when the checkpoint is already the last item, leaving orphan turns untouched", () => {
    // Orphaned turn: its anchor is not in the transcript (removed by an
    // earlier mutation). A truncate that removes no tail items must not clean
    // it up or report it — the reported metadata must never diverge from the
    // rows this call actually deleted.
    seedItems(["item-a", "item-b"]);
    appendTurn("item-b", 0);
    appendTurn("removed-elsewhere", 1);

    expect(dbTruncateThreadRuntimeAfter("thread-1", "item-b")).toEqual({
      truncated: false,
      removedCompletedTurnAnchors: [],
    });
    expect(dbGetThreadRuntimeItems("thread-1").map((item) => item.id)).toEqual([
      "item-a",
      "item-b",
    ]);
    expect(dbGetThreadCompletedTurns("thread-1")).toHaveLength(2);
  });

  it("removes exactly the tail items and the completed turns anchored on them", () => {
    seedItems(["item-a", "item-b", "item-c", "item-d"]);
    appendTurn("item-a", 0);
    appendTurn("item-c", 1);
    appendTurn("item-d", 2);

    expect(dbTruncateThreadRuntimeAfter("thread-1", "item-b")).toEqual({
      truncated: true,
      removedCompletedTurnAnchors: ["item-c", "item-d"],
    });
    expect(dbGetThreadRuntimeItems("thread-1").map((item) => item.id)).toEqual([
      "item-a",
      "item-b",
    ]);
    expect(dbGetThreadCompletedTurns("thread-1").map((turn) => turn.anchorItemId)).toEqual([
      "item-a",
    ]);
  });

  it("does not report or delete turns orphaned by earlier mutations during a real truncation", () => {
    seedItems(["item-a", "item-b", "item-c"]);
    appendTurn("item-c", 0);
    appendTurn("removed-elsewhere", 1);

    expect(dbTruncateThreadRuntimeAfter("thread-1", "item-a")).toEqual({
      truncated: true,
      removedCompletedTurnAnchors: ["item-c"],
    });
    expect(dbGetThreadCompletedTurns("thread-1").map((turn) => turn.anchorItemId)).toEqual([
      "removed-elsewhere",
    ]);
  });

  it("reports an actual truncation with an empty anchor list when no turns were anchored on the tail", () => {
    seedItems(["item-a", "item-b"]);
    appendTurn("item-a", 0);

    expect(dbTruncateThreadRuntimeAfter("thread-1", "item-a")).toEqual({
      truncated: true,
      removedCompletedTurnAnchors: [],
    });
    expect(dbGetThreadRuntimeItems("thread-1").map((item) => item.id)).toEqual(["item-a"]);
    expect(dbGetThreadCompletedTurns("thread-1")).toHaveLength(1);
  });
  it("handles large tails without exceeding SQLite parameter limits", () => {
    seedItems(["checkpoint"]);
    dbFlushThreadRuntimeWrites("thread-1");
    const sqlite = getSqlite();
    const insertItem = sqlite.prepare(
      "INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state) VALUES ('thread-1', ?, ?, 'assistant_message', 'completed')",
    );
    const insertTurn = sqlite.prepare(
      "INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id) VALUES ('thread-1', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z', ?)",
    );
    const tailCount = 40_000;
    sqlite.transaction(() => {
      for (let index = 0; index < tailCount; index += 1) {
        const itemId = `large-${index}`;
        insertItem.run(itemId, index + 1);
        insertTurn.run(index, itemId);
      }
    })();
    const result = dbTruncateThreadRuntimeAfter("thread-1", "checkpoint");
    expect(result.truncated).toBe(true);
    expect(result.removedCompletedTurnAnchors).toHaveLength(tailCount);
    expect(dbGetThreadRuntimeItems("thread-1").map((item) => item.id)).toEqual(["checkpoint"]);
    expect(dbGetThreadCompletedTurns("thread-1")).toEqual([]);
  });

  it("rolls back turn deletion if deleting the runtime tail fails", () => {
    seedItems(["item-a", "item-b"]);
    appendTurn("item-b", 0);
    dbFlushThreadRuntimeWrites("thread-1");
    getSqlite().exec(
      "CREATE TRIGGER reject_truncate BEFORE DELETE ON thread_runtime_items BEGIN SELECT RAISE(ABORT, 'blocked truncate'); END",
    );
    expect(() => dbTruncateThreadRuntimeAfter("thread-1", "item-a")).toThrow("blocked truncate");
    expect(dbGetThreadRuntimeItems("thread-1").map((item) => item.id)).toEqual([
      "item-a",
      "item-b",
    ]);
    expect(dbGetThreadCompletedTurns("thread-1").map((turn) => turn.anchorItemId)).toEqual([
      "item-b",
    ]);
  });
});
