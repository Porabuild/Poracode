import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { resetRuntimeItemsWriterCache } from "./runtimeItemsWriter";
import { resetRuntimePersistenceForTests } from "./runtimePersistenceRuntime";
import { HEAD_CHARS } from "./runtimeStreamCap";
import { prepareRuntimeStreamHead } from "./runtimeStreamHeadStore";
import { readRuntimeStreamHeads } from "./runtimeStreamHeadRead";
import type { RuntimeStreamHeadMetadata } from "./runtimeStreamHeadCodec";
import { nativeBindingEnv, testThread } from "./runtimeItems.testFixtures";
import { observePersistentWriterReads } from "./RuntimePersistentStreamReadTrace.testFixtures";
export type { WriterStreamRead } from "./RuntimePersistentStreamReadTrace.testFixtures";

export const THREAD = "thread-1";

export function delta(
  itemId: string,
  text: string,
  stream: Extract<RuntimeEvent, { type: "content.delta" }>["stream"] = "assistant_text",
  replace = false,
): RuntimeEvent {
  return {
    type: "content.delta",
    threadId: THREAD,
    itemId,
    stream,
    delta: text,
    ...(replace ? { replace } : {}),
  };
}

export function installPersistentHeadWriterFixture(): { directory: () => string } {
  let directory: string;
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    resetRuntimePersistenceForTests();
    directory = mkdtempSync(join(tmpdir(), "poracode-persistent-head-"));
    const sqlite = initDatabase(join(directory, "state.sqlite"));
    dbUpsertProject(
      {
        id: "project-1",
        name: "Persistent stream heads",
        location: { kind: "posix", path: directory },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread(testThread(), 0);
    // Legacy seeds deliberately start without schema-53 metadata. Canonical
    // snapshot writes now use blocks and cannot model this upgrade entry path.
    const insert = sqlite.prepare(`INSERT INTO thread_runtime_items
      (thread_id, item_id, position, type, state, payload, streams)
      VALUES (?, ?, ?, 'assistant_message', ?, ?, ?)`);
    insert.run(
      THREAD,
      "a",
      0,
      "started",
      JSON.stringify({ content: "kept" }),
      JSON.stringify({ assistant_text: "a".repeat(HEAD_CHARS), reasoning_text: "unchanged Ω" }),
    );
    insert.run(
      THREAD,
      "b",
      1,
      "completed",
      null,
      JSON.stringify({ assistant_text: "b".repeat(HEAD_CHARS) }),
    );
    insert.run(
      THREAD,
      "growing",
      2,
      "started",
      null,
      JSON.stringify({ assistant_text: "g".repeat(HEAD_CHARS - 1) }),
    );
    resetRuntimeItemsWriterCache();
    // Trace before initialization or a first writer creates its cached statements.
    observePersistentWriterReads(sqlite);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    const sqlite = getSqlite();
    if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
    resetRuntimePersistenceForTests();
    closeDatabase();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });
  return { directory: () => directory };
}

/** Durable metadata initialization changes no logical stream content or state. */
export function initializeHeads(...itemIds: string[]): void {
  const sqlite = getSqlite();
  sqlite
    .transaction(() => {
      for (const itemId of itemIds) {
        prepareRuntimeStreamHead(sqlite, {
          threadId: THREAD,
          itemId,
          stream: "assistant_text",
          createStream: false,
        });
      }
    })
    .immediate();
}

export function persistentHeads(itemId?: string): RuntimeStreamHeadMetadata[] {
  return getSqlite()
    .prepare(`SELECT * FROM thread_runtime_item_stream_heads
    ${itemId === undefined ? "" : "WHERE item_id = ?"}
    ORDER BY thread_id, item_id, stream_order`)
    .all(...(itemId === undefined ? [] : [itemId])) as RuntimeStreamHeadMetadata[];
}

export function retiredHintSchemaNames(): string[] {
  return getSqlite()
    .prepare(
      "SELECT name FROM temp.sqlite_master WHERE name LIKE 'runtime_frozen_stream%' ORDER BY name",
    )
    .pluck()
    .all() as string[];
}

/** Inspect values at writer-only .get calls; retain counts, never seed/BLOB text. */
export function observeStreamLookups(
  onPrepare?: Parameters<typeof observePersistentWriterReads>[1],
  onRead?: Parameters<typeof observePersistentWriterReads>[2],
): ReturnType<typeof observePersistentWriterReads> {
  return observePersistentWriterReads(getSqlite(), onPrepare, onRead);
}

function legacyRows() {
  const sqlite = getSqlite();
  return [
    sqlite.prepare("SELECT * FROM thread_runtime_items ORDER BY thread_id, item_id").all(),
    sqlite
      .prepare("SELECT * FROM thread_runtime_item_stream_state ORDER BY thread_id, item_id, stream")
      .all(),
    sqlite
      .prepare(
        "SELECT * FROM thread_runtime_item_stream_chunks ORDER BY thread_id, item_id, stream, seq",
      )
      .all(),
  ];
}

/** Physical rollback evidence includes every persistent metadata row and BLOB. */
export function durableStreamDigest(): string {
  const sqlite = getSqlite();
  const hash = createHash("sha256").update(JSON.stringify([...legacyRows(), persistentHeads()]));
  const blocks = sqlite
    .prepare("SELECT * FROM thread_runtime_item_stream_head_blocks ORDER BY head_id, seq")
    .all() as Array<{ head_id: number; seq: number; chars: number; data: Buffer }>;
  for (const { data, ...row } of blocks) hash.update(JSON.stringify(row)).update(data);
  return hash.digest("hex");
}

/** Compare the old logical head/chunk layout with the effective schema-53 head. */
export function logicalStreamDigest(): string {
  const sqlite = getSqlite();
  return sqlite.transaction(() => {
    const [items, states, chunks] = legacyRows();
    const rows = items as Array<{ thread_id: string; item_id: string; streams: string | null }>;
    const heads = readRuntimeStreamHeads(sqlite, THREAD, rows);
    const effective = rows.map((row) => ({
      ...row,
      streams: JSON.stringify(heads.get(row.item_id)),
    }));
    return createHash("sha256")
      .update(JSON.stringify([effective, states, chunks]))
      .digest("hex");
  })();
}
