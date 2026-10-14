import type { RuntimeEvent, ToolCallPayload } from "@/shared/contracts";
import { msg } from "@/shared/messages";
import {
  interruptDelegatedAgentToolPayload,
  isDelegatedAgentTool,
} from "@/shared/toolCallClassification";
import { dbReadRunningToolCallItems } from "@/host/db/runtimeItems";
import {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
} from "@/host/db/runtimePersistenceTypes";
import { applyThreadRuntimeEventsNow } from "@/host/db/runtimeItemsWriter";
import {
  pendingRuntimeItemPayloadEvents,
  runThreadRuntimeMutation,
  tryRunThreadRuntimeMutation,
} from "@/host/db/runtimePersistenceRuntime";

export type DelegatedAgentSettlementRefusal = "busy" | "storage" | "gap";

export function delegatedAgentSettlementRefusal(error: unknown): DelegatedAgentSettlementRefusal {
  if (error instanceof RuntimePersistenceBusyError) return "busy";
  if (error instanceof RuntimePersistenceContaminatedError) return "gap";
  return "storage";
}

export interface DelegatedAgentBootSettleReport {
  /** Threads that had orphaned delegated-agent rows settled. */
  threads: number;
  /** Total delegated-agent rows settled. */
  items: number;
  /** Committed events for the caller to publish to clients. */
  settledBatches: Array<{ threadId: string; events: RuntimeEvent[] }>;
  /** Exact retired-generation IDs whose mutation was refused. */
  deferredBatches?: Array<{
    threadId: string;
    itemIds: string[];
    refusal: DelegatedAgentSettlementRefusal;
    error: unknown;
  }>;
}

function isOrphaned(payload: ToolCallPayload | undefined): payload is ToolCallPayload {
  return (
    !!payload &&
    isDelegatedAgentTool(payload) &&
    payload.status !== "success" &&
    payload.status !== "error" &&
    !(
      payload.isCrossagent === true &&
      payload.crossagentStatus !== undefined &&
      payload.crossagentStatus !== "running"
    )
  );
}

/** The caller holds the mutation gate; never expand the captured generation. */
function settleCapturedRows(threadId: string, itemIds: ReadonlySet<string>): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const row of dbReadRunningToolCallItems(threadId)) {
    const payload = row.payload as ToolCallPayload | undefined;
    if (!itemIds.has(row.itemId) || !isOrphaned(payload)) continue;
    const errorMessage = msg("runtime.delegatedAgentInterrupted");
    events.push({
      type: "item.completed",
      threadId,
      itemId: row.itemId,
      payload: interruptDelegatedAgentToolPayload(payload, errorMessage),
    });
  }
  applyThreadRuntimeEventsNow(threadId, events);
  return events;
}

/**
 * Capture the dead generation before any replacement supervisor can admit work.
 * The synchronous gate commits accepted prefixes and refuses contamination or
 * held/queued access. Refused IDs survive for event-driven recovery; subsequent
 * attempts must never rescan for new-generation candidates.
 * Legacy completed/status-running inventory is needed only at host boot.
 */
export function settleOrphanedDelegatedAgentRuns(
  includeLegacyCompleted = true,
): DelegatedAgentBootSettleReport {
  const candidates = new Map<string, Set<string>>();
  const payloads = new Map<string, Map<string, ToolCallPayload | undefined>>();
  const capture = (threadId: string, itemId: string, payload: ToolCallPayload | undefined) => {
    if (!isOrphaned(payload)) return;
    const ids = candidates.get(threadId) ?? new Set<string>();
    ids.add(itemId);
    candidates.set(threadId, ids);
  };
  const remember = (threadId: string, itemId: string, payload: ToolCallPayload | undefined) => {
    const thread = payloads.get(threadId) ?? new Map<string, ToolCallPayload | undefined>();
    thread.set(itemId, payload);
    payloads.set(threadId, thread);
    capture(threadId, itemId, payload);
  };
  for (const row of dbReadRunningToolCallItems(undefined, includeLegacyCompleted)) {
    remember(row.threadId, row.itemId, row.payload as ToolCallPayload | undefined);
  }
  for (const event of pendingRuntimeItemPayloadEvents()) {
    if (event.type === "item.started") {
      if (event.itemType === "tool_call")
        remember(event.threadId, event.itemId, event.payload as ToolCallPayload | undefined);
    } else {
      const previous = payloads.get(event.threadId);
      if (!previous?.has(event.itemId)) continue;
      // Normalized updates are shallow payload patches, just like the writer.
      remember(event.threadId, event.itemId, {
        ...previous.get(event.itemId),
        ...(event.payload as Partial<ToolCallPayload> | undefined),
      } as ToolCallPayload);
    }
  }

  const settledBatches: DelegatedAgentBootSettleReport["settledBatches"] = [];
  const deferredBatches: NonNullable<DelegatedAgentBootSettleReport["deferredBatches"]> = [];
  let items = 0;
  for (const [threadId, itemIds] of candidates) {
    try {
      // Existing non-rebase mode: commit prefix, apply callback, no truncation
      // or evidence discard. Only item.completed events mutate the transcript.
      const events = tryRunThreadRuntimeMutation(threadId, "truncate", () =>
        settleCapturedRows(threadId, itemIds),
      );
      if (events.length === 0) continue;
      settledBatches.push({ threadId, events });
      items += events.length;
    } catch (error) {
      deferredBatches.push({
        threadId,
        itemIds: [...itemIds],
        refusal: delegatedAgentSettlementRefusal(error),
        error,
      });
    }
  }
  return {
    threads: settledBatches.length,
    items,
    settledBatches,
    ...(deferredBatches.length ? { deferredBatches } : {}),
  };
}

/** Queue behind existing access owners, retaining the scheduler's bounded wait. */
export function settleDeferredDelegatedAgentRuns(
  threadId: string,
  itemIds: ReadonlySet<string>,
  isActive: () => boolean,
): Promise<RuntimeEvent[]> {
  return runThreadRuntimeMutation(threadId, "truncate", () =>
    isActive() ? settleCapturedRows(threadId, itemIds) : [],
  );
}
