import Database from "better-sqlite3";
import type { RuntimeEvent, ThreadContextUsage } from "@/shared/contracts";
import { RUNTIME_REQUEST_ITEM_TYPE } from "@/shared/contracts";
import { recordUsageSpentFromRuntimeEvents } from "@/host/profile/usageLedger";
import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";
import type { PersistedRuntimeItem } from "./runtimeItems";
import { appendStreamDelta, clearItemStream, streamHasContent } from "./runtimeStreamStore";

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

/** Runtime transaction busy timeout: no synchronous wait on a lock. */
export const RUNTIME_FLUSH_BUSY_TIMEOUT_MS = 0;

interface RuntimeItemRow {
  type: string;
  state: string;
  payload: string | null;
  streams: string | null;
}

interface WriterStatements {
  getItem: Database.Statement;
  nextPosition: Database.Statement;
  insertItem: Database.Statement;
  updateItem: Database.Statement;
  setItemState: Database.Statement;
  deleteItem: Database.Statement;
  completeOpenRequests: Database.Statement;
}

let cachedStatements: {
  sqlite: InstanceType<typeof Database>;
  statements: WriterStatements;
} | null = null;

function writerStatements(sqlite: InstanceType<typeof Database>): WriterStatements {
  if (cachedStatements?.sqlite === sqlite) return cachedStatements.statements;
  const statements: WriterStatements = {
    getItem: sqlite.prepare(
      "SELECT type, state, payload, streams FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
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
       SET state = ?, payload = ?, streams = ?
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

/**
 * Runs `operation` with a short scoped busy timeout and restores the
 * connection's previous value in a `finally`. The host is single-threaded and
 * synchronous, so no other writer can observe the temporary value.
 */
export function withRuntimeBusyTimeout<T>(
  operation: () => T,
  timeoutMs: number = RUNTIME_FLUSH_BUSY_TIMEOUT_MS,
): T {
  const sqlite = getSqlite();
  let previous: number | undefined;
  try {
    const read = sqlite.pragma("busy_timeout", { simple: true });
    previous = typeof read === "number" ? read : undefined;
  } catch {
    previous = undefined;
  }
  try {
    sqlite.pragma(`busy_timeout = ${Math.max(0, Math.floor(timeoutMs))}`);
    return operation();
  } finally {
    if (previous !== undefined) {
      try {
        sqlite.pragma(`busy_timeout = ${previous}`);
      } catch {
        // The connection is gone; the cache reset on close owns cleanup.
      }
    }
  }
}

export function threadExistsInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
): boolean {
  return (
    (sqlite.prepare("SELECT 1 FROM threads WHERE id = ?").get(threadId) as
      | { "1": number }
      | undefined) !== undefined
  );
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
    sqlite
      .transaction(() => {
        if (!threadExistsInSqlite(sqlite, threadId)) return;

        const statements = writerStatements(sqlite);
        const readItem = (itemId: string) =>
          statements.getItem.get(threadId, itemId) as RuntimeItemRow | undefined;
        let nextItemPosition: number | undefined;
        const appendItem = (item: PersistedRuntimeItem) => {
          nextItemPosition ??= (statements.nextPosition.get(threadId) as { position: number })
            .position;
          statements.insertItem.run(
            threadId,
            item.id,
            nextItemPosition,
            item.type,
            item.state,
            item.payload === undefined ? null : JSON.stringify(item.payload),
            JSON.stringify(item.streams),
            item.parentItemId ?? null,
          );
          nextItemPosition += 1;
        };

        for (const event of events) {
          switch (event.type) {
            case "item.started":
              appendItem({
                id: event.itemId,
                type: event.itemType,
                state: "started",
                streams: {},
                ...(event.payload !== undefined ? { payload: event.payload } : {}),
                ...(event.parentItemId ? { parentItemId: event.parentItemId } : {}),
              });
              break;

            case "item.updated": {
              const row = readItem(event.itemId);
              if (!row) break;
              statements.updateItem.run(
                row.state === "completed" ? "completed" : "updated",
                JSON.stringify(
                  mergePayload(row.payload ? safeParse(row.payload) : undefined, event.payload),
                ),
                row.streams ?? "{}",
                threadId,
                event.itemId,
              );
              break;
            }

            case "item.completed": {
              const row = readItem(event.itemId);
              if (!row) break;
              const streams = row.streams ? (safeParse(row.streams) as Record<string, string>) : {};
              if (
                row.type === "reasoning" &&
                !streamHasContent(
                  sqlite,
                  threadId,
                  event.itemId,
                  "reasoning_text",
                  streams.reasoning_text,
                )
              ) {
                statements.deleteItem.run(threadId, event.itemId);
                break;
              }
              const previousPayload = row.payload ? safeParse(row.payload) : undefined;
              const payload =
                event.payload === undefined
                  ? previousPayload
                  : mergePayload(previousPayload, event.payload);
              statements.updateItem.run(
                "completed",
                payload === undefined ? null : JSON.stringify(payload),
                row.streams ?? "{}",
                threadId,
                event.itemId,
              );
              break;
            }

            case "content.delta": {
              const row = readItem(event.itemId);
              if (!row) break;
              const head = row.streams ? (safeParse(row.streams) as Record<string, string>) : {};
              if (event.replace) {
                clearItemStream(sqlite, threadId, event.itemId, event.stream);
                head[event.stream] = "";
              }
              const appended = appendStreamDelta(sqlite, {
                threadId,
                itemId: event.itemId,
                stream: event.stream,
                delta: event.delta,
                head: head[event.stream] ?? "",
              });
              const nextState = row.state === "completed" ? "completed" : "updated";
              if (appended.head === undefined && !event.replace) {
                // Content went entirely into the append-only tail, so the item row
                // only needs its lifecycle state refreshed — no blob rewrite.
                statements.setItemState.run(nextState, threadId, event.itemId);
                break;
              }
              statements.updateItem.run(
                nextState,
                row.payload,
                JSON.stringify({ ...head, [event.stream]: appended.head ?? "" }),
                threadId,
                event.itemId,
              );
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
                statements.updateItem.run(
                  "started",
                  JSON.stringify(payload),
                  row.streams ?? "{}",
                  threadId,
                  itemId,
                );
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
              statements.updateItem.run(
                "completed",
                row.payload,
                row.streams ?? "{}",
                threadId,
                itemId,
              );
              break;
            }

            default:
              break;
          }
        }

        // Same transaction: a usage failure rolls back the items above, and a
        // retry re-applies idempotently (cumulative counter / sample dedupe).
        recordUsageSpentFromRuntimeEvents(threadId, events);
      })
      .immediate();
  });
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
