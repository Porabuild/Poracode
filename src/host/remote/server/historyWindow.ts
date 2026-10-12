import { CATALOG_HOST_WIRE_MAX_BYTES } from "@/shared/remote/historyReadContract";
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

/** Select and materialize a contiguous newest-first window. Soft estimates
 * describe the projected response; the original conservative bounds still
 * cap payload materialization. Exact projected sizes govern the final pack.
 * Call only inside the held history fence. */
export function readProjectedHistoryWindow(
  threadId: string,
  rows: readonly HistoryPageRowMeta[],
  softWireBytes: number,
  caps: CatalogEffectiveCaps,
  compactDetails = false,
): {
  readonly keptMeta: readonly HistoryPageRowMeta[];
  readonly projectedDesc: readonly HistoryRuntimeItem[];
} {
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
  const keptMeta: HistoryPageRowMeta[] = [];
  const projectedDesc: HistoryRuntimeItem[] = [];
  let wireBytes = 2;
  let materializationBound = 0;
  let index = 0;
  while (index < rows.length) {
    const batchStart = index;
    const unitEnds: number[] = [];
    let estimatedBytes = wireBytes;
    while (index < rows.length) {
      const end = unitEnd(rows, index);
      const unit = rows.slice(index, end);
      const estimate = unit.reduce((sum, row) => sum + row.packingWireBytes, 0);
      const bound = unit.reduce((sum, row) => sum + row.boundWireBytes, 0);
      const isFirst = keptMeta.length === 0 && index === batchStart;
      if (
        !isFirst &&
        (estimatedBytes + estimate > softWireBytes ||
          materializationBound + bound > CATALOG_HOST_WIRE_MAX_BYTES)
      )
        break;
      if (isFirst && bound > CATALOG_HOST_WIRE_MAX_BYTES) {
        // A page-of-one lets the existing exact hard-cap refusal name the row.
        index += 1;
        unitEnds.push(index);
        break;
      }
      estimatedBytes += estimate;
      materializationBound += bound;
      index = end;
      unitEnds.push(end);
    }
    if (index === batchStart) break;
    const batchMeta = rows.slice(batchStart, index);
    const materialized = dbReadThreadHistoryPhase2(
      threadId,
      batchMeta.map((row) => row.itemId),
      { compactDetails },
    );
    const byId = new Map(
      projectRuntimeItemsImageRefs(threadId, materialized).map((item) => [item.id, item]),
    );
    let start = batchStart;
    for (const end of unitEnds) {
      const meta = rows.slice(start, end).filter((row) => byId.has(row.itemId));
      const items = meta.map((row) => byId.get(row.itemId)!);
      const actualBytes = items.reduce(
        (sum, item) => sum + Buffer.byteLength(JSON.stringify(item), "utf8") + 1,
        0,
      );
      // The first display unit is soft-exempt; hard caps are checked by the
      // builder against the complete serialized envelope. Never cut a group.
      if (keptMeta.length > 0 && wireBytes + actualBytes > softWireBytes)
        return { keptMeta, projectedDesc };
      keptMeta.push(...meta);
      projectedDesc.push(...items);
      wireBytes += actualBytes;
      start = end;
    }
    if (wireBytes >= softWireBytes) break;
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
