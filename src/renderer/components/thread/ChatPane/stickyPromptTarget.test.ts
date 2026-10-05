import { describe, expect, it } from "vitest";
import { findFirstVisibleRowIndex, findStickyPromptIndex } from "./stickyPromptTarget";

describe("findFirstVisibleRowIndex", () => {
  it("skips mounted rows that sit above or below the viewport", () => {
    const rows = [
      { index: 4, top: 300, bottom: 400 },
      { index: 1, top: -200, bottom: -100 },
      { index: 3, top: 150, bottom: 300 },
      { index: 2, top: -100, bottom: 120 },
      { index: 5, top: 600, bottom: 700 },
    ];
    expect(findFirstVisibleRowIndex(rows, 100, 500)).toBe(2);
  });

  it("treats a row ending exactly at the viewport top as scrolled out", () => {
    const rows = [
      { index: 0, top: 0, bottom: 100 },
      { index: 1, top: 100, bottom: 200 },
    ];
    expect(findFirstVisibleRowIndex(rows, 100, 300)).toBe(1);
  });

  it("returns null when nothing overlaps the viewport", () => {
    expect(findFirstVisibleRowIndex([{ index: 0, top: 0, bottom: 50 }], 100, 300)).toBeNull();
    expect(findFirstVisibleRowIndex([], 0, 300)).toBeNull();
  });
});

describe("findStickyPromptIndex", () => {
  const promptsAt =
    (...indices: number[]) =>
    (index: number) =>
      indices.includes(index);

  it("returns the nearest prompt above the first visible row", () => {
    expect(findStickyPromptIndex(7, promptsAt(0, 3, 9))).toBe(3);
  });

  it("returns null while the prompt itself is the first visible row", () => {
    expect(findStickyPromptIndex(3, promptsAt(0, 3))).toBeNull();
  });

  it("returns null when no prompt precedes the visible content", () => {
    expect(findStickyPromptIndex(4, promptsAt(6))).toBeNull();
  });
});
