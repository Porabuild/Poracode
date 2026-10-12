import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { sqliteAvailable, nativeBindingEnv } from "./runtimeItems.testFixtures";
import {
  dbClearThreadRuntimeItems,
  dbReadThreadRuntimeItems,
  dbReplaceThreadRuntimeSnapshot,
  dbTruncateThreadRuntimeAfter,
} from "./runtimeItems";
import { applyThreadRuntimeEventsNow } from "./runtimeItemsWriter";
import { resetRuntimePersistenceForTests } from "./runtimePersistenceRuntime";
import { readRuntimePayloadOrigin } from "./runtimePayloadOrigins";
import {
  captureSchema53PayloadOriginEvidence,
  createSchema53PayloadOriginDatabase,
  installFixtureOrigin,
  ORIGIN_A,
  ORIGIN_B,
} from "./runtimePayloadOrigins.testFixtures";

describe.skipIf(!sqliteAvailable)("runtime payload origin SQL custody", () => {
  let directory: string;
  let sqlite: InstanceType<typeof Database>;

  beforeEach(() => {
    resetRuntimePersistenceForTests();
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    mkdirSync("tmp", { recursive: true });
    directory = mkdtempSync(join("tmp", "origin-custody-"));
    const path = join(directory, "state.sqlite");
    createSchema53PayloadOriginDatabase(path).close();
    sqlite = initDatabase(path);
    installFixtureOrigin(sqlite);
    installFixtureOrigin(sqlite, "tail-item", ORIGIN_B);
  });

  afterEach(() => {
    resetRuntimePersistenceForTests();
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function origin(itemId = "growing", threadId = "thread-1") {
    return readRuntimePayloadOrigin(sqlite, threadId, itemId);
  }

  function proofs() {
    return sqlite
      .prepare("SELECT * FROM thread_runtime_item_payload_origins ORDER BY thread_id, item_id")
      .all();
  }

  it("preserves proof and all existing bytes for a real writer's ignored duplicate start", () => {
    const before = captureSchema53PayloadOriginEvidence(sqlite);
    applyThreadRuntimeEventsNow("thread-1", [
      {
        type: "item.started",
        threadId: "thread-1",
        itemId: "growing",
        itemType: "tool_call",
        payload: { replacement: true },
      },
    ]);
    expect(origin()).toEqual(ORIGIN_A);
    expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
    const receipt = sqlite
      .prepare(
        "INSERT OR IGNORE INTO thread_runtime_items (thread_id, item_id, position, type, state) VALUES ('thread-1', 'growing', 10, 'tool_call', 'started')",
      )
      .run();
    expect(receipt.changes).toBe(0);
    expect(origin()).toEqual(ORIGIN_A);
  });

  it.each(["payload = payload", "type = type", "thread_id = thread_id", "item_id = item_id"])(
    "invalidates a direct same-value assignment to %s while conserving item/stream/gap bytes",
    (assignment) => {
      const before = captureSchema53PayloadOriginEvidence(sqlite);
      sqlite.exec(
        `UPDATE thread_runtime_items SET ${assignment} WHERE thread_id = 'thread-1' AND item_id = 'growing'`,
      );
      expect(origin()).toBeUndefined();
      expect(origin("tail-item")).toEqual(ORIGIN_B);
      expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
    },
  );

  it("invalidates a real in-place same-byte writer update and unknown partial merges", () => {
    const before = sqlite
      .prepare("SELECT payload FROM thread_runtime_items WHERE item_id = 'tail-item'")
      .get();
    applyThreadRuntimeEventsNow("thread-1", [
      { type: "item.updated", threadId: "thread-1", itemId: "tail-item", payload: {} },
    ]);
    expect(
      sqlite.prepare("SELECT payload FROM thread_runtime_items WHERE item_id = 'tail-item'").get(),
    ).toEqual(before);
    expect(origin("tail-item")).toBeUndefined();
    expect(origin()).toEqual(ORIGIN_A);
    applyThreadRuntimeEventsNow("thread-1", [
      {
        type: "item.updated",
        threadId: "thread-1",
        itemId: "growing",
        payload: { unknownProducer: true },
      },
    ]);
    expect(origin()).toBeUndefined();
  });

  it("preserves origins for state, position, parent and stream-only writes", () => {
    sqlite.exec(`UPDATE thread_runtime_items SET state = 'completed', position = 7, parent_item_id = 'parent-2'
      WHERE thread_id = 'thread-1' AND item_id = 'growing';
      UPDATE thread_runtime_items SET streams = streams WHERE item_id = 'tail-item';`);
    applyThreadRuntimeEventsNow("thread-1", [
      {
        type: "content.delta",
        threadId: "thread-1",
        itemId: "growing",
        stream: "command_output",
        delta: "append🙂",
      },
    ]);
    expect(origin()).toEqual(ORIGIN_A);
    expect(origin("tail-item")).toEqual(ORIGIN_B);
  });

  it("never transfers proof from current thread routing or handoffs", () => {
    sqlite.exec(`UPDATE threads SET agent_kind = 'fixture.format-b' WHERE id = 'thread-1';
      INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
      VALUES ('thread-1', 'handoff', 9, 'handoff', 'completed', '{"from":"fixture.format-a","to":"fixture.format-b"}');`);
    expect(origin()).toEqual(ORIGIN_A);
    expect(origin("handoff")).toBeUndefined();
    sqlite.exec("UPDATE threads SET agent_kind = 'fixture.format-a' WHERE id = 'thread-1'");
    expect(origin("handoff")).toBeUndefined();
  });

  it.each([0, 1])(
    "invalidates delete/reinsert and INSERT OR REPLACE with recursive_triggers=%s",
    (recursiveTriggers) => {
      sqlite.pragma(`recursive_triggers = ${recursiveTriggers}`);
      sqlite.exec(`DELETE FROM thread_runtime_items WHERE thread_id = 'thread-1' AND item_id = 'tail-item';
      INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
      VALUES ('thread-1', 'tail-item', 8, 'assistant_message', 'started', '{}');`);
      expect(origin("tail-item")).toBeUndefined();
      installFixtureOrigin(sqlite, "tail-item");
      sqlite.exec(`INSERT OR REPLACE INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
      VALUES ('thread-1', 'tail-item', 8, 'assistant_message', 'started', '{}');`);
      expect(origin("tail-item")).toBeUndefined();
      expect(origin()).toEqual(ORIGIN_A);
    },
  );

  it("clears OLD and NEW composite keys on moves and conflict replacement", () => {
    sqlite.exec(`INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
      VALUES ('thread-2', 'tail-item', 0, 'assistant_message', 'started', '{}');`);
    installFixtureOrigin(sqlite, "tail-item", ORIGIN_A, "thread-2");
    sqlite.exec(`UPDATE OR REPLACE thread_runtime_items SET thread_id = 'thread-2'
      WHERE thread_id = 'thread-1' AND item_id = 'tail-item'`);
    expect(origin("tail-item")).toBeUndefined();
    expect(origin("tail-item", "thread-2")).toBeUndefined();
    installFixtureOrigin(sqlite, "tail-item", ORIGIN_B, "thread-2");
    sqlite.exec(
      "UPDATE thread_runtime_items SET item_id = 'moved' WHERE thread_id = 'thread-2' AND item_id = 'tail-item'",
    );
    expect(origin("tail-item", "thread-2")).toBeUndefined();
    expect(origin("moved", "thread-2")).toBeUndefined();
    expect(origin()).toEqual(ORIGIN_A);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("AFTER INSERT clears a stale new-key proof left by an external FK-disabled delete", () => {
    sqlite.pragma("foreign_keys = OFF");
    sqlite.exec("DELETE FROM thread_runtime_items WHERE item_id = 'tail-item'");
    sqlite.pragma("foreign_keys = ON");
    expect(origin("tail-item")).toEqual(ORIGIN_B);
    sqlite.exec(`INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload)
      VALUES ('thread-1', 'tail-item', 8, 'assistant_message', 'started', '{}');`);
    expect(origin("tail-item")).toBeUndefined();
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("restores payload, streams, gaps and proof on transaction and nested savepoint rollback", () => {
    const before = captureSchema53PayloadOriginEvidence(sqlite);
    const origins = proofs();
    expect(() =>
      sqlite.transaction(() => {
        sqlite.exec("UPDATE thread_runtime_items SET payload = payload WHERE item_id = 'growing'");
        expect(origin()).toBeUndefined();
        installFixtureOrigin(sqlite, "growing", ORIGIN_B);
        sqlite.exec("DELETE FROM thread_runtime_items WHERE item_id = 'tail-item'");
        throw new Error("outer rollback");
      })(),
    ).toThrow("outer rollback");
    expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
    expect(proofs()).toEqual(origins);
    sqlite.transaction(() => {
      expect(() =>
        sqlite.transaction(() => {
          sqlite.exec("UPDATE thread_runtime_items SET payload = '{}' WHERE item_id = 'growing'");
          installFixtureOrigin(sqlite, "growing", ORIGIN_B);
          throw new Error("savepoint rollback");
        })(),
      ).toThrow("savepoint rollback");
      expect(origin()).toEqual(ORIGIN_A);
      expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
      sqlite.exec("UPDATE thread_runtime_items SET state = state WHERE item_id = 'tail-item'");
    })();
    expect(proofs()).toEqual(origins);
  });

  it("rolls back a real snapshot failure then treats a logical old snapshot, including extra caller fields, as unknown", async () => {
    const before = captureSchema53PayloadOriginEvidence(sqlite);
    const origins = proofs();
    const snapshot = dbReadThreadRuntimeItems("thread-1");
    sqlite.exec(`CREATE TRIGGER fail_snapshot AFTER UPDATE OF payload ON thread_runtime_items
      WHEN NEW.item_id = 'tail-item' BEGIN SELECT RAISE(ABORT, 'snapshot failure'); END;`);
    await expect(
      dbReplaceThreadRuntimeSnapshot("thread-1", snapshot, [], undefined),
    ).rejects.toThrow("snapshot failure");
    expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
    expect(proofs()).toEqual(origins);
    sqlite.exec("DROP TRIGGER fail_snapshot");
    await dbReplaceThreadRuntimeSnapshot(
      "thread-1",
      snapshot.map((item) => ({
        ...item,
        formatOwnerKey: ORIGIN_A.formatOwnerKey,
        originFormatVersion: 1,
      })),
      [],
      undefined,
    );
    expect(proofs()).toEqual([]);
    expect(dbReadThreadRuntimeItems("thread-1")).toEqual(snapshot);
    closeDatabase();
    sqlite = initDatabase(join(directory, "state.sqlite"), { schemaMode: "validate" });
    expect(origin()).toBeUndefined();
  });

  it("cascades snapshot-removed items and whole-thread clear, with rollback for a failed clear", async () => {
    const snapshot = dbReadThreadRuntimeItems("thread-1");
    await dbReplaceThreadRuntimeSnapshot(
      "thread-1",
      snapshot.filter(({ id }) => id === "growing"),
      [],
      undefined,
    );
    expect(origin("tail-item")).toBeUndefined();
    expect(proofs()).toEqual([]);
    installFixtureOrigin(sqlite);
    const before = captureSchema53PayloadOriginEvidence(sqlite);
    sqlite.exec(`CREATE TRIGGER fail_clear AFTER DELETE ON thread_runtime_items
      BEGIN SELECT RAISE(ABORT, 'clear failure'); END;`);
    await expect(dbClearThreadRuntimeItems("thread-1")).rejects.toThrow("clear failure");
    expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
    expect(origin()).toEqual(ORIGIN_A);
    sqlite.exec("DROP TRIGGER fail_clear");
    await dbClearThreadRuntimeItems("thread-1");
    expect(proofs()).toEqual([]);
    expect(sqlite.prepare("SELECT * FROM thread_runtime_item_stream_heads").all()).toEqual([]);
  });

  it("preserves the retained prefix and missing-anchor no-op, and rolls back a failed real truncate", async () => {
    // Truncation requires a clean prefix; the upgrade fixture deliberately has
    // gap/unclean-epoch evidence. Establish the normal precondition through the
    // existing authoritative snapshot rebase, then attest the test payloads.
    await dbReplaceThreadRuntimeSnapshot(
      "thread-1",
      dbReadThreadRuntimeItems("thread-1"),
      [],
      undefined,
    );
    installFixtureOrigin(sqlite);
    installFixtureOrigin(sqlite, "tail-item", ORIGIN_B);
    const before = captureSchema53PayloadOriginEvidence(sqlite);
    expect(dbTruncateThreadRuntimeAfter("thread-1", "missing").truncated).toBe(false);
    expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
    sqlite.exec(`CREATE TRIGGER fail_truncate AFTER DELETE ON thread_runtime_items
      WHEN OLD.item_id = 'tail-item' BEGIN SELECT RAISE(ABORT, 'truncate failure'); END;`);
    expect(() => dbTruncateThreadRuntimeAfter("thread-1", "growing")).toThrow("truncate failure");
    expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
    expect(origin()).toEqual(ORIGIN_A);
    expect(origin("tail-item")).toEqual(ORIGIN_B);
    sqlite.exec("DROP TRIGGER fail_truncate");
    expect(dbTruncateThreadRuntimeAfter("thread-1", "growing").truncated).toBe(true);
    expect(origin()).toEqual(ORIGIN_A);
    expect(origin("tail-item")).toBeUndefined();
  });

  it.each(["threads", "projects"])("cascades %s deletion and rolls it back atomically", (table) => {
    const before = captureSchema53PayloadOriginEvidence(sqlite);
    const origins = proofs();
    const id = table === "threads" ? "thread-1" : "project-1";
    expect(() =>
      sqlite.transaction(() => {
        sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        expect(proofs()).toEqual([]);
        throw new Error("owner deletion rollback");
      })(),
    ).toThrow("owner deletion rollback");
    expect(captureSchema53PayloadOriginEvidence(sqlite)).toEqual(before);
    expect(proofs()).toEqual(origins);
    sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    expect(proofs()).toEqual([]);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(getSqlite()).toBe(sqlite);
  });
});
