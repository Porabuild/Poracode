import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import {
  dbMeasureHistoryStreamHeadEscaped,
  dbReadThreadHistoryPagePhase1,
  dbReadThreadHistoryPhase2,
} from "./historyReads";
import { dbMeasureLegacyHistoryCharge } from "./legacyReadCharge";
import { dbGetThreadRuntimeItemCommitted } from "./runtimeItemRead";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbReadLatestThreadGoalItem,
  dbReadThreadConversationItemsPage,
  dbReadThreadRuntimeItems,
  dbReadThreadRuntimeItemsPage,
} from "./runtimeItems";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { runtimeStreamHasContent, runtimeWriterStreamHasContent } from "./runtimeStreamHeadProbes";
import { measureRuntimeStreamHeadStorage } from "./runtimeStreamHeadRead";
import {
  appendProjectionHead,
  captureProjectionReads,
  insertProjectionItem,
  PROJECTION_THREAD,
  replaceProjectionHead,
  setProjectionTail,
} from "./runtimeStreamHeadProjection.testFixtures";

describe.skipIf(!sqliteAvailable)("indexed runtime head reader integration", () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-head-readers-"));
    path = join(dir, "state.sqlite");
    initDatabase(path);
    dbUpsertProject(
      {
        id: "project-1",
        name: "Project",
        location: { kind: "posix", path: "/tmp/project" },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  it("assembles full, single, page, conversation and ordered phase2 heads with legacy elision parity", () => {
    const sqlite = getSqlite();
    const seed = "kept first line\n";
    const addition = "x".repeat(8191) + "🧪partial";
    for (const [id, position] of [
      ["indexed", 0],
      ["legacy", 1],
    ] as const) {
      insertProjectionItem(sqlite, {
        id,
        position,
        seed: JSON.stringify({ assistant_text: id === "indexed" ? seed : seed + addition }),
        payload: '{"kept":true}',
      });
      setProjectionTail(sqlite, id, "assistant_text", "partial tail\nkept tail", 7);
    }
    appendProjectionHead(sqlite, "indexed", "assistant_text", addition);
    const full = dbReadThreadRuntimeItems(PROJECTION_THREAD);
    expect(full[0]!.streams).toEqual(full[1]!.streams);
    expect(full[0]!.streams.assistant_text).toContain("kept first line\n");
    expect(full[0]!.streams.assistant_text).toContain("kept tail");
    expect(dbGetThreadRuntimeItemCommitted(PROJECTION_THREAD, "indexed")).toEqual(full[0]);
    expect(dbReadThreadRuntimeItemsPage(PROJECTION_THREAD, undefined, 1).items).toEqual([full[1]]);
    expect(dbReadThreadRuntimeItemsPage(PROJECTION_THREAD, 1, 1).items).toEqual([full[0]]);
    expect(dbReadThreadConversationItemsPage(PROJECTION_THREAD, 1, 1).items).toEqual([full[0]]);
    expect(dbReadThreadHistoryPhase2(PROJECTION_THREAD, ["legacy", "missing", "indexed"])).toEqual([
      full[1],
      full[0],
    ]);
  });

  it("keeps latest goal head-only and payload-only reads free of seed/head/tail projections", () => {
    const sqlite = getSqlite();
    insertProjectionItem(sqlite, {
      id: "goal",
      position: 0,
      type: "goal",
      seed: '{"goal_text":"seed"}',
    });
    appendProjectionHead(sqlite, "goal", "goal_text", " + blocks");
    setProjectionTail(sqlite, "goal", "goal_text", " + tail");
    insertProjectionItem(sqlite, { id: "newer", position: 1 });
    const projected = captureProjectionReads(sqlite, () =>
      dbGetThreadRuntimeItemCommitted(PROJECTION_THREAD, "goal", { includeStreams: false }),
    );
    expect(projected.result!.streams).toEqual({});
    expect(projected.reads).toHaveLength(1);
    expect(projected.reads[0]!.rows[0]!.streams).toBeNull();
    expect(projected.reads[0]!.sql).toContain("NULL AS streams");
    const goal = captureProjectionReads(sqlite, () =>
      dbReadLatestThreadGoalItem(PROJECTION_THREAD),
    );
    expect(goal.result!.streams).toEqual({ goal_text: "seed + blocks" });
    expect(
      goal.reads.every((read) => !/thread_runtime_item_stream_(?:chunks|state)\b/u.test(read.sql)),
    ).toBe(true);
    expect(dbGetThreadRuntimeItemCommitted(PROJECTION_THREAD, "goal")!.streams.goal_text).toBe(
      "seed + blocks + tail",
    );
  });

  it("preserves stream order, empty replacements and distinct lone-surrogate keys", () => {
    const sqlite = getSqlite();
    const initial = { z: "hidden", "2": "integer", sibling: "kept" };
    insertProjectionItem(sqlite, { id: "item", position: 0, seed: JSON.stringify(initial) });
    appendProjectionHead(sqlite, "item", "\ud800", "high key");
    appendProjectionHead(sqlite, "item", "�", "replacement key");
    replaceProjectionHead(sqlite, "item", "z", "");
    const streams = dbGetThreadRuntimeItemCommitted(PROJECTION_THREAD, "item")!.streams;
    expect(Object.keys(streams)).toEqual(["2", "z", "sibling", "\ud800", "�"]);
    expect(streams).toEqual({
      "2": "integer",
      z: "",
      sibling: "kept",
      "\ud800": "high key",
      "�": "replacement key",
    });
  });

  it("uses scalar reasoning classification and exact UTF16 escaped counters without head BLOBs", () => {
    const sqlite = getSqlite();
    insertProjectionItem(sqlite, {
      id: "reason",
      position: 0,
      type: "reasoning",
      state: "completed",
    });
    appendProjectionHead(sqlite, "reason", "reasoning_text", 'quoted "\\\u0001\ud800');
    appendProjectionHead(sqlite, "reason", "reasoning_text", "\udc00 lone \ud800");
    const full = dbGetThreadRuntimeItemCommitted(PROJECTION_THREAD, "reason")!;
    const quoted = JSON.stringify(full.streams.reasoning_text);
    const probe = captureProjectionReads(sqlite, () => ({
      phase1: dbReadThreadHistoryPagePhase1(PROJECTION_THREAD, { limit: 1 }),
      escaped: dbMeasureHistoryStreamHeadEscaped(PROJECTION_THREAD, "reason"),
    }));
    expect(probe.result.phase1.rows[0]!.kind).toBe("group");
    expect(probe.result.escaped).toEqual({
      wireBytes: Buffer.byteLength(quoted, "utf8") - 2,
      decodeBytes: (quoted.length - 2) * 2,
    });
    expect(
      probe.reads
        .flatMap((read) => read.rows)
        .some((row) => Object.hasOwn(row, "data") || typeof row.streams === "string"),
    ).toBe(false);
    expect(probe.result.phase1.rows[0]!.boundStreamWireBytes).toBeGreaterThan(
      Buffer.byteLength(JSON.stringify(full.streams), "utf8"),
    );
    replaceProjectionHead(sqlite, "reason", "reasoning_text", " \u00a0\ufeff");
    expect(dbReadThreadHistoryPagePhase1(PROJECTION_THREAD, { limit: 1 }).rows[0]!.kind).toBe(
      "hidden",
    );
  });

  it("excludes all stream components from hard lower bounds when elision can remove them", () => {
    const sqlite = getSqlite();
    insertProjectionItem(sqlite, { id: "elided", position: 0 });
    appendProjectionHead(sqlite, "elided", "assistant_text", "x".repeat(20_000));
    setProjectionTail(sqlite, "elided", "assistant_text", "y".repeat(20_000), 1);
    const row = dbReadThreadHistoryPagePhase1(PROJECTION_THREAD, { limit: 1 }).rows[0]!;
    const actual = JSON.stringify(dbReadThreadHistoryPhase2(PROJECTION_THREAD, ["elided"])[0]);
    expect(row.streamsElided).toBe(true);
    expect(row.lowerBoundWireBytes).toBeLessThanOrEqual(Buffer.byteLength(actual, "utf8"));
    expect(row.lowerBoundDecodeBytes).toBeLessThanOrEqual(actual.length * 2);
    expect(row.lowerBoundWireBytes).toBe(
      Buffer.byteLength(JSON.stringify("elided"), "utf8") +
        Buffer.byteLength(JSON.stringify("assistant_message"), "utf8"),
    );
  });

  it("adds selected metadata keys and BLOB bytes to legacy reservations without charging unselected heads", () => {
    const sqlite = getSqlite();
    insertProjectionItem(sqlite, {
      id: "older",
      position: 0,
      seed: '{"assistant_text":"retained old seed"}',
    });
    insertProjectionItem(sqlite, { id: "latest", position: 1 });
    const beforeFull = dbMeasureLegacyHistoryCharge(PROJECTION_THREAD, { omitScrollback: true });
    const beforePage = dbMeasureLegacyHistoryCharge(PROJECTION_THREAD, {
      runtimePage: true,
      targetTimelineEntryCount: 1,
      omitScrollback: true,
    });
    appendProjectionHead(sqlite, "older", "assistant_text", "x".repeat(50_000));
    appendProjectionHead(sqlite, "latest", "assistant_text", "quoted 🧪");
    const sizes = measureRuntimeStreamHeadStorage(sqlite, PROJECTION_THREAD, ["older", "latest"]);
    const bytes = (id: string) => sizes.get(id)!.metadataKeyBytes + sizes.get(id)!.blockBytes;
    expect(
      dbMeasureLegacyHistoryCharge(PROJECTION_THREAD, { omitScrollback: true }).itemsStoredBytes -
        beforeFull.itemsStoredBytes,
    ).toBe(bytes("older") + bytes("latest"));
    expect(
      dbMeasureLegacyHistoryCharge(PROJECTION_THREAD, {
        runtimePage: true,
        targetTimelineEntryCount: 1,
        omitScrollback: true,
      }).itemsStoredBytes - beforePage.itemsStoredBytes,
    ).toBe(bytes("latest"));
    replaceProjectionHead(sqlite, "older", "assistant_text", "");
    expect(
      dbMeasureLegacyHistoryCharge(PROJECTION_THREAD, { omitScrollback: true }).itemsStoredBytes,
    ).toBeGreaterThan(beforeFull.itemsStoredBytes);
  });

  it.each([
    "not-json",
    "null",
    '{"reasoning_text":3}',
    '{"reasoning_text":false}',
    '{"reasoning_text":{}}',
  ])("retains strict writer refusal and forgiving page probes for legacy %s", (seed) => {
    const sqlite = getSqlite();
    insertProjectionItem(sqlite, {
      id: "legacy",
      position: 0,
      type: "reasoning",
      state: "completed",
      seed,
    });
    expect(() =>
      runtimeWriterStreamHasContent(sqlite, PROJECTION_THREAD, "legacy", "reasoning_text"),
    ).toThrow(/(?:Cannot read properties|trim)/u);
    expect(runtimeStreamHasContent(sqlite, PROJECTION_THREAD, "legacy", "reasoning_text")).toBe(
      false,
    );
    expect(dbReadThreadHistoryPagePhase1(PROJECTION_THREAD, { limit: 1 }).rows[0]!.kind).toBe(
      "hidden",
    );
  });

  it.each(["single", "full", "page", "conversation", "phase2", "goal"] as const)(
    "keeps seed, blocks and tails on one snapshot for %s across external same-size replacement",
    (mode) => {
      const sqlite = getSqlite();
      insertProjectionItem(sqlite, {
        id: "item",
        position: 0,
        type: mode === "goal" ? "goal" : "assistant_message",
        seed: '{"assistant_text":"seed-old"}',
      });
      appendProjectionHead(sqlite, "item", "assistant_text", " before");
      setProjectionTail(sqlite, "item", "assistant_text", " tail before");
      const external = new Database(path, {
        ...(nativeBindingEnv ? { nativeBinding: nativeBindingEnv } : {}),
      });
      external.pragma("foreign_keys = ON");
      const prepare = sqlite.prepare.bind(sqlite);
      let changed = false;
      const change = () => {
        if (changed) return;
        changed = true;
        external
          .transaction(() => {
            external
              .prepare(
                "UPDATE thread_runtime_items SET streams = ? WHERE thread_id = ? AND item_id = ?",
              )
              .run('{"assistant_text":"seed-new"}', PROJECTION_THREAD, "item");
            external
              .prepare("DELETE FROM thread_runtime_item_stream_chunks WHERE thread_id = ?")
              .run(PROJECTION_THREAD);
            external
              .prepare("DELETE FROM thread_runtime_item_stream_state WHERE thread_id = ?")
              .run(PROJECTION_THREAD);
            appendProjectionHead(external, "item", "assistant_text", " after!");
            setProjectionTail(external, "item", "assistant_text", " tail after!");
          })
          .immediate();
      };
      const spy = vi.spyOn(sqlite, "prepare").mockImplementation((sql: string) => {
        const statement = prepare(sql);
        if (/SELECT item_id.*payload, streams/su.test(sql)) {
          const get = statement.get.bind(statement),
            all = statement.all.bind(statement);
          vi.spyOn(statement, "get").mockImplementation((...args: unknown[]) => {
            const result: unknown = get(...args);
            change();
            return result;
          });
          vi.spyOn(statement, "all").mockImplementation((...args: unknown[]) => {
            const result = all(...args) as unknown[];
            change();
            return result;
          });
        }
        return statement;
      });
      try {
        const result =
          mode === "single"
            ? dbGetThreadRuntimeItemCommitted(PROJECTION_THREAD, "item")
            : mode === "full"
              ? dbReadThreadRuntimeItems(PROJECTION_THREAD)[0]
              : mode === "page"
                ? dbReadThreadRuntimeItemsPage(PROJECTION_THREAD, undefined, 1).items[0]
                : mode === "conversation"
                  ? dbReadThreadConversationItemsPage(PROJECTION_THREAD, undefined, 1).items[0]
                  : mode === "phase2"
                    ? dbReadThreadHistoryPhase2(PROJECTION_THREAD, ["item"])[0]
                    : dbReadLatestThreadGoalItem(PROJECTION_THREAD);
        expect(changed).toBe(true);
        expect(result!.streams.assistant_text).toBe(
          mode === "goal" ? "seed-old before" : "seed-old before tail before",
        );
      } finally {
        spy.mockRestore();
        external.close();
      }
      expect(
        dbGetThreadRuntimeItemCommitted(PROJECTION_THREAD, "item")!.streams.assistant_text,
      ).toBe("seed-new after! tail after!");
    },
  );
});
