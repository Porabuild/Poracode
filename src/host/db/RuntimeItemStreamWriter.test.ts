import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { dbReplaceThreadRuntimeItems } from "./runtimeItems";
import { dbGetThreadRuntimeItemCommitted } from "./runtimeItemRead";
import { applyThreadRuntimeEventsNow, resetRuntimeItemsWriterCache } from "./runtimeItemsWriter";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { applyLegacyStreamEvents } from "./RuntimeLegacyStreamWriter.testFixtures";

const threadId = "thread-1";
function delta(itemId: string, text: string, replace = false): RuntimeEvent {
  return {
    type: "content.delta",
    threadId,
    itemId,
    stream: "assistant_text",
    delta: text,
    ...(replace ? { replace } : {}),
  };
}

describe.skipIf(!sqliteAvailable)("transaction-prefix stream metadata custody", () => {
  let directory: string;
  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    directory = mkdtempSync(join(tmpdir(), "poracode-stream-prefix-"));
    initDatabase(join(directory, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Stream prefix",
        location: { kind: "posix", path: directory },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
    await dbReplaceThreadRuntimeItems(threadId, [
      {
        id: "a",
        type: "assistant_message",
        state: "started",
        payload: { content: "kept" },
        streams: { assistant_text: "before🧪", reasoning_text: "unchanged Ω" },
      },
      { id: "b", type: "assistant_message", state: "completed", streams: {} },
    ]);
    resetRuntimeItemsWriterCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("preserves indexed heads across consecutive deltas, row edits, item switches and misses without rewriting the seed", () => {
    const sqlite = getSqlite();
    sqlite.exec(
      "CREATE TEMP TRIGGER reject_stream_seed_update BEFORE UPDATE OF streams ON thread_runtime_items BEGIN SELECT RAISE(ABORT, 'unexpected seed rewrite'); END",
    );
    const events: RuntimeEvent[] = [
      ...Array.from({ length: 1000 }, () => delta("a", "x")),
      delta("b", "β"),
      delta("a", "Ω"),
      { type: "item.updated", threadId, itemId: "a", payload: { summary: "latest" } },
      delta("a", "!"),
      { type: "item.completed", threadId, itemId: "a" },
      delta("a", "tail"),
      delta("missing", "ignored"),
      delta("a", "end"),
    ];
    applyThreadRuntimeEventsNow(threadId, events);
    expect(dbGetThreadRuntimeItemCommitted(threadId, "a")).toMatchObject({
      state: "completed",
      payload: { content: "kept", summary: "latest" },
      streams: {
        assistant_text: "before🧪" + "x".repeat(1000) + "Ω!tailend",
        reasoning_text: "unchanged Ω",
      },
    });
    expect(dbGetThreadRuntimeItemCommitted(threadId, "b")).toMatchObject({
      state: "completed",
      streams: { assistant_text: "β" },
    });
    expect(dbGetThreadRuntimeItemCommitted(threadId, "missing")).toBeNull();
  });

  it("preserves prior rows and payload bytes when replacement and multiple streams grow", () => {
    const sqlite = getSqlite();
    const payload = JSON.stringify({ image: "x".repeat(2 * 1024 * 1024), caption: "猫🖼" });
    sqlite
      .prepare("UPDATE thread_runtime_items SET payload = ? WHERE thread_id = ? AND item_id = ?")
      .run(payload, threadId, "a");
    // A diagnostic trigger certifies no payload column rewrite by stream-only writes.
    sqlite.exec(
      "CREATE TEMP TRIGGER reject_stream_payload_update BEFORE UPDATE OF payload ON thread_runtime_items BEGIN SELECT RAISE(ABORT, 'unexpected payload rewrite'); END",
    );
    applyThreadRuntimeEventsNow(threadId, [
      delta("a", "discarded"),
      delta("a", "", true),
      delta("a", "new🙂"),
      { type: "content.delta", threadId, itemId: "a", stream: "reasoning_text", delta: "more" },
      delta("a", "tail"),
    ]);
    expect(
      sqlite
        .prepare("SELECT payload FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?")
        .get(threadId, "a"),
    ).toEqual({ payload });
    expect(dbGetThreadRuntimeItemCommitted(threadId, "a")?.streams).toEqual({
      assistant_text: "new🙂tail",
      reasoning_text: "unchanged Ωmore",
    });
  });

  it("does not carry a failed prefix's decoded head into a retry or another transaction", () => {
    const sqlite = getSqlite();
    sqlite.exec(
      "CREATE TEMP TRIGGER fail_stream_prefix BEFORE UPDATE OF data ON thread_runtime_item_stream_head_blocks WHEN instr(hex(NEW.data), '4600410049004C00') > 0 BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
    );
    expect(() =>
      applyThreadRuntimeEventsNow(threadId, [delta("a", "OK"), delta("a", "FAIL")]),
    ).toThrow("fixture failure");
    expect(dbGetThreadRuntimeItemCommitted(threadId, "a")?.streams.assistant_text).toBe("before🧪");
    sqlite.exec("DROP TRIGGER fail_stream_prefix");
    applyThreadRuntimeEventsNow(threadId, [delta("a", "OK"), delta("a", "FAIL")]);
    expect(dbGetThreadRuntimeItemCommitted(threadId, "a")?.streams.assistant_text).toBe(
      "before🧪OKFAIL",
    );
    sqlite
      .prepare("UPDATE thread_runtime_items SET streams = ? WHERE thread_id = ? AND item_id = ?")
      .run(JSON.stringify({ assistant_text: "external" }), threadId, "a");
    applyThreadRuntimeEventsNow(threadId, [delta("a", " fresh")]);
    expect(dbGetThreadRuntimeItemCommitted(threadId, "a")?.streams.assistant_text).toBe(
      "external fresh",
    );
  });

  it("preserves strict legacy reasoning refusal and rolls back earlier head writes", () => {
    const sqlite = getSqlite();
    const initial = dbGetThreadRuntimeItemCommitted(threadId, "a");
    const seeds = [
      "{broken",
      "null",
      JSON.stringify({ reasoning_text: 23 }),
      JSON.stringify({ reasoning_text: false }),
      JSON.stringify({ reasoning_text: { content: "invalid" } }),
    ];
    const insert = sqlite.prepare(
      "INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, streams) VALUES (?, ?, ?, 'reasoning', 'updated', ?)",
    );
    for (const [index, seed] of seeds.entries()) {
      const itemId = `invalid-reasoning-${index}`;
      insert.run(threadId, itemId, 100 + index, seed);
      expect(() =>
        applyThreadRuntimeEventsNow(threadId, [
          delta("a", "rolled back"),
          { type: "item.completed", threadId, itemId },
        ]),
      ).toThrow(TypeError);
      expect(dbGetThreadRuntimeItemCommitted(threadId, "a")).toEqual(initial);
      expect(
        sqlite
          .prepare(
            "SELECT state, streams FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
          )
          .get(threadId, itemId),
      ).toEqual({ state: "updated", streams: seed });
    }
  });

  it.each([
    { stream: "constructor", text: " value", replace: false },
    { stream: "constructor", text: "", replace: true },
    { stream: "__proto__", text: " value", replace: false },
    { stream: "__proto__", text: "", replace: true },
  ])(
    "preserves effective siblings across exceptional $stream fallback ($replace) and full rebase",
    async ({ stream, text, replace }) => {
      const sqlite = getSqlite();
      const original = dbGetThreadRuntimeItemCommitted(threadId, "a")!;
      sqlite
        .prepare(
          "INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams) VALUES (?, 'oracle', 20, 'assistant_message', 'started', NULL, ?)",
        )
        .run(threadId, JSON.stringify(original.streams));
      const events: RuntimeEvent[] = [
        delta("a", " block"),
        {
          type: "content.delta",
          threadId,
          itemId: "a",
          stream: "reasoning_text",
          delta: " sibling",
        },
        {
          type: "content.delta",
          threadId,
          itemId: "a",
          // Deliberately exercise exceptional stored keys outside normal wire vocabulary.
          stream: stream as Extract<RuntimeEvent, { type: "content.delta" }>["stream"],
          delta: text,
          ...(replace ? { replace } : {}),
        },
        delta("a", " after fallback"),
      ];
      const outcome = (write: () => void) => {
        try {
          write();
          return "success";
        } catch (error) {
          return error instanceof Error ? error.name : typeof error;
        }
      };
      const expected = outcome(() =>
        sqlite
          .transaction(() =>
            applyLegacyStreamEvents(
              sqlite,
              threadId,
              events.map((event) => ({ ...event, itemId: "oracle" })),
            ),
          )
          .immediate(),
      );
      expect(outcome(() => applyThreadRuntimeEventsNow(threadId, events))).toBe(expected);
      const read = (itemId: string) => {
        try {
          return { streams: dbGetThreadRuntimeItemCommitted(threadId, itemId)!.streams };
        } catch (error) {
          return { refused: error instanceof Error ? error.name : typeof error };
        }
      };
      expect(read("a")).toEqual(read("oracle"));
      await dbReplaceThreadRuntimeItems(threadId, [
        {
          id: "a",
          type: "assistant_message",
          state: "started",
          streams: { assistant_text: "rebased" },
        },
      ]);
      expect(dbGetThreadRuntimeItemCommitted(threadId, "a")!.streams).toEqual({
        assistant_text: "rebased",
      });
      expect(
        sqlite
          .prepare(
            "SELECT COUNT(*) AS n FROM thread_runtime_item_stream_chunks WHERE thread_id = ?",
          )
          .get(threadId),
      ).toEqual({ n: 0 });
      expect(
        sqlite
          .prepare(
            "SELECT item_id, stream_key FROM thread_runtime_item_stream_heads WHERE thread_id = ?",
          )
          .all(threadId),
      ).toEqual([{ item_id: "a", stream_key: '"assistant_text"' }]);
    },
  );
});
