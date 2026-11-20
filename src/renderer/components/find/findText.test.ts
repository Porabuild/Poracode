import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFindHighlights,
  FIND_HIGHLIGHT_CURRENT_NAME,
  FIND_HIGHLIGHT_NAME,
  scrollRangeIntoView,
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

it("reveals a match inside horizontal overflow when requested", () => {
  const transcript = document.createElement("div");
  const tableScroller = document.createElement("div");
  tableScroller.style.overflowX = "auto";
  const cell = document.createElement("span");
  cell.textContent = "Needle Far";
  tableScroller.append(cell);
  transcript.append(tableScroller);
  Object.defineProperties(tableScroller, {
    clientWidth: { value: 100 },
    scrollWidth: { value: 300 },
  });
  tableScroller.getBoundingClientRect = () => new DOMRect(0, 0, 100, 50);
  transcript.getBoundingClientRect = () => new DOMRect(0, 0, 100, 300);
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.getBoundingClientRect = () => new DOMRect(200 - tableScroller.scrollLeft, 100, 40, 12);

  scrollRangeIntoView(transcript, range);
  expect(tableScroller.scrollLeft).toBe(0);
  scrollRangeIntoView(transcript, range, { horizontally: true });
  expect(tableScroller.scrollLeft).toBe(140);
  expect(transcript.scrollLeft).toBe(0);
  tableScroller.scrollLeft = 220;
  scrollRangeIntoView(transcript, range, { horizontally: true });
  expect(tableScroller.scrollLeft).toBe(200);
});
