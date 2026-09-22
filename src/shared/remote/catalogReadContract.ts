import { z } from "zod";

/**
 * B4 catalog read contract (capability `reads=bounded-v1`).
 *
 * This module owns the wire names, byte-accounting definitions, cursor codecs
 * and the membership request/response schemas for the bounded catalog reads.
 * It is deliberately additive: the protocol version stays 12, undeclared
 * clients keep the existing assembled path, and no existing schema is edited.
 * The generated-contract owner (C0) consumes these definitions; see
 * `tmp/v2-production/b4-catalog-host.md` for the exact handoff.
 *
 * Byte accounting (parent override, supersedes the earlier "retained memory"
 * bound):
 *
 * - `wireBytes` = UTF-8 bytes of the serialized response body.
 * - `decodeBytes` = `2 × serialized.length` (UTF-16 code units × 2), which is
 *   exactly what the client engine charges for a raw frame
 *   (`measuredRawBytes` in `src/renderer/state/remote/engine/decode.ts`). It is
 *   a bound on the SERIALIZED text the client holds, NOT a bound on parsed
 *   objects, structured clones, heap, or RSS.
 * - Host hard caps: 32 MiB wire / 64 MiB decode. The decode cap supports the
 *   existing 4,000,000-character stream cap (24 MiB once JSON-escaped) with
 *   headroom.
 * - Soft packing target: 512 KiB wire, packing only. A soft target never
 *   refuses a row the client can decode; hard caps are the refusal boundary.
 * - Hard rejection is proven, never estimated. Phase 1 computes both a
 *   conservative upper bound (packing only) and a sound lower bound (the exact
 *   escaped size of fields that the wire schema emits verbatim); only a lower
 *   bound that already exceeds a cap refuses a row before its payload is
 *   fetched. A conservative upper bound above a cap is not proof and never
 *   refuses; it is resolved by the exact phase-2 measurement.
 */
export const CATALOG_READS_CAPABILITY = "bounded-v1";

/** Host hard cap for the serialized UTF-8 wire size of one response. */
export const CATALOG_HOST_WIRE_MAX_BYTES = 32 * 1024 * 1024;

/** Host hard cap for `2 × serialized.length` (client engine raw charge). */
export const CATALOG_HOST_DECODE_MAX_BYTES = 64 * 1024 * 1024;

/** Soft packing target; controls page packing only, never a refusal. */
export const CATALOG_SOFT_PACK_WIRE_BYTES = 512 * 1024;

export const CATALOG_THREAD_PAGE_DEFAULT_LIMIT = 100;
export const CATALOG_PROJECT_PAGE_DEFAULT_LIMIT = 50;
export const CATALOG_PAGE_MAX_LIMIT = 200;
export const CATALOG_MEMBERSHIP_MAX_IDS = 200;

/**
 * Conservative phase-1 bound for stored JSON columns.
 *
 * A stored JSON text is re-serialized from its parsed value (`JSON.parse` →
 * response schema → `JSON.stringify`). For any text accepted by `JSON.parse`:
 *
 * - strings/keys: canonical escaping emits at most 6 UTF-16/UTF-8 units per
 *   stored unit (control characters and lone surrogates); escape sequences
 *   cannot be shorter than their canonical form;
 * - numbers: `JSON.stringify` emits the shortest round-trip decimal for the
 *   parsed IEEE-754 double (≤ 17 significant digits; fixed notation below
 *   1e21, exponential above), so every number token re-emits in ≤ 24
 *   characters. A token can only grow when its stored lexeme is shorter than
 *   that; the shortest expanding lexeme is `1e20` (4 chars → 21, ×5.25), and
 *   every shorter number lexeme re-emits at equal or shorter length;
 * - structure, keys and punctuation re-emit verbatim.
 *
 * Therefore canonical bytes and UTF-16 units are each ≤ 6 × the stored UTF-8
 * byte length. This is a derivation, not a fuzz result; the response zod
 * schema only strips unknown keys or materializes fixed defaults, which the
 * per-row envelope below covers.
 */
export const CATALOG_JSON_BOUND_FACTOR = 6;

/**
 * Fixed per-row allowance for key names, punctuation, numbers, booleans and
 * schema-materialized defaults. A minimal row measures well under 1 KiB; the
 * constant keeps a full order of magnitude of headroom.
 */
export const CATALOG_ROW_ENVELOPE_BYTES = 4096;

/**
 * Sound lower bound on the serialized UTF-16 code units of an escaped JSON
 * text whose escaped UTF-8 byte length and escaped code-point count are both
 * known exactly (SQLite `length(CAST(json_quote(x) AS BLOB))` and
 * `length(json_quote(x))`):
 *
 * - UTF-16 units ≥ code points (a supplementary code point is two units);
 * - UTF-16 units ≥ UTF-8 bytes / 3 (the densest well-formed encoding is three
 *   bytes per one-unit BMP code point; supplementary pairs are two units per
 *   four bytes).
 *
 * `JSON.stringify` and SQLite `json_quote` emit byte-identical canonical
 * escapes for every well-formed UTF-16 string (controls use `\b`/`\t`/`\n`/
 * `\f`/`\r` or `\u00XX`, `"`/`\` are escaped, everything else is literal), and
 * a lone surrogate cannot be stored in a SQLite TEXT value through the host's
 * parameter binding (it becomes U+FFFD). A lower bound here is therefore a
 * proof about the actual response text, not an estimate.
 */
export function escapedUnitsLowerBound(
  escapedCodePoints: number,
  escapedWireBytes: number,
): number {
  return Math.max(escapedCodePoints, Math.ceil(escapedWireBytes / 3));
}

/** Cursors are opaque and bounded; longer input is malformed by definition. */
export const CATALOG_CURSOR_MAX_LENGTH = 4096;

export type CatalogPaintOrder = "manual" | "updated" | "created";
export type CatalogReadMode = "page" | "inventory";
export type CatalogReadKind = "thread" | "project";

export const CATALOG_PAINT_ORDER_CURSOR_PREFIX: Readonly<Record<CatalogPaintOrder, string>> = {
  manual: "tp1.",
  updated: "tu2.",
  created: "tc2.",
};

/** Projects have a single paint order (`sort_order, id`) like manual threads. */
export const CATALOG_PROJECT_PAINT_CURSOR_PREFIX = "pj1.";
export const CATALOG_THREAD_INVENTORY_CURSOR_PREFIX = "ti1.";
export const CATALOG_PROJECT_INVENTORY_CURSOR_PREFIX = "pi1.";

export class CatalogCursorError extends Error {
  constructor(
    readonly kind: CatalogReadKind,
    message = "Catalog cursor is malformed or does not match the requested mode.",
  ) {
    super(message);
    this.name = "CatalogCursorError";
  }
}

export type CatalogThreadPaintCursor =
  | { readonly order: "manual"; readonly sortOrder: number; readonly id: string }
  | { readonly order: "updated"; readonly updatedAt: string; readonly id: string }
  | { readonly order: "created"; readonly createdAt: string; readonly id: string };

export interface CatalogProjectPaintCursor {
  readonly sortOrder: number;
  readonly id: string;
}

/**
 * Inventory cursors carry the frontier captured at page 1 so the walk is
 * bounded by `(cursor, frontier]` and terminates under inserts above the
 * frontier. The cursor always travels in the wire payload, never a host-side
 * per-client state.
 */
export interface CatalogInventoryCursor {
  readonly id: string;
  readonly frontier: string;
}

/** `2 × UTF-16 code units`; mirrors the client engine's raw frame charge. */
export function serializedDecodeByteLength(serialized: string): number {
  return serialized.length * 2;
}

/**
 * UTF-8 byte length of the serialized body. Uses the host Buffer when present
 * (native, allocation-free) and falls back to an exact manual scan so this
 * module stays importable from browser bundles.
 */
export function serializedWireByteLength(serialized: string): number {
  if (typeof Buffer !== "undefined") return Buffer.byteLength(serialized, "utf8");
  let bytes = 0;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = serialized.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function encodeCursorPayload(prefix: string, payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  return `${prefix}${base64}`;
}

function decodeCursorPayload(cursor: string, prefix: string, kind: CatalogReadKind): unknown {
  if (cursor.length === 0 || cursor.length > CATALOG_CURSOR_MAX_LENGTH) {
    throw new CatalogCursorError(kind);
  }
  if (!cursor.startsWith(prefix)) throw new CatalogCursorError(kind);
  const encoded = cursor.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) throw new CatalogCursorError(kind);
  try {
    const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new CatalogCursorError(kind);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function encodeCatalogThreadPaintCursor(cursor: CatalogThreadPaintCursor): string {
  switch (cursor.order) {
    case "manual":
      return encodeCursorPayload(CATALOG_PAINT_ORDER_CURSOR_PREFIX.manual, {
        s: cursor.sortOrder,
        i: cursor.id,
      });
    case "updated":
      return encodeCursorPayload(CATALOG_PAINT_ORDER_CURSOR_PREFIX.updated, {
        u: cursor.updatedAt,
        i: cursor.id,
      });
    case "created":
      return encodeCursorPayload(CATALOG_PAINT_ORDER_CURSOR_PREFIX.created, {
        c: cursor.createdAt,
        i: cursor.id,
      });
  }
}

export function decodeCatalogThreadPaintCursor(cursor: string): CatalogThreadPaintCursor {
  for (const order of ["manual", "updated", "created"] as const) {
    const prefix = CATALOG_PAINT_ORDER_CURSOR_PREFIX[order];
    if (!cursor.startsWith(prefix)) continue;
    const payload = decodeCursorPayload(cursor, prefix, "thread");
    if (typeof payload !== "object" || payload === null) throw new CatalogCursorError("thread");
    const record = payload as Record<string, unknown>;
    if (!isNonEmptyString(record.i)) throw new CatalogCursorError("thread");
    if (order === "manual") {
      if (!isSafeInteger(record.s)) throw new CatalogCursorError("thread");
      return { order, sortOrder: record.s, id: record.i };
    }
    if (order === "updated") {
      if (!isNonEmptyString(record.u)) throw new CatalogCursorError("thread");
      return { order, updatedAt: record.u, id: record.i };
    }
    if (!isNonEmptyString(record.c)) throw new CatalogCursorError("thread");
    return { order, createdAt: record.c, id: record.i };
  }
  throw new CatalogCursorError("thread");
}

export function encodeCatalogProjectPaintCursor(cursor: CatalogProjectPaintCursor): string {
  return encodeCursorPayload(CATALOG_PROJECT_PAINT_CURSOR_PREFIX, {
    s: cursor.sortOrder,
    i: cursor.id,
  });
}

export function decodeCatalogProjectPaintCursor(cursor: string): CatalogProjectPaintCursor {
  const payload = decodeCursorPayload(cursor, CATALOG_PROJECT_PAINT_CURSOR_PREFIX, "project");
  if (typeof payload !== "object" || payload === null) throw new CatalogCursorError("project");
  const record = payload as Record<string, unknown>;
  if (!isSafeInteger(record.s) || !isNonEmptyString(record.i)) {
    throw new CatalogCursorError("project");
  }
  return { sortOrder: record.s, id: record.i };
}

export function encodeCatalogInventoryCursor(
  kind: CatalogReadKind,
  cursor: CatalogInventoryCursor,
): string {
  return encodeCursorPayload(
    kind === "thread"
      ? CATALOG_THREAD_INVENTORY_CURSOR_PREFIX
      : CATALOG_PROJECT_INVENTORY_CURSOR_PREFIX,
    { i: cursor.id, f: cursor.frontier },
  );
}

export function decodeCatalogInventoryCursor(
  cursor: string,
  kind: CatalogReadKind,
): CatalogInventoryCursor {
  const payload = decodeCursorPayload(
    cursor,
    kind === "thread"
      ? CATALOG_THREAD_INVENTORY_CURSOR_PREFIX
      : CATALOG_PROJECT_INVENTORY_CURSOR_PREFIX,
    kind,
  );
  if (typeof payload !== "object" || payload === null) throw new CatalogCursorError(kind);
  const record = payload as Record<string, unknown>;
  if (!isNonEmptyString(record.i) || !isNonEmptyString(record.f)) {
    throw new CatalogCursorError(kind);
  }
  return { id: record.i, frontier: record.f };
}

const catalogMembershipIdSchema = z.string().min(1).max(512);

/**
 * `POST /api/catalog/membership` body. Both lists are optional and bounded to
 * {@link CATALOG_MEMBERSHIP_MAX_IDS}; uniqueness is enforced by the host
 * handler through {@link catalogMembershipRequestUniquenessIssue} so the
 * generated native contract stays JSON-Schema representable (a custom refine
 * has no portable native validator).
 */
export const catalogMembershipRequestSchema = z.object({
  threadIds: z.array(catalogMembershipIdSchema).max(CATALOG_MEMBERSHIP_MAX_IDS).optional(),
  projectIds: z.array(catalogMembershipIdSchema).max(CATALOG_MEMBERSHIP_MAX_IDS).optional(),
});
export type CatalogMembershipRequest = z.infer<typeof catalogMembershipRequestSchema>;

/**
 * Returns the first wire field whose id list contains a duplicate, or null.
 * The host maps a non-null result to `400 invalid_request`; duplicate ids are
 * otherwise harmless to the PK lookup but are rejected so a buggy client
 * cannot inflate a batch past its intended size.
 */
export function catalogMembershipRequestUniquenessIssue(
  request: CatalogMembershipRequest,
): "threadIds" | "projectIds" | null {
  if (request.threadIds && new Set(request.threadIds).size !== request.threadIds.length) {
    return "threadIds";
  }
  if (request.projectIds && new Set(request.projectIds).size !== request.projectIds.length) {
    return "projectIds";
  }
  return null;
}

export const catalogMembershipResponseSchema = z.object({
  existingThreadIds: z.array(z.string().min(1)),
  existingProjectIds: z.array(z.string().min(1)),
});
export type CatalogMembershipResponse = z.infer<typeof catalogMembershipResponseSchema>;

export const CATALOG_ITEM_TOO_LARGE_CODE = "read_item_too_large";

/**
 * Typed refusal for a page-of-one that cannot fit one effective hard cap. The
 * body names the accounting explicitly so no consumer can mistake `decodeBytes`
 * for parsed-object/RSS memory: it is the serialized UTF-16×2 charge the client
 * engine applies. `measurement` distinguishes an exact phase-2 measurement from
 * a phase-1 pre-fetch refusal; `wireBytes`/`decodeBytes` are always conservative
 * upper bounds of the row, and `lowerBoundWireBytes`/`lowerBoundDecodeBytes`
 * carry the sound lower bound that proved the refusal (they are ≥ the actual
 * size only when the whole row is provable, e.g. a raw string column that the
 * wire schema emits verbatim).
 */
export const catalogItemTooLargeBodySchema = z.object({
  error: z.object({
    code: z.literal(CATALOG_ITEM_TOO_LARGE_CODE),
    message: z.string().min(1),
  }),
  readItem: z.object({
    resource: z.enum(["thread", "project"]),
    id: z.string().min(1),
    wireBytes: z.number().int().nonnegative(),
    decodeBytes: z.number().int().nonnegative(),
    maxBytes: z.number().int().positive(),
    maxDecodeBytes: z.number().int().positive(),
    measurement: z.enum(["serialized-exact", "serialized-upper-bound"]),
    wireBytesMeaning: z.literal("utf8-serialized"),
    decodeBytesMeaning: z.literal("utf16-code-units-x2"),
    lowerBoundWireBytes: z.number().int().nonnegative().optional(),
    lowerBoundDecodeBytes: z.number().int().nonnegative().optional(),
  }),
});
export type CatalogItemTooLargeBody = z.infer<typeof catalogItemTooLargeBodySchema>;
