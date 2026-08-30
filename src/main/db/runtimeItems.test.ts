import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { LATEST_SCHEMA_VERSION } from "./migrations";
import { dbDeleteThread, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetLatestThreadGoalItem,
  dbGetThreadContextUsage,
  dbGetLatestThreadRuntimeAnchorItemId,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeItemsPage,
  dbReplaceThreadRuntimeItems,
  dbTruncateThreadRuntimeAfter,
} from "./runtimeItems";
import { HEAD_CHARS, TAIL_CHARS } from "./runtimeStreamCap";

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

function testThread(): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Runtime persistence",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "working",
    attention: "working",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe.skipIf(!sqliteAvailable)("runtimeItems incremental persistence", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-runtime-db-test-"));
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

  it("applies streamed item and context updates without replacing the transcript", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "assistant-1",
        itemType: "assistant_message",
        payload: { model: "gpt-5" },
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "assistant-1",
        stream: "assistant_text",
        delta: "hello ",
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "assistant-1",
        stream: "assistant_text",
        delta: "world",
      },
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "assistant-1",
        payload: { finishReason: "stop" },
      },
      {
        type: "item.completed",
        threadId: "thread-1",
        itemId: "assistant-1",
      },
      {
        type: "context.updated",
        threadId: "thread-1",
        usage: { usedTokens: 125, maxTokens: 1000 },
      },
    ]);

    expect(dbGetThreadRuntimeItems("thread-1")).toEqual([
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        payload: { model: "gpt-5", finishReason: "stop" },
        streams: { assistant_text: "hello world" },
      },
    ]);
    expect(dbGetThreadContextUsage("thread-1")).toEqual({
      usedTokens: 125,
      maxTokens: 1000,
    });
  });

  it("deduplicates repeated item starts and removes empty completed reasoning", () => {
    const start = {
      type: "item.started" as const,
      threadId: "thread-1",
      itemId: "reasoning-1",
      itemType: "reasoning" as const,
    };
    dbApplyThreadRuntimeEvents("thread-1", [start, start]);
    expect(dbGetThreadRuntimeItems("thread-1")).toHaveLength(1);

    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.completed",
        threadId: "thread-1",
        itemId: "reasoning-1",
      },
    ]);
    expect(dbGetThreadRuntimeItems("thread-1")).toEqual([]);
  });

  it("prunes only trailing top-level reasoning after an interrupted turn", () => {
    dbReplaceThreadRuntimeItems("thread-1", [
      { id: "reasoning-before", type: "reasoning", state: "completed", streams: {} },
      { id: "assistant-1", type: "assistant_message", state: "completed", streams: {} },
      { id: "reasoning-after", type: "reasoning", state: "completed", streams: {} },
      { id: "plan-1", type: "plan", state: "completed", streams: {} },
      { id: "error-1", type: "error", state: "completed", streams: {} },
      {
        id: "child-reasoning",
        type: "reasoning",
        state: "completed",
        streams: {},
        parentItemId: "tool-1",
      },
    ]);

    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "turn.completed",
        threadId: "thread-1",
        turnId: "turn-1",
        state: "interrupted",
      },
    ]);

    expect(dbGetThreadRuntimeItems("thread-1").map((item) => item.id)).toEqual([
      "reasoning-before",
      "assistant-1",
      "plan-1",
      "error-1",
      "child-reasoning",
    ]);
  });

  it("persists an open request so a snapshot can recover it, then retires it on resolve", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "request.opened",
        threadId: "thread-1",
        requestId: "req-1",
        requestType: "tool_user_input",
        payload: { summary: "Which framework?", multiSelect: false },
      },
    ]);

    // The open request is persisted as a non-rendered runtime item keyed by
    // request id, carrying the payload the recovery path reads back.
    expect(dbGetThreadRuntimeItems("thread-1")).toEqual([
      {
        id: "pending_request:req-1",
        type: "pending_request",
        state: "started",
        payload: {
          requestId: "req-1",
          requestType: "tool_user_input",
          payload: { summary: "Which framework?", multiSelect: false },
        },
        streams: {},
      },
    ]);

    // It must survive the paginated read the narrow PWA uses to open a thread,
    // otherwise snapshot recovery would never see it.
    const page = dbGetThreadRuntimeItemsPage("thread-1", undefined, 500, 40);
    expect(page.items.map((item) => item.id)).toContain("pending_request:req-1");

    // Resolving the request retires the item so it is no longer recoverable.
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "request.resolved",
        threadId: "thread-1",
        requestId: "req-1",
        outcome: "answered",
      },
    ]);
    expect(dbGetThreadRuntimeItems("thread-1")[0]?.state).toBe("completed");
  });

  it("does not count request items toward the narrow PWA timeline target", () => {
    dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "assistant-0",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Earlier answer" },
      },
      ...Array.from({ length: 45 }, (_, index) => ({
        id: `pending_request:completed-${index}`,
        type: "pending_request",
        state: "completed" as const,
        payload: {
          requestId: `completed-${index}`,
          requestType: "tool_user_input",
          payload: { summary: "Answered question" },
        },
        streams: {},
      })),
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Latest answer" },
      },
      {
        id: "pending_request:active",
        type: "pending_request",
        state: "started",
        payload: {
          requestId: "active",
          requestType: "tool_user_input",
          payload: { summary: "Current question" },
        },
        streams: {},
      },
    ]);

    const page = dbGetThreadRuntimeItemsPage("thread-1", undefined, 500, 40);
    expect(
      page.items.filter((item) => item.type === "assistant_message").map((item) => item.id),
    ).toEqual(["assistant-0", "assistant-1"]);
    expect(page.items.map((item) => item.id)).toContain("pending_request:active");
  });

  it("does not use a hidden request item as a completed-turn anchor", () => {
    dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Visible answer" },
      },
      {
        id: "pending_request:req-1",
        type: "pending_request",
        state: "completed",
        payload: {
          requestId: "req-1",
          requestType: "tool_user_input",
          payload: { summary: "Interrupted question" },
        },
        streams: {},
      },
    ]);

    expect(dbGetLatestThreadRuntimeAnchorItemId("thread-1")).toBe("assistant-1");
  });

  it("persists a provider handoff divider and keeps it out of the turn anchor", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "assistant-1",
        itemType: "assistant_message",
        payload: { content: [{ kind: "text", text: "Answer from the first provider" }] },
      },
      { type: "item.completed", threadId: "thread-1", itemId: "assistant-1" },
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "handoff-1",
        itemType: "provider_handoff",
        payload: {
          fromAgentKind: "claude",
          toAgentKind: "copilot",
          at: "2026-08-29T00:00:00.000Z",
        },
      },
      { type: "item.completed", threadId: "thread-1", itemId: "handoff-1" },
    ]);

    const items = dbGetThreadRuntimeItems("thread-1");
    expect(items.map((item) => item.type)).toEqual(["assistant_message", "provider_handoff"]);
    expect(items.at(-1)?.payload).toMatchObject({
      fromAgentKind: "claude",
      toAgentKind: "copilot",
    });
    // The divider records no work, so a completed turn must still hang off the
    // assistant row that produced it.
    expect(dbGetLatestThreadRuntimeAnchorItemId("thread-1")).toBe("assistant-1");
  });

  it("retires a still-open request item when the turn completes", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "request.opened",
        threadId: "thread-1",
        requestId: "req-2",
        requestType: "command_execution_approval",
        payload: { summary: "Run the command?" },
      },
    ]);
    expect(dbGetThreadRuntimeItems("thread-1")[0]?.state).toBe("started");

    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "turn.completed",
        threadId: "thread-1",
        turnId: "turn-1",
        state: "interrupted",
      },
    ]);
    expect(dbGetThreadRuntimeItems("thread-1")[0]?.state).toBe("completed");
  });

  it("pages backward from the transcript tail and truncates by item position", () => {
    dbApplyThreadRuntimeEvents(
      "thread-1",
      Array.from({ length: 250 }, (_, index) => ({
        type: "item.started" as const,
        threadId: "thread-1",
        itemId: `item-${index}`,
        itemType: "assistant_message" as const,
      })),
    );

    const tail = dbGetThreadRuntimeItemsPage("thread-1", undefined, 200);
    expect(tail.items[0]?.id).toBe("item-50");
    expect(tail.items.at(-1)?.id).toBe("item-249");
    expect(tail.nextCursor).toBe(50);

    const older = dbGetThreadRuntimeItemsPage("thread-1", tail.nextCursor ?? undefined, 200);
    expect(older.items).toHaveLength(50);
    expect(older.items[0]?.id).toBe("item-0");
    expect(older.nextCursor).toBeNull();

    dbTruncateThreadRuntimeAfter("thread-1", "item-124");
    expect(dbGetThreadRuntimeItems("thread-1")).toHaveLength(125);
    expect(dbGetThreadRuntimeItems("thread-1").at(-1)?.id).toBe("item-124");
  });

  it("keeps a groupable run intact when a page boundary lands inside it", () => {
    dbReplaceThreadRuntimeItems(
      "thread-1",
      Array.from({ length: 250 }, (_, index) => ({
        id: `item-${index}`,
        type:
          index === 50
            ? "assistant_message"
            : index >= 30 && index <= 69
              ? index % 2 === 0
                ? "tool_call"
                : "reasoning"
              : "assistant_message",
        state: "completed" as const,
        streams: {},
        ...(index === 50 ? { parentItemId: "tool-parent" } : {}),
      })),
    );

    const tail = dbGetThreadRuntimeItemsPage("thread-1", undefined, 200);
    expect(tail.items).toHaveLength(220);
    expect(tail.items[0]?.id).toBe("item-30");
    expect(tail.items.at(-1)?.id).toBe("item-249");
    expect(tail.nextCursor).toBe(30);

    const older = dbGetThreadRuntimeItemsPage("thread-1", tail.nextCursor ?? undefined, 200);
    expect(older.items).toHaveLength(30);
    expect(older.items[0]?.id).toBe("item-0");
    expect(older.items.at(-1)?.id).toBe("item-29");
    expect(older.nextCursor).toBeNull();
  });

  it("fills one page by projected timeline entries across dense tool runs", () => {
    dbReplaceThreadRuntimeItems("thread-1", [
      { id: "assistant-0", type: "assistant_message", state: "completed", streams: {} },
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `group-a-${index}`,
        type: "command_execution" as const,
        state: "completed" as const,
        streams: {},
      })),
      { id: "assistant-1", type: "assistant_message", state: "completed", streams: {} },
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `group-b-${index}`,
        type: "command_execution" as const,
        state: "completed" as const,
        streams: {},
      })),
      { id: "assistant-2", type: "assistant_message", state: "completed", streams: {} },
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `group-c-${index}`,
        type: "command_execution" as const,
        state: "completed" as const,
        streams: {},
      })),
      { id: "assistant-3", type: "assistant_message", state: "completed", streams: {} },
    ]);

    const page = dbGetThreadRuntimeItemsPage("thread-1", undefined, 10, 4);
    expect(page.items).toHaveLength(62);
    expect(page.items[0]?.id).toBe("group-b-0");
    expect(page.items.at(-1)?.id).toBe("assistant-3");
    expect(page.nextCursor).toBe(32);
  });

  it("returns exact 40-row timeline pages instead of the full raw scan batch", () => {
    dbReplaceThreadRuntimeItems(
      "thread-1",
      Array.from({ length: 90 }, (_, index) => ({
        id: `assistant-${index}`,
        type: "assistant_message" as const,
        state: "completed" as const,
        streams: {},
      })),
    );

    const tail = dbGetThreadRuntimeItemsPage("thread-1", undefined, 500, 40);
    expect(tail.items).toHaveLength(40);
    expect(tail.items[0]?.id).toBe("assistant-50");
    expect(tail.items.at(-1)?.id).toBe("assistant-89");
    expect(tail.nextCursor).toBe(50);

    const older = dbGetThreadRuntimeItemsPage("thread-1", tail.nextCursor ?? undefined, 500, 40);
    expect(older.items).toHaveLength(40);
    expect(older.items[0]?.id).toBe("assistant-10");
    expect(older.items.at(-1)?.id).toBe("assistant-49");
    expect(older.nextCursor).toBe(10);
  });

  it("counts subagent parents and inline images as standalone rendered rows", () => {
    dbReplaceThreadRuntimeItems("thread-1", [
      { id: "assistant-0", type: "assistant_message", state: "completed", streams: {} },
      { id: "command-0", type: "command_execution", state: "completed", streams: {} },
      { id: "command-1", type: "command_execution", state: "completed", streams: {} },
      {
        id: "subagent",
        type: "tool_call",
        state: "completed",
        payload: { name: "spawnAgent", isSubAgent: true },
        streams: {},
      },
      {
        id: "subagent-child",
        type: "assistant_message",
        state: "completed",
        streams: {},
        parentItemId: "subagent",
      },
      {
        id: "image",
        type: "image_view",
        state: "completed",
        payload: { name: "imageView", images: ["data:image/png;base64,iVBORw0KGgo="] },
        streams: {},
      },
      { id: "assistant-1", type: "assistant_message", state: "completed", streams: {} },
    ]);

    const page = dbGetThreadRuntimeItemsPage("thread-1", undefined, 500, 4);
    expect(page.items.map((item) => item.id)).toEqual([
      "command-0",
      "command-1",
      "subagent",
      "subagent-child",
      "image",
      "assistant-1",
    ]);
    expect(page.nextCursor).toBe(1);
  });

  it("uses the parent lookup index when paging a thread", () => {
    const plan = getSqlite()
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT DISTINCT parent_item_id
         FROM thread_runtime_items
         WHERE thread_id = ? AND parent_item_id IS NOT NULL`,
      )
      .all("thread-1") as Array<{ detail: string }>;

    expect(plan.map((row) => row.detail).join("\n")).toContain(
      "COVERING INDEX idx_runtime_items_thread_parent",
    );
  });

  it("adds the parent lookup index when upgrading schema v37", () => {
    getSqlite().exec(`
      DROP INDEX idx_runtime_items_thread_parent;
      UPDATE app_state SET value = '37' WHERE key = 'schema_version';
    `);

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    const columns = getSqlite()
      .prepare("PRAGMA index_info(idx_runtime_items_thread_parent)")
      .all() as Array<{ name: string }>;
    const schemaVersion = getSqlite()
      .prepare("SELECT value FROM app_state WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(columns.map((column) => column.name)).toEqual(["thread_id", "parent_item_id"]);
    expect(schemaVersion.value).toBe(String(LATEST_SCHEMA_VERSION));
  });

  it("repairs a missing parent lookup column when upgrading a drifted schema v37", () => {
    getSqlite().exec(`
      DROP INDEX idx_runtime_items_thread_parent;
      ALTER TABLE thread_runtime_items DROP COLUMN parent_item_id;
      UPDATE app_state SET value = '37' WHERE key = 'schema_version';
    `);

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    const columns = getSqlite()
      .prepare("PRAGMA index_info(idx_runtime_items_thread_parent)")
      .all() as Array<{ name: string }>;
    const schemaVersion = getSqlite()
      .prepare("SELECT value FROM app_state WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(columns.map((column) => column.name)).toEqual(["thread_id", "parent_item_id"]);
    expect(schemaVersion.value).toBe(String(LATEST_SCHEMA_VERSION));
  });

  it("repairs a missing parent lookup index at the current schema version", () => {
    getSqlite().exec("DROP INDEX idx_runtime_items_thread_parent");

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    const columns = getSqlite()
      .prepare("PRAGMA index_info(idx_runtime_items_thread_parent)")
      .all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(["thread_id", "parent_item_id"]);
  });

  it("repairs the parent lookup index from the prerelease Antigravity schema v40", () => {
    getSqlite().exec(`
      DROP INDEX idx_runtime_items_thread_parent;
      UPDATE app_state SET value = '40' WHERE key = 'schema_version';
    `);

    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));

    const columns = getSqlite()
      .prepare("PRAGMA index_info(idx_runtime_items_thread_parent)")
      .all() as Array<{ name: string }>;
    const schemaVersion = getSqlite()
      .prepare("SELECT value FROM app_state WHERE key = 'schema_version'")
      .get() as { value: string };
    expect(columns.map((column) => column.name)).toEqual(["thread_id", "parent_item_id"]);
    expect(schemaVersion.value).toBe(String(LATEST_SCHEMA_VERSION));
  });

  it("keeps buffered stream writes readable before the flush window elapses", () => {
    // Writes are queued to keep streaming off the per-chunk rewrite path, so
    // every reader must drain the queue or hydration would serve a stale
    // transcript.
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "cmd-1",
        itemType: "command_execution",
        payload: { command: "pnpm test" },
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "cmd-1",
        stream: "command_output",
        delta: "line one ",
      },
    ]);
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "cmd-1",
        stream: "command_output",
        delta: "line two",
      },
      { type: "item.completed", threadId: "thread-1", itemId: "cmd-1" },
    ]);

    const items = dbGetThreadRuntimeItems("thread-1");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "cmd-1",
      state: "completed",
      streams: { command_output: "line one line two" },
    });
    expect(dbGetThreadRuntimeItemsPage("thread-1", undefined, 50, 40).items).toHaveLength(1);
  });

  it("applies queued events in order across separate batches", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "msg-1",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "msg-1",
        stream: "assistant_text",
        delta: "a",
      },
    ]);
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "msg-1",
        stream: "assistant_text",
        delta: "b",
      },
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "msg-2",
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "msg-1",
        stream: "assistant_text",
        delta: "c",
      },
    ]);

    const items = dbGetThreadRuntimeItems("thread-1");

    expect(items.map((item) => item.id)).toEqual(["msg-1", "msg-2"]);
    expect(items[0]!.streams.assistant_text).toBe("abc");
  });

  it("keeps a multi-megabyte stream whole while it fits the retained window", () => {
    const megabyte = "y".repeat(1_000_000);
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "cmd-1",
        itemType: "command_execution",
        payload: { command: "pnpm test" },
      },
    ]);
    for (let i = 0; i < 3; i += 1) {
      dbApplyThreadRuntimeEvents("thread-1", [
        {
          type: "content.delta",
          threadId: "thread-1",
          itemId: "cmd-1",
          stream: "command_output",
          delta: megabyte,
        },
      ]);
      dbFlushThreadRuntimeWrites("thread-1");
    }

    const output = dbGetThreadRuntimeItems("thread-1")[0]!.streams.command_output!;

    expect(output).toBe(megabyte.repeat(3));
    expect(output).not.toContain("poracode elided");
  });

  it("bounds a runaway command output while keeping its head and tail", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "cmd-1",
        itemType: "command_execution",
        payload: { command: "pnpm run dev" },
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "cmd-1",
        stream: "command_output",
        delta: "FIRST-LINE ",
      },
    ]);
    dbFlushThreadRuntimeWrites("thread-1");
    for (let i = 0; i < 6; i += 1) {
      dbApplyThreadRuntimeEvents("thread-1", [
        {
          type: "content.delta",
          threadId: "thread-1",
          itemId: "cmd-1",
          stream: "command_output",
          delta: "x".repeat(1_000_000),
        },
      ]);
      dbFlushThreadRuntimeWrites("thread-1");
    }
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "cmd-1",
        stream: "command_output",
        delta: " LAST-LINE",
      },
    ]);

    const output = dbGetThreadRuntimeItems("thread-1")[0]!.streams.command_output!;

    // Whole chunks are dropped, so the retained window can overshoot by at most
    // the newest chunk; it must never grow without bound.
    expect(output.length).toBeLessThanOrEqual(HEAD_CHARS + TAIL_CHARS + 600_000);
    expect(output.length).toBeGreaterThan(HEAD_CHARS + TAIL_CHARS - 600_000);
    expect(output.startsWith("FIRST-LINE ")).toBe(true);
    expect(output.endsWith(" LAST-LINE")).toBe(true);
    expect(output).toContain("poracode elided");
  });

  it("drops a completed reasoning item whose text only ever arrived as chunks", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "think-1",
        itemType: "reasoning",
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "think-1",
        stream: "reasoning_text",
        delta: "   ",
      },
      { type: "item.completed", threadId: "thread-1", itemId: "think-1" },
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "think-2",
        itemType: "reasoning",
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "think-2",
        stream: "reasoning_text",
        delta: "a real thought",
      },
      { type: "item.completed", threadId: "thread-1", itemId: "think-2" },
    ]);

    const items = dbGetThreadRuntimeItems("thread-1");

    expect(items.map((item) => item.id)).toEqual(["think-2"]);
    expect(items[0]!.streams.reasoning_text).toBe("a real thought");
  });

  it("counts completed reasoning whose non-whitespace text is only in the chunk tail", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "think-tail",
        itemType: "reasoning",
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "think-tail",
        stream: "reasoning_text",
        delta: `${" ".repeat(HEAD_CHARS)}visible tail`,
      },
      { type: "item.completed", threadId: "thread-1", itemId: "think-tail" },
    ]);

    expect(dbGetThreadRuntimeItemsPage("thread-1", undefined, 50, 40).items).toHaveLength(1);
  });

  it("removes the appended stream tail when the thread is deleted", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "cmd-1",
        itemType: "command_execution",
        payload: { command: "pnpm run dev" },
      },
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "cmd-1",
        stream: "command_output",
        delta: "z".repeat(HEAD_CHARS + 50_000),
      },
    ]);
    dbFlushThreadRuntimeWrites("thread-1");
    const chunkCount = () =>
      (
        getSqlite()
          .prepare("SELECT COUNT(*) AS n FROM thread_runtime_item_stream_chunks")
          .get() as { n: number }
      ).n;
    const stateCount = () =>
      (
        getSqlite().prepare("SELECT COUNT(*) AS n FROM thread_runtime_item_stream_state").get() as {
          n: number;
        }
      ).n;
    expect(chunkCount()).toBeGreaterThan(0);
    expect(stateCount()).toBeGreaterThan(0);

    dbDeleteThread("thread-1");

    expect(chunkCount()).toBe(0);
    expect(stateCount()).toBe(0);
  });

  it("does not resurrect queued writes for a transcript that was replaced", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "stale-1",
        itemType: "assistant_message",
      },
    ]);

    dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "fresh-1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "hi" },
      },
    ]);

    expect(dbGetThreadRuntimeItems("thread-1").map((item) => item.id)).toEqual(["fresh-1"]);
  });

  it("does not apply queued writes after a thread id is deleted and reused", () => {
    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "stale-1",
        itemType: "assistant_message",
      },
    ]);

    dbDeleteThread("thread-1");
    dbUpsertThread(testThread(), 0);

    expect(dbGetThreadRuntimeItems("thread-1")).toEqual([]);
  });

  it("returns the latest goal even when its position is before the tail window", () => {
    dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "goal-outside-tail",
        type: "goal",
        state: "updated",
        payload: { action: "set", objective: "outside-tail goal" },
        streams: {},
      },
      ...Array.from({ length: 90 }, (_, index) => ({
        id: `assistant-${index}`,
        type: "assistant_message" as const,
        state: "completed" as const,
        streams: {},
      })),
    ]);

    const tail = dbGetThreadRuntimeItemsPage("thread-1", undefined, 500, 40);
    expect(tail.items.some((item) => item.id === "goal-outside-tail")).toBe(false);
    expect(tail.items.at(-1)?.id).toBe("assistant-89");

    expect(dbGetLatestThreadGoalItem("thread-1")?.id).toBe("goal-outside-tail");

    dbApplyThreadRuntimeEvents("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "goal-new",
        itemType: "goal",
        payload: { action: "updated", objective: "new goal" },
      },
    ]);
    expect(dbGetLatestThreadGoalItem("thread-1")?.id).toBe("goal-new");
  });
});
