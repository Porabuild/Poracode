import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFindHighlights,
  FIND_HIGHLIGHT_CURRENT_NAME,
  FIND_HIGHLIGHT_NAME,
  setFindHighlights,
} from "./findText";

class TestHighlight {
  priority = 0;
  constructor(readonly ranges: Range[]) {}
}

let registry: Map<string, TestHighlight>;
beforeEach(() => {
  registry = new Map();
  vi.stubGlobal("CSS", { highlights: registry });
  vi.stubGlobal(
    "Highlight",
    class extends TestHighlight {
      constructor(...ranges: Range[]) {
        super(ranges);
      }
    },
  );
});
afterEach(() => {
  clearFindHighlights();
  vi.unstubAllGlobals();
});

describe("find highlight style lifetime", () => {
  it("enables the existing colors for matches and preserves current-match priority", () => {
    const range = document.createRange();
    setFindHighlights([range], range);
    expect(document.documentElement).toHaveAttribute("data-poracode-find-highlights");
    expect(registry.get(FIND_HIGHLIGHT_NAME)?.ranges).toEqual([range]);
    expect(registry.get(FIND_HIGHLIGHT_CURRENT_NAME)?.ranges).toEqual([range]);
    expect(registry.get(FIND_HIGHLIGHT_CURRENT_NAME)?.priority).toBe(1);
  });

  it("stops matching highlight styles when the query has no matches or closes", () => {
    const range = document.createRange();
    setFindHighlights([range], range);
    setFindHighlights([], null);
    expect(document.documentElement).not.toHaveAttribute("data-poracode-find-highlights");
    expect(registry.has(FIND_HIGHLIGHT_CURRENT_NAME)).toBe(false);
    setFindHighlights([range], null);
    clearFindHighlights();
    expect(document.documentElement).not.toHaveAttribute("data-poracode-find-highlights");
    expect(registry.size).toBe(0);
  });

  it("styles a current match resolved separately from the base ranges", () => {
    setFindHighlights([], document.createRange());
    expect(document.documentElement).toHaveAttribute("data-poracode-find-highlights");
  });

  it("leaves styles inactive when the highlight API is unavailable", () => {
    vi.stubGlobal("Highlight", undefined);
    setFindHighlights([document.createRange()], null);
    expect(document.documentElement).not.toHaveAttribute("data-poracode-find-highlights");
    expect(registry.size).toBe(0);
  });
});
