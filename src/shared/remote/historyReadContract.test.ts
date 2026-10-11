import { describe, expect, it } from "vitest";
import {
  CATALOG_HOST_DECODE_MAX_BYTES,
  CATALOG_HOST_WIRE_MAX_BYTES,
  CATALOG_READS_CAPABILITY,
  HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT,
  HISTORY_COMPLETED_TURNS_MAX_LIMIT,
  HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES,
  HISTORY_TURNS_CURSOR_PREFIX,
  HISTORY_TURNS_SOFT_PACK_WIRE_BYTES,
  HistoryCursorError,
  decodeCompletedTurnCursor,
  encodeCompletedTurnCursor,
  historyTurnPageSchema,
  serializedDecodeByteLength,
  serializedWireByteLength,
} from "./historyReadContract";

const MiB = 1024 * 1024;

describe("B4 history read contract", () => {
  it("keeps one caps table: 32 MiB wire / 64 MiB serialized-decode", () => {
    expect(CATALOG_HOST_WIRE_MAX_BYTES).toBe(32 * MiB);
    expect(CATALOG_HOST_DECODE_MAX_BYTES).toBe(64 * MiB);
    expect(HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES).toBe(1 * MiB);
    expect(HISTORY_TURNS_SOFT_PACK_WIRE_BYTES).toBe(256 * 1024);
    expect(HISTORY_COMPLETED_TURNS_DEFAULT_LIMIT).toBe(200);
    expect(HISTORY_COMPLETED_TURNS_MAX_LIMIT).toBe(500);
  });

  it("does not shrink the budget below the existing 4M-character stream cap", () => {
    // The existing stream cap permits 4,000,000 control characters; JSON
    // escaping expands each to 6 ASCII characters. The negotiated decode cap
    // must fit that serialized text without inventing a smaller compatibility
    // cap.
    const escaped = JSON.stringify("\u0001".repeat(4_000_000));
    expect(escaped.length).toBe(24_000_002);
    expect(serializedWireByteLength(escaped)).toBeLessThanOrEqual(CATALOG_HOST_WIRE_MAX_BYTES);
    expect(serializedDecodeByteLength(escaped)).toBeLessThanOrEqual(CATALOG_HOST_DECODE_MAX_BYTES);
  });

  it("round-trips ct1. cursors, including zero and the max page index", () => {
    for (const idx of [0, 1, 7, 200, 499_999]) {
      const cursor = encodeCompletedTurnCursor(idx);
      expect(cursor.startsWith(HISTORY_TURNS_CURSOR_PREFIX)).toBe(true);
      expect(decodeCompletedTurnCursor(cursor)).toBe(idx);
    }
  });

  it("refuses a cursor that is malformed or carries another route's prefix", () => {
    const wrongPrefix = encodeCompletedTurnCursor(3).replace(HISTORY_TURNS_CURSOR_PREFIX, "tp1.");
    for (const cursor of [
      wrongPrefix,
      HISTORY_TURNS_CURSOR_PREFIX,
      `${HISTORY_TURNS_CURSOR_PREFIX}!!!`,
      "x".repeat(5000),
    ]) {
      expect(() => decodeCompletedTurnCursor(cursor)).toThrow(HistoryCursorError);
    }
  });

  it("refuses a ct1. payload with a negative or non-integer index", () => {
    const payload = (value: unknown): string =>
      `${HISTORY_TURNS_CURSOR_PREFIX}${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
    for (const value of [
      { i: -1 },
      { i: 1.5 },
      { i: "3" },
      { i: Number.MAX_SAFE_INTEGER + 2 },
      {},
    ]) {
      expect(() => decodeCompletedTurnCursor(payload(value))).toThrow(HistoryCursorError);
    }
  });

  it("parses a turn page with anchorless turns and the reads echo", () => {
    const page = historyTurnPageSchema.parse({
      turns: [
        {
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:01:00.000Z",
          anchorItemId: null,
        },
        {
          startedAt: "2026-01-02T00:00:00.000Z",
          endedAt: "2026-01-02T00:01:00.000Z",
          anchorItemId: "item-9",
        },
      ],
      completedTurnsNextCursor: encodeCompletedTurnCursor(4),
      reads: CATALOG_READS_CAPABILITY,
    });
    expect(page.turns).toHaveLength(2);
    expect(page.turns[0]?.anchorItemId).toBeNull();
    expect(decodeCompletedTurnCursor(page.completedTurnsNextCursor!)).toBe(4);
  });
});
