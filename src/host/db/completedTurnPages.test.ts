import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dbReadCompletedTurnPhase1,
  dbReadCompletedTurnPhase2,
  type MaterializedCompletedTurn,
} from "./completedTurnPages";
import { closeDatabase, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbAppendThreadCompletedTurn,
  dbReplaceThreadCompletedTurns,
  dbReplaceThreadRuntimeItems,
  dbTruncateThreadRuntimeAfter,
  type PersistedCompletedTurn,
} from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";

function turn(index: number, anchor: string | null = `item-${index}`): PersistedCompletedTurn {
  const hour = String(Math.floor(index / 60)).padStart(2, "0");
  const minute = String(index % 60).padStart(2, "0");
  return {
    startedAt: `2026-01-01T${hour}:${minute}:00.000Z`,
    endedAt: `2026-01-01T${hour}:${minute}:30.000Z`,
    anchorItemId: anchor,
  };
}

/** Walks the exact continuation protocol: newest page, then `idx < cursor`. */
function walk(cursors: Array<number | undefined>, limit: number): MaterializedCompletedTurn[][] {
  return cursors.map((cursorIdx) => {
    const phase1 = dbReadCompletedTurnPhase1("thread-1", {
      limit,
      ...(cursorIdx !== undefined ? { beforeIdx: cursorIdx } : {}),
    });
    return dbReadCompletedTurnPhase2(
      "thread-1",
      phase1.rows.map((row) => row.idx),
    );
  });
}

describe.skipIf(!sqliteAvailable)("B4 bounded completed-turn pages", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-b4-turns-db-"));
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

  it("returns the newest window in idx order and an exclusive continuation window", () => {
    dbReplaceThreadCompletedTurns(
      "thread-1",
      Array.from({ length: 25 }, (_, index) =>
        turn(index, index % 2 === 0 ? null : `item-${index}`),
      ),
    );

    const phase1 = dbReadCompletedTurnPhase1("thread-1", { limit: 10 });
    expect(phase1.rows.map((row) => row.idx)).toEqual([24, 23, 22, 21, 20, 19, 18, 17, 16, 15]);
    expect(phase1.moreBeyondWindow).toBe(true);

    const materialized = dbReadCompletedTurnPhase2(
      "thread-1",
      phase1.rows.map((row) => row.idx),
    );
    expect(materialized.map((row) => row.idx)).toEqual([24, 23, 22, 21, 20, 19, 18, 17, 16, 15]);
    // Anchorless turns are preserved exactly.
    expect(materialized.find((row) => row.idx === 24)?.anchorItemId).toBeNull();
    expect(materialized.find((row) => row.idx === 23)?.anchorItemId).toBe("item-23");

    const older = dbReadCompletedTurnPhase1("thread-1", { limit: 10, beforeIdx: 15 });
    expect(older.rows.map((row) => row.idx)).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
    expect(older.moreBeyondWindow).toBe(true);
    const oldest = dbReadCompletedTurnPhase1("thread-1", { limit: 10, beforeIdx: 5 });
    expect(oldest.rows.map((row) => row.idx)).toEqual([4, 3, 2, 1, 0]);
    expect(oldest.moreBeyondWindow).toBe(false);
  });

  it("walks every page with a monotone cursor and no duplicates or holes", () => {
    dbReplaceThreadCompletedTurns(
      "thread-1",
      Array.from({ length: 457 }, (_, index) => turn(index)),
    );

    const seen: number[] = [];
    let cursorIdx: number | undefined;
    for (let page = 0; page < 100; page += 1) {
      const phase1 = dbReadCompletedTurnPhase1("thread-1", {
        limit: 200,
        ...(cursorIdx !== undefined ? { beforeIdx: cursorIdx } : {}),
      });
      if (phase1.rows.length === 0) break;
      const materialized = dbReadCompletedTurnPhase2(
        "thread-1",
        phase1.rows.map((row) => row.idx),
      );
      // Pages are ascending by idx and strictly older than the previous cursor.
      const ascending = [...materialized].reverse();
      expect(ascending.map((row) => row.idx)).toEqual(
        [...ascending.map((row) => row.idx)].sort((a, b) => a - b),
      );
      expect(cursorIdx === undefined || ascending.at(-1)!.idx < cursorIdx).toBe(true);
      seen.push(...ascending.map((row) => row.idx));
      if (!phase1.moreBeyondWindow) break;
      cursorIdx = phase1.rows.at(-1)!.idx;
    }
    expect([...seen].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 457 }, (_, index) => index),
    );
    expect(new Set(seen).size).toBe(457);
  });

  it("returns an empty page at the end and null cursor semantics", () => {
    dbReplaceThreadCompletedTurns("thread-1", [turn(0), turn(1)]);
    const past = dbReadCompletedTurnPhase1("thread-1", { limit: 10, beforeIdx: 0 });
    expect(past.rows).toEqual([]);
    expect(past.moreBeyondWindow).toBe(false);
  });

  it("keeps continuation exact across a snapshot replace (idx renumbering)", () => {
    const original = Array.from({ length: 300 }, (_, index) => turn(index));
    dbReplaceThreadCompletedTurns("thread-1", original);

    // Client loaded the tail and holds a continuation cursor.
    const tail = dbReadCompletedTurnPhase1("thread-1", { limit: 200 });
    const cursorIdx = tail.rows.at(-1)!.idx;

    // Reset replaces the turn level: the retained prefix plus newer turns.
    const merged = [
      ...original.slice(0, 280),
      ...Array.from({ length: 20 }, (_, i) => turn(280 + i)),
    ];
    dbReplaceThreadCompletedTurns("thread-1", merged);

    const continuation = dbReadCompletedTurnPhase2(
      "thread-1",
      dbReadCompletedTurnPhase1("thread-1", { limit: 200, beforeIdx: cursorIdx }).rows.map(
        (row) => row.idx,
      ),
    );
    expect(continuation.length).toBeGreaterThan(0);
    expect(continuation.map((row) => row.idx)).toEqual(
      [...continuation.map((row) => row.idx)].sort((a, b) => b - a),
    );

    // Mirror of the client merge rule: dedupe by (startedAt, endedAt), keep
    // ascending. The union is lossless regardless of the renumbering.
    const byTimestamps = new Map<string, PersistedCompletedTurn>();
    for (const source of [continuation, merged]) {
      for (const record of source) {
        byTimestamps.set(`${record.startedAt}|${record.endedAt}`, {
          startedAt: record.startedAt,
          endedAt: record.endedAt,
          anchorItemId: record.anchorItemId,
        });
      }
    }
    const union = [...byTimestamps.values()].sort((a, b) =>
      `${a.startedAt}|${a.endedAt}`.localeCompare(`${b.startedAt}|${b.endedAt}`),
    );
    expect(union).toHaveLength(300);
  });

  it("drops continuation rows removed by a transcript truncate", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      { id: "keep", type: "assistant_message", state: "completed", streams: {} },
      { id: "cut-1", type: "assistant_message", state: "completed", streams: {} },
      { id: "cut-2", type: "assistant_message", state: "completed", streams: {} },
    ]);
    const turns = [
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:30.000Z",
        anchorItemId: "keep",
      },
      {
        startedAt: "2026-01-01T00:01:00.000Z",
        endedAt: "2026-01-01T00:01:30.000Z",
        anchorItemId: "cut-1",
      },
      {
        startedAt: "2026-01-01T00:02:00.000Z",
        endedAt: "2026-01-01T00:02:30.000Z",
        anchorItemId: "cut-2",
      },
    ];
    dbReplaceThreadCompletedTurns("thread-1", turns);

    const truncate = dbTruncateThreadRuntimeAfter("thread-1", "keep");
    expect(truncate.truncated).toBe(true);
    expect(truncate.removedCompletedTurnAnchors.sort()).toEqual(["cut-1", "cut-2"]);

    const remaining = dbReadCompletedTurnPhase2(
      "thread-1",
      dbReadCompletedTurnPhase1("thread-1", { limit: 10 }).rows.map((row) => row.idx),
    );
    expect(remaining.map((row) => row.anchorItemId)).toEqual(["keep"]);
    // A continuation cursor issued before the truncate reads the committed turn
    // rows exactly: the removed anchors are gone and nothing is fabricated.
    const staleCursor = dbReadCompletedTurnPhase2(
      "thread-1",
      dbReadCompletedTurnPhase1("thread-1", { limit: 10, beforeIdx: 3 }).rows.map((row) => row.idx),
    );
    expect(staleCursor.map((row) => row.anchorItemId)).toEqual(["keep"]);
    expect(staleCursor.map((row) => row.startedAt)).toEqual([turns[0]!.startedAt]);
  });

  it("keeps the existing startedAt/endedAt append dedupe semantics", () => {
    dbAppendThreadCompletedTurn("thread-1", turn(0));
    const before = dbReadCompletedTurnPhase1("thread-1", { limit: 10 });
    dbAppendThreadCompletedTurn("thread-1", {
      startedAt: turn(0).startedAt,
      endedAt: turn(0).endedAt,
      anchorItemId: "different-anchor",
    });
    const after = dbReadCompletedTurnPhase1("thread-1", { limit: 10 });
    expect(after.rows).toHaveLength(before.rows.length);
    expect(after.rows[0]!.anchorItemId).toBe("item-0");
    // Sanity: the phase-1 bound dominates the serialized rows.
    for (const row of after.rows) {
      expect(row.boundWireBytes).toBeGreaterThan(
        JSON.stringify({
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          anchorItemId: row.anchorItemId,
        }).length,
      );
    }
  });

  it("walks pages with a monotone cursor through the walk helper", () => {
    dbReplaceThreadCompletedTurns(
      "thread-1",
      Array.from({ length: 5 }, (_, i) => turn(i)),
    );
    const [newest, older] = walk([undefined, 2], 3);
    expect(newest!.map((row) => row.idx)).toEqual([4, 3, 2]);
    expect(older!.map((row) => row.idx)).toEqual([1, 0]);
  });

  it("computes lower bounds that never exceed the actual serialized turn", () => {
    // A hostile anchor id and a valid-Unicode timestamp: both are emitted
    // verbatim, so their exact escaped literals are a sound lower bound.
    dbReplaceThreadCompletedTurns("thread-1", [
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:00:30.000Z",
        anchorItemId: `界${"x".repeat(2_000_000)}`,
      },
      {
        startedAt: "2026-01-01T00:01:00.000Z",
        endedAt: "2026-01-01T00:01:30.000Z",
        anchorItemId: null,
      },
      {
        startedAt: "2026-01-01T00:02:00.000Z",
        endedAt: "2026-01-01T00:02:30.000Z",
        anchorItemId: "😀".repeat(100_000),
      },
    ]);
    const phase1 = dbReadCompletedTurnPhase1("thread-1", { limit: 10 });
    const materialized = dbReadCompletedTurnPhase2(
      "thread-1",
      phase1.rows.map((row) => row.idx),
    );
    for (const row of phase1.rows) {
      const actual = materialized.find((candidate) => candidate.idx === row.idx)!;
      const serialized = JSON.stringify({
        startedAt: actual.startedAt,
        endedAt: actual.endedAt,
        anchorItemId: actual.anchorItemId,
      });
      expect(row.lowerBoundWireBytes).toBeLessThanOrEqual(Buffer.byteLength(serialized));
      expect(row.lowerBoundDecodeBytes).toBeLessThanOrEqual(serialized.length * 2);
      expect(row.boundWireBytes).toBeGreaterThanOrEqual(Buffer.byteLength(serialized));
    }
    const huge = phase1.rows.find((row) => row.anchorItemId?.startsWith("界"))!;
    expect(huge.lowerBoundWireBytes).toBeGreaterThan(2_000_000);
  });
});
