import { dbGetThreadTerminalScrollback } from "@/host/db/terminalScrollback";
import { dbReadCompletedTurnPhase1, dbReadCompletedTurnPhase2 } from "@/host/db/completedTurnPages";
import { dbReadThreadHistoryPagePhase1 } from "@/host/db/historyReads";
import { RUNTIME_PAGE_BOUNDARY_SCAN_SIZE } from "@/host/db/runtimeTimelineReads";
import { dbGetThreadContextUsage, dbReadLatestThreadGoalItem } from "@/host/db/runtimeItems";
import type { RemoteRuntimeHistoryNotice } from "@/shared/remote";
import {
  CATALOG_READS_CAPABILITY,
  HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES,
  HISTORY_TURNS_SOFT_PACK_WIRE_BYTES,
  encodeCompletedTurnCursor,
  historyTurnPageSchema,
} from "@/shared/remote/historyReadContract";
import { HISTORY_DETAILS_PROJECTION } from "@/shared/remote/historyPresentation";
import type { CatalogEffectiveCaps } from "./catalogPageBudget";
import {
  historyEnvelopeTooLarge,
  historyItemTooLarge,
  packCompletedTurnsWithinSoftTarget,
  refuseOversizedCompletedTurn,
  trimHistoryPrefixToCaps,
} from "./historyReadBudget";
import { readProjectedHistoryWindow } from "./historyWindow";
import { boundedRuntimeItemsPageSchema } from "./historyReadSchemas";
import type { BoundedHistoryItemsInput } from "./historyReadBuilders";
import { dbGetThread } from "@/host/db/projectsThreads";
import { RemoteHttpError } from "../auth";

/** Atomic committed-prefix reads. The caller holds the host's thread fence. */
export function readBoundedHistorySnapshotData(
  threadId: string,
  input: {
    readonly compactDetails: boolean;
    readonly includeTerminalScrollback: boolean;
    readonly completedTurnsLimit: number;
    readonly targetTimelineEntryCount: number;
    readonly caps: CatalogEffectiveCaps;
  },
) {
  const { caps } = input;
  const itemsSoft = Math.min(HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES, caps.maxWireBytes);
  const turnsSoft = Math.min(HISTORY_TURNS_SOFT_PACK_WIRE_BYTES, caps.maxWireBytes);
  const phase1 = dbReadThreadHistoryPagePhase1(threadId, {
    ...(input.compactDetails ? { compactDetails: true } : {}),
    // A smaller scan batch avoids probing 500 candidates for a short tail;
    // shared selection still fills the same complete timeline-entry window.
    limit: RUNTIME_PAGE_BOUNDARY_SCAN_SIZE,
    targetTimelineEntryCount: input.targetTimelineEntryCount,
  });
  const { keptMeta, projectedDesc } = readProjectedHistoryWindow(
    threadId,
    phase1.rows,
    itemsSoft,
    caps,
    input.compactDetails,
  );

  const turnsPhase1 = dbReadCompletedTurnPhase1(threadId, {
    limit: input.completedTurnsLimit,
  });
  const turnsPack = packCompletedTurnsWithinSoftTarget(turnsPhase1.rows, turnsSoft);
  refuseOversizedCompletedTurn(turnsPack.packed[0], caps);
  const turnsMeta = dbReadCompletedTurnPhase2(
    threadId,
    turnsPack.packed.map((turn) => turn.idx),
  );
  const goal = dbReadLatestThreadGoalItem(threadId);
  const contextUsage = dbGetThreadContextUsage(threadId);
  return {
    keptMeta,
    projectedDesc,
    itemsOmitted: keptMeta.length < phase1.rows.length || phase1.moreBeyondWindow,
    newestCandidatePosition: phase1.rows[0]?.position,
    turnsMeta,
    turnsOmitted: turnsMeta.length < turnsPhase1.rows.length || turnsPhase1.moreBeyondWindow,
    goal,
    contextUsage,
    terminalScrollback: input.includeTerminalScrollback
      ? dbGetThreadTerminalScrollback(threadId)
      : "",
  };
}

export function readBoundedHistoryItems(
  input: BoundedHistoryItemsInput,
  caps: CatalogEffectiveCaps,
  runtimeNotice: RemoteRuntimeHistoryNotice | undefined,
  compactDetails: boolean,
): string {
  if (!dbGetThread(input.threadId))
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  const soft = Math.min(HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES, caps.maxWireBytes);
  const phase1 = dbReadThreadHistoryPagePhase1(input.threadId, {
    ...(compactDetails ? { compactDetails: true } : {}),
    limit: input.limit,
    ...(input.beforePosition !== undefined ? { beforePosition: input.beforePosition } : {}),
    ...(input.targetTimelineEntryCount !== undefined
      ? { targetTimelineEntryCount: input.targetTimelineEntryCount }
      : {}),
  });
  const { keptMeta, projectedDesc } = readProjectedHistoryWindow(
    input.threadId,
    phase1.rows,
    soft,
    caps,
    compactDetails,
  );
  const pageItemsAsc = [...projectedDesc].reverse();
  const omitted = keptMeta.length < phase1.rows.length || phase1.moreBeyondWindow;
  const nextCursor = (count: number): number | null => {
    if (!omitted && count >= pageItemsAsc.length) return null;
    if (count > 0) return keptMeta[count - 1]!.position;
    const newest = phase1.rows[0]?.position;
    return newest === undefined ? null : newest + 1;
  };
  const serialize = (count: number): string =>
    `${JSON.stringify(
      boundedRuntimeItemsPageSchema.parse({
        reads: CATALOG_READS_CAPABILITY,
        ...(compactDetails ? { historyProjection: HISTORY_DETAILS_PROJECTION } : {}),
        items: pageItemsAsc.slice(pageItemsAsc.length - count),
        nextCursor: nextCursor(count),
        ...(runtimeNotice ? { runtimeNotice } : {}),
      }),
    )}\n`;
  const result = trimHistoryPrefixToCaps({ rows: keptMeta, serialize, caps });
  if ("singleSizes" in result) {
    if (keptMeta.length > 0) {
      throw historyItemTooLarge("runtime_item", keptMeta[0]!.itemId, result.singleSizes, caps);
    }
    throw historyEnvelopeTooLarge(result.singleSizes, caps);
  }
  return result.body;
}

export function readBoundedCompletedTurnPage(input: {
  readonly threadId: string;
  readonly cursorIdx?: number;
  readonly limit: number;
  readonly caps: CatalogEffectiveCaps;
}): string {
  if (!dbGetThread(input.threadId)) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const soft = Math.min(HISTORY_TURNS_SOFT_PACK_WIRE_BYTES, input.caps.maxWireBytes);
  const phase1 = dbReadCompletedTurnPhase1(input.threadId, {
    limit: input.limit,
    ...(input.cursorIdx !== undefined ? { beforeIdx: input.cursorIdx } : {}),
  });
  const pack = packCompletedTurnsWithinSoftTarget(phase1.rows, soft);
  refuseOversizedCompletedTurn(pack.packed[0], input.caps);
  const materialized = dbReadCompletedTurnPhase2(
    input.threadId,
    pack.packed.map((turn) => turn.idx),
  );
  const materializedIds = new Set(materialized.map((turn) => turn.idx));
  const keptMeta = pack.packed.filter((turn) => materializedIds.has(turn.idx));
  const turnsAsc = [...materialized].reverse();
  const omitted = keptMeta.length < phase1.rows.length || phase1.moreBeyondWindow;
  const nextCursor = (count: number): string | null => {
    if (!omitted && count >= turnsAsc.length) return null;
    if (count > 0) return encodeCompletedTurnCursor(keptMeta[count - 1]!.idx);
    const newest = phase1.rows[0]?.idx;
    return newest === undefined ? null : encodeCompletedTurnCursor(newest + 1);
  };
  const serialize = (count: number): string =>
    `${JSON.stringify(
      historyTurnPageSchema.parse({
        reads: CATALOG_READS_CAPABILITY,
        turns: turnsAsc
          .slice(turnsAsc.length - count)
          .map(({ startedAt, endedAt, anchorItemId }) => ({ startedAt, endedAt, anchorItemId })),
        completedTurnsNextCursor: nextCursor(count),
      }),
    )}\n`;
  const trimmed = trimHistoryPrefixToCaps({ rows: keptMeta, serialize, caps: input.caps });
  if ("singleSizes" in trimmed) {
    throw historyItemTooLarge(
      "turn",
      String(keptMeta[0]?.idx ?? phase1.rows[0]?.idx ?? 0),
      trimmed.singleSizes,
      input.caps,
    );
  }
  return trimmed.body;
}
