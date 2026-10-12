import {
  CATALOG_HOST_DECODE_MAX_BYTES,
  CATALOG_HOST_WIRE_MAX_BYTES,
  type HistoryItemTooLargeBody,
} from "@/shared/remote/historyReadContract";
import type { HistoryStreamHeadEscapedSizes, HistoryTimelineKind } from "@/host/db/historyReads";
import { RemoteHttpError } from "../auth";
import {
  catalogLowerBoundProvesOversized,
  catalogSizesFit,
  catalogUpperBoundWithinCaps,
  measureCatalogBody,
  type CatalogEffectiveCaps,
  type CatalogSizes,
} from "./catalogPageBudget";

/**
 * B4 history page budget: soft packing (group runs are one unit), exact
 * post-materialization trimming, and the typed refusal bodies.
 *
 * Hard rejection is proven, never estimated. A pre-fetch refusal is reserved
 * for a row that cannot be returned even under the HOST hard caps (a
 * stored-state condition); a smaller client declaration is always resolved by
 * the exact phase-2 measurement, so the client sees measured sizes rather than
 * an estimate. The conservative upper bound decides only whether a proof is
 * needed at all; otherwise a sound lower bound is assembled from the exact
 * escaped size of verbatim fields plus the stream tail, and (only if that is
 * not already decisive) the stream head is measured exactly inside SQLite. A
 * JSON payload has no sound lower bound because image projection and schema
 * stripping only shrink it; such rows are always resolved by the exact phase-2
 * measurement. `measureStreamHead` is invoked only when a decision needs it.
 */

export class HistoryItemTooLargeError extends Error {
  constructor(readonly body: HistoryItemTooLargeBody) {
    super(
      `History item "${body.readItem.id}" cannot fit the negotiated byte caps ` +
        `(wire ${body.readItem.wireBytes}/${body.readItem.maxBytes}, ` +
        `decode ${body.readItem.decodeBytes}/${body.readItem.maxDecodeBytes}, ` +
        `${body.readItem.measurement}).`,
    );
    this.name = "HistoryItemTooLargeError";
  }
}

function buildHistoryItemTooLargeBody(input: {
  readonly resource: "runtime_item" | "turn";
  readonly id: string;
  readonly sizes: CatalogSizes;
  readonly caps: CatalogEffectiveCaps;
  readonly measurement: "serialized-exact" | "serialized-upper-bound";
  readonly lowerBoundSizes?: CatalogSizes;
}): HistoryItemTooLargeBody {
  return {
    error: {
      code: "read_item_too_large",
      message:
        "The history item exceeds the host byte budget for a single page; it is refused " +
        "explicitly rather than truncated or dropped.",
    },
    readItem: {
      resource: input.resource,
      id: input.id,
      wireBytes: input.sizes.wireBytes,
      decodeBytes: input.sizes.decodeBytes,
      maxBytes: input.caps.maxWireBytes,
      maxDecodeBytes: input.caps.maxDecodeBytes,
      measurement: input.measurement,
      wireBytesMeaning: "utf8-serialized",
      decodeBytesMeaning: "utf16-code-units-x2",
      ...(input.lowerBoundSizes
        ? {
            lowerBoundWireBytes: input.lowerBoundSizes.wireBytes,
            lowerBoundDecodeBytes: input.lowerBoundSizes.decodeBytes,
          }
        : {}),
    },
  };
}

export function historyItemTooLarge(
  resource: "runtime_item" | "turn",
  id: string,
  sizes: CatalogSizes,
  caps: CatalogEffectiveCaps,
  measurement: "serialized-exact" | "serialized-upper-bound" = "serialized-exact",
  lowerBoundSizes?: CatalogSizes,
): HistoryItemTooLargeError {
  return new HistoryItemTooLargeError(
    buildHistoryItemTooLargeBody({
      resource,
      id,
      sizes,
      caps,
      measurement,
      ...(lowerBoundSizes ? { lowerBoundSizes } : {}),
    }),
  );
}

export function historyEnvelopeTooLarge(
  sizes: CatalogSizes,
  caps: CatalogEffectiveCaps,
): RemoteHttpError {
  return new RemoteHttpError(
    "read_response_too_large",
    `The history response envelope cannot fit the negotiated caps ` +
      `(wire ${sizes.wireBytes}/${caps.maxWireBytes}, decode ${sizes.decodeBytes}/${caps.maxDecodeBytes}).`,
    503,
  );
}

export const HISTORY_HOST_CAPS: CatalogEffectiveCaps = {
  maxWireBytes: CATALOG_HOST_WIRE_MAX_BYTES,
  maxDecodeBytes: CATALOG_HOST_DECODE_MAX_BYTES,
  softPackWireBytes: CATALOG_HOST_WIRE_MAX_BYTES,
};

export interface HistoryRefusalBoundRow {
  readonly id: string;
  readonly boundWireBytes: number;
  readonly boundStreamWireBytes: number;
  readonly lowerBoundWireBytes: number;
  readonly lowerBoundDecodeBytes: number;
  /** When true, elision line-trimming can shrink the assembled streams, so
   * neither the tail nor the head measurement is a sound lower bound. */
  readonly streamsElided: boolean;
}

export function refuseOversizedHistoryBound(
  resource: "runtime_item" | "turn",
  row: HistoryRefusalBoundRow,
  caps: CatalogEffectiveCaps,
  measureStreamHead: () => HistoryStreamHeadEscapedSizes,
): void {
  const upperWireBytes = Math.max(row.boundWireBytes, row.boundStreamWireBytes);
  const upper: CatalogSizes = { wireBytes: upperWireBytes, decodeBytes: upperWireBytes * 2 };
  if (catalogUpperBoundWithinCaps(upper, HISTORY_HOST_CAPS)) return;
  let lower: CatalogSizes = {
    wireBytes: row.lowerBoundWireBytes,
    decodeBytes: row.lowerBoundDecodeBytes,
  };
  if (!row.streamsElided && !catalogLowerBoundProvesOversized(lower, HISTORY_HOST_CAPS)) {
    const head = measureStreamHead();
    lower = {
      wireBytes: lower.wireBytes + head.wireBytes,
      decodeBytes: lower.decodeBytes + head.decodeBytes,
    };
  }
  if (!catalogLowerBoundProvesOversized(lower, HISTORY_HOST_CAPS)) return;
  throw historyItemTooLarge(resource, row.id, upper, caps, "serialized-upper-bound", lower);
}

/**
 * Soft packing that never cuts inside a timeline group run. Consecutive
 * `group` rows are one display entry, so they are packed as one unit: the pack
 * stops before the unit that would exceed the soft target, and the first unit
 * is soft-exempt exactly like the page-of-one rule. Whether the first unit can
 * be included whole is decided against the HOST hard caps by the conservative
 * bound (a packing estimate); the exact refusal decision is
 * {@link refuseOversizedHistoryBound}'s. When the first unit's estimate cannot
 * fit the host caps, only its newest row is packed so the pre-fetch refusal can
 * name the exact row.
 */
export function packHistoryItemsWithinSoftTarget<T extends HistoryTimelineRowMeta>(
  rows: readonly T[],
  softPackWireBytes: number,
): { readonly packed: readonly T[]; readonly hasMore: boolean } {
  const packed: T[] = [];
  let accumulated = 0;
  let index = 0;
  while (index < rows.length) {
    let unitEnd = index;
    let unitBound = 0;
    if (rows[index]!.kind === "group") {
      while (unitEnd < rows.length && rows[unitEnd]!.kind === "group") {
        unitBound += rows[unitEnd]!.boundWireBytes;
        unitEnd += 1;
      }
    } else {
      unitBound = rows[index]!.boundWireBytes;
      unitEnd = index + 1;
    }

    if (packed.length === 0) {
      if (
        unitBound <= CATALOG_HOST_WIRE_MAX_BYTES &&
        unitBound * 2 <= CATALOG_HOST_DECODE_MAX_BYTES
      ) {
        packed.push(...rows.slice(index, unitEnd));
        accumulated += unitBound;
        index = unitEnd;
        continue;
      }
      // The newest unit's estimate cannot fit the host caps; pack its newest
      // row only so the phase-1 pre-fetch refusal can name the exact row.
      packed.push(rows[index]!);
      return { packed, hasMore: packed.length < rows.length };
    }

    if (accumulated + unitBound > softPackWireBytes) break;
    packed.push(...rows.slice(index, unitEnd));
    accumulated += unitBound;
    index = unitEnd;
  }
  return { packed, hasMore: packed.length < rows.length };
}

export interface HistoryTimelineRowMeta {
  readonly itemId: string;
  readonly kind: HistoryTimelineKind;
  readonly boundWireBytes: number;
}

export function packCompletedTurnsWithinSoftTarget<T extends { readonly boundWireBytes: number }>(
  rows: readonly T[],
  softPackWireBytes: number,
): { readonly packed: readonly T[]; readonly hasMore: boolean } {
  const packed: T[] = [];
  let accumulated = 0;
  for (const row of rows) {
    if (packed.length > 0 && accumulated + row.boundWireBytes > softPackWireBytes) break;
    packed.push(row);
    accumulated += row.boundWireBytes;
  }
  return { packed, hasMore: rows.length > packed.length };
}

/** Largest count in `[low, high]` satisfying `fits`; null when even `low` fails. */
export function maxFittingCount(
  low: number,
  high: number,
  fits: (count: number) => boolean,
): number | null {
  if (high < low) return null;
  if (!fits(low)) return null;
  let best = low;
  let currentLow = low;
  let currentHigh = high;
  while (currentLow <= currentHigh) {
    const mid = Math.floor((currentLow + currentHigh) / 2);
    if (fits(mid)) {
      best = mid;
      currentLow = mid + 1;
    } else {
      currentHigh = mid - 1;
    }
  }
  return best;
}

export interface HistoryTrimRow {
  readonly kind?: HistoryTimelineKind;
  readonly boundWireBytes: number;
}

export type HistoryTrimResult =
  | { readonly count: number; readonly body: string; readonly sizes: CatalogSizes }
  | { readonly singleSizes: CatalogSizes };

/**
 * Serializes an already-packed newest-first row prefix, re-measuring exactly,
 * and trims rows off the OLDEST end until the body fits both hard caps. The
 * cursor is derived from the same count by the `serialize` callback, so a trim
 * can never create a hole: rows dropped here are exactly the rows the
 * continuation cursor (`position < cursor`) refetches.
 *
 * Only whole timeline group runs are dropped; when the newest run alone cannot
 * fit, the explicit page-of-one is kept (hard caps are the refusal boundary,
 * not the soft target). Returns the measured single-row sizes when even one
 * row cannot fit, so the caller can emit the typed refusal without refetching.
 */
export function trimHistoryPrefixToCaps<T extends HistoryTrimRow>(input: {
  readonly rows: readonly T[];
  readonly serialize: (count: number) => string;
  readonly caps: CatalogEffectiveCaps;
}): HistoryTrimResult {
  const n = input.rows.length;
  if (n === 0) {
    const body = input.serialize(0);
    const sizes = measureCatalogBody(body);
    if (catalogSizesFit(sizes, input.caps)) return { count: 0, body, sizes };
    throw historyEnvelopeTooLarge(sizes, input.caps);
  }

  const fullBody = input.serialize(n);
  const fullSizes = measureCatalogBody(fullBody);
  if (catalogSizesFit(fullSizes, input.caps)) return { count: n, body: fullBody, sizes: fullSizes };

  const measure = (count: number): { body: string; sizes: CatalogSizes } => {
    const body = input.serialize(count);
    return { body, sizes: measureCatalogBody(body) };
  };

  let best = 0;
  let bestBody = "";
  let bestSizes: CatalogSizes | null = null;
  let low = 1;
  let high = n - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const measured = measure(mid);
    if (catalogSizesFit(measured.sizes, input.caps)) {
      best = mid;
      bestBody = measured.body;
      bestSizes = measured.sizes;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  // The cursor serialization is tiny but not perfectly monotone; extend the
  // binary-search result while the next row still fits.
  while (best > 0 && best < n - 1) {
    const measured = measure(best + 1);
    if (!catalogSizesFit(measured.sizes, input.caps)) break;
    best += 1;
    bestBody = measured.body;
    bestSizes = measured.sizes;
  }
  if (best === 0) return { singleSizes: measure(1).sizes };

  let count = best;
  if (count < n && input.rows[count - 1]!.kind === "group" && input.rows[count]!.kind === "group") {
    let runEnd = count;
    while (runEnd < n && input.rows[runEnd]!.kind === "group") runEnd += 1;
    const extended = measure(runEnd);
    if (catalogSizesFit(extended.sizes, input.caps)) {
      return { count: runEnd, body: extended.body, sizes: extended.sizes };
    }
    let runStart = count - 1;
    while (runStart > 0 && input.rows[runStart - 1]!.kind === "group") runStart -= 1;
    if (runStart === 0) {
      const single = measure(1);
      if (!catalogSizesFit(single.sizes, input.caps)) return { singleSizes: single.sizes };
      return { count: 1, body: single.body, sizes: single.sizes };
    }
    const measured = measure(runStart);
    count = runStart;
    bestBody = measured.body;
    bestSizes = measured.sizes;
    if (!catalogSizesFit(bestSizes, input.caps)) return { singleSizes: measure(1).sizes };
  }
  return { count, body: bestBody, sizes: bestSizes! };
}
