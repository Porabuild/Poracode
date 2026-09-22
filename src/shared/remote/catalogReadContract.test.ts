import { describe, expect, it } from "vitest";
import {
  CATALOG_CURSOR_MAX_LENGTH,
  CATALOG_HOST_DECODE_MAX_BYTES,
  CATALOG_HOST_WIRE_MAX_BYTES,
  CATALOG_JSON_BOUND_FACTOR,
  CATALOG_MEMBERSHIP_MAX_IDS,
  CATALOG_PAINT_ORDER_CURSOR_PREFIX,
  CATALOG_READS_CAPABILITY,
  CatalogCursorError,
  catalogItemTooLargeBodySchema,
  catalogMembershipRequestSchema,
  catalogMembershipRequestUniquenessIssue,
  decodeCatalogInventoryCursor,
  decodeCatalogProjectPaintCursor,
  decodeCatalogThreadPaintCursor,
  encodeCatalogInventoryCursor,
  encodeCatalogProjectPaintCursor,
  encodeCatalogThreadPaintCursor,
  escapedUnitsLowerBound,
  serializedDecodeByteLength,
  serializedWireByteLength,
} from "./catalogReadContract";

describe("catalogReadContract", () => {
  it("round-trips every cursor namespace and refuses mismatches", () => {
    const manual = encodeCatalogThreadPaintCursor({ order: "manual", sortOrder: 4, id: "t-1" });
    expect(manual.startsWith(CATALOG_PAINT_ORDER_CURSOR_PREFIX.manual)).toBe(true);
    expect(decodeCatalogThreadPaintCursor(manual)).toEqual({
      order: "manual",
      sortOrder: 4,
      id: "t-1",
    });
    const updated = encodeCatalogThreadPaintCursor({
      order: "updated",
      updatedAt: "2026-09-01T00:00:00.000Z",
      id: "t-2",
    });
    expect(decodeCatalogThreadPaintCursor(updated)).toEqual({
      order: "updated",
      updatedAt: "2026-09-01T00:00:00.000Z",
      id: "t-2",
    });
    const created = encodeCatalogThreadPaintCursor({
      order: "created",
      createdAt: "2026-08-01T00:00:00.000Z",
      id: "t-3",
    });
    expect(decodeCatalogThreadPaintCursor(created)).toEqual({
      order: "created",
      createdAt: "2026-08-01T00:00:00.000Z",
      id: "t-3",
    });
    const inventory = encodeCatalogInventoryCursor("thread", { id: "t-9", frontier: "t-zz" });
    expect(decodeCatalogInventoryCursor(inventory, "thread")).toEqual({
      id: "t-9",
      frontier: "t-zz",
    });
    // A thread cursor is not a project cursor, and vice versa.
    expect(() => decodeCatalogInventoryCursor(inventory, "project")).toThrow(CatalogCursorError);
    expect(() =>
      decodeCatalogThreadPaintCursor(encodeCatalogProjectPaintCursor({ sortOrder: 1, id: "p" })),
    ).toThrow(CatalogCursorError);
    expect(
      decodeCatalogProjectPaintCursor(encodeCatalogProjectPaintCursor({ sortOrder: 2, id: "p" })),
    ).toEqual({ sortOrder: 2, id: "p" });
  });

  it("rejects malformed, oversized, and structurally invalid cursors", () => {
    expect(() => decodeCatalogThreadPaintCursor("")).toThrow(CatalogCursorError);
    expect(() => decodeCatalogThreadPaintCursor("x".repeat(CATALOG_CURSOR_MAX_LENGTH + 1))).toThrow(
      CatalogCursorError,
    );
    expect(() => decodeCatalogThreadPaintCursor("tp1.***")).toThrow(CatalogCursorError);
    expect(() => decodeCatalogThreadPaintCursor("tp1.bm90anNvbg")).toThrow(CatalogCursorError);
    expect(() => decodeCatalogThreadPaintCursor(`tu2.${btoa("{}")}`)).toThrow(CatalogCursorError);
    expect(() =>
      decodeCatalogInventoryCursor(`ti1.${btoa(JSON.stringify({ i: "a", f: "" }))}`, "thread"),
    ).toThrow(CatalogCursorError);
    expect(() =>
      decodeCatalogInventoryCursor(`ti1.${btoa(JSON.stringify({ i: 7, f: "f" }))}`, "thread"),
    ).toThrow(CatalogCursorError);
  });

  it("names the serialized decode accounting exactly as the client engine charges it", () => {
    expect(serializedDecodeByteLength("abc")).toBe(6);
    expect(serializedDecodeByteLength("😀")).toBe(4);
    expect(serializedWireByteLength("😀")).toBe(4);
    expect(serializedWireByteLength("é")).toBe(2);
    expect(serializedWireByteLength("abc")).toBe(3);
    // 4M control characters escape to 24M ASCII chars: 48 MB decode, 24 MB wire.
    const escapedStreamChars = 4_000_000 * 6;
    expect(serializedDecodeByteLength("x".repeat(escapedStreamChars))).toBe(48_000_000);
    expect(48_000_000).toBeLessThanOrEqual(CATALOG_HOST_DECODE_MAX_BYTES);
    expect(24_000_000).toBeLessThanOrEqual(CATALOG_HOST_WIRE_MAX_BYTES);
    expect(CATALOG_JSON_BOUND_FACTOR).toBe(6);
  });

  it("validates the membership request bounds and uniqueness", () => {
    expect(catalogMembershipRequestSchema.parse({ threadIds: ["a"], projectIds: ["b"] })).toEqual({
      threadIds: ["a"],
      projectIds: ["b"],
    });
    expect(catalogMembershipRequestSchema.parse({})).toEqual({});
    const maxIds = Array.from({ length: CATALOG_MEMBERSHIP_MAX_IDS }, (_, index) => `id-${index}`);
    expect(catalogMembershipRequestSchema.parse({ threadIds: maxIds }).threadIds).toHaveLength(
      CATALOG_MEMBERSHIP_MAX_IDS,
    );
    expect(() =>
      catalogMembershipRequestSchema.parse({ threadIds: [...maxIds, "one-more"] }),
    ).toThrow(/too big|at most/iu);
    expect(() => catalogMembershipRequestSchema.parse({ threadIds: [""] })).toThrow(
      /too small|at least/iu,
    );
    // Uniqueness is enforced by the host handler through the shared helper
    // (a custom refine cannot be represented in the generated native
    // contract), so the wire schema itself stays permissive.
    expect(catalogMembershipRequestSchema.parse({ threadIds: ["dup", "dup"] })).toEqual({
      threadIds: ["dup", "dup"],
    });
    expect(catalogMembershipRequestUniquenessIssue({ threadIds: ["dup", "dup"] })).toBe(
      "threadIds",
    );
    expect(catalogMembershipRequestUniquenessIssue({ projectIds: ["a", "a"] })).toBe("projectIds");
    expect(
      catalogMembershipRequestUniquenessIssue({ threadIds: ["a"], projectIds: ["b"] }),
    ).toBeNull();
    expect(catalogMembershipRequestUniquenessIssue({})).toBeNull();
  });

  it("keeps the typed oversize body explicit about the accounting", () => {
    const parsed = catalogItemTooLargeBodySchema.parse({
      error: { code: "read_item_too_large", message: "too large" },
      readItem: {
        resource: "thread",
        id: "t-1",
        wireBytes: 10,
        decodeBytes: 20,
        maxBytes: CATALOG_HOST_WIRE_MAX_BYTES,
        maxDecodeBytes: CATALOG_HOST_DECODE_MAX_BYTES,
        measurement: "serialized-exact",
        wireBytesMeaning: "utf8-serialized",
        decodeBytesMeaning: "utf16-code-units-x2",
      },
    });
    expect(parsed.readItem.decodeBytesMeaning).toBe("utf16-code-units-x2");
    expect(CATALOG_READS_CAPABILITY).toBe("bounded-v1");

    const proven = catalogItemTooLargeBodySchema.parse({
      error: { code: "read_item_too_large", message: "too large" },
      readItem: {
        resource: "thread",
        id: "t-2",
        wireBytes: 100,
        decodeBytes: 200,
        maxBytes: 50,
        maxDecodeBytes: 100,
        measurement: "serialized-upper-bound",
        wireBytesMeaning: "utf8-serialized",
        decodeBytesMeaning: "utf16-code-units-x2",
        lowerBoundWireBytes: 60,
        lowerBoundDecodeBytes: 120,
      },
    });
    expect(proven.readItem.lowerBoundWireBytes).toBe(60);
  });

  it("derives a sound escaped-unit lower bound from code points and bytes", () => {
    // ASCII: units == bytes == code points.
    expect(escapedUnitsLowerBound(3, 3)).toBe(3);
    // Three-byte BMP characters: one unit per three bytes.
    expect(escapedUnitsLowerBound(10, 30)).toBe(10);
    // Supplementary characters: two units per four bytes, but code points
    // dominate when they are the larger term.
    expect(escapedUnitsLowerBound(2, 4)).toBe(2);
    // Control escapes: six ASCII code points per escaped character.
    expect(escapedUnitsLowerBound(6, 6)).toBe(6);
    // The bound is never above the byte length and never above 3× code points.
    for (const [codePoints, bytes] of [
      [1, 4],
      [100, 300],
      [7, 42],
      [1000, 4000],
    ] as const) {
      const units = escapedUnitsLowerBound(codePoints, bytes);
      expect(units).toBeGreaterThanOrEqual(codePoints);
      expect(units).toBeGreaterThanOrEqual(Math.ceil(bytes / 3));
      expect(units).toBeLessThanOrEqual(Math.max(codePoints, bytes));
    }
  });
});
