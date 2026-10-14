import { getSqlite } from "./connection";
import { readRuntimeSnapshot } from "./runtimeReadSnapshot";
import type { PersistedRuntimeItem } from "./runtimeItems";
import { mapRuntimeItemRows, type RuntimeTimelineItemRow } from "./runtimeTimelineReads";

export interface RuntimeItemReadOptions {
  /**
   * Include the stored stream head and appended tails (default: true).
   * Set false for payload/metadata reads: no stored stream text is selected or
   * assembled, and the returned item's streams are {}. This changes only the
   * projection, not the reader's committed-only or fenced consistency.
   */
  includeStreams?: boolean;
}

/**
 * Reads one item from the committed prefix without flushing pending events or
 * claiming currency (no cursor). Call the fenced reader when pending canonical
 * events must commit before the read.
 */
export function dbGetThreadRuntimeItemCommitted(
  threadId: string,
  itemId: string,
  options: RuntimeItemReadOptions = {},
): PersistedRuntimeItem | null {
  const sqlite = getSqlite();
  const includeStreams = options.includeStreams !== false;
  const read = () => {
    const row = sqlite
      .prepare(
        `SELECT item_id, type, state, payload, ${includeStreams ? "streams" : "NULL AS streams"}, parent_item_id FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?`,
      )
      .get(threadId, itemId) as RuntimeTimelineItemRow | undefined;
    if (!row) return null;
    return mapRuntimeItemRows(sqlite, threadId, [row], { includeStreams })[0]!;
  };
  return readRuntimeSnapshot(sqlite, read);
}
