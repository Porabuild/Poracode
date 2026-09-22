import { z } from "zod";
import { persistedCompletedTurnSchema } from "../ipc/schemas";
import { CATALOG_READS_CAPABILITY } from "./catalogReadContract";

/**
 * B4 history read contract (capability `reads=bounded-v1`, shared with the
 * catalog slice).
 *
 * This module owns the wire names, byte-budget constants, the completed-turn
 * continuation cursor, and the turn-page / typed-oversize schemas for bounded
 * history reads. It is deliberately additive: the protocol version stays 12,
 * undeclared clients keep the existing complete variants, and no existing
 * schema is edited. The generated-contract owner (C0) consumes these
 * definitions; see `tmp/v2-production/b4-history-host.md` for the exact
 * handoff.
 *
 * Byte accounting (the parent override that supersedes the earlier "retained
 * memory" wording; same accounting as the catalog slice):
 *
 * - `wireBytes` = UTF-8 bytes of the serialized response body.
 * - `decodeBytes` = `2 × serialized.length` (UTF-16 code units × 2) — exactly
 *   the client engine's raw frame charge (`measuredRawBytes` in
 *   `src/renderer/state/remote/engine/decode.ts`). It is a bound on the
 *   SERIALIZED text the client holds, NOT a parsed-object, structured-clone,
 *   heap, or RSS bound.
 * - Host hard caps: 32 MiB wire / 64 MiB decode (re-exported from the catalog
 *   contract; one caps table for the whole capability bundle).
 * - Soft packing targets: history page 1 MiB wire, turn page 256 KiB wire.
 *   Soft targets control packing only; they never refuse a row the client can
 *   decode. A valid page-of-one may exceed the soft target and must fit the
 *   declared hard budgets.
 *
 * 64 MiB decode covers the existing 4,000,000-character stream cap: 4M control
 * characters escape to 24M ASCII characters → 48 MB decode (≤ 64 MiB) and
 * 24 MB wire (≤ 32 MiB). No smaller per-item cap is invented for compatibility.
 * - Hard rejection is proven, never estimated: only a sound lower bound that
 *   already exceeds a cap refuses a row before its payload is fetched (the
 *   exact escaped size of verbatim fields and the stream tail, plus the exact
 *   SQL-side measurement of the stream head when needed). Conservative upper
 *   bounds drive packing only.
 */
export {
  CATALOG_HOST_DECODE_MAX_BYTES,
  CATALOG_HOST_WIRE_MAX_BYTES,
  CATALOG_JSON_BOUND_FACTOR,
  CATALOG_READS_CAPABILITY,
  CATALOG_ROW_ENVELOPE_BYTES,
  escapedUnitsLowerBound,
  serializedDecodeByteLength,
  serializedWireByteLength,
} from "./catalogReadContract";

/** Soft packing target for one bounded history item page (wire UTF-8). */
export const HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES = 1024 * 1024;

/** Soft packing target for one completed-turn page (wire UTF-8). */
export const HISTORY_TURNS_SOFT_PACK_WIRE_BYTES = 256 * 1024;

export const HISTORY_ITEMS_DEFAULT_LIMIT = 500;
export const HISTORY_ITEMS_MAX_LIMIT = 500;
export const HISTORY_TIMELINE_ENTRY_DEFAULT = 40;
export const HISTORY_TIMELINE_ENTRY_MAX = 100;
export const HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT = 200;
export const HISTORY_COMPLETED_TURNS_MAX_LIMIT = 500;

/**
 * Fixed per-turn allowance for keys, punctuation, timestamps and the nullable
 * anchor id. A turn serializes to ~120 bytes; 256 keeps more than 2× headroom
 * while staying small enough that the 256 KiB soft target can pack the default
 * 200-turn tail.
 */
export const HISTORY_TURN_ROW_ENVELOPE_BYTES = 256;

/**
 * `ct1.` cursor: the exclusive lower bound (`idx`) of the next older
 * completed-turn page. Prefix is the capability signal; a cursor whose prefix
 * or payload does not match the turn route is a protocol error
 * (`400 invalid_thread_cursor`), never a silent fallback.
 */
export const HISTORY_TURNS_CURSOR_PREFIX = "ct1.";
export const HISTORY_CURSOR_MAX_LENGTH = 4096;

export class HistoryCursorError extends Error {
  constructor(
    message = "The completed-turn cursor is malformed or does not match the turn route.",
  ) {
    super(message);
    this.name = "HistoryCursorError";
  }
}

export function encodeCompletedTurnCursor(idx: number): string {
  if (!Number.isSafeInteger(idx) || idx < 0) {
    throw new HistoryCursorError("The completed-turn cursor index must be a nonnegative integer.");
  }
  const json = JSON.stringify({ i: idx });
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  return `${HISTORY_TURNS_CURSOR_PREFIX}${base64}`;
}

export function decodeCompletedTurnCursor(cursor: string): number {
  if (cursor.length === 0 || cursor.length > HISTORY_CURSOR_MAX_LENGTH) {
    throw new HistoryCursorError();
  }
  if (!cursor.startsWith(HISTORY_TURNS_CURSOR_PREFIX)) {
    throw new HistoryCursorError();
  }
  const encoded = cursor.slice(HISTORY_TURNS_CURSOR_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) throw new HistoryCursorError();
  let payload: unknown;
  try {
    const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new HistoryCursorError();
  }
  if (typeof payload !== "object" || payload === null) throw new HistoryCursorError();
  const idx = (payload as Record<string, unknown>).i;
  if (typeof idx !== "number" || !Number.isSafeInteger(idx) || idx < 0) {
    throw new HistoryCursorError();
  }
  return idx;
}

/**
 * `GET /api/threads/{threadId}/turns` response. `completedTurnsNextCursor` is
 * the `ct1.<idx>` of the oldest returned turn when older turns remain; null at
 * the end. Turns are ascending by `idx`; turns without an `anchor_item_id` are
 * included because the idx continuation is exact.
 */
export const historyTurnPageSchema = z.object({
  turns: z.array(persistedCompletedTurnSchema),
  completedTurnsNextCursor: z.string().min(1).nullable(),
  reads: z.literal(CATALOG_READS_CAPABILITY),
});
export type HistoryTurnPage = z.infer<typeof historyTurnPageSchema>;

/**
 * Typed refusal for a page-of-one that cannot fit one effective hard cap. The
 * body names the accounting explicitly so no consumer can mistake
 * `decodeBytes` for parsed-object/RSS memory. `resource` is the history half
 * of the capability's union; the catalog slice owns `thread`/`project` and C0
 * folds both into the single generated `read_item_too_large` body.
 * `wireBytes`/`decodeBytes` are conservative upper bounds of the row;
 * `lowerBoundWireBytes`/`lowerBoundDecodeBytes` carry the sound lower bound
 * that proved a pre-fetch refusal.
 */
export const historyItemTooLargeBodySchema = z.object({
  error: z.object({
    code: z.literal("read_item_too_large"),
    message: z.string().min(1),
  }),
  readItem: z.object({
    resource: z.enum(["runtime_item", "turn"]),
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
export type HistoryItemTooLargeBody = z.infer<typeof historyItemTooLargeBodySchema>;
