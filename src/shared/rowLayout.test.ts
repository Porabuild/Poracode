import { describe, it, expect } from "vitest";
import {
  effectiveRowLayout,
  paneIndexToRowCol,
  addToRowLayout,
  insertRowInLayout,
  removeFromRowLayout,
  removeIndicesFromRowLayout,
} from "./rowLayout";

describe("effectiveRowLayout", () => {
  it("returns rowLayout when provided and non-empty", () => {
    expect(effectiveRowLayout(5, [2, 3])).toEqual([2, 3]);
  });

  it("returns [paneCount] when rowLayout is undefined", () => {
    expect(effectiveRowLayout(4)).toEqual([4]);
  });

  it("returns [paneCount] when rowLayout is empty", () => {
    expect(effectiveRowLayout(3, [])).toEqual([3]);
  });
});

describe("paneIndexToRowCol", () => {
  it("returns row 0 col 0 for first pane", () => {
    expect(paneIndexToRowCol([2, 3], 0)).toEqual({ row: 0, col: 0, rowStart: 0 });
  });

  it("returns correct position for second element in first row", () => {
    expect(paneIndexToRowCol([2, 3], 1)).toEqual({ row: 0, col: 1, rowStart: 0 });
  });

  it("returns correct position for first element of second row", () => {
    expect(paneIndexToRowCol([2, 3], 2)).toEqual({ row: 1, col: 0, rowStart: 2 });
  });

  it("returns correct position for last element", () => {
    expect(paneIndexToRowCol([2, 3], 4)).toEqual({ row: 1, col: 2, rowStart: 2 });
  });

  it("handles index past end by treating as last row", () => {
    const result = paneIndexToRowCol([2, 3], 10);
    expect(result.row).toBe(1);
  });

  it("works with single-row layout", () => {
    expect(paneIndexToRowCol([5], 3)).toEqual({ row: 0, col: 3, rowStart: 0 });
  });
});

describe("addToRowLayout", () => {
  it("increments the column count of the row containing flatIndex", () => {
    expect(addToRowLayout([2, 3], 0)).toEqual([3, 3]);
  });

  it("increments second row when flatIndex is in second row", () => {
    expect(addToRowLayout([2, 3], 3)).toEqual([2, 4]);
  });
});

describe("insertRowInLayout", () => {
  it("inserts a new row with count 1 at the given index", () => {
    expect(insertRowInLayout([2, 3], 0)).toEqual([1, 2, 3]);
  });

  it("inserts at the end", () => {
    expect(insertRowInLayout([2, 3], 2)).toEqual([2, 3, 1]);
  });

  it("inserts in the middle", () => {
    expect(insertRowInLayout([2, 3], 1)).toEqual([2, 1, 3]);
  });
});

describe("removeFromRowLayout", () => {
  it("decrements the column count of the row containing flatIndex", () => {
    expect(removeFromRowLayout([2, 3], 0)).toEqual([1, 3]);
  });

  it("removes the row entirely if count becomes 0", () => {
    expect(removeFromRowLayout([1, 3], 0)).toEqual([3]);
  });

  it("decrements second row", () => {
    expect(removeFromRowLayout([2, 3], 3)).toEqual([2, 2]);
  });
});

describe("removeIndicesFromRowLayout", () => {
  it("removes specific indices from multiple rows", () => {
    // rowLayout [2, 3] means indices 0,1 in row 0 and 2,3,4 in row 1
    const result = removeIndicesFromRowLayout([2, 3], new Set([0, 3]));
    expect(result).toEqual([1, 2]);
  });

  it("removes an entire row if all its indices are removed", () => {
    const result = removeIndicesFromRowLayout([2, 3], new Set([0, 1]));
    expect(result).toEqual([3]);
  });

  it("returns empty array if all indices removed", () => {
    const result = removeIndicesFromRowLayout([2, 1], new Set([0, 1, 2]));
    expect(result).toEqual([]);
  });

  it("returns unchanged layout if no indices removed", () => {
    const result = removeIndicesFromRowLayout([2, 3], new Set());
    expect(result).toEqual([2, 3]);
  });
});
