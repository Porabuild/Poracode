import Database from "better-sqlite3";
import type { ThreadContextUsage } from "@/shared/contracts";
import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";

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

interface ThreadRuntimeSummaryStatementRunner {
  all(...values: string[]): unknown[];
}

interface ThreadRuntimeSummaryQueryRunner {
  prepare(sql: string): ThreadRuntimeSummaryStatementRunner;
}

function runtimeItemState(state: string): PersistedRuntimeItem["state"] {
  return state === "completed" || state === "updated" ? state : "started";
}

function chunkValues<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
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

export function dbGetThreadRuntimeSummaries(
  threadIds: readonly string[],
): Record<string, ThreadRuntimeSummary> {
  return dbReadThreadRuntimeSummaries(getSqlite(), threadIds);
}

export function dbGetThreadRuntimeItems(threadId: string): PersistedRuntimeItem[] {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(
      "SELECT item_id, type, state, payload, streams, parent_item_id FROM thread_runtime_items WHERE thread_id = ? ORDER BY position ASC",
    )
    .all(threadId) as Array<{
    item_id: string;
    type: string;
    state: string;
    payload: string | null;
    streams: string | null;
    parent_item_id: string | null;
  }>;
  return rows.map((row) => ({
    id: row.item_id,
    type: row.type,
    state: runtimeItemState(row.state),
    payload: row.payload ? safeParse(row.payload) : undefined,
    streams: row.streams ? (safeParse(row.streams) as Record<string, string>) : {},
    ...(row.parent_item_id ? { parentItemId: row.parent_item_id } : {}),
  }));
}

export function dbReplaceThreadRuntimeItems(threadId: string, items: PersistedRuntimeItem[]): void {
  const sqlite = getSqlite();
  sqlite.transaction(() => {
    if (!threadExistsInSqlite(sqlite, threadId)) return;
    replaceThreadRuntimeItemsInSqlite(sqlite, threadId, items);
  })();
}

function threadExistsInSqlite(sqlite: InstanceType<typeof Database>, threadId: string): boolean {
  return (
    (sqlite.prepare("SELECT 1 FROM threads WHERE id = ?").get(threadId) as
      | { "1": number }
      | undefined) !== undefined
  );
}

function replaceThreadRuntimeItemsInSqlite(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  items: PersistedRuntimeItem[],
): void {
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
      JSON.stringify(it.streams ?? {}),
      it.parentItemId ?? null,
    );
  }
}

export function dbClearThreadRuntimeItems(threadId: string): void {
  getSqlite().prepare("DELETE FROM thread_runtime_items WHERE thread_id = ?").run(threadId);
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

export function dbReplaceThreadCompletedTurns(
  threadId: string,
  turns: PersistedCompletedTurn[],
): void {
  const sqlite = getSqlite();
  sqlite.transaction(() => {
    if (!threadExistsInSqlite(sqlite, threadId)) return;
    replaceThreadCompletedTurnsInSqlite(sqlite, threadId, turns);
  })();
}

export function dbReplaceThreadRuntimeSnapshot(
  threadId: string,
  items: PersistedRuntimeItem[],
  turns: PersistedCompletedTurn[],
  contextUsage: ThreadContextUsage | null | undefined,
): void {
  const sqlite = getSqlite();
  sqlite.transaction(() => {
    if (!threadExistsInSqlite(sqlite, threadId)) return;
    replaceThreadRuntimeItemsInSqlite(sqlite, threadId, items);
    replaceThreadCompletedTurnsInSqlite(sqlite, threadId, turns);
    if (contextUsage !== undefined) {
      replaceThreadContextUsageInSqlite(sqlite, threadId, contextUsage);
    }
  })();
}

export function dbGetThreadContextUsage(threadId: string): ThreadContextUsage | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare("SELECT usage FROM thread_context_usage WHERE thread_id = ?")
    .get(threadId) as { usage: string } | undefined;
  if (!row) return null;
  const parsed = safeParse(row.usage);
  return parsed && typeof parsed === "object" ? (parsed as ThreadContextUsage) : null;
}

function replaceThreadContextUsageInSqlite(
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
