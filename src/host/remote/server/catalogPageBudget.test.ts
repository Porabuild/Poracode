import { describe, expect, it } from "vitest";
import {
  buildCatalogItemTooLargeBody,
  CatalogItemTooLargeError,
  catalogLowerBoundProvesOversized,
  catalogSizesFit,
  catalogUpperBoundWithinCaps,
  measureCatalogBody,
  packCatalogRowsWithinSoftTarget,
  resolveCatalogEffectiveCaps,
  serializeCatalogRowsWithinExactCaps,
} from "./catalogPageBudget";

const caps = (maxWireBytes: number, maxDecodeBytes = maxWireBytes * 2) => ({
  maxWireBytes,
  maxDecodeBytes,
  softPackWireBytes: maxWireBytes,
});

function rowsWithBound(bytes: readonly number[]) {
  return bytes.map((boundWireBytes, index) => ({
    id: `row-${index}`,
    sortOrder: index,
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    boundWireBytes,
    lowerBoundWireBytes: 0,
    lowerBoundDecodeBytes: 0,
  }));
}

describe("catalogPageBudget", () => {
  it("resolves effective caps by clamping to the host ceiling and shrinking the soft target", () => {
    const host = resolveCatalogEffectiveCaps({});
    expect(host.maxWireBytes).toBe(32 * 1024 * 1024);
    expect(host.maxDecodeBytes).toBe(64 * 1024 * 1024);
    expect(host.softPackWireBytes).toBe(512 * 1024);
    const client = resolveCatalogEffectiveCaps({ maxBytes: 1024, maxDecodeBytes: 2048 });
    expect(client).toMatchObject({
      maxWireBytes: 1024,
      maxDecodeBytes: 2048,
      softPackWireBytes: 1024,
    });
    const over = resolveCatalogEffectiveCaps({ maxBytes: Number.MAX_SAFE_INTEGER });
    expect(over.maxWireBytes).toBe(32 * 1024 * 1024);
  });

  it("packs against the soft target and always keeps the first row", () => {
    const rows = rowsWithBound([100, 100, 100, 100]);
    expect(packCatalogRowsWithinSoftTarget(rows, 10, 250)).toEqual({
      packed: rows.slice(0, 2),
      hasMore: true,
    });
    expect(packCatalogRowsWithinSoftTarget(rows, 10, 1000)).toEqual({
      packed: rows,
      hasMore: false,
    });
    // First row alone over the soft target: page-of-one, never refused here.
    const oversize = rowsWithBound([900, 100]);
    expect(packCatalogRowsWithinSoftTarget(oversize, 10, 250)).toEqual({
      packed: [oversize[0]],
      hasMore: true,
    });
    // Limit wins over budget.
    expect(packCatalogRowsWithinSoftTarget(rows, 2, 10_000)).toEqual({
      packed: rows.slice(0, 2),
      hasMore: true,
    });
  });

  it("trims trailing rows by exact measurement and never grows the page", () => {
    const rows = ["a", "b", "c", "d"];
    const serialize = (slice: readonly string[]) => JSON.stringify({ rows: slice });
    const result = serializeCatalogRowsWithinExactCaps({
      rows,
      serialize,
      caps: caps(serialize(["a", "b"]).length),
      onOversized: () => new Error("unexpected"),
      onEnvelopeOversized: () => new Error("unexpected"),
    });
    expect(result.rows).toEqual(["a", "b"]);
    expect(catalogSizesFit(result.sizes, caps(serialize(["a", "b"]).length))).toBe(true);
  });

  it("refuses a page-of-one that cannot fit and reports the measured sizes", () => {
    const rows = ["a"];
    const serialize = (slice: readonly string[]) => JSON.stringify({ rows: slice });
    const sizes = measureCatalogBody(serialize(rows));
    const effective = caps(sizes.wireBytes - 1, sizes.decodeBytes);
    let failure: unknown;
    try {
      serializeCatalogRowsWithinExactCaps({
        rows,
        serialize,
        caps: effective,
        onOversized: (first, measured) =>
          new CatalogItemTooLargeError(
            buildCatalogItemTooLargeBody({
              resource: "thread",
              id: first,
              sizes: measured,
              caps: effective,
              measurement: "serialized-exact",
            }),
          ),
        onEnvelopeOversized: () => new Error("unexpected"),
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CatalogItemTooLargeError);
    expect((failure as CatalogItemTooLargeError).body.readItem).toMatchObject({
      id: "a",
      wireBytes: sizes.wireBytes,
      maxBytes: sizes.wireBytes - 1,
      measurement: "serialized-exact",
    });
  });

  it("refuses an envelope that cannot fit even with no rows", () => {
    const serialize = () => "x".repeat(100);
    expect(() =>
      serializeCatalogRowsWithinExactCaps({
        rows: [],
        serialize,
        caps: caps(50),
        onOversized: () => new Error("unexpected"),
        onEnvelopeOversized: () => new Error("envelope"),
      }),
    ).toThrowError("envelope");
  });

  it("separates the packing upper bound from the proof lower bound", () => {
    const effective = caps(1000, 2000);
    // An upper bound above a cap is not proof: the row is not refused.
    expect(catalogUpperBoundWithinCaps({ wireBytes: 4000, decodeBytes: 8000 }, effective)).toBe(
      false,
    );
    expect(catalogLowerBoundProvesOversized({ wireBytes: 500, decodeBytes: 1000 }, effective)).toBe(
      false,
    );
    // A sound lower bound above a cap is proof.
    expect(
      catalogLowerBoundProvesOversized({ wireBytes: 1001, decodeBytes: 2002 }, effective),
    ).toBe(true);
    expect(catalogLowerBoundProvesOversized({ wireBytes: 500, decodeBytes: 2001 }, effective)).toBe(
      true,
    );

    const body = buildCatalogItemTooLargeBody({
      resource: "thread",
      id: "t-1",
      sizes: { wireBytes: 4000, decodeBytes: 8000 },
      caps: effective,
      measurement: "serialized-upper-bound",
      lowerBoundSizes: { wireBytes: 1001, decodeBytes: 2002 },
    });
    expect(body.readItem).toMatchObject({
      wireBytes: 4000,
      lowerBoundWireBytes: 1001,
      lowerBoundDecodeBytes: 2002,
    });
  });
});
