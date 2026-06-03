import { describe, expect, it } from "vitest";
import { normalizeRows } from "./openCodeGoDb";

describe("normalizeRows", () => {
  it("scales epoch-second timestamps to milliseconds and keeps ms ones", () => {
    const rows = normalizeRows([
      { createdMs: 1_700_000_000, cost: 0.5 },
      { createdMs: 1_700_000_000_000, cost: 1.25 },
    ]);
    expect(rows).toEqual([
      { createdMs: 1_700_000_000_000, cost: 0.5 },
      { createdMs: 1_700_000_000_000, cost: 1.25 },
    ]);
  });

  it("drops rows with non-numeric, negative, or non-finite values", () => {
    const rows = normalizeRows([
      { createdMs: "x", cost: 1 },
      { createdMs: 1_700_000_000_000, cost: -1 },
      { createdMs: 1_700_000_000_000, cost: Number.NaN },
      { createdMs: 0, cost: 1 },
      { createdMs: 1_700_000_000_000, cost: 2 },
    ]);
    expect(rows).toEqual([{ createdMs: 1_700_000_000_000, cost: 2 }]);
  });
});
