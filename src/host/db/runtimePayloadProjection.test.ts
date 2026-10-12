import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeBindingEnv, sqliteAvailable, testThread } from "./runtimeItems.testFixtures";
import { initDatabase, closeDatabase, getSqlite } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import {
  dbReplaceThreadRuntimeItems,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeItemsPage,
} from "./runtimeItems";
import { dbGetThreadRuntimeItemCommitted } from "./runtimeItemRead";
import { dbReadThreadHistoryPagePhase1, dbReadThreadHistoryPhase2 } from "./historyReads";
import { installTrustedRuntimePayloadOriginAfterCompleteWrite } from "./runtimePayloadOrigins";
import { dbMeasureLegacyHistoryCharge } from "./legacyReadCharge";
import { PERSISTED_RUNTIME_PAYLOAD_FORMAT_OWNER_KEY } from "@/supervisor/agents/codex/persistedRuntimePayload";

import {
  buildBoundedThreadHistoryItems,
  HistoryItemTooLargeError,
} from "@/host/remote/server/historyRead";
import { resolveCatalogEffectiveCaps } from "@/host/remote/server/catalogPageBudget";
import {
  serializedWireByteLength,
  serializedDecodeByteLength,
} from "@/shared/remote/historyReadContract";

const threadId = "thread-1",
  itemId = "native-create",
  path = "/owned/fixture/created.txt";
const source = {
  changes: [{ path, kind: { type: "add" }, diff: "GENUINE_CREATED\nline two\nline three\n" }],
};
const payload = {
  path,
  changeKind: "create",
  diffSummary: { added: 0, removed: 0 },
  args: source,
  result: source,
  unknown: { preserved: true },
};

describe.skipIf(!sqliteAvailable)("proved selected-row payload projections", () => {
  let dir: string;
  beforeEach(async () => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-payload-projection-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Fixture",
        location: { kind: "posix", path: "/owned/fixture" },
        createdAt: "2026-01-01",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
    await dbReplaceThreadRuntimeItems(threadId, [
      {
        id: itemId,
        type: "file_change",
        state: "completed",
        payload,
        streams: { file_change_output: "unchanged" },
      },
    ]);
  });
  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });
  function attest(key = PERSISTED_RUNTIME_PAYLOAD_FORMAT_OWNER_KEY, id = itemId) {
    const sqlite = getSqlite();
    sqlite.transaction(() => {
      const row = sqlite
        .prepare("SELECT type,payload FROM thread_runtime_items WHERE thread_id=? AND item_id=?")
        .get(threadId, id) as { type: string; payload: string };
      const result = sqlite
        .prepare("UPDATE thread_runtime_items SET payload=payload WHERE thread_id=? AND item_id=?")
        .run(threadId, id);
      installTrustedRuntimePayloadOriginAfterCompleteWrite(sqlite, {
        threadId,
        itemId: id,
        itemType: row.type,
        installedPayload: row.payload,
        sqlChanges: result.changes,
        origin: { formatOwnerKey: key, originFormatVersion: 1 },
        custody: "captured-producer-complete-payload",
      });
    })();
  }
  it("keeps unknown histories raw and projects single/full/page/bounded reads without changing stored JSON", async () => {
    const sqlite = getSqlite(),
      raw = sqlite.prepare("SELECT payload FROM thread_runtime_items WHERE item_id=?").get(itemId);
    expect(dbGetThreadRuntimeItemCommitted(threadId, itemId)?.payload).toEqual(payload);
    const before = dbReadThreadHistoryPagePhase1(threadId, { limit: 10 });
    attest();
    const values = [
      dbGetThreadRuntimeItemCommitted(threadId, itemId),
      dbGetThreadRuntimeItemCommitted(threadId, itemId, { includeStreams: false }),
      (await dbGetThreadRuntimeItems(threadId))[0],
      (await dbGetThreadRuntimeItemsPage(threadId, undefined, 10)).items[0],
      dbReadThreadHistoryPhase2(threadId, [itemId])[0],
    ];
    for (const item of values)
      expect(item?.payload).toEqual({ ...payload, diffSummary: { added: 3, removed: 0 } });
    expect(values[1]?.streams).toEqual({});
    expect(values[0]?.streams).toEqual({ file_change_output: "unchanged" });
    expect(
      sqlite.prepare("SELECT payload FROM thread_runtime_items WHERE item_id=?").get(itemId),
    ).toEqual(raw);
    const after = dbReadThreadHistoryPagePhase1(threadId, { limit: 10 });
    expect(after.rows[0]!.boundWireBytes - before.rows[0]!.boundWireBytes).toBe(16);
    expect(after.rows[0]!.lowerBoundWireBytes).toBe(before.rows[0]!.lowerBoundWireBytes);
    expect(after.rows[0]!.lowerBoundDecodeBytes).toBe(before.rows[0]!.lowerBoundDecodeBytes);
  });
  it("measures projected counter growth exactly at both hard caps", async () => {
    const read = (maxBytes?: number, maxDecodeBytes?: number) =>
      buildBoundedThreadHistoryItems(
        { threadId, limit: 10 },
        resolveCatalogEffectiveCaps({
          ...(maxBytes === undefined ? {} : { maxBytes }),
          ...(maxDecodeBytes === undefined ? {} : { maxDecodeBytes }),
        }),
      );
    const expanded = { changes: [{ path, kind: { type: "add" }, diff: "line\n".repeat(100) }] };
    await dbReplaceThreadRuntimeItems(threadId, [
      {
        id: itemId,
        type: "file_change",
        state: "completed",
        payload: { ...payload, args: expanded, result: expanded },
        streams: {},
      },
    ]);
    const raw = await read();
    attest();
    const projected = await read();
    expect(JSON.parse(projected).items[0].payload.diffSummary).toEqual({ added: 100, removed: 0 });
    expect(JSON.parse(projected).items[0].id).toBe(JSON.parse(raw).items[0].id);
    const wire = serializedWireByteLength(projected),
      decode = serializedDecodeByteLength(projected);
    expect(wire - serializedWireByteLength(raw)).toBe(2);
    expect(await read(wire, decode)).toBe(projected);
    await expect(read(wire - 1, decode)).rejects.toBeInstanceOf(HistoryItemTooLargeError);
    await expect(read(wire, decode - 1)).rejects.toBeInstanceOf(HistoryItemTooLargeError);
  });
  it("uses proved item ownership through A→B→A routing; unknown keys and direct writes remain raw", () => {
    attest();
    const sqlite = getSqlite();
    for (const kind of ["kind-a", "kind-b", "kind-a"]) {
      sqlite.prepare("UPDATE threads SET agent_kind=? WHERE id=?").run(kind, threadId);
      expect(dbGetThreadRuntimeItemCommitted(threadId, itemId)?.payload).toMatchObject({
        diffSummary: { added: 3, removed: 0 },
      });
    }
    attest("unknown-format/v1");
    expect(dbGetThreadRuntimeItemCommitted(threadId, itemId)?.payload).toEqual(payload);
    attest();
    sqlite.prepare("UPDATE thread_runtime_items SET payload=payload WHERE item_id=?").run(itemId);
    expect(dbGetThreadRuntimeItemCommitted(threadId, itemId)?.payload).toEqual(payload);
  });
  it("payload-only projection selects no stored seed/head/tail or unrelated payload", () => {
    attest();
    const sqlite = getSqlite();
    const prepare = vi.spyOn(sqlite, "prepare");
    expect(
      dbGetThreadRuntimeItemCommitted(threadId, itemId, { includeStreams: false })?.payload,
    ).toMatchObject({ diffSummary: { added: 3, removed: 0 } });
    const queries = prepare.mock.calls.map(([sql]) => sql as string);
    expect(queries.some((sql) => /NULL AS streams/.test(sql))).toBe(true);
    expect(
      queries.some((sql) => /FROM thread_runtime_item_stream_(chunks|heads|head_blocks)/.test(sql)),
    ).toBe(false);
    expect(
      queries.filter((sql) => /SELECT[^;]*\bpayload\b[^;]*FROM thread_runtime_items\b/s.test(sql)),
    ).toHaveLength(1);
  });
  it("charges only proved guaranteed selected provenance values; public lower bounds never get upper expansion", () => {
    const unknown = dbMeasureLegacyHistoryCharge(threadId, { omitScrollback: true });
    attest();
    const known = dbMeasureLegacyHistoryCharge(threadId, { omitScrollback: true });
    expect(known.itemsStoredBytes - unknown.itemsStoredBytes).toBe(
      Buffer.byteLength(itemId) + Buffer.byteLength(PERSISTED_RUNTIME_PAYLOAD_FORMAT_OWNER_KEY),
    );
    attest("unknown-format/v1");
    expect(dbMeasureLegacyHistoryCharge(threadId, { omitScrollback: true })).toEqual(unknown);
  });
});
