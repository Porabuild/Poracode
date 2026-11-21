import {
  CATALOG_HOST_DECODE_MAX_BYTES,
  CATALOG_HOST_WIRE_MAX_BYTES,
  CATALOG_JSON_BOUND_FACTOR,
  HISTORY_LATEST_TURN_MAX_WIRE_BYTES,
} from "@/shared/remote/historyReadContract";
import {
  hasDeferredHistoryStreams,
  type HistoryRuntimeItem,
} from "@/shared/remote/historyPresentation";
import { CATALOG_ROW_ENVELOPE_BYTES } from "@/shared/remote/catalogReadContract";
import {
  dbMeasureHistoryStreamHeadEscaped,
  dbReadThreadHistoryPhase2,
  type HistoryPageRowMeta,
} from "@/host/db/historyReads";
import type { CatalogEffectiveCaps } from "./catalogPageBudget";
import { refuseOversizedHistoryBound } from "./historyReadBudget";
import { projectRuntimeItemsImageRefs } from "./imageRefProjection";
import {
  DEFERRED_FILE_CHANGE_PACKING_BYTES,
  isDeferrableFileChangeRow,
  slimDeferredFileChange,
} from "./historyBodyDeferral";

/** Select and materialize a contiguous newest-first window. Soft estimates
 * describe the projected response; the original conservative bounds still
 * cap payload materialization. Exact projected sizes govern the final pack.
 * `protectLatestTurn` lets a tail read keep the newest prompt's turn past the
 * soft target, within the latest-turn ceiling and the client's caps.
 * Call only inside the held history fence. */
export function readProjectedHistoryWindow(
  threadId: string,
  rows: readonly HistoryPageRowMeta[],
  softWireBytes: number,
  caps: CatalogEffectiveCaps,
  options: {
    readonly compactDetails?: boolean;
    readonly deferFileChangeBodies?: boolean;
    readonly deferUnsettledFileChanges?: boolean;
    readonly protectLatestTurn?: boolean;
  } = {},
): {
  readonly keptMeta: readonly HistoryPageRowMeta[];
  readonly projectedDesc: readonly HistoryRuntimeItem[];
} {
  const compactDetails = options.compactDetails === true;
  const deferFileChanges = compactDetails && options.deferFileChangeBodies === true;
  const latestUserTurnRows =
    rows.findIndex((row) => row.type === "user_message" && row.parentItemId === null) + 1;
  const deferrableRows = rows.map(
    (row, rowIndex) =>
      deferFileChanges &&
      isDeferrableFileChangeRow(row.type, row.state, {
        allowUnsettled:
          options.deferUnsettledFileChanges === true ||
          (latestUserTurnRows > 0 && rowIndex >= latestUserTurnRows),
      }),
  );
  if (deferFileChanges)
    // The bound stays conservative: it caps what one read materializes.
    rows = rows.map((row, rowIndex) =>
      deferrableRows[rowIndex]
        ? {
            ...row,
            packingWireBytes: Math.min(row.packingWireBytes, DEFERRED_FILE_CHANGE_PACKING_BYTES),
          }
        : row,
    );
  if (compactDetails)
    rows = rows.map((row) =>
      hasDeferredHistoryStreams(row.type, row.state)
        ? {
            ...row,
            boundWireBytes:
              row.boundWireBytes - row.boundStreamWireBytes + CATALOG_ROW_ENVELOPE_BYTES,
            packingWireBytes: Math.min(
              row.packingWireBytes,
              row.boundWireBytes - row.boundStreamWireBytes + CATALOG_ROW_ENVELOPE_BYTES,
            ),
            boundStreamWireBytes: 0,
            lowerBoundWireBytes: 0,
            lowerBoundDecodeBytes: 0,
            streamsElided: true,
          }
        : row,
    );
  const first = rows[0];
  if (first) {
    refuseOversizedHistoryBound("runtime_item", { id: first.itemId, ...first }, caps, () =>
      dbMeasureHistoryStreamHeadEscaped(threadId, first.itemId),
    );
  }
  const latestTurnRows = options.protectLatestTurn ? latestUserTurnRows : 0;
  // Half the client's effective cap stays for the rest of the envelope, so the
  // builder's cap trim cannot cut the protected prompt.
  const latestTurnWireBytes = Math.max(
    softWireBytes,
    Math.min(
      Math.min(caps.maxWireBytes, caps.maxDecodeBytes / 2) / 2,
      HISTORY_LATEST_TURN_MAX_WIRE_BYTES,
    ),
  );
  const budgetAt = (index: number) =>
    index < latestTurnRows ? latestTurnWireBytes : softWireBytes;
  // Deferrable file_change rows drop their large diff bodies immediately after
  // phase-2 slimming, so charge their raw stored size (~bound/6) rather than
  // worst-case 6x JSON wire expansion against batch and read caps.
  const rowDeferredRawBytes = (rowIndex: number): number =>
    deferrableRows[rowIndex]
      ? Math.ceil(rows[rowIndex]!.boundWireBytes / CATALOG_JSON_BOUND_FACTOR)
      : 0;
  const rowNonDeferredBound = (rowIndex: number): number =>
    deferrableRows[rowIndex] ? 0 : rows[rowIndex]!.boundWireBytes;
  const rowBatchCost = (rowIndex: number): number =>
    deferrableRows[rowIndex] ? rowDeferredRawBytes(rowIndex) : rows[rowIndex]!.boundWireBytes;

  const firstUnitEnd = rows.length > 0 ? unitEnd(rows, 0) : 0;
  const keptMeta: HistoryPageRowMeta[] = [];
  const projectedDesc: HistoryRuntimeItem[] = [];
  let wireBytes = 2;
  let nonDeferredMaterialized = 0;
  let deferredMaterialized = 0;
  let index = 0;
  while (index < rows.length) {
    const batchStart = index;
    const unitEnds: number[] = [];
    let estimatedBytes = wireBytes;
    let batchMaterialized = 0;
    const cutUnitSlice = (end: number, requireOne: boolean) => {
      let cut = index;
      let cutBatch = batchMaterialized;
      let cutNonDeferred = nonDeferredMaterialized;
      let cutDeferred = deferredMaterialized;
      let cutEstimate = estimatedBytes;
      if (requireOne) {
        cutBatch += rowBatchCost(cut);
        cutNonDeferred += rowNonDeferredBound(cut);
        cutDeferred += rowDeferredRawBytes(cut);
        cutEstimate += rows[cut]!.packingWireBytes;
        cut += 1;
      }
      while (cut < end) {
        const nextBatch = cutBatch + rowBatchCost(cut);
        const nextNonDeferred = cutNonDeferred + rowNonDeferredBound(cut);
        const nextDeferred = cutDeferred + rowDeferredRawBytes(cut);
        const nextEstimate = cutEstimate + rows[cut]!.packingWireBytes;
        if (
          nextBatch > CATALOG_HOST_WIRE_MAX_BYTES ||
          nextNonDeferred > CATALOG_HOST_WIRE_MAX_BYTES ||
          nextDeferred > CATALOG_HOST_DECODE_MAX_BYTES ||
          nextEstimate > budgetAt(cut)
        )
          break;
        cutBatch = nextBatch;
        cutNonDeferred = nextNonDeferred;
        cutDeferred = nextDeferred;
        cutEstimate = nextEstimate;
        cut += 1;
      }
      if (cut > index) {
        batchMaterialized = cutBatch;
        nonDeferredMaterialized = cutNonDeferred;
        deferredMaterialized = cutDeferred;
        index = cut;
        unitEnds.push(index);
      }
    };
    while (index < rows.length) {
      const end = unitEnd(rows, index);
      let estimate = 0;
      let batchCost = 0;
      let nonDeferredCost = 0;
      let deferredCost = 0;
      for (let cursor = index; cursor < end; cursor += 1) {
        estimate += rows[cursor]!.packingWireBytes;
        batchCost += rowBatchCost(cursor);
        nonDeferredCost += rowNonDeferredBound(cursor);
        deferredCost += rowDeferredRawBytes(cursor);
      }
      const inFirstUnit = index < firstUnitEnd;
      const isFirst = keptMeta.length === 0 && index === batchStart;
      const fitsMaterialization =
        batchMaterialized + batchCost <= CATALOG_HOST_WIRE_MAX_BYTES &&
        nonDeferredMaterialized + nonDeferredCost <= CATALOG_HOST_WIRE_MAX_BYTES &&
        deferredMaterialized + deferredCost <= CATALOG_HOST_DECODE_MAX_BYTES;
      if (!isFirst && (!fitsMaterialization || estimatedBytes + estimate > budgetAt(index))) {
        if (inFirstUnit && index === batchStart && estimatedBytes < budgetAt(index)) {
          cutUnitSlice(end, false);
        }
        break;
      }
      if (isFirst && !fitsMaterialization) {
        // The conservative bound exceeding the hard cap does not prove the real
        // size does. Cut the unit by row at the soft target so a long tool run
        // pages in a few reads; a page of one row still reaches the exact
        // hard-cap refusal that names it.
        cutUnitSlice(end, true);
        break;
      }
      estimatedBytes += estimate;
      batchMaterialized += batchCost;
      nonDeferredMaterialized += nonDeferredCost;
      deferredMaterialized += deferredCost;
      index = end;
      unitEnds.push(end);
    }
    if (index === batchStart) break;
    const batchMeta = rows.slice(batchStart, index);
    const deferrableById = new Map<string, boolean>();
    for (let cursor = batchStart; cursor < index; cursor += 1) {
      deferrableById.set(rows[cursor]!.itemId, deferrableRows[cursor]!);
    }
    const materialized = dbReadThreadHistoryPhase2(
      threadId,
      batchMeta.map((row) => row.itemId),
      { compactDetails, preserveExternalizedImageStubs: true },
    );
    const byId = new Map<string, HistoryRuntimeItem>(
      projectRuntimeItemsImageRefs(threadId, materialized).map((item) => [
        item.id,
        deferrableById.get(item.id) ? slimDeferredFileChange(item, { allowUnsettled: true }) : item,
      ]),
    );
    let start = batchStart;
    for (const end of unitEnds) {
      const meta = rows.slice(start, end).filter((row) => byId.has(row.itemId));
      const items = meta.map((row) => byId.get(row.itemId)!);
      const itemWireBytes = items.map(
        (item) => Buffer.byteLength(JSON.stringify(item), "utf8") + 1,
      );
      const actualBytes = itemWireBytes.reduce((sum, bytes) => sum + bytes, 0);
      const canTrimFirstUnitByRow =
        end <= firstUnitEnd &&
        (keptMeta.length > 0 ||
          (deferFileChanges &&
            meta.some(
              (row, idx) => deferrableById.get(row.itemId) && !items[idx]!.detailsDeferred,
            )));
      if (canTrimFirstUnitByRow && wireBytes + actualBytes > budgetAt(start)) {
        for (let offset = 0; offset < meta.length; offset += 1) {
          const bytes = itemWireBytes[offset]!;
          if (keptMeta.length > 0 && wireBytes + bytes > budgetAt(start + offset))
            return { keptMeta, projectedDesc };
          keptMeta.push(meta[offset]!);
          projectedDesc.push(items[offset]!);
          wireBytes += bytes;
        }
        return { keptMeta, projectedDesc };
      }
      // The first display unit is soft-exempt; hard caps are checked by the
      // builder against the complete serialized envelope. Never cut a group.
      if (keptMeta.length > 0 && wireBytes + actualBytes > budgetAt(start))
        return { keptMeta, projectedDesc };
      keptMeta.push(...meta);
      projectedDesc.push(...items);
      wireBytes += actualBytes;
      start = end;
    }
    if (wireBytes >= budgetAt(index)) break;
    // Overestimates can leave room. Continue from the next unit using the
    // exact size already admitted instead of returning an undersized page.
  }
  return { keptMeta, projectedDesc };
}

function unitEnd(rows: readonly HistoryPageRowMeta[], start: number): number {
  let end = start + 1;
  if (rows[start]!.kind === "group")
    while (end < rows.length && rows[end]!.kind === "group") end += 1;
  return end;
}
