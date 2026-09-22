import type { RuntimeEvent, ToolCallPayload } from "@/shared/contracts";
import { dbReadRunningToolCallItems } from "@/host/db/runtimeItems";
import { applyThreadRuntimeEventsNow } from "@/host/db/runtimeItemsWriter";
import {
  commitRuntimeThreadPrefixSync,
  pendingRuntimeThreadIds,
} from "@/host/db/runtimePersistenceRuntime";

/**
 * The text a host-restart interruption leaves in the run tile's result slot.
 * Plain string, matching the shape real Crossagent settle tiles persist (the
 * run's output text); rendered by the same generic result handling.
 */
const HOST_RESTART_SETTLE_TEXT = "Interrupted: the host restarted before this run completed.";

export interface CrossagentBootSettleReport {
  /** Threads that had orphaned run rows settled. */
  threads: number;
  /** Total run rows settled. */
  items: number;
  /** The settle events per thread, for the caller to publish to clients. */
  settledBatches: Array<{ threadId: string; events: RuntimeEvent[] }>;
}

/**
 * Settle every still-running Crossagent run row in the database.
 *
 * Crossagent runs live in the supervisor process's run manager and die with
 * it, but a run whose process died without a settle tile leaves its
 * `thread_runtime_items` row reading "running" forever. A freshly spawned
 * supervisor tracks nothing, so "running in the DB" can only mean "owned by a
 * previous supervisor generation" exactly when no supervisor exists yet —
 * which is why this runs before the first spawn and again on every supervisor
 * reset (crash, explicit restart), never while a supervisor is up.
 *
 * Runtime events commit on a ~250ms drain, so events the dying supervisor
 * already had admitted may still be uncommitted when a reset fires. The pass
 * first commits every pending thread's accepted prefix synchronously, which
 * makes the read see the dying generation's final state; only the supervisor
 * admits crossagent events, and it is dead, so nothing new can race the
 * settle write afterwards. A thread whose prefix commit refuses (degraded or
 * fenced storage) is skipped — its rows keep the pre-sweep status quo and the
 * next pass retries.
 *
 * The settle write uses the flush-path transaction primitive directly: the
 * bypass is the point (an authoritative out-of-band write, like the truncate
 * control path), and its precondition — no pending runtime writes for the
 * affected threads — is established by the prefix commit above.
 *
 * After this pass, a running Crossagent row in the database is a live run of
 * the current supervisor, which is the invariant renderer hydration relies on
 * to stop force-failing unobserved rows. Native sub-agent rows are left
 * alone: they belong to parent sessions, and the renderer already reconciles
 * those against session liveness.
 */
export function settleOrphanedCrossagentRuns(): CrossagentBootSettleReport {
  for (const threadId of pendingRuntimeThreadIds()) {
    try {
      commitRuntimeThreadPrefixSync(threadId);
    } catch (error) {
      console.warn(
        `[backend] Crossagent settle: pending prefix commit refused for thread ${threadId}:`,
        error,
      );
    }
  }

  const itemIdsByThread = new Map<string, string[]>();
  for (const row of dbReadRunningToolCallItems()) {
    const payload = row.payload as ToolCallPayload | undefined;
    if (payload?.isCrossagent !== true) continue;
    const itemIds = itemIdsByThread.get(row.threadId) ?? [];
    itemIds.push(row.itemId);
    itemIdsByThread.set(row.threadId, itemIds);
  }

  const settledBatches: Array<{ threadId: string; events: RuntimeEvent[] }> = [];
  let items = 0;
  for (const [threadId, itemIds] of itemIdsByThread) {
    const events: RuntimeEvent[] = itemIds.map((itemId) => ({
      type: "item.completed",
      threadId,
      itemId,
      payload: {
        status: "error",
        isCrossagent: true,
        crossagentStatus: "failed",
        result: HOST_RESTART_SETTLE_TEXT,
      },
    }));
    applyThreadRuntimeEventsNow(threadId, events);
    settledBatches.push({ threadId, events });
    items += itemIds.length;
  }
  return { threads: itemIdsByThread.size, items, settledBatches };
}
