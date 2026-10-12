import Database from "better-sqlite3";
import type { RuntimeEvent, ThreadContextUsage } from "@/shared/contracts";
import { RUNTIME_REQUEST_ITEM_TYPE } from "@/shared/contracts";
import { recordUsageSpentFromRuntimeEvents } from "@/host/profile/usageLedger";
import { getSqlite } from "./connection";
import { withRuntimeBusyTimeout } from "./runtimeBusyTimeout";
import { commitRuntimeAtomicWrite } from "./runtimeAtomicWrite";
import type { RuntimeAtomicBatchWriter, RuntimeWriteBatch } from "./runtimeWriteQueue";
import { safeParse } from "./rowMappers";
import type { PersistedRuntimeItem } from "./runtimeItems";
import {
  readAdmittedRuntimePayloadOrigin,
  type RuntimePayloadOrigin,
} from "@/shared/runtimePayloadOriginProtocol";
import { readRuntimePayloadOrigin } from "./runtimePayloadOrigins";
import {
  installRuntimeItemPayloadOrigin,
  originForRuntimePayloadMerge,
} from "./runtimePayloadOriginWriteCustody";
import { runtimeWriterStreamHasContent } from "./runtimeStreamHeadProbes";
import {
  RuntimeItemStreamWriter,
  type RuntimeItemStreamStatements,
} from "./RuntimeItemStreamWriter";

/**
 * Synchronous SQLite writer for canonical runtime events. Extracted from
 * `runtimeItems.ts` (B1) so the reader/pagination surface can shrink and the
 * write path can own one prepared-statement cache per open connection.
 *
 * Durability contract:
 * - Items and the usage ledger commit in the SAME `.immediate()` transaction.
 *   A failure rolls back both, so a retry can only re-apply a no-op (cumulative
 *   deltas recompute against the committed counter; per-call samples dedupe by
 *   `sampleId`). This removes the previous silent usage-accounting-loss path
 *   where the ledger committed separately from the event that produced it.
 * - Runtime transactions run under a scoped `busy_timeout = 0`: the host never
 *   waits on a lock inside its single-threaded loop. `SQLITE_BUSY`/
 *   `SQLITE_LOCKED` surface as retryable to the controller, which yields and
 *   retries on a later macrotask with backoff.
 * - The writer throws on storage failure; the controller classifies and keeps
 *   the events pending. It never swallows.
 */

interface RuntimeItemRow {
  type: string;
  state: string;
  payload: string | null;
}

interface WriterStatements extends RuntimeItemStreamStatements {
  getItem: Database.Statement;
  nextPosition: Database.Statement;
  insertItem: Database.Statement;
  updateItem: Database.Statement;
  setItemState: Database.Statement;
  deleteItem: Database.Statement;
  completeOpenRequests: Database.Statement;
  writeEvents: (threadId: string, events: readonly RuntimeEvent[]) => void;
  writeBatches: (batches: readonly RuntimeWriteBatch[]) => void;
}

let cachedStatements: {
  sqlite: InstanceType<typeof Database>;
  statements: WriterStatements;
} | null = null;

function writerStatements(sqlite: InstanceType<typeof Database>): WriterStatements {
  if (cachedStatements?.sqlite === sqlite) return cachedStatements.statements;
  const statements: WriterStatements = {
    writeEvents: sqlite.transaction((threadId: string, events: readonly RuntimeEvent[]) => {
      applyRuntimeEventsInTransaction(sqlite, threadId, events);
    }).immediate,
    writeBatches: sqlite.transaction((batches: readonly RuntimeWriteBatch[]) => {
      for (const batch of batches) {
        applyRuntimeEventsInTransaction(sqlite, batch.threadId, batch.events);
      }
    }).immediate,
    getItem: sqlite.prepare(
      "SELECT type, state, payload FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
    ),
    updateItemStreams: sqlite.prepare(
      "UPDATE thread_runtime_items SET state = ?, streams = ? WHERE thread_id = ? AND item_id = ?",
    ),
    nextPosition: sqlite.prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS position FROM thread_runtime_items WHERE thread_id = ?",
    ),
    insertItem: sqlite.prepare(
      `INSERT OR IGNORE INTO thread_runtime_items
         (thread_id, item_id, position, type, state, payload, streams, parent_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    updateItem: sqlite.prepare(
      `UPDATE thread_runtime_items
       SET state = ?, payload = ?
       WHERE thread_id = ? AND item_id = ?`,
    ),
    setItemState: sqlite.prepare(
      "UPDATE thread_runtime_items SET state = ? WHERE thread_id = ? AND item_id = ?",
    ),
    deleteItem: sqlite.prepare(
      "DELETE FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
    ),
    completeOpenRequests: sqlite.prepare(
      `UPDATE thread_runtime_items SET state = 'completed'
       WHERE thread_id = ? AND type = ? AND state != 'completed'`,
    ),
  };
  cachedStatements = { sqlite, statements };
  return statements;
}

/** Drop the per-connection statement cache (called when the database closes). */
export function resetRuntimeItemsWriterCache(): void {
  cachedStatements = null;
}

export { withRuntimeBusyTimeout, RUNTIME_FLUSH_BUSY_TIMEOUT_MS } from "./runtimeBusyTimeout";

const existsStatements = new WeakMap<InstanceType<typeof Database>, Database.Statement>();
export function threadExistsInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
): boolean {
  let statement = existsStatements.get(sqlite);
  if (!statement) {
    statement = sqlite.prepare("SELECT 1 FROM threads WHERE id = ?");
    existsStatements.set(sqlite, statement);
  }
  return statement.get(threadId) !== undefined;
}

/**
 * Applies one thread's canonical runtime events and its usage ledger entries in
 * a single immediate transaction. Callers are the persistence controller's
 * flush path only; it throws on failure and never partially commits.
 */
export function applyThreadRuntimeEventsNow(
  threadId: string,
  events: readonly RuntimeEvent[],
): void {
  if (events.length === 0) return;
  const sqlite = getSqlite();
  withRuntimeBusyTimeout(() => {
    writerStatements(sqlite).writeEvents(threadId, events);
  });
}

/**
 * Internal, bounded queue capability. One cached outer transaction and one
 * busy-timeout scope cover every selected prefix; no per-thread writer
 * savepoints or PRAGMAs. Items and usage remain atomic together. The queue
 * alone acknowledges prefixes AFTER this returns committed. The statement
 * cache follows the SQLite handle and is discarded on clean close/rebind;
 * schema 53 stores heads in bounded blocks; event and read-fence formats are unchanged.
 */
export const applyRuntimeEventBatchesNow: RuntimeAtomicBatchWriter = (batches) => {
  const sqlite = getSqlite();
  return commitRuntimeAtomicWrite(sqlite, () => {
    writerStatements(sqlite).writeBatches(batches);
  });
};

function applyRuntimeEventsInTransaction(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  events: readonly RuntimeEvent[],
): void {
  if (!threadExistsInSqlite(sqlite, threadId)) return;

  const statements = writerStatements(sqlite);
  const streamWriter = new RuntimeItemStreamWriter(sqlite, threadId, statements);
  const readItem = (itemId: string) =>
    statements.getItem.get(threadId, itemId) as RuntimeItemRow | undefined;
  let nextItemPosition: number | undefined;
  const appendItem = (item: PersistedRuntimeItem, origin?: RuntimePayloadOrigin) => {
    nextItemPosition ??= (statements.nextPosition.get(threadId) as { position: number }).position;
    const installedPayload = item.payload === undefined ? null : JSON.stringify(item.payload);
    const result = statements.insertItem.run(
      threadId,
      item.id,
      nextItemPosition,
      item.type,
      item.state,
      installedPayload,
      JSON.stringify(item.streams),
      item.parentItemId ?? null,
    );
    installRuntimeItemPayloadOrigin(
      sqlite,
      threadId,
      item.id,
      item.type,
      installedPayload,
      result.changes,
      origin,
    );
    nextItemPosition += 1;
  };

  for (const event of events) {
    if (event.type !== "content.delta") streamWriter.invalidate();
    switch (event.type) {
      case "item.started":
        appendItem(
          {
            id: event.itemId,
            type: event.itemType,
            state: "started",
            streams: {},
            ...(event.payload !== undefined ? { payload: event.payload } : {}),
            ...(event.parentItemId ? { parentItemId: event.parentItemId } : {}),
          },
          readAdmittedRuntimePayloadOrigin(event),
        );
        break;

      case "item.updated": {
        const row = readItem(event.itemId);
        if (!row) break;
        const previousPayload = row.payload ? safeParse(row.payload) : undefined;
        const origin = originForRuntimePayloadMerge(
          sqlite,
          threadId,
          event.itemId,
          event,
          previousPayload,
          event.payload,
        );
        const installedPayload = JSON.stringify(mergePayload(previousPayload, event.payload));
        const result = statements.updateItem.run(
          row.state === "completed" ? "completed" : "updated",
          installedPayload,
          threadId,
          event.itemId,
        );
        installRuntimeItemPayloadOrigin(
          sqlite,
          threadId,
          event.itemId,
          row.type,
          installedPayload ?? null,
          result.changes,
          origin,
        );
        break;
      }

      case "item.completed": {
        const row = readItem(event.itemId);
        if (!row) break;
        if (
          row.type === "reasoning" &&
          !runtimeWriterStreamHasContent(sqlite, threadId, event.itemId, "reasoning_text")
        ) {
          statements.deleteItem.run(threadId, event.itemId);
          break;
        }
        const previousPayload = row.payload ? safeParse(row.payload) : undefined;
        const payload =
          event.payload === undefined
            ? previousPayload
            : mergePayload(previousPayload, event.payload);
        const installedPayload = payload === undefined ? null : JSON.stringify(payload);
        const origin =
          event.payload === undefined
            ? // Keep the original writer's JSON serialization. A valid prior
              // whole payload remains its producer's evidence after re-encoding;
              // malformed prior JSON that becomes null cannot be re-attested.
              previousPayload !== undefined || installedPayload === row.payload
              ? readRuntimePayloadOrigin(sqlite, threadId, event.itemId)
              : undefined
            : originForRuntimePayloadMerge(
                sqlite,
                threadId,
                event.itemId,
                event,
                previousPayload,
                event.payload,
              );
        const result = statements.updateItem.run(
          "completed",
          installedPayload,
          threadId,
          event.itemId,
        );
        installRuntimeItemPayloadOrigin(
          sqlite,
          threadId,
          event.itemId,
          row.type,
          installedPayload,
          result.changes,
          origin,
        );
        break;
      }

      case "content.delta": {
        streamWriter.append(event);
        break;
      }

      case "context.updated": {
        const previous = readThreadContextUsageInSqlite(sqlite, threadId);
        replaceThreadContextUsageInSqlite(
          sqlite,
          threadId,
          mergeContextUsage(previous, event.usage),
        );
        break;
      }

      case "turn.completed":
        if (event.state === "interrupted" || event.state === "cancelled") {
          pruneTrailingInterruptedReasoningItems(sqlite, threadId);
        }
        // A finished turn no longer blocks on an approval/question. Retire any
        // request items left open (e.g. an interrupted turn that never emitted
        // `request.resolved`) so a later snapshot cannot resurrect a stale
        // pending request.
        statements.completeOpenRequests.run(threadId, RUNTIME_REQUEST_ITEM_TYPE);
        break;

      case "usage.spent":
        // Token consumption is not a chat item; the ledger records it below
        // inside this same transaction.
        break;

      case "request.opened": {
        // Persist the open request so a remote client that missed the live
        // broadcast can recover it from the thread snapshot. The payload shape
        // mirrors what `requestsFromRuntimeItems` reads back on recovery.
        const itemId = runtimeRequestItemId(event.requestId);
        const payload = {
          requestId: event.requestId,
          requestType: event.requestType,
          payload: event.payload,
        };
        const row = readItem(itemId);
        if (row) {
          statements.updateItem.run("started", JSON.stringify(payload), threadId, itemId);
        } else {
          appendItem({
            id: itemId,
            type: RUNTIME_REQUEST_ITEM_TYPE,
            state: "started",
            streams: {},
            payload,
          });
        }
        break;
      }

      case "request.resolved": {
        const itemId = runtimeRequestItemId(event.requestId);
        const row = readItem(itemId);
        if (!row) break;
        statements.updateItem.run("completed", row.payload, threadId, itemId);
        break;
      }

      default:
        break;
    }
  }

  // Same transaction: a usage failure rolls back the items above, and a
  // retry re-applies idempotently (cumulative counter / sample dedupe).
  recordUsageSpentFromRuntimeEvents(threadId, events);
}

/** Item id for a persisted open request, keyed by its request id. */
export function runtimeRequestItemId(requestId: string): string {
  return `${RUNTIME_REQUEST_ITEM_TYPE}:${requestId}`;
}

export function mergePayload(prev: unknown, next: unknown): unknown {
  if (!prev || typeof prev !== "object") return next;
  if (!next || typeof next !== "object") return next;
  return { ...(prev as Record<string, unknown>), ...(next as Record<string, unknown>) };
}

export function mergeContextUsage(
  prev: ThreadContextUsage | null,
  usage: ThreadContextUsage,
): ThreadContextUsage {
  return { ...(prev ?? {}), ...usage };
}

export function pruneTrailingInterruptedReasoningItems(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
): void {
  sqlite
    .prepare(
      `DELETE FROM thread_runtime_items
       WHERE thread_id = ?
         AND type = 'reasoning'
         AND parent_item_id IS NULL
         AND position > COALESCE((
           SELECT MAX(position)
           FROM thread_runtime_items
           WHERE thread_id = ?
             AND parent_item_id IS NULL
             AND type NOT IN ('reasoning', 'plan', 'error')
         ), -1)`,
    )
    .run(threadId, threadId);
}

export function readThreadContextUsageInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
): ThreadContextUsage | null {
  const row = sqlite
    .prepare("SELECT usage FROM thread_context_usage WHERE thread_id = ?")
    .get(threadId) as { usage: string } | undefined;
  if (!row) return null;
  const parsed = safeParse(row.usage);
  return parsed && typeof parsed === "object" ? (parsed as ThreadContextUsage) : null;
}

export function replaceThreadContextUsageInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  usage: ThreadContextUsage | null,
): void {
  if (usage === null) {
    sqlite.prepare("DELETE FROM thread_context_usage WHERE thread_id = ?").run(threadId);
    return;
  }
  // Token usage is captured durably at the canonical-event layer (usage_events),
  // not here — this row is only the live context-window snapshot for the UI.
  sqlite
    .prepare(
      `INSERT INTO thread_context_usage (thread_id, usage) VALUES (?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET usage = excluded.usage`,
    )
    .run(threadId, JSON.stringify(usage));
}
