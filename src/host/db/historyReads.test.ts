import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serializedWireByteLength } from "@/shared/remote/catalogReadContract";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbReadThreadHistoryPagePhase1, dbReadThreadHistoryPhase2 } from "./historyReads";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbGetThreadRuntimeItemsPage, dbReplaceThreadRuntimeItems } from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";

interface ItemFixture {
  id: string;
  type: string;
  state: "started" | "updated" | "completed";
  payload?: unknown;
  streams: Record<string, string>;
  parentItemId?: string;
}

function groupRun(prefix: string, count: number, type = "command_execution"): ItemFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    type,
    state: "completed" as const,
    streams: {},
  }));
}

async function legacyPage(
  threadId: string,
  beforePosition: number | undefined,
  limit: number,
  targetTimelineEntryCount?: number,
) {
  return dbGetThreadRuntimeItemsPage(threadId, beforePosition, limit, targetTimelineEntryCount);
}

function phase1Meta(threadId: string, query: Parameters<typeof dbReadThreadHistoryPagePhase1>[1]) {
  return dbReadThreadHistoryPagePhase1(threadId, query);
}

function captureSql(run: () => void): string[] {
  const sqlite = getSqlite();
  const original = sqlite.prepare.bind(sqlite);
  const sql: string[] = [];
  (sqlite as unknown as { prepare: (statement: string) => unknown }).prepare = (
    statement: string,
  ) => {
    sql.push(statement);
    return original(statement);
  };
  try {
    run();
  } finally {
    (sqlite as unknown as { prepare: typeof original }).prepare = original;
  }
  return sql;
}

describe.skipIf(!sqliteAvailable)("B4 bounded history reads (phase 1/2)", () => {
  let dir: string;

  beforeEach(() => {
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    dir = mkdtempSync(join(tmpdir(), "poracode-b4-history-db-"));
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

  it("selects the exact legacy candidate window and cursor on the plain path", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `head-${index}`,
        type: "assistant_message",
        state: "completed" as const,
        streams: {},
      })),
      ...groupRun("group", 40),
      ...Array.from({ length: 180 }, (_, index) => ({
        id: `tail-${index}`,
        type: "assistant_message",
        state: "completed" as const,
        streams: {},
      })),
    ]);

    const windows: Array<{ beforePosition?: number; limit: number }> = [
      { limit: 200 },
      { limit: 50 },
      { limit: 10 },
    ];
    for (const window of windows) {
      const legacy = await legacyPage("thread-1", window.beforePosition, window.limit);
      const phase1 = phase1Meta("thread-1", window);
      expect(phase1.rows.map((row) => row.itemId)).toEqual(
        [...legacy.items].reverse().map((item) => item.id),
      );
      expect(phase1.moreBeyondWindow).toBe(legacy.nextCursor !== null);
      expect(legacy.nextCursor === null || phase1.rows.at(-1)!.position === legacy.nextCursor).toBe(
        true,
      );
    }

    // Older window from the cursor must agree too.
    const tail = await legacyPage("thread-1", undefined, 60);
    const older = await legacyPage("thread-1", tail.nextCursor ?? undefined, 60);
    const phaseOlder = phase1Meta("thread-1", {
      limit: 60,
      ...(tail.nextCursor !== null ? { beforePosition: tail.nextCursor } : {}),
    });
    expect(phaseOlder.rows.map((row) => row.itemId)).toEqual(
      [...older.items].reverse().map((item) => item.id),
    );
    expect(phaseOlder.moreBeyondWindow).toBe(older.nextCursor !== null);
  });

  it("selects the exact legacy timeline-entry window on the target path", async () => {
    const dense = [
      { id: "assistant-0", type: "assistant_message", state: "completed" as const, streams: {} },
      ...groupRun("group-a", 30),
      { id: "assistant-1", type: "assistant_message", state: "completed" as const, streams: {} },
      ...groupRun("group-b", 30),
      { id: "assistant-2", type: "assistant_message", state: "completed" as const, streams: {} },
      ...groupRun("group-c", 30),
      { id: "assistant-3", type: "assistant_message", state: "completed" as const, streams: {} },
    ];
    await dbReplaceThreadRuntimeItems("thread-1", dense);
    const legacy = await legacyPage("thread-1", undefined, 10, 4);
    const phase1 = phase1Meta("thread-1", { limit: 10, targetTimelineEntryCount: 4 });
    expect(phase1.rows.map((row) => row.itemId)).toEqual(
      [...legacy.items].reverse().map((item) => item.id),
    );
    expect(phase1.moreBeyondWindow).toBe(legacy.nextCursor !== null);

    await dbReplaceThreadRuntimeItems(
      "thread-1",
      Array.from({ length: 90 }, (_, index) => ({
        id: `assistant-${index}`,
        type: "assistant_message",
        state: "completed" as const,
        streams: {},
      })),
    );
    const exact = await legacyPage("thread-1", undefined, 500, 40);
    const phaseExact = phase1Meta("thread-1", { limit: 500, targetTimelineEntryCount: 40 });
    expect(phaseExact.rows.map((row) => row.itemId)).toEqual(
      [...exact.items].reverse().map((item) => item.id),
    );
    expect(phaseExact.rows.at(-1)!.position).toBe(exact.nextCursor);
  });

  it("classifies hidden, named, sub-agent, image and reasoning rows exactly like the legacy reader", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      { id: "assistant-0", type: "assistant_message", state: "completed", streams: {} },
      { id: "plan-1", type: "plan", state: "completed", streams: {} },
      { id: "goal-1", type: "goal", state: "completed", streams: {} },
      { id: "error-1", type: "error", state: "completed", streams: {} },
      ...groupRun("command", 30),
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
      { id: "anon-tool", type: "tool_call", state: "completed", payload: {}, streams: {} },
      { id: "reasoning-empty", type: "reasoning", state: "completed", streams: {} },
      {
        id: "reasoning-filled",
        type: "reasoning",
        state: "completed",
        streams: { reasoning_text: "thinking hard" },
      },
      { id: "assistant-1", type: "assistant_message", state: "completed", streams: {} },
    ]);

    const legacy = await legacyPage("thread-1", undefined, 500, 4);
    const phase1 = phase1Meta("thread-1", { limit: 500, targetTimelineEntryCount: 4 });
    expect(phase1.rows.map((row) => row.itemId)).toEqual(
      [...legacy.items].reverse().map((item) => item.id),
    );

    const full = phase1Meta("thread-1", { limit: 500 });
    const kinds = new Map(full.rows.map((row) => [row.itemId, row.kind]));
    expect(kinds.get("plan-1")).toBe("hidden");
    expect(kinds.get("goal-1")).toBe("hidden");
    expect(kinds.get("error-1")).toBe("hidden");
    expect(kinds.get("subagent-child")).toBe("hidden");
    expect(kinds.get("anon-tool")).toBe("hidden");
    expect(kinds.get("reasoning-empty")).toBe("hidden");
    expect(kinds.get("reasoning-filled")).toBe("group");
    expect(kinds.get("subagent")).toBe("item");
    expect(kinds.get("image")).toBe("item");
    expect(kinds.get("command-0")).toBe("group");

    // The exact same visible projection order as the legacy target scan.
    expect(legacy.items.map((item) => item.id)).toContain("subagent");
    expect(legacy.items.map((item) => item.id)).toContain("image");
  });

  it("materializes phase-2 rows byte-identically to the legacy page", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "assistant-0",
        type: "assistant_message",
        state: "completed",
        payload: { model: "gpt-5", nested: { big: 1e20 } },
        streams: { assistant_text: "hello \u0001 world", reasoning_text: "why" },
      },
      {
        id: "tool-1",
        type: "tool_call",
        state: "completed",
        payload: { name: "read_file", args: { path: "/tmp/x" } },
        streams: {},
      },
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "updated",
        streams: { assistant_text: "x".repeat(300_000) },
      },
    ]);

    const legacy = await legacyPage("thread-1", undefined, 500);
    const phase1 = phase1Meta("thread-1", { limit: 500 });
    const materializedDesc = dbReadThreadHistoryPhase2(
      "thread-1",
      phase1.rows.map((row) => row.itemId),
    );
    expect([...materializedDesc].reverse()).toEqual(legacy.items);
    // The phase-1 bound is sound for every serialized row.
    for (const row of phase1.rows) {
      const item = materializedDesc.find((candidate) => candidate.id === row.itemId)!;
      expect(row.boundWireBytes).toBeGreaterThanOrEqual(
        serializedWireByteLength(JSON.stringify(item)),
      );
    }
  });

  it("keeps phase 1 metadata-only (no payload text) and phase 2 keyed by included ids", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      {
        id: "assistant-0",
        type: "assistant_message",
        state: "completed",
        payload: { model: "gpt-5" },
        streams: { assistant_text: "text" },
      },
      ...groupRun("command", 20),
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "more" },
      },
    ]);

    const metadataSql = captureSql(() => {
      dbReadThreadHistoryPagePhase1("thread-1", { limit: 100 });
    });
    expect(
      metadataSql.some((sql) =>
        /length\(CAST\(COALESCE\(payload, ''\) AS BLOB\)\) AS payload_bytes/u.test(sql),
      ),
    ).toBe(true);
    // No statement may select both text columns for the candidate window, and
    // no payload text is selected at all when no named tool row is present.
    expect(metadataSql.some((sql) => /payload, streams|streams, parent_item_id/u.test(sql))).toBe(
      false,
    );
    expect(metadataSql.some((sql) => /SELECT item_id, payload FROM/u.test(sql))).toBe(false);

    const phase1 = phase1Meta("thread-1", { limit: 100 });
    const payloadSql = captureSql(() => {
      phase1Meta("thread-1", { limit: 100 });
    });
    expect(payloadSql.some((sql) => /SELECT item_id, payload FROM/u.test(sql))).toBe(false);

    const ids = phase1.rows.slice(0, 3).map((row) => row.itemId);
    const fetchSql = captureSql(() => {
      dbReadThreadHistoryPhase2("thread-1", ids);
    });
    expect(
      fetchSql.some(
        (sql) =>
          sql.includes("WHERE thread_id = ? AND item_id IN (?, ?, ?)") &&
          sql.includes("type, state, payload, streams"),
      ),
    ).toBe(true);
    expect(fetchSql.some((sql) => /item_id IN \(\?\)$/u.test(sql))).toBe(false);
  });

  it("probes only named-tool and completed-reasoning rows for classification", async () => {
    await dbReplaceThreadRuntimeItems("thread-1", [
      { id: "assistant-0", type: "assistant_message", state: "completed", streams: {} },
      {
        id: "tool-1",
        type: "tool_call",
        state: "completed",
        payload: { name: "read_file" },
        streams: {},
      },
      {
        id: "reasoning-1",
        type: "reasoning",
        state: "completed",
        streams: { reasoning_text: "r" },
      },
      { id: "command-1", type: "command_execution", state: "completed", streams: {} },
    ]);

    const sql = captureSql(() => {
      const page = phase1Meta("thread-1", { limit: 100 });
      expect(page.rows.map((row) => row.itemId)).toEqual([
        "command-1",
        "reasoning-1",
        "tool-1",
        "assistant-0",
      ]);
    });
    const payloadProbes = sql.filter((statement) =>
      /SELECT item_id, payload FROM/u.test(statement),
    );
    const streamProbes = sql.filter((statement) => /SELECT item_id, streams FROM/u.test(statement));
    expect(payloadProbes).toHaveLength(1);
    expect(streamProbes).toHaveLength(1);
    expect(payloadProbes[0]!.split("?").length - 1).toBe(2);
    expect(streamProbes[0]!.split("?").length - 1).toBe(2);
  });
});
