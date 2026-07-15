import { describe, expect, it } from "vitest";
import { capturePrependAnchors, measurePrependAnchorDelta } from "./chatPrependAnchor";

interface RowSpec {
  key: string;
  top: number;
  height: number;
}

function buildScroller(viewTop: number, viewHeight: number, rows: RowSpec[]): HTMLElement {
  const scroller = document.createElement("div");
  scroller.getBoundingClientRect = () =>
    ({ top: viewTop, bottom: viewTop + viewHeight, height: viewHeight }) as DOMRect;
  for (const row of rows) {
    const el = document.createElement("div");
    el.dataset.chatVirtualRow = "true";
    el.dataset.itemId = row.key;
    el.getBoundingClientRect = () =>
      ({ top: row.top, bottom: row.top + row.height, height: row.height }) as DOMRect;
    scroller.appendChild(el);
  }
  return scroller;
}

describe("capturePrependAnchors", () => {
  it("captures only rows intersecting the viewport, topmost first", () => {
    const scroller = buildScroller(100, 400, [
      { key: "below", top: 520, height: 40 },
      { key: "partial-top", top: 60, height: 80 },
      { key: "middle", top: 200, height: 100 },
      { key: "above", top: 0, height: 90 },
    ]);
    expect(capturePrependAnchors(scroller)).toEqual([
      { key: "partial-top", offset: -40 },
      { key: "middle", offset: 100 },
    ]);
  });

  it("skips rows without an item id", () => {
    const scroller = buildScroller(0, 400, [{ key: "a", top: 10, height: 20 }]);
    const bare = document.createElement("div");
    bare.dataset.chatVirtualRow = "true";
    bare.getBoundingClientRect = () => ({ top: 50, bottom: 70, height: 20 }) as DOMRect;
    scroller.appendChild(bare);
    expect(capturePrependAnchors(scroller)).toEqual([{ key: "a", offset: 10 }]);
  });
});

describe("measurePrependAnchorDelta", () => {
  it("returns how far the anchored row drifted from its captured offset", () => {
    const scroller = buildScroller(100, 400, [{ key: "anchor", top: 260, height: 40 }]);
    // Captured at 100px from viewport top, now renders at 160px → drifted +60.
    expect(measurePrependAnchorDelta(scroller, [{ key: "anchor", offset: 100 }])).toBe(60);
  });

  it("falls back to the next anchor when the first key no longer exists", () => {
    const scroller = buildScroller(0, 400, [{ key: "survivor", top: 90, height: 40 }]);
    const anchors = [
      { key: "merged-away", offset: 10 },
      { key: "survivor", offset: 50 },
    ];
    expect(measurePrependAnchorDelta(scroller, anchors)).toBe(40);
  });

  it("returns null when no captured anchor is rendered anymore", () => {
    const scroller = buildScroller(0, 400, [{ key: "other", top: 10, height: 20 }]);
    expect(measurePrependAnchorDelta(scroller, [{ key: "gone", offset: 0 }])).toBeNull();
    expect(measurePrependAnchorDelta(scroller, [])).toBeNull();
  });
});
