import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { settleOrphanedCrossagentRuns } from "./crossagentBootSettle";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbHasPendingThreadRuntimeWrites,
  dbReadRunningToolCallItems,
  dbReadThreadRuntimeItems,
} from "@/host/db/runtimeItems";
import { applyThreadRuntimeEventsNow } from "@/host/db/runtimeItemsWriter";

const THREAD_A = "thread-orphan-a";
const THREAD_B = "thread-orphan-b";

function crossagentStarted(threadId: string, itemId: string): RuntimeEvent {
  return {
    type: "item.started",
    threadId,
    itemId,
    itemType: "tool_call",
    payload: {
      name: "Crossagent · orphaned run",
      status: "running",
      isCrossagent: true,
      crossagentStatus: "running",
    },
  };
}

describe.skipIf(!sqliteAvailable)("Crossagent boot settle (real SQLite)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-crossagent-settle-test-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Settle project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    for (const id of [THREAD_A, THREAD_B]) {
      dbUpsertThread({ ...testThread(), id }, 0);
    }
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("settles only running Crossagent rows, leaving other delegated rows alone", () => {
    applyThreadRuntimeEventsNow(THREAD_A, [
      crossagentStarted(THREAD_A, "cross-orphan"),
      {
        type: "item.started",
        threadId: THREAD_A,
        itemId: "native-orphan",
        itemType: "tool_call",
        payload: { name: "Task", status: "running", isSubAgent: true },
      },
    ]);
    applyThreadRuntimeEventsNow(THREAD_B, [
      {
        type: "item.started",
        threadId: THREAD_B,
        itemId: "plain-tool",
        itemType: "tool_call",
        payload: { name: "Bash", status: "running" },
      },
      crossagentStarted(THREAD_B, "cross-done"),
      {
        type: "item.completed",
        threadId: THREAD_B,
        itemId: "cross-done",
        payload: {
          name: "Crossagent · finished run",
          status: "success",
          isCrossagent: true,
          crossagentStatus: "completed",
          result: "all good",
        },
      },
    ]);

    const report = settleOrphanedCrossagentRuns();

    expect(report).toMatchObject({ threads: 1, items: 1 });
    expect(report.settledBatches).toEqual([
      {
        threadId: THREAD_A,
        events: [
          expect.objectContaining({
            type: "item.completed",
            itemId: "cross-orphan",
            payload: expect.objectContaining({ crossagentStatus: "failed" }),
          }),
        ],
      },
    ]);

    const itemsA = new Map(dbReadThreadRuntimeItems(THREAD_A).map((item) => [item.id, item]));
    expect(itemsA.get("cross-orphan")).toMatchObject({
      state: "completed",
      payload: {
        name: "Crossagent · orphaned run",
        status: "error",
        isCrossagent: true,
        crossagentStatus: "failed",
        result: "Interrupted: the host restarted before this run completed.",
      },
    });
    // Native sub-agents belong to parent sessions, not the run manager: the
    // renderer reconciles those against session liveness, so they stay put.
    expect(itemsA.get("native-orphan")).toMatchObject({
      state: "started",
      payload: { status: "running" },
    });

    const itemsB = new Map(dbReadThreadRuntimeItems(THREAD_B).map((item) => [item.id, item]));
    expect(itemsB.get("plain-tool")).toMatchObject({ state: "started" });
    expect(itemsB.get("cross-done")).toMatchObject({
      state: "completed",
      payload: { status: "success", result: "all good" },
    });
  });

  it("is idempotent: a second pass finds nothing left to settle", () => {
    applyThreadRuntimeEventsNow(THREAD_A, [crossagentStarted(THREAD_A, "cross-orphan")]);

    const first = settleOrphanedCrossagentRuns();
    expect(first.threads).toBe(1);
    expect(first.items).toBe(1);
    expect(first.settledBatches).toHaveLength(1);
    const second = settleOrphanedCrossagentRuns();
    expect(second).toMatchObject({ threads: 0, items: 0 });
    expect(second.settledBatches).toEqual([]);
    // The running-row inventory the renderer's hydration gate relies on is
    // empty once the only running row has been settled.
    expect(dbReadRunningToolCallItems()).toEqual([]);
  });

  it("settles admitted-but-uncommitted starts: the pending prefix commits before the read", () => {
    // The dying supervisor's last item.started sits in the async drain
    // (admitted, not yet flushed). The sweep must commit the pending prefix
    // first, or the row would commit after the sweep and spin forever under
    // the renderer's preserveCrossagent hydration gate.
    const admission = dbApplyThreadRuntimeEvents(THREAD_A, [
      crossagentStarted(THREAD_A, "cross-in-drain"),
    ]);
    expect(admission.kind).toBe("accepted");
    expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(true);

    const report = settleOrphanedCrossagentRuns();

    expect(report).toMatchObject({ threads: 1, items: 1 });
    expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(false);
    expect(dbReadRunningToolCallItems()).toEqual([]);
    expect(
      new Map(dbReadThreadRuntimeItems(THREAD_A).map((i) => [i.id, i])).get("cross-in-drain"),
    ).toMatchObject({
      state: "completed",
      payload: { crossagentStatus: "failed" },
    });
  });

  it("settles updated-state orphans, counts multi-thread batches, and skips payloadless rows", () => {
    applyThreadRuntimeEventsNow(THREAD_A, [
      crossagentStarted(THREAD_A, "cross-updated"),
      {
        type: "item.updated",
        threadId: THREAD_A,
        itemId: "cross-updated",
        payload: { progress: { stepCount: 3 } },
      },
      crossagentStarted(THREAD_A, "cross-second"),
    ]);
    applyThreadRuntimeEventsNow(THREAD_B, [crossagentStarted(THREAD_B, "cross-other-thread")]);
    // A running tool_call with no payload at all must neither throw nor count.
    getSqlite()
      .prepare(
        `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams, parent_item_id)
         VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM thread_runtime_items WHERE thread_id = ?), 'tool_call', 'started', NULL, '{}', NULL)`,
      )
      .run(THREAD_B, "no-payload", THREAD_B);

    const report = settleOrphanedCrossagentRuns();

    expect(report).toMatchObject({ threads: 2, items: 3 });
    const itemsA = new Map(dbReadThreadRuntimeItems(THREAD_A).map((item) => [item.id, item]));
    expect(itemsA.get("cross-updated")).toMatchObject({
      state: "completed",
      payload: { crossagentStatus: "failed", progress: { stepCount: 3 } },
    });
    const itemsB = new Map(dbReadThreadRuntimeItems(THREAD_B).map((item) => [item.id, item]));
    expect(itemsB.get("no-payload")).toMatchObject({ state: "started" });
  });

  it("overwrites a streamed partial result with the interruption text", () => {
    applyThreadRuntimeEventsNow(THREAD_A, [
      crossagentStarted(THREAD_A, "cross-partial"),
      {
        type: "item.updated",
        threadId: THREAD_A,
        itemId: "cross-partial",
        payload: { result: "partial output streamed before the crash" },
      },
    ]);

    settleOrphanedCrossagentRuns();

    expect(
      new Map(dbReadThreadRuntimeItems(THREAD_A).map((item) => [item.id, item])).get(
        "cross-partial",
      ),
    ).toMatchObject({
      state: "completed",
      payload: {
        crossagentStatus: "failed",
        result: "Interrupted: the host restarted before this run completed.",
      },
    });
  });
});
