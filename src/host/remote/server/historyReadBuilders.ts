import {
  CATALOG_READS_CAPABILITY,
  HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES,
  HISTORY_TIMELINE_ENTRY_DEFAULT,
  HISTORY_TURNS_SOFT_PACK_WIRE_BYTES,
  encodeCompletedTurnCursor,
  historyTurnPageSchema,
} from "@/shared/remote/historyReadContract";
import type { RemoteRuntimeHistoryNotice } from "@/shared/remote";
import {
  HISTORY_DETAILS_PROJECTION,
  type HistoryRuntimeItem,
} from "@/shared/remote/historyPresentation";
import { dbReadCompletedTurnPhase1, dbReadCompletedTurnPhase2 } from "@/host/db/completedTurnPages";
import { dbReadThreadHistoryPagePhase1, type HistoryPageRowMeta } from "@/host/db/historyReads";
import { dbGetThread } from "@/host/db/projectsThreads";
import { runtimeHistoryRevision } from "@/host/db/runtimeHistoryRevision";
import { RUNTIME_PAGE_BOUNDARY_SCAN_SIZE } from "@/host/db/runtimeTimelineReads";
import {
  dbGetThreadContextUsage,
  dbReadLatestThreadGoalItem,
  type PersistedRuntimeItem,
} from "@/host/db/runtimeItems";
import { readRuntimeFence } from "@/host/db/runtimePersistenceRuntime";
import { dbGetThreadTerminalScrollback } from "@/host/db/terminalScrollback";
import { RemoteHttpError } from "../auth";
import {
  catalogSizesFit,
  measureCatalogBody,
  type CatalogEffectiveCaps,
} from "./catalogPageBudget";
import type { RemoteServerContext } from "./context";
import {
  historyEnvelopeTooLarge,
  historyItemTooLarge,
  maxFittingCount,
  packCompletedTurnsWithinSoftTarget,
  refuseOversizedCompletedTurn,
  trimHistoryPrefixToCaps,
  type HistoryTrimResult,
} from "./historyReadBudget";
import {
  beginRuntimeFence,
  flushHistoryFenceOrThrow,
  mapHistoryPersistenceRefusal,
} from "./historyReadFence";
import type { HistoryReadNegotiation } from "./historyReadNegotiation";
import { boundedRuntimeItemsPageSchema, boundedThreadSnapshotSchema } from "./historyReadSchemas";
import { projectRuntimeItemsImageRefs } from "./imageRefProjection";
import { readProjectedHistoryWindow } from "./historyWindow";
import { readRuntimeHistoryNoticeForRead } from "./runtimeHistoryNoticeGate";
import { withStableUpdatedAt } from "./stableUpdatedAt";

/**
 * B4 bounded-history page builders. Each builder owns the fence lifecycle: the
 * intake prefix and `ctx.seq` are captured in the same synchronous turn before
 * the awaited flush, and phase 1 + phase 2 run inside the held fence. Bodies
 * are exact-measured against the negotiated caps before they are returned.
 */

export interface BoundedHistorySnapshotOptions {
  readonly omitScrollback?: boolean;
  readonly targetTimelineEntryCount?: number;
}

/**
 * Bounded `thread-history`: the same snapshot shape as the legacy route, but
 * the runtime tail and completed-turn tail are phase-1 packed, fetched by key,
 * and exact-measured against the negotiated caps. `runtimeNextCursor` remains
 * the oldest returned item position and `completedTurnsNextCursor` is the
 * `ct1.<idx>` of the oldest returned turn, so continuation is exact.
 */
export async function buildBoundedThreadSnapshot(
  ctx: RemoteServerContext,
  threadId: string,
  negotiation: HistoryReadNegotiation,
  options: BoundedHistorySnapshotOptions = {},
): Promise<string> {
  const initialThread = dbGetThread(threadId);
  if (!initialThread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const readsTerminal = initialThread.presentationMode !== "gui";
  // Asynchronous committed-prefix fence: pin the intake prefix and capture the
  // published cursor in the SAME synchronous turn, then commit the prefix in
  // chunks, then read phase 1 + phase 2 behind the held fence. Content is
  // exactly the published canonical domain at or below `snapshotSeq`.
  const fenceToken = beginRuntimeFence(threadId);
  const snapshotSeq = ctx.seq;
  const runtimeResumeCursor = ctx.threadHistoryReplay.cursor(
    threadId,
    snapshotSeq,
    runtimeHistoryRevision(threadId),
  );
  await flushHistoryFenceOrThrow(threadId, fenceToken);

  const caps = negotiation.caps;
  const itemsSoft = Math.min(HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES, caps.maxWireBytes);
  const turnsSoft = Math.min(HISTORY_TURNS_SOFT_PACK_WIRE_BYTES, caps.maxWireBytes);
  const targetTimelineEntryCount =
    options.targetTimelineEntryCount ?? HISTORY_TIMELINE_ENTRY_DEFAULT;

  let fenced: {
    readonly keptMeta: readonly HistoryPageRowMeta[];
    readonly projectedDesc: readonly HistoryRuntimeItem[];
    readonly itemsOmitted: boolean;
    readonly newestCandidatePosition: number | undefined;
    readonly turnsMeta: ReturnType<typeof dbReadCompletedTurnPhase2>;
    readonly turnsOmitted: boolean;
    readonly goal: PersistedRuntimeItem | null;
    readonly contextUsage: ReturnType<typeof dbGetThreadContextUsage>;
    readonly runtimeNotice: RemoteRuntimeHistoryNotice | undefined;
  };
  try {
    fenced = readRuntimeFence(fenceToken, () => {
      const phase1 = dbReadThreadHistoryPagePhase1(threadId, {
        ...(negotiation.compactDetails ? { compactDetails: true } : {}),
        // A smaller scan batch avoids probing 500 candidates for a short tail;
        // shared selection still fills the same complete timeline-entry window.
        limit: RUNTIME_PAGE_BOUNDARY_SCAN_SIZE,
        targetTimelineEntryCount,
      });
      const { keptMeta, projectedDesc } = readProjectedHistoryWindow(
        threadId,
        phase1.rows,
        itemsSoft,
        caps,
        negotiation.compactDetails,
      );

      const turnsPhase1 = dbReadCompletedTurnPhase1(threadId, {
        limit: negotiation.completedTurnsLimit,
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
        // B1: gate + notice projection share this synchronous fenced turn with
        // the transcript reads, so an acknowledgement cannot land between them.
        runtimeNotice: readRuntimeHistoryNoticeForRead(ctx, threadId, negotiation.noticesDeclared),
      };
    });
  } catch (error) {
    // A contaminated thread must not be served as a short tail with a fresh
    // cursor (the client would replay and double-apply the gap).
    throw mapHistoryPersistenceRefusal(error);
  }

  // Stored history and latest host-projected controls are independent of
  // supervisor/agent readiness. Live terminal contents arrive through the
  // separately subscribed terminal watch; a cold snapshot uses its durable tail.
  const terminalScrollback =
    readsTerminal && !options.omitScrollback
      ? dbGetThreadTerminalScrollback(threadId) || undefined
      : undefined;
  const backgroundTasks = [...(ctx.backgroundTasksByThread.get(threadId) ?? [])];
  const followUpQueue = readsTerminal ? null : ctx.threadLiveReadState.queueFor(threadId);

  const thread = dbGetThread(threadId);
  if (!thread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }

  const projectedDesc = fenced.projectedDesc;
  const goalInPage =
    fenced.goal !== null && projectedDesc.some((item) => item.id === fenced.goal!.id);
  const projectedGoal =
    fenced.goal !== null && !goalInPage
      ? projectRuntimeItemsImageRefs(threadId, [fenced.goal])[0]!
      : null;
  const pageItemsAsc = [...projectedDesc].reverse();
  const itemCountAvailable = pageItemsAsc.length;
  const turnsAsc = [...fenced.turnsMeta].reverse();
  const turnsTotal = turnsAsc.length;

  const nextRuntimeCursor = (count: number): number | null => {
    const omitted = fenced.itemsOmitted || count < itemCountAvailable;
    if (!omitted) return null;
    if (count > 0) return fenced.keptMeta[count - 1]!.position;
    if (fenced.newestCandidatePosition !== undefined) return fenced.newestCandidatePosition + 1;
    return null;
  };
  const nextTurnsCursor = (count: number): string | null => {
    const omitted = fenced.turnsOmitted || count < turnsTotal;
    if (!omitted) return null;
    if (count > 0) return encodeCompletedTurnCursor(turnsAsc[turnsTotal - count]!.idx);
    if (turnsTotal > 0) return encodeCompletedTurnCursor(turnsAsc[turnsTotal - 1]!.idx + 1);
    return null;
  };
  const turnSlice = (count: number) =>
    turnsAsc
      .slice(turnsTotal - count)
      .map(({ startedAt, endedAt, anchorItemId }) => ({ startedAt, endedAt, anchorItemId }));

  const serialize = (itemCount: number, turnCount: number): string =>
    `${JSON.stringify(
      boundedThreadSnapshotSchema.parse(
        withStableUpdatedAt(`thread:${threadId}`, {
          snapshotSeq,
          runtimeResumeCursor,
          thread: ctx.sessionConfigInventory.enrichThreadRow(thread),
          reads: CATALOG_READS_CAPABILITY,
          ...(negotiation.compactDetails ? { historyProjection: HISTORY_DETAILS_PROJECTION } : {}),
          runtimeItems: projectedGoal
            ? [projectedGoal, ...pageItemsAsc.slice(itemCountAvailable - itemCount)]
            : pageItemsAsc.slice(itemCountAvailable - itemCount),
          runtimeNextCursor: nextRuntimeCursor(itemCount),
          completedTurns: turnSlice(turnCount),
          completedTurnsNextCursor: nextTurnsCursor(turnCount),
          contextUsage: fenced.contextUsage,
          backgroundTasks,
          ...(terminalScrollback ? { terminalScrollback } : {}),
          ...(followUpQueue !== undefined ? { followUpQueue } : {}),
          ...(fenced.runtimeNotice ? { runtimeNotice: fenced.runtimeNotice } : {}),
        }),
      ),
    )}\n`;

  const fits = (itemCount: number, turnCount: number): boolean =>
    catalogSizesFit(measureCatalogBody(serialize(itemCount, turnCount)), caps);
  const fullBody = serialize(itemCountAvailable, turnsTotal);
  if (catalogSizesFit(measureCatalogBody(fullBody), caps)) {
    return fullBody;
  }
  const emptySizes = measureCatalogBody(serialize(0, 0));
  if (!catalogSizesFit(emptySizes, caps)) {
    throw historyEnvelopeTooLarge(emptySizes, caps);
  }
  const trimmed = trimHistoryPrefixToCaps({
    rows: fenced.keptMeta,
    serialize: (count) => serialize(count, 0),
    caps,
  });
  if ("singleSizes" in trimmed) {
    if (itemCountAvailable > 0) {
      throw historyItemTooLarge(
        "runtime_item",
        fenced.keptMeta[0]!.itemId,
        trimmed.singleSizes,
        caps,
      );
    }
    if (turnsTotal > 0) {
      throw historyItemTooLarge(
        "turn",
        String(turnsAsc[turnsTotal - 1]!.idx),
        measureCatalogBody(serialize(0, 1)),
        caps,
      );
    }
    throw historyEnvelopeTooLarge(emptySizes, caps);
  }
  const maxTurns = maxFittingCount(0, turnsTotal, (count) => fits(trimmed.count, count)) ?? 0;
  return serialize(trimmed.count, maxTurns);
}

export interface BoundedHistoryItemsInput {
  readonly threadId: string;
  readonly beforePosition?: number;
  readonly limit: number;
  readonly targetTimelineEntryCount?: number;
}

/** Bounded `thread-history-items`: older items pages stay position-cursored and
 * gain the phase-1/phase-2 byte budget. `nextCursor` is the oldest returned
 * position; a byte cut moves it to the last included row, never a hole. The
 * caller reads + gates the durable notice synchronously (`notices=v1`) and
 * passes its wire projection here, so both paths of the route carry it. */
export async function buildBoundedThreadHistoryItems(
  input: BoundedHistoryItemsInput,
  caps: CatalogEffectiveCaps,
  runtimeNotice?: RemoteRuntimeHistoryNotice,
  compactDetails = false,
): Promise<string> {
  if (!dbGetThread(input.threadId)) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const fenceToken = beginRuntimeFence(input.threadId);
  await flushHistoryFenceOrThrow(input.threadId, fenceToken);
  const soft = Math.min(HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES, caps.maxWireBytes);
  let trimmed: Extract<HistoryTrimResult, { count: number }>;
  try {
    trimmed = readRuntimeFence(fenceToken, () => {
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
      return result;
    });
  } catch (error) {
    throw mapHistoryPersistenceRefusal(error);
  }
  return trimmed.body;
}

/**
 * Bounded `thread-turns`: older completed turns ascending by `idx` with the
 * exact next `ct1.` cursor. Turns without an `anchor_item_id` are included;
 * the cursor is exclusive (`idx < cursor`), so continuation has no holes.
 * Read committed-only like the other completed-turn projections.
 */
export function buildBoundedCompletedTurnPage(input: {
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
