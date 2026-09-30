import Database from "better-sqlite3";
import type { RuntimeEvent, ThreadContextUsage } from "@/shared/contracts";
import { RUNTIME_REQUEST_ITEM_TYPE } from "@/shared/contracts";
import type { PersistedRuntimePage } from "@/shared/ipc/schemas";
import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";
import { clearThreadStreamChunks, streamHasContent, writeItemStreams } from "./runtimeStreamStore";
import {
  chunkValues,
  classifyRuntimeTimelineEntry,
  mapRuntimeItemRow,
  mapRuntimeItemRows,
  placeholders,
  runtimeItemState,
  selectRuntimePageRows,
  type RuntimeTimelineItemRow,
  type RuntimeTimelineKind,
} from "./runtimeTimelineReads";
import {
  applyRuntimeEvents,
  beginRuntimeFence,
  discardRuntimeWrites,
  flushRuntimeFence,
  getRuntimeDurableGapRebaseEpoch,
  hasPendingRuntimeWrites,
  readRuntimeFence,
  releaseRuntimeFence,
  runThreadRuntimeMutation,
  runtimePersistenceController,
  tryRunThreadRuntimeMutation,
} from "./runtimePersistenceRuntime";
import { clearThreadDurableGapRowsInTransaction } from "./runtimeDurableGap";
import {
  readThreadContextUsageInSqlite,
  replaceThreadContextUsageInSqlite,
  threadExistsInSqlite,
  withRuntimeBusyTimeout,
} from "./runtimeItemsWriter";
import {
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
  type RuntimeAdmission,
  type RuntimeFenceResult,
} from "./runtimePersistenceTypes";

/**
 * Persisted canonical chat items per thread. Stored as a flat table keyed by
 * (thread_id, item_id); ordered by `position` to preserve insertion order.
 * Mirrors the renderer's `RuntimeChatItem` shape (id, type, state, payload,
 * streams) so the chat UI can hydrate on reopen.
 */
export interface PersistedRuntimeItem {
  id: string;
  type: string;
  state: "started" | "updated" | "completed";
  payload?: unknown;
  streams: Record<string, string>;
  parentItemId?: string | undefined;
}

export interface ThreadRuntimeSummary {
  itemCount: number;
  latestItemId?: string | undefined;
  latestItemType?: string | undefined;
  latestItemState?: PersistedRuntimeItem["state"] | undefined;
  contextUsage?: ThreadContextUsage | undefined;
}

const SQLITE_IN_CHUNK_SIZE = 500;

/** Row shape of the ordered-transcript reader; shared with the bounded reader. */
type PersistedRuntimeItemRow = RuntimeTimelineItemRow;

interface PositionedPersistedRuntimeItemRow extends PersistedRuntimeItemRow {
  position: number;
}

interface ThreadRuntimeSummaryStatementRunner {
  all(...values: string[]): unknown[];
}

interface ThreadRuntimeSummaryQueryRunner {
  prepare(sql: string): ThreadRuntimeSummaryStatementRunner;
}

/**
 * Low-cost shell snapshot summary: count runtime items and read only the latest
 * item metadata/context usage for many threads at once. This avoids decoding
 * every persisted chat payload on every remote `/api/snapshot` refresh.
 */
export function dbReadThreadRuntimeSummaries(
  sqlite: ThreadRuntimeSummaryQueryRunner,
  threadIds: readonly string[],
): Record<string, ThreadRuntimeSummary> {
  const ids = [...new Set(threadIds)].filter((id) => id.length > 0);
  const summaries: Record<string, ThreadRuntimeSummary> = {};
  for (const id of ids) {
    summaries[id] = { itemCount: 0 };
  }
  for (const chunk of chunkValues(ids, SQLITE_IN_CHUNK_SIZE)) {
    if (chunk.length === 0) continue;
    const sqlPlaceholders = placeholders(chunk.length);
    const runtimeRows = sqlite
      .prepare(
        `
        SELECT thread_id, item_count, item_id, type, state
        FROM (
          SELECT
            thread_id,
            item_id,
            type,
            state,
            COUNT(*) OVER (PARTITION BY thread_id) AS item_count,
            ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY position DESC) AS rn
          FROM thread_runtime_items
          WHERE thread_id IN (${sqlPlaceholders})
        )
        WHERE rn = 1
        `,
      )
      .all(...chunk) as Array<{
      thread_id: string;
      item_count: number;
      item_id: string;
      type: string;
      state: string;
    }>;
    for (const row of runtimeRows) {
      const currentSummary = summaries[row.thread_id] ?? { itemCount: 0 };
      summaries[row.thread_id] = {
        ...currentSummary,
        itemCount: row.item_count,
        latestItemId: row.item_id,
        latestItemType: row.type,
        latestItemState: runtimeItemState(row.state),
      };
    }

    const usageRows = sqlite
      .prepare(
        `SELECT thread_id, usage FROM thread_context_usage WHERE thread_id IN (${sqlPlaceholders})`,
      )
      .all(...chunk) as Array<{ thread_id: string; usage: string }>;
    for (const row of usageRows) {
      const parsed = safeParse(row.usage);
      if (!parsed || typeof parsed !== "object") continue;
      const currentSummary = summaries[row.thread_id] ?? { itemCount: 0 };
      summaries[row.thread_id] = {
        ...currentSummary,
        contextUsage: parsed as ThreadContextUsage,
      };
    }
  }
  return summaries;
}

/**
 * Committed-only projection for shell summaries. Summaries are not an ordered
 * transcript: they deliberately do not flush pending canonical events, carry no
 * cursor, and disclose lag. Callers that need a cursor-consistent transcript
 * use the fence-based readers.
 */
export function dbGetThreadRuntimeSummariesCommitted(
  threadIds: readonly string[],
): Record<string, ThreadRuntimeSummary> {
  return dbReadThreadRuntimeSummaries(getSqlite(), threadIds);
}

/**
 * Run a cursor-bearing ordered-transcript read behind the asynchronous
 * committed-prefix fence: pin the prefix, commit it in chunks, then read
 * synchronously in the same turn the fence is held. Throws typed refusals for
 * degraded, contaminated, cancelled, or deadline outcomes so a short
 * transcript is never served as current.
 */
async function readThreadWithFence<T>(threadId: string, read: () => T): Promise<T> {
  const token = beginRuntimeFence(threadId);
  const result = await flushRuntimeFence(token);
  if (result.kind !== "committed") throw fenceRefusalError(threadId, result);
  return readRuntimeFence(token, read);
}

/** Maps a failed fence outcome to the typed read refusal. */
export function fenceRefusalError(
  threadId: string,
  result: Exclude<RuntimeFenceResult, { kind: "committed" }>,
): RuntimePersistenceDegradedError | RuntimePersistenceContaminatedError {
  if (result.kind === "contaminated") {
    return new RuntimePersistenceContaminatedError(
      threadId,
      result.reason,
      result.refusedEvents,
      result.refusedBytes,
      250,
    );
  }
  if (result.kind === "degraded") {
    return new RuntimePersistenceDegradedError(
      threadId,
      0,
      0,
      result.errorClass,
      250,
      result.error,
    );
  }
  return new RuntimePersistenceDegradedError(
    threadId,
    0,
    0,
    "retryable",
    250,
    new Error(
      result.kind === "cancelled"
        ? "Runtime fence was cancelled."
        : "Runtime fence deadline elapsed.",
    ),
  );
}

/**
 * Ordered canonical transcript for a thread. Fenced: the content is exactly
 * the committed prefix at the request's pinned cursor, or a typed refusal.
 */
export function dbGetThreadRuntimeItems(threadId: string): Promise<PersistedRuntimeItem[]> {
  return readThreadWithFence(threadId, () => dbReadThreadRuntimeItems(threadId));
}

/** Synchronous committed-prefix read. Only call behind a held fence. */
export function dbReadThreadRuntimeItems(threadId: string): PersistedRuntimeItem[] {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(
      "SELECT item_id, type, state, payload, streams, parent_item_id FROM thread_runtime_items WHERE thread_id = ? ORDER BY position ASC",
    )
    .all(threadId) as PersistedRuntimeItemRow[];
  return mapRuntimeItemRows(sqlite, threadId, rows);
}

/**
 * Reads one runtime item by id from the committed prefix, without flushing and
 * without claiming currency (no cursor). Exists so the remote image endpoint
 * can resolve a single inline image without loading a whole thread's payloads.
 */
export function dbGetThreadRuntimeItemCommitted(
  threadId: string,
  itemId: string,
): PersistedRuntimeItem | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      "SELECT item_id, type, state, payload, streams, parent_item_id FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
    )
    .get(threadId, itemId) as PersistedRuntimeItemRow | undefined;
  return row ? mapRuntimeItemRows(sqlite, threadId, [row])[0]! : null;
}

/** Fenced ordered-transcript read for the latest goal even when it precedes the page window. */
export function dbGetLatestThreadGoalItem(threadId: string): Promise<PersistedRuntimeItem | null> {
  return readThreadWithFence(threadId, () => dbReadLatestThreadGoalItem(threadId));
}

/** Synchronous committed-prefix read. Only call behind a held fence. */
export function dbReadLatestThreadGoalItem(threadId: string): PersistedRuntimeItem | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `SELECT item_id, type, state, payload, streams, parent_item_id
       FROM thread_runtime_items
       WHERE thread_id = ? AND type = 'goal'
       ORDER BY position DESC
       LIMIT 1`,
    )
    .get(threadId) as PersistedRuntimeItemRow | undefined;
  return row ? mapRuntimeItemRow(row) : null;
}

/** Fenced ordered-transcript page. Content is the committed prefix or typed refusal. */
export function dbGetThreadRuntimeItemsPage(
  threadId: string,
  beforePosition: number | undefined,
  limit: number,
  targetTimelineEntryCount?: number,
): Promise<PersistedRuntimePage> {
  return readThreadWithFence(threadId, () =>
    dbReadThreadRuntimeItemsPage(threadId, beforePosition, limit, targetTimelineEntryCount),
  );
}

/**
 * Every tool_call row that still reads as running, across all threads, with
 * its parsed payload. Generic on purpose — no delegated-agent knowledge here —
 * so boot-time maintenance (e.g. settling orphaned Crossagent runs when the
 * run-owning supervisor process was replaced) can classify rows itself.
 *
 * Cost note: this is an unindexed scan (no index covers `type`/`state`), so
 * it reads the whole table per call; callers are boot and supervisor reset
 * only. The result set is small but not bounded by construction — native
 * sub-agent rows whose terminal event never landed accumulate until the
 * renderer's session-liveness reconcile settles their display. A partial
 * index (`WHERE type = 'tool_call' AND state != 'completed'`) is the follow-up
 * if these scans ever show up in boot profiles.
 */
export function dbReadRunningToolCallItems(): Array<{
  threadId: string;
  itemId: string;
  payload: unknown;
}> {
  const rows = getSqlite()
    .prepare(
      `SELECT thread_id, item_id, payload
       FROM thread_runtime_items
       WHERE type = 'tool_call' AND state != 'completed'`,
    )
    .all() as Array<{ thread_id: string; item_id: string; payload: string | null }>;
  return rows.map((row) => ({
    threadId: row.thread_id,
    itemId: row.item_id,
    payload: row.payload === null ? undefined : safeParse(row.payload),
  }));
}

/** Synchronous committed-prefix page read. Only call behind a held fence. */
export function dbReadThreadRuntimeItemsPage(
  threadId: string,
  beforePosition: number | undefined,
  limit: number,
  targetTimelineEntryCount?: number,
): PersistedRuntimePage {
  const sqlite = getSqlite();
  const childParentIds = new Set(
    (
      sqlite
        .prepare(
          "SELECT DISTINCT parent_item_id FROM thread_runtime_items WHERE thread_id = ? AND parent_item_id IS NOT NULL",
        )
        .all(threadId) as Array<{ parent_item_id: string }>
    ).map((row) => row.parent_item_id),
  );
  const readTailRows = sqlite.prepare(
    `SELECT item_id, position, type, state, payload, streams, parent_item_id
     FROM thread_runtime_items
     WHERE thread_id = ?
     ORDER BY position DESC
     LIMIT ?`,
  );
  const readOlderRows = sqlite.prepare(
    `SELECT item_id, position, type, state, payload, streams, parent_item_id
     FROM thread_runtime_items
     WHERE thread_id = ? AND position < ?
     ORDER BY position DESC
     LIMIT ?`,
  );
  const readRows = (cursor: number | undefined, rowLimit: number) =>
    (cursor === undefined
      ? readTailRows.all(threadId, rowLimit)
      : readOlderRows.all(threadId, cursor, rowLimit)) as PositionedPersistedRuntimeItemRow[];

  const isTimelineGroup = (row: PositionedPersistedRuntimeItemRow): boolean =>
    classifyRuntimeTimelineRow(sqlite, threadId, row, childParentIds) !== "item";

  if (targetTimelineEntryCount === undefined) {
    const page = selectRuntimePageRows({
      readRows,
      isTimelineGroup,
      classify: (row) => classifyRuntimeTimelineRow(sqlite, threadId, row, childParentIds),
      ...(beforePosition !== undefined ? { beforePosition } : {}),
      limit,
    });
    return {
      items: mapRuntimeItemRows(sqlite, threadId, [...page.rows].reverse()),
      nextCursor: page.hasMore ? (page.rows.at(-1)?.position ?? null) : null,
    };
  }

  const page = selectRuntimePageRows({
    readRows,
    isTimelineGroup,
    classify: (row) => classifyRuntimeTimelineRow(sqlite, threadId, row, childParentIds),
    ...(beforePosition !== undefined ? { beforePosition } : {}),
    limit,
    targetTimelineEntryCount,
  });
  return {
    items: mapRuntimeItemRows(sqlite, threadId, [...page.rows].reverse()),
    nextCursor: page.hasMore ? (page.rows.at(-1)?.position ?? null) : null,
  };
}

/** Fenced ordered-transcript page of conversational messages. */
export function dbGetThreadConversationItemsPage(
  threadId: string,
  beforePosition: number | undefined,
  limit: number,
): Promise<PersistedRuntimePage> {
  return readThreadWithFence(threadId, () =>
    dbReadThreadConversationItemsPage(threadId, beforePosition, limit),
  );
}

/** Synchronous committed-prefix read. Only call behind a held fence. */
export function dbReadThreadConversationItemsPage(
  threadId: string,
  beforePosition: number | undefined,
  limit: number,
): PersistedRuntimePage {
  const sqlite = getSqlite();
  const rows = (
    beforePosition === undefined
      ? sqlite
          .prepare(
            `SELECT item_id, position, type, state, payload, streams, parent_item_id
           FROM thread_runtime_items
           WHERE thread_id = ? AND parent_item_id IS NULL
             AND type IN ('user_message', 'assistant_message')
           ORDER BY position DESC
           LIMIT ?`,
          )
          .all(threadId, limit + 1)
      : sqlite
          .prepare(
            `SELECT item_id, position, type, state, payload, streams, parent_item_id
           FROM thread_runtime_items
           WHERE thread_id = ? AND position < ? AND parent_item_id IS NULL
             AND type IN ('user_message', 'assistant_message')
           ORDER BY position DESC
           LIMIT ?`,
          )
          .all(threadId, beforePosition, limit + 1)
  ) as PositionedPersistedRuntimeItemRow[];
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit).reverse();
  return {
    items: mapRuntimeItemRows(sqlite, threadId, pageRows),
    nextCursor: hasMore ? (pageRows[0]?.position ?? null) : null,
  };
}

/**
 * Legacy adapter over the shared classifier: it supplies the two lazy text
 * probes (parsed payload for named tools, stream content for completed
 * reasoning) and nothing else. The hidden/group/item decision itself lives in
 * `runtimeTimelineReads.ts` and is shared with the bounded history reader.
 */
function classifyRuntimeTimelineRow(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  row: PositionedPersistedRuntimeItemRow,
  childParentIds: ReadonlySet<string>,
): RuntimeTimelineKind {
  return classifyRuntimeTimelineEntry({
    itemId: row.item_id,
    type: row.type,
    state: row.state,
    parentItemId: row.parent_item_id,
    childParentIds,
    payload: () => {
      const parsedPayload = row.payload ? safeParse(row.payload) : undefined;
      return parsedPayload && typeof parsedPayload === "object"
        ? (parsedPayload as Record<string, unknown>)
        : undefined;
    },
    reasoningHasContent: () => {
      const streams = row.streams ? safeParse(row.streams) : undefined;
      const reasoningText =
        streams && typeof streams === "object"
          ? (streams as Record<string, unknown>).reasoning_text
          : undefined;
      return streamHasContent(
        sqlite,
        threadId,
        row.item_id,
        "reasoning_text",
        typeof reasoningText === "string" ? reasoningText : undefined,
      );
    },
  });
}

/**
 * Applies the supervisor's canonical runtime events to SQLite through the
 * bounded persistence controller. The controller owns admission, retry, and
 * producer backpressure; the queue coalesces each item's consecutive deltas
 * and writes once per window, so a streaming item costs a few row rewrites per
 * second instead of one per chunk.
 *
 * The returned admission is the accepted/committed boundary: a refusal means
 * the events were NOT accepted into host memory and the caller must treat the
 * producer as backpressured, never as durable.
 */
export function dbApplyThreadRuntimeEvents(
  threadId: string,
  events: readonly RuntimeEvent[],
): RuntimeAdmission {
  if (events.length === 0) {
    return {
      kind: "accepted",
      persistSeq: 0,
      estimatedBytes: 0,
      acceptedEvents: 0,
      refusedEvents: 0,
      refusedBytes: 0,
    };
  }
  return applyRuntimeEvents(threadId, events);
}

/**
 * Bounded asynchronous prefix flush for callers that need accepted runtime
 * events committed before their own follow-up work. There is no synchronous
 * "flush and claim latest" API left: the fence commits the pinned prefix in
 * chunks and refuses typed instead of fabricating a complete result.
 */
export async function dbFlushThreadRuntimeWrites(threadId?: string): Promise<void> {
  const threadIds =
    threadId !== undefined ? [threadId] : runtimePersistenceController.pendingThreadIds();
  for (const pendingThreadId of threadIds) {
    const token = beginRuntimeFence(pendingThreadId);
    const result = await flushRuntimeFence(token);
    if (result.kind !== "committed") {
      throw fenceRefusalError(pendingThreadId, result);
    }
    // This caller commits a prefix without reading behind it, so it owns the
    // release: a held fence would pin the thread until its max-hold timer.
    releaseRuntimeFence(token);
  }
}

export function dbDiscardThreadRuntimeWrites(threadId: string): void {
  discardRuntimeWrites(threadId);
}

export function dbHasPendingThreadRuntimeWrites(threadId?: string): boolean {
  return hasPendingRuntimeWrites(threadId);
}

/**
 * Wholesale runtime replacement. This is an authoritative rebase: the gate
 * commits the accepted prefix for a clean thread, applies the replacement, and
 * records an explicit supersede for a contaminated thread (the rebase is that
 * thread's recovery).
 */
export async function dbReplaceThreadRuntimeItems(
  threadId: string,
  items: PersistedRuntimeItem[],
): Promise<void> {
  await runThreadRuntimeMutation(threadId, "replace", () => {
    const sqlite = getSqlite();
    withRuntimeBusyTimeout(() => {
      sqlite
        .transaction(() => {
          if (!threadExistsInSqlite(sqlite, threadId)) return;
          replaceThreadRuntimeItemsInSqlite(sqlite, threadId, items);
        })
        .immediate();
    });
  });
}

function replaceThreadRuntimeItemsInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  items: PersistedRuntimeItem[],
): void {
  // Authoritative rebase: clear exact gap evidence and older-epoch touches in
  // the SAME transaction as the transcript replacement. The current boot's
  // touch is preserved when it existed, so a live producer that was launched
  // in this boot stays covered across the rebase (it re-enters through the
  // mandatory admission touch, which is a no-op while that row survives).
  clearThreadDurableGapRowsInTransaction(sqlite, threadId, getRuntimeDurableGapRebaseEpoch());
  // A wholesale replace supplies each item's complete stream text, so any
  // append-only tail left from streaming is stale and must go with it.
  const replace = sqlite.prepare(
    `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams, parent_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(thread_id, item_id) DO UPDATE SET
       position = excluded.position,
       type = excluded.type,
       state = excluded.state,
       payload = excluded.payload,
       streams = excluded.streams,
       parent_item_id = excluded.parent_item_id`,
  );
  clearThreadStreamChunks(sqlite, threadId);
  const incomingIds = new Set(items.map((it) => it.id));
  const existing = sqlite
    .prepare("SELECT item_id FROM thread_runtime_items WHERE thread_id = ?")
    .all(threadId) as Array<{ item_id: string }>;
  const removeStmt = sqlite.prepare(
    "DELETE FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
  );
  for (const row of existing) {
    if (!incomingIds.has(row.item_id)) {
      removeStmt.run(threadId, row.item_id);
    }
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    replace.run(
      threadId,
      it.id,
      i,
      it.type,
      it.state,
      it.payload === undefined ? null : JSON.stringify(it.payload),
      "{}",
      it.parentItemId ?? null,
    );
    writeItemStreams(sqlite, threadId, it.id, it.streams ?? {});
  }
}

/**
 * Deletion is an authoritative rebase: the gate cancels any active fence (its
 * reader settles `cancelled`), explicitly discards the thread's buffered
 * writes, and deletes the rows in one mutation. Contamination is cleared
 * because the rows are gone.
 */
export async function dbClearThreadRuntimeItems(threadId: string): Promise<void> {
  await runThreadRuntimeMutation(threadId, "delete", () => {
    const sqlite = getSqlite();
    withRuntimeBusyTimeout(() => {
      sqlite
        .transaction(() => {
          sqlite.prepare("DELETE FROM thread_runtime_items WHERE thread_id = ?").run(threadId);
          // Authoritative rebase: durable gap evidence goes with the transcript
          // in the same transaction.
          clearThreadDurableGapRowsInTransaction(
            sqlite,
            threadId,
            getRuntimeDurableGapRebaseEpoch(),
          );
        })
        .immediate();
    });
  });
}

/**
 * Deletes the tail after the retained checkpoint and reports its removed turn
 * anchors from the same transaction. Unrelated orphan turns survive. Callers
 * publish a truncation only when rows were removed, so a no-op cannot later
 * replay as a destructive client event.
 *
 * Synchronous by contract (the checkpoint-revert boundary): the mutation gate
 * grants it only when no fence/mutation is active for the thread; otherwise it
 * throws typed busy instead of landing inside a fence's flush/read window.
 * Truncate is not an authoritative rebase (it preserves a prefix), so a
 * contaminated thread refuses typed rather than silently dropping the hole.
 */
export function dbTruncateThreadRuntimeAfter(
  threadId: string,
  itemId: string,
): {
  truncated: boolean;
  removedCompletedTurnAnchors: string[];
} {
  return tryRunThreadRuntimeMutation(threadId, "truncate", () => {
    const sqlite = getSqlite();
    let truncated = false;
    let removedCompletedTurnAnchors: string[] = [];
    withRuntimeBusyTimeout(() => {
      sqlite
        .transaction(() => {
          const checkpoint = sqlite
            .prepare(
              "SELECT position FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?",
            )
            .get(threadId, itemId) as { position: number } | undefined;
          if (!checkpoint) return;
          // Select and delete anchored turns before deleting their tail items;
          // the shared subquery keeps both metadata and deletion scoped to this tail.
          const removedTurnAnchors = (
            sqlite
              .prepare(
                `SELECT anchor_item_id FROM thread_completed_turns
             WHERE thread_id = ?
               AND anchor_item_id IN (
                 SELECT item_id FROM thread_runtime_items
                 WHERE thread_id = ? AND position > ?
               )`,
              )
              .all(threadId, threadId, checkpoint.position) as Array<{ anchor_item_id: string }>
          ).map((row) => row.anchor_item_id);
          sqlite
            .prepare(
              `DELETE FROM thread_completed_turns
           WHERE thread_id = ? AND anchor_item_id IN (
             SELECT item_id FROM thread_runtime_items
             WHERE thread_id = ? AND position > ?
           )`,
            )
            .run(threadId, threadId, checkpoint.position);
          const deletedItems = sqlite
            .prepare("DELETE FROM thread_runtime_items WHERE thread_id = ? AND position > ?")
            .run(threadId, checkpoint.position);
          truncated = deletedItems.changes > 0;
          removedCompletedTurnAnchors = [...new Set(removedTurnAnchors)];
        })
        .immediate();
    });
    return { truncated, removedCompletedTurnAnchors };
  });
}

/**
 * Frozen per-turn timing window. One row per completed turn (first user
 * input → thread settles back to idle). Mirrors the renderer's
 * `CompletedTurnRecord` shape.
 */
export interface PersistedCompletedTurn {
  startedAt: string;
  endedAt: string;
  anchorItemId: string | null;
}

export function dbGetThreadCompletedTurns(threadId: string): PersistedCompletedTurn[] {
  // Committed-only projection used by control writes and snapshots; the
  // control-op retry rebuilds it after a failed attempt.
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(
      "SELECT started_at, ended_at, anchor_item_id FROM thread_completed_turns WHERE thread_id = ? ORDER BY idx ASC",
    )
    .all(threadId) as Array<{
    started_at: string;
    ended_at: string;
    anchor_item_id: string | null;
  }>;
  return rows.map((row) => ({
    startedAt: row.started_at,
    endedAt: row.ended_at,
    anchorItemId: row.anchor_item_id,
  }));
}

export function dbAppendThreadCompletedTurn(threadId: string, turn: PersistedCompletedTurn): void {
  // Idempotent control write (dedupe by turn timestamps); runs through the
  // controller's retrying control queue, never as a synchronous flush.
  const sqlite = getSqlite();
  withRuntimeBusyTimeout(() => {
    sqlite
      .transaction(() => {
        if (!threadExistsInSqlite(sqlite, threadId)) return;
        const duplicate = sqlite
          .prepare(
            `SELECT 1 AS ok
             FROM thread_completed_turns
             WHERE thread_id = ? AND started_at = ? AND ended_at = ?
             LIMIT 1`,
          )
          .get(threadId, turn.startedAt, turn.endedAt) as { ok: number } | undefined;
        if (duplicate) return;
        const row = sqlite
          .prepare(
            "SELECT COALESCE(MAX(idx), -1) + 1 AS idx FROM thread_completed_turns WHERE thread_id = ?",
          )
          .get(threadId) as { idx: number };
        sqlite
          .prepare(
            `INSERT INTO thread_completed_turns
             (thread_id, idx, started_at, ended_at, anchor_item_id)
           VALUES (?, ?, ?, ?, ?)`,
          )
          .run(threadId, row.idx, turn.startedAt, turn.endedAt, turn.anchorItemId);
      })
      .immediate();
  });
}

export function dbGetLatestThreadRuntimeAnchorItemId(threadId: string): string | null {
  const row = getSqlite()
    .prepare(
      `SELECT item_id
       FROM thread_runtime_items
       WHERE thread_id = ?
         AND type NOT IN ('user_message', 'plan', 'goal', 'error', 'provider_handoff')
         AND type != ?
         AND parent_item_id IS NULL
       ORDER BY position DESC
       LIMIT 1`,
    )
    .get(threadId, RUNTIME_REQUEST_ITEM_TYPE) as { item_id: string } | undefined;
  return row?.item_id ?? null;
}

export function dbReplaceThreadCompletedTurns(
  threadId: string,
  turns: PersistedCompletedTurn[],
): void {
  const sqlite = getSqlite();
  withRuntimeBusyTimeout(() => {
    sqlite
      .transaction(() => {
        if (!threadExistsInSqlite(sqlite, threadId)) return;
        replaceThreadCompletedTurnsInSqlite(sqlite, threadId, turns);
      })
      .immediate();
  });
}

/**
 * Apply a snapshot replacement without the per-thread gate. Only the
 * controller's mutation gate may call this, from inside a granted `replace`/
 * `reset` mutation, because the gate already committed the accepted prefix (or
 * explicitly superseded it for a contaminated rebase).
 */
export function replaceThreadRuntimeSnapshotUnchecked(
  threadId: string,
  items: PersistedRuntimeItem[],
  turns: PersistedCompletedTurn[],
  contextUsage: ThreadContextUsage | null | undefined,
): void {
  const sqlite = getSqlite();
  withRuntimeBusyTimeout(() => {
    sqlite
      .transaction(() => {
        if (!threadExistsInSqlite(sqlite, threadId)) return;
        replaceThreadRuntimeItemsInSqlite(sqlite, threadId, items);
        replaceThreadCompletedTurnsInSqlite(sqlite, threadId, turns);
        if (contextUsage !== undefined) {
          replaceThreadContextUsageInSqlite(sqlite, threadId, contextUsage);
        }
      })
      .immediate();
  });
}

/**
 * Snapshot replacement. This is an authoritative rebase: the gate commits the
 * accepted prefix for a clean thread, applies the replacement, and records an
 * explicit supersede for a contaminated thread (the reset is that thread's
 * recovery). A failed replacement keeps both the pending prefix and the
 * contamination.
 */
export async function dbReplaceThreadRuntimeSnapshot(
  threadId: string,
  items: PersistedRuntimeItem[],
  turns: PersistedCompletedTurn[],
  contextUsage: ThreadContextUsage | null | undefined,
): Promise<void> {
  await runThreadRuntimeMutation(threadId, "replace", () =>
    replaceThreadRuntimeSnapshotUnchecked(threadId, items, turns, contextUsage),
  );
}

export function dbGetThreadContextUsage(threadId: string): ThreadContextUsage | null {
  return readThreadContextUsageInSqlite(getSqlite(), threadId);
}

function replaceThreadCompletedTurnsInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  turns: PersistedCompletedTurn[],
): void {
  const insert = sqlite.prepare(
    `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
       VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(thread_id, idx) DO UPDATE SET
       started_at = excluded.started_at,
       ended_at = excluded.ended_at,
       anchor_item_id = excluded.anchor_item_id`,
  );
  const remove = sqlite.prepare(
    "DELETE FROM thread_completed_turns WHERE thread_id = ? AND idx >= ?",
  );
  remove.run(threadId, turns.length);
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]!;
    insert.run(threadId, i, turn.startedAt, turn.endedAt, turn.anchorItemId ?? null);
  }
}
