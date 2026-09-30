import {
  CATALOG_HOST_DECODE_MAX_BYTES,
  CATALOG_HOST_WIRE_MAX_BYTES,
  CATALOG_SOFT_PACK_WIRE_BYTES,
  serializedDecodeByteLength,
  serializedWireByteLength,
  type CatalogItemTooLargeBody,
} from "@/shared/remote/catalogReadContract";
import type { CatalogPageRowMeta } from "@/host/db/catalogReads";

/**
 * B4 page budget. Two hard caps per representation (`wireBytes` = serialized
 * UTF-8; `decodeBytes` = 2 × serialized UTF-16 units) and one soft packing
 * target that can never refuse a row on its own. Phase 2 re-measures the exact
 * serialized body and trims trailing rows by binary search; a page-of-one that
 * cannot fit either hard cap becomes a typed `read_item_too_large` refusal.
 */

export interface CatalogEffectiveCaps {
  readonly maxWireBytes: number;
  readonly maxDecodeBytes: number;
  /** Packing only; never a refusal boundary. */
  readonly softPackWireBytes: number;
}

export interface CatalogSizes {
  readonly wireBytes: number;
  readonly decodeBytes: number;
}

export function resolveCatalogEffectiveCaps(input: {
  readonly maxBytes?: number;
  readonly maxDecodeBytes?: number;
}): CatalogEffectiveCaps {
  const maxWireBytes = Math.min(
    input.maxBytes ?? CATALOG_HOST_WIRE_MAX_BYTES,
    CATALOG_HOST_WIRE_MAX_BYTES,
  );
  const maxDecodeBytes = Math.min(
    input.maxDecodeBytes ?? CATALOG_HOST_DECODE_MAX_BYTES,
    CATALOG_HOST_DECODE_MAX_BYTES,
  );
  return {
    maxWireBytes,
    maxDecodeBytes,
    softPackWireBytes: Math.min(CATALOG_SOFT_PACK_WIRE_BYTES, maxWireBytes),
  };
}

export function measureCatalogBody(body: string): CatalogSizes {
  return {
    wireBytes: serializedWireByteLength(body),
    decodeBytes: serializedDecodeByteLength(body),
  };
}

export function catalogSizesFit(sizes: CatalogSizes, caps: CatalogEffectiveCaps): boolean {
  return sizes.wireBytes <= caps.maxWireBytes && sizes.decodeBytes <= caps.maxDecodeBytes;
}

/**
 * True when a conservative upper bound is already inside both caps: the actual
 * row cannot exceed the caps, so no pre-fetch decision is needed. The converse
 * is NOT a refusal — an upper bound above a cap only means the exact
 * measurement (or a sound lower bound) has to decide.
 */
export function catalogUpperBoundWithinCaps(
  sizes: CatalogSizes,
  caps: CatalogEffectiveCaps,
): boolean {
  return catalogSizesFit(sizes, caps);
}

/**
 * Hard pre-fetch rejection rule: refuse only when a SOUND lower bound of the
 * row already exceeds a cap. `lower` must be derived from fields the wire
 * schema emits verbatim (see `dbReadCatalog*Phase1`); it is never an estimate.
 */
export function catalogLowerBoundProvesOversized(
  lower: CatalogSizes,
  caps: CatalogEffectiveCaps,
): boolean {
  return lower.wireBytes > caps.maxWireBytes || lower.decodeBytes > caps.maxDecodeBytes;
}

export interface CatalogPackResult {
  readonly packed: readonly CatalogPageRowMeta[];
  /** True when rows remain after the packed prefix (soft cut or window edge). */
  readonly hasMore: boolean;
}

/**
 * Packs phase-1 candidates against the soft wire target. The first row is
 * always packed (page-of-one); the hard-cap decision is phase 2's, so a soft
 * target never refuses a row the client could decode.
 */
export function packCatalogRowsWithinSoftTarget(
  rows: readonly CatalogPageRowMeta[],
  limit: number,
  softPackWireBytes: number,
): CatalogPackResult {
  const packed: CatalogPageRowMeta[] = [];
  let accumulated = 0;
  for (const row of rows) {
    if (packed.length === limit) return { packed, hasMore: true };
    if (packed.length > 0 && accumulated + row.boundWireBytes > softPackWireBytes) {
      return { packed, hasMore: true };
    }
    packed.push(row);
    accumulated += row.boundWireBytes;
  }
  return { packed, hasMore: rows.length > packed.length };
}

export class CatalogItemTooLargeError extends Error {
  constructor(readonly body: CatalogItemTooLargeBody) {
    super(
      `Catalog item "${body.readItem.id}" cannot fit the negotiated byte caps ` +
        `(wire ${body.readItem.wireBytes}/${body.readItem.maxBytes}, ` +
        `decode ${body.readItem.decodeBytes}/${body.readItem.maxDecodeBytes}, ` +
        `${body.readItem.measurement}).`,
    );
    this.name = "CatalogItemTooLargeError";
  }
}

export function buildCatalogItemTooLargeBody(input: {
  readonly resource: "thread" | "project";
  readonly id: string;
  readonly sizes: CatalogSizes;
  readonly caps: CatalogEffectiveCaps;
  readonly measurement: "serialized-exact" | "serialized-upper-bound";
  /** Sound lower bound that proved a pre-fetch refusal. */
  readonly lowerBoundSizes?: CatalogSizes;
}): CatalogItemTooLargeBody {
  return {
    error: {
      code: "read_item_too_large",
      message:
        "The item exceeds the host byte budget for a single catalog page; it is refused " +
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

export interface CatalogBoundedSerialization<T> {
  readonly body: string;
  readonly rows: readonly T[];
  readonly sizes: CatalogSizes;
}

/**
 * Serializes an already-packed row list, re-measuring exactly, and trims
 * trailing rows until it fits both hard caps. Trimming is monotone (dropping a
 * trailing element never grows the JSON), so the maximum fitting prefix is
 * found by binary search. When even a single row cannot fit, the supplied
 * typed refusal is thrown with that row's measured sizes.
 */
export function serializeCatalogRowsWithinExactCaps<T>(input: {
  readonly rows: readonly T[];
  readonly serialize: (rows: readonly T[]) => string;
  readonly caps: CatalogEffectiveCaps;
  readonly onOversized: (first: T, sizes: CatalogSizes) => Error;
  readonly onEnvelopeOversized: (sizes: CatalogSizes) => Error;
}): CatalogBoundedSerialization<T> {
  const emptyBody = input.serialize([]);
  if (input.rows.length === 0) {
    const sizes = measureCatalogBody(emptyBody);
    if (!catalogSizesFit(sizes, input.caps)) throw input.onEnvelopeOversized(sizes);
    return { body: emptyBody, rows: [], sizes };
  }

  let low = 1;
  let high = input.rows.length;
  let bestCount = 0;
  let bestBody = "";
  let bestSizes: CatalogSizes | null = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const body = input.serialize(input.rows.slice(0, mid));
    const sizes = measureCatalogBody(body);
    if (catalogSizesFit(sizes, input.caps)) {
      bestCount = mid;
      bestBody = body;
      bestSizes = sizes;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (bestCount === 0 || bestSizes === null) {
    const singleBody = input.serialize(input.rows.slice(0, 1));
    const first = input.rows[0];
    if (first === undefined) throw input.onEnvelopeOversized(measureCatalogBody(singleBody));
    throw input.onOversized(first, measureCatalogBody(singleBody));
  }
  return { body: bestBody, rows: input.rows.slice(0, bestCount), sizes: bestSizes };
}
