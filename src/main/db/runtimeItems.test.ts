import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbApplyThreadRuntimeEvents,
  dbGetThreadContextUsage,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeItemsPage,
  dbReplaceThreadRuntimeItems,
  dbTruncateThreadRuntimeAfter,
} from "./runtimeItems";

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
});
