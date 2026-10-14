import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent, ToolCallPayload } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { settleOrphanedDelegatedAgentRuns } from "./delegatedAgentBootSettle";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbGetThread, dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbHasPendingThreadRuntimeWrites,
  dbReadRunningToolCallItems,
  dbReadThreadRuntimeItems,
} from "@/host/db/runtimeItems";
import { applyThreadRuntimeEventsNow } from "@/host/db/runtimeItemsWriter";
import {
  beginRuntimeFence,
  markRuntimeRebaseDropped,
  releaseRuntimeFence,
} from "@/host/db/runtimePersistenceRuntime";

const THREAD_A = "thread-orphan-a";
const THREAD_B = "thread-orphan-b";
const INTERRUPTION = msg("runtime.delegatedAgentInterrupted");

function started(
  threadId: string,
  itemId: string,
  payload: ToolCallPayload = { name: "Delegate", status: "running", isSubAgent: true },
): Extract<RuntimeEvent, { type: "item.started" }> {
  return { type: "item.started", threadId, itemId, itemType: "tool_call", payload };
}

function crossagentStarted(threadId: string, itemId: string): RuntimeEvent {
  return started(threadId, itemId, {
    name: "Crossagent · orphaned run",
    status: "running",
    isCrossagent: true,
    crossagentStatus: "running",
  });
}

function items(threadId: string) {
  return new Map(dbReadThreadRuntimeItems(threadId).map((item) => [item.id, item]));
}

describe.skipIf(!sqliteAvailable)("delegated-agent boot settle (real SQLite)", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-delegated-settle-test-"));
    dbPath = join(dir, "state.sqlite");
    initDatabase(dbPath);
    dbUpsertProject(
      {
        id: "project-1",
        name: "Settle project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    for (const id of [THREAD_A, THREAD_B]) dbUpsertThread({ ...testThread(), id }, 0);
  });

  afterEach(() => {
    getSqlite().pragma("query_only = OFF");
    getSqlite().exec("DROP TRIGGER IF EXISTS settle_prefix_failure");
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    vi.restoreAllMocks();
  });

  it("settles native and Crossagent rows while preserving ordinary and raw MCP tools", () => {
    applyThreadRuntimeEventsNow(THREAD_A, [
      crossagentStarted(THREAD_A, "cross"),
      started(THREAD_A, "native"),
      started(THREAD_A, "classified", {
        name: "Delegate",
        status: "running",
        args: { agentType: "explorer" },
      }),
      started(THREAD_A, "workflow", { name: "Workflow", status: "running" }),
    ]);
    applyThreadRuntimeEventsNow(THREAD_B, [
      started(THREAD_B, "plain", { name: "Bash", status: "running" }),
      started(THREAD_B, "raw-mcp", {
        name: "mcp__crossagents__spawn_agent",
        status: "running",
        isCrossagent: true,
      }),
      started(THREAD_B, "other-mcp", {
        name: "delegate",
        serverId: "other",
        status: "running",
        isSubAgent: true,
      }),
    ]);
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ threads: 1, items: 4 });
    expect(items(THREAD_A).get("cross")).toMatchObject({
      state: "completed",
      payload: { status: "error", crossagentStatus: "failed", result: INTERRUPTION },
    });
    for (const id of ["native", "classified", "workflow"])
      expect(items(THREAD_A).get(id)).toMatchObject({
        state: "completed",
        payload: { status: "error", result: { error: INTERRUPTION } },
      });
    for (const item of items(THREAD_B).values()) expect(item.state).toBe("started");
  });

  it("preserves terminal payload evidence and genuinely completed rows", () => {
    applyThreadRuntimeEventsNow(THREAD_A, [
      started(THREAD_A, "native-done"),
      {
        type: "item.completed",
        threadId: THREAD_A,
        itemId: "native-done",
        payload: { status: "success", result: "all good" },
      },
      started(THREAD_A, "native-error", {
        name: "Delegate",
        isSubAgent: true,
        status: "error",
        result: { error: "real error" },
      }),
      started(THREAD_A, "cross-done", {
        name: "Crossagent",
        isCrossagent: true,
        status: "running",
        crossagentStatus: "completed",
        result: "finished",
      }),
      started(THREAD_A, "cross-cancelled", {
        name: "Crossagent",
        isCrossagent: true,
        status: "running",
        crossagentStatus: "cancelled",
      }),
    ]);
    const before = dbReadThreadRuntimeItems(THREAD_A);
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ threads: 0, items: 0 });
    expect(dbReadThreadRuntimeItems(THREAD_A)).toEqual(before);
  });

  it("repairs previous stored completed/status-running rows after reopening SQLite", () => {
    applyThreadRuntimeEventsNow(THREAD_A, [
      started(THREAD_A, "legacy-native"),
      crossagentStarted(THREAD_A, "legacy-cross"),
    ]);
    applyThreadRuntimeEventsNow(THREAD_A, [
      {
        type: "item.completed",
        threadId: THREAD_A,
        itemId: "legacy-native",
        payload: { status: "running" },
      },
      {
        type: "item.completed",
        threadId: THREAD_A,
        itemId: "legacy-cross",
        payload: { status: "running" },
      },
    ]);
    const schema = getSqlite().pragma("user_version", { simple: true });
    const thread = dbGetThread(THREAD_A);
    closeDatabase();
    initDatabase(dbPath);
    expect(dbReadRunningToolCallItems(THREAD_A)).toHaveLength(2);
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ threads: 1, items: 2 });
    expect(getSqlite().pragma("user_version", { simple: true })).toBe(schema);
    expect(dbGetThread(THREAD_A)).toEqual(thread);
    closeDatabase();
    initDatabase(dbPath);
    expect(items(THREAD_A).get("legacy-native")).toMatchObject({
      state: "completed",
      payload: { status: "error" },
    });
    expect(settleOrphanedDelegatedAgentRuns()).toEqual({
      threads: 0,
      items: 0,
      settledBatches: [],
    });
  });

  it("retains args, metadata, parent, streams and existing results verbatim", () => {
    const payload = {
      name: "Delegate",
      status: "running" as const,
      isSubAgent: true,
      args: { prompt: "inspect", agentType: "explorer" },
      result: { output: "partial" },
      progress: { stepCount: 3 },
      description: "original description",
    };
    applyThreadRuntimeEventsNow(THREAD_A, [
      { ...started(THREAD_A, "native", payload), parentItemId: "parent" },
      {
        type: "content.delta",
        threadId: THREAD_A,
        itemId: "native",
        stream: "command_output",
        delta: "streamed text",
      },
      crossagentStarted(THREAD_A, "cross"),
      {
        type: "item.updated",
        threadId: THREAD_A,
        itemId: "cross",
        payload: { result: "partial run output", progress: { stepCount: 2 } },
      },
    ]);
    const before = items(THREAD_A);
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ items: 2 });
    expect(items(THREAD_A).get("native")).toEqual({
      ...before.get("native"),
      state: "completed",
      payload: { ...payload, status: "error" },
    });
    expect(items(THREAD_A).get("cross")).toMatchObject({
      state: "completed",
      payload: {
        result: "partial run output",
        progress: { stepCount: 2 },
        crossagentStatus: "failed",
      },
    });
  });

  it("commits pending starts before reading, including threads absent from the inventory", () => {
    expect(
      dbApplyThreadRuntimeEvents(THREAD_A, [
        started(THREAD_A, "pending-native"),
        crossagentStarted(THREAD_A, "pending-cross"),
      ]).kind,
    ).toBe("accepted");
    expect(dbReadRunningToolCallItems()).toEqual([]);
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ threads: 1, items: 2 });
    expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(false);
    expect(dbReadRunningToolCallItems()).toEqual([]);
  });

  it("commits a pending terminal event before classifying its row", () => {
    applyThreadRuntimeEventsNow(THREAD_A, [
      started(THREAD_A, "native"),
      crossagentStarted(THREAD_A, "cross"),
    ]);
    dbApplyThreadRuntimeEvents(THREAD_A, [
      {
        type: "item.completed",
        threadId: THREAD_A,
        itemId: "native",
        payload: { status: "success", result: "finished" },
      },
      {
        type: "item.completed",
        threadId: THREAD_A,
        itemId: "cross",
        payload: { status: "success", crossagentStatus: "completed", result: "finished" },
      },
    ]);
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ items: 0 });
    expect(items(THREAD_A).get("native")).toMatchObject({
      payload: { status: "success", result: "finished" },
    });
    expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(false);
  });

  it("skips a failed prefix without writing behind it, while unaffected threads progress", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    applyThreadRuntimeEventsNow(THREAD_A, [started(THREAD_A, "native")]);
    applyThreadRuntimeEventsNow(THREAD_B, [crossagentStarted(THREAD_B, "cross")]);
    dbApplyThreadRuntimeEvents(THREAD_A, [
      {
        type: "item.completed",
        threadId: THREAD_A,
        itemId: "native",
        payload: { status: "success", result: "completed before crash" },
      },
    ]);
    getSqlite().exec(`CREATE TRIGGER settle_prefix_failure BEFORE UPDATE ON thread_runtime_items
      WHEN NEW.thread_id = '${THREAD_A}' BEGIN SELECT RAISE(ABORT, 'prefix failure'); END;`);
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ threads: 1, items: 1 });
    expect(items(THREAD_A).get("native")).toMatchObject({
      state: "started",
      payload: { status: "running" },
    });
    expect(dbHasPendingThreadRuntimeWrites(THREAD_A)).toBe(true);
    expect(items(THREAD_B).get("cross")).toMatchObject({ state: "completed" });
    getSqlite().exec("DROP TRIGGER settle_prefix_failure");
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ items: 0 });
    expect(items(THREAD_A).get("native")).toMatchObject({
      payload: { status: "success", result: "completed before crash" },
    });
  });

  it("refuses contaminated threads even with no pending prefix", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    applyThreadRuntimeEventsNow(THREAD_A, [started(THREAD_A, "native")]);
    applyThreadRuntimeEventsNow(THREAD_B, [started(THREAD_B, "native")]);
    markRuntimeRebaseDropped(THREAD_A);
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ threads: 1, items: 1 });
    expect(items(THREAD_A).get("native")).toMatchObject({
      state: "started",
      payload: { status: "running" },
    });
    expect(items(THREAD_B).get("native")).toMatchObject({ state: "completed" });
  });

  it("reports a deferred capture while an in-flight read fence owns the thread", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    applyThreadRuntimeEventsNow(THREAD_A, [started(THREAD_A, "native")]);
    applyThreadRuntimeEventsNow(THREAD_B, [crossagentStarted(THREAD_B, "cross")]);
    const fence = beginRuntimeFence(THREAD_A);
    try {
      expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ threads: 1, items: 1 });
      expect(items(THREAD_A).get("native")).toMatchObject({ state: "started" });
    } finally {
      releaseRuntimeFence(fence);
    }
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ threads: 1, items: 1 });
    expect(settleOrphanedDelegatedAgentRuns()).toEqual({
      threads: 0,
      items: 0,
      settledBatches: [],
    });
  });

  it("does not publish uncommitted settlements when the writer refuses storage", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    applyThreadRuntimeEventsNow(THREAD_A, [started(THREAD_A, "native")]);
    getSqlite().pragma("query_only = ON");
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({
      threads: 0,
      items: 0,
      settledBatches: [],
    });
    expect(items(THREAD_A).get("native")).toMatchObject({ state: "started" });
    getSqlite().pragma("query_only = OFF");
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ items: 1 });
  });

  it("ignores malformed and payloadless historical rows without aborting healthy rows", () => {
    applyThreadRuntimeEventsNow(THREAD_A, [started(THREAD_A, "native")]);
    getSqlite()
      .prepare(`INSERT INTO thread_runtime_items
      (thread_id, item_id, position, type, state, payload, streams, parent_item_id)
      VALUES (?, ?, ?, 'tool_call', ?, ?, '{}', NULL)`)
      .run(THREAD_A, "malformed", 2, "completed", "not json");
    getSqlite()
      .prepare(`INSERT INTO thread_runtime_items
      (thread_id, item_id, position, type, state, payload, streams, parent_item_id)
      VALUES (?, ?, ?, 'tool_call', ?, ?, '{}', NULL)`)
      .run(THREAD_A, "no-payload", 3, "started", null);
    expect(settleOrphanedDelegatedAgentRuns()).toMatchObject({ items: 1 });
    expect(items(THREAD_A).get("malformed")).toMatchObject({ state: "completed" });
    expect(items(THREAD_A).get("no-payload")).toMatchObject({ state: "started" });
  });
});
