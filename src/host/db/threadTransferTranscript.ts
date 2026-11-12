import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import Database from "better-sqlite3";
import { canonicalContentBlockSchema } from "@/shared/contracts/runtimeEvent";
import type { PersistedCompletedTurn, PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { selectThreadTransferSnapshot } from "@/shared/threadTransfer";
import { getSqlite } from "./connection";
import { resolveBetterSqliteNativeBindingOptions } from "./nativeBinding";
import { fenceRefusalError } from "./runtimeItems";
import {
  beginRuntimeFence,
  flushRuntimeFence,
  readRuntimeFence,
  releaseRuntimeFence,
} from "./runtimePersistenceRuntime";
import { mapRuntimeItemRows, type RuntimeTimelineItemRow } from "./runtimeTimelineReads";
import { dbReadThreadTransferTranscript } from "./threadForks";

const STREAM_BATCH_SIZE = 32;

interface PositionedTimelineRow extends RuntimeTimelineItemRow {
  position: number;
}

export interface StagedThreadTransferTranscript {
  readonly itemCount: number;
  readonly throughItemId: string;
  readonly turns: PersistedCompletedTurn[];
  readonly attachmentCandidatePaths: string[];
}

function collectCandidateAttachmentPaths(
  item: PersistedRuntimeItem,
  seen: Set<string>,
  out: string[],
): void {
  if (item.type !== "user_message" && item.type !== "assistant_message") return;
  const content = (item.payload as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return;
  for (const entry of content) {
    const parsed = canonicalContentBlockSchema.safeParse(entry);
    if (!parsed.success) continue;
    const block = parsed.data;
    if ((block.kind !== "image" && block.kind !== "file") || !block.path) continue;
    if (seen.has(block.path)) continue;
    seen.add(block.path);
    out.push(block.path);
  }
}

/**
 * Streams a fence-consistent settled transcript directly into a gzipped JSON
 * array file (`itemsGzipPath`) in small batches, pinning an isolated read-only
 * MVCC WAL snapshot so neither the runtime fence nor full-transcript arrays
 * are held in memory during compression.
 */
export async function dbStageThreadTransferTranscript(
  threadId: string,
  itemsGzipPath: string,
): Promise<StagedThreadTransferTranscript | null> {
  const writerSqlite = getSqlite();
  if (writerSqlite.memory) {
    const transcript = await dbReadThreadTransferTranscript(threadId);
    const snapshot = selectThreadTransferSnapshot(transcript.items, transcript.turns);
    if (!snapshot) return null;
    const seen = new Set<string>();
    const attachmentCandidatePaths: string[] = [];
    for (const item of snapshot.items) {
      collectCandidateAttachmentPaths(item, seen, attachmentCandidatePaths);
    }
    const settledItems = snapshot.items;
    function* memoryChunks(): Generator<string> {
      yield "[";
      for (let i = 0; i < settledItems.length; i += 1) {
        if (i > 0) yield ",";
        yield JSON.stringify(settledItems[i]);
      }
      yield "]";
    }
    await pipeline(
      Readable.from(memoryChunks()),
      createGzip(),
      createWriteStream(itemsGzipPath, { flags: "wx" }),
    );
    return {
      itemCount: snapshot.items.length,
      throughItemId: snapshot.throughItemId,
      turns: snapshot.turns,
      attachmentCandidatePaths,
    };
  }

  let roSqlite: InstanceType<typeof Database> | undefined;
  const token = beginRuntimeFence(threadId);
  try {
    const flushed = await flushRuntimeFence(token);
    if (flushed.kind !== "committed") throw fenceRefusalError(threadId, flushed);
    roSqlite = readRuntimeFence(token, () => {
      const handle = new Database(writerSqlite.name, {
        ...resolveBetterSqliteNativeBindingOptions(),
        readonly: true,
        fileMustExist: true,
      });
      try {
        handle.pragma("query_only = ON");
        handle.pragma("busy_timeout = 250");
        handle.pragma("cache_size = -2048");
        handle.pragma("mmap_size = 0");
        handle.pragma("temp_store = FILE");
        handle.exec("BEGIN");
        // Establish the MVCC WAL read snapshot while the runtime fence is held.
        handle.prepare("SELECT 1 FROM threads WHERE id = ?").get(threadId);
        return handle;
      } catch (error) {
        if (handle.inTransaction) handle.exec("ROLLBACK");
        handle.close();
        throw error;
      }
    });
  } finally {
    releaseRuntimeFence(token);
  }

  try {
    const sqlite = roSqlite;
    const rawTurns = (
      sqlite
        .prepare(
          "SELECT started_at, ended_at, anchor_item_id FROM thread_completed_turns WHERE thread_id = ? ORDER BY idx ASC",
        )
        .all(threadId) as Array<{
        started_at: string;
        ended_at: string;
        anchor_item_id: string | null;
      }>
    ).map((row) => ({
      startedAt: row.started_at,
      endedAt: row.ended_at,
      anchorItemId: row.anchor_item_id,
    }));

    const readFirstBatch = sqlite.prepare(
      `SELECT item_id, position, type, state, payload, streams, parent_item_id
       FROM thread_runtime_items
       WHERE thread_id = ?
       ORDER BY position ASC, item_id ASC
       LIMIT ?`,
    );
    const readNextBatch = sqlite.prepare(
      `SELECT item_id, position, type, state, payload, streams, parent_item_id
       FROM thread_runtime_items
       WHERE thread_id = ? AND (position > ? OR (position = ? AND item_id > ?))
       ORDER BY position ASC, item_id ASC
       LIMIT ?`,
    );

    const excluded = new Set<string>();
    const keptIds = new Set<string>();
    const seenAttachments = new Set<string>();
    const attachmentCandidatePaths: string[] = [];
    let itemCount = 0;
    let throughItemId: string | undefined;

    function* iterSettledItems(): Generator<PersistedRuntimeItem> {
      let cursor: { position: number; itemId: string } | undefined;
      while (true) {
        const rawBatch = (
          cursor === undefined
            ? readFirstBatch.all(threadId, STREAM_BATCH_SIZE)
            : readNextBatch.all(
                threadId,
                cursor.position,
                cursor.position,
                cursor.itemId,
                STREAM_BATCH_SIZE,
              )
        ) as PositionedTimelineRow[];
        if (rawBatch.length === 0) break;
        const last = rawBatch[rawBatch.length - 1]!;
        cursor = { position: last.position, itemId: last.item_id };

        const candidateRows: PositionedTimelineRow[] = [];
        for (const row of rawBatch) {
          if (
            row.type === "goal" ||
            row.type === "pending_request" ||
            (row.parent_item_id !== null && excluded.has(row.parent_item_id))
          ) {
            excluded.add(row.item_id);
            continue;
          }
          candidateRows.push(row);
        }
        if (candidateRows.length === 0) continue;

        const mapped = mapRuntimeItemRows(sqlite, threadId, candidateRows);
        for (const item of mapped) {
          const status = (item.payload as { status?: unknown } | undefined)?.status;
          if (
            status === "running" ||
            (item.parentItemId !== undefined && excluded.has(item.parentItemId))
          ) {
            excluded.add(item.id);
            continue;
          }
          const settled: PersistedRuntimeItem = { ...item, state: "completed" };
          keptIds.add(settled.id);
          itemCount += 1;
          if (!settled.parentItemId) throughItemId = settled.id;
          collectCandidateAttachmentPaths(settled, seenAttachments, attachmentCandidatePaths);
          yield settled;
        }
      }
    }

    const iterator = iterSettledItems();
    const first = iterator.next();
    if (first.done) return null;

    function* jsonChunks(): Generator<string> {
      yield "[";
      yield JSON.stringify(first.value);
      for (let step = iterator.next(); !step.done; step = iterator.next()) {
        yield `,${JSON.stringify(step.value)}`;
      }
      yield "]";
    }

    await pipeline(
      Readable.from(jsonChunks()),
      createGzip(),
      createWriteStream(itemsGzipPath, { flags: "wx" }),
    );
    if (!throughItemId) return null;

    return {
      itemCount,
      throughItemId,
      turns: rawTurns.filter(
        (turn) => turn.anchorItemId === null || keptIds.has(turn.anchorItemId),
      ),
      attachmentCandidatePaths,
    };
  } finally {
    if (roSqlite.inTransaction) roSqlite.exec("ROLLBACK");
    roSqlite.close();
  }
}
