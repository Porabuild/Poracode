import { describe, it, expect } from "vitest";
import {
  buildPaneLayoutFromLegacy,
  collectPaneIds,
  leadPaneId,
  replacePaneIdInLayout,
  swapPaneIdsInLayout,
  splitPaneInLayout,
  removePaneFromLayout,
  insertPaneInLayout,
  adjustInsertTargetForRemoval,
  findPaneAlign,
  findPanePath,
  type PaneLayout,
} from "./paneLayout";

describe("buildPaneLayoutFromLegacy", () => {
  it("throws for empty panes", () => {
    expect(() => buildPaneLayoutFromLegacy([])).toThrow("at least one pane");
  });

  it("single pane returns a leaf", () => {
    const layout = buildPaneLayoutFromLegacy(["a"]);
    expect(layout).toEqual({ kind: "leaf", paneId: "a" });
  });

  it("multiple panes without rowLayout create a vertical split", () => {
    const layout = buildPaneLayoutFromLegacy(["a", "b", "c"]);
    expect(layout).toEqual({
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
        { kind: "leaf", paneId: "c" },
      ],
    });
  });

  it("rowLayout with single row behaves like no rowLayout", () => {
    const layout = buildPaneLayoutFromLegacy(["a", "b"], [2]);
    expect(layout).toEqual({
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
      ],
    });
  });

  it("rowLayout [2,3] creates horizontal split of vertical rows", () => {
    const layout = buildPaneLayoutFromLegacy(["a", "b", "c", "d", "e"], [2, 3]);
    expect(layout).toEqual({
      kind: "split",
      axis: "horizontal",
      children: [
        {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: "a" },
            { kind: "leaf", paneId: "b" },
          ],
        },
        {
          kind: "split",
          axis: "vertical",
          children: [
            { kind: "leaf", paneId: "c" },
            { kind: "leaf", paneId: "d" },
            { kind: "leaf", paneId: "e" },
          ],
        },
      ],
    });
  });

  it("rowLayout [1,1] with two panes creates horizontal split of leaves", () => {
    const layout = buildPaneLayoutFromLegacy(["x", "y"], [1, 1]);
    expect(layout).toEqual({
      kind: "split",
      axis: "horizontal",
      children: [
        { kind: "leaf", paneId: "x" },
        { kind: "leaf", paneId: "y" },
      ],
    });
  });
});

describe("collectPaneIds", () => {
  it("collects single leaf", () => {
    expect(collectPaneIds({ kind: "leaf", paneId: "a" })).toEqual(["a"]);
  });

  it("collects nested split", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        {
          kind: "split",
          axis: "horizontal",
          children: [
            { kind: "leaf", paneId: "b" },
            { kind: "leaf", paneId: "c" },
          ],
        },
      ],
    };
    expect(collectPaneIds(layout)).toEqual(["a", "b", "c"]);
  });
});

describe("leadPaneId", () => {
  it("returns paneId of single leaf", () => {
    expect(leadPaneId({ kind: "leaf", paneId: "x" })).toBe("x");
  });

  it("returns leftmost nested leaf", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        {
          kind: "split",
          axis: "horizontal",
          children: [
            { kind: "leaf", paneId: "deep" },
            { kind: "leaf", paneId: "other" },
          ],
        },
        { kind: "leaf", paneId: "right" },
      ],
    };
    expect(leadPaneId(layout)).toBe("deep");
  });
});

describe("replacePaneIdInLayout", () => {
  it("replaces leaf paneId", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "old" };
    expect(replacePaneIdInLayout(layout, "old", "new")).toEqual({
      kind: "leaf",
      paneId: "new",
      slotId: "old",
    });
  });

  it("preserves an existing slot identity", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "old", slotId: "slot-a" };
    expect(replacePaneIdInLayout(layout, "old", "new")).toEqual({
      kind: "leaf",
      paneId: "new",
      slotId: "slot-a",
    });
  });

  it("does not replace unmatched leaf", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "other" };
    expect(replacePaneIdInLayout(layout, "old", "new")).toEqual(layout);
  });

  it("replaces deeply nested paneId", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "target" },
      ],
    };
    const result = replacePaneIdInLayout(layout, "target", "replaced");
    expect(collectPaneIds(result)).toContain("replaced");
    expect(collectPaneIds(result)).not.toContain("target");
  });
});

describe("swapPaneIdsInLayout", () => {
  it("swaps two pane ids", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
      ],
    };
    const result = swapPaneIdsInLayout(layout, "a", "b");
    const ids = collectPaneIds(result);
    expect(ids[0]).toBe("b");
    expect(ids[1]).toBe("a");
  });

  it("moves each pane slot with its pane", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a", slotId: "slot-a" },
        { kind: "leaf", paneId: "b", slotId: "slot-b" },
      ],
    };
    expect(swapPaneIdsInLayout(layout, "a", "b")).toEqual({
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "b", slotId: "slot-b" },
        { kind: "leaf", paneId: "a", slotId: "slot-a" },
      ],
    });
  });
});

describe("splitPaneInLayout", () => {
  it("splits a leaf to the right", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "a" };
    const result = splitPaneInLayout(layout, "a", "b", "right");
    expect(result).toEqual({
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
      ],
    });
  });

  it("splits a leaf to the left", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "a" };
    const result = splitPaneInLayout(layout, "a", "b", "left");
    expect(result).toEqual({
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "b" },
        { kind: "leaf", paneId: "a" },
      ],
    });
  });

  it("splits a leaf to the bottom", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "a" };
    const result = splitPaneInLayout(layout, "a", "b", "bottom");
    expect(result).toEqual({
      kind: "split",
      axis: "horizontal",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
      ],
    });
  });

  it("splits a leaf to the top", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "a" };
    const result = splitPaneInLayout(layout, "a", "b", "top");
    expect(result).toEqual({
      kind: "split",
      axis: "horizontal",
      children: [
        { kind: "leaf", paneId: "b" },
        { kind: "leaf", paneId: "a" },
      ],
    });
  });

  it("does nothing when target paneId not found", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "a" };
    const result = splitPaneInLayout(layout, "missing", "b", "right");
    expect(result).toEqual(layout);
  });
});

describe("removePaneFromLayout", () => {
  it("returns null when removing the only leaf", () => {
    expect(removePaneFromLayout({ kind: "leaf", paneId: "a" }, "a")).toBeNull();
  });

  it("returns remaining leaf when removing from a two-child split", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
      ],
    };
    expect(removePaneFromLayout(layout, "a")).toEqual({ kind: "leaf", paneId: "b" });
  });

  it("preserves structure when removing from a three-child split", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
        { kind: "leaf", paneId: "c" },
      ],
    };
    const result = removePaneFromLayout(layout, "b");
    expect(collectPaneIds(result!)).toEqual(["a", "c"]);
  });

  it("does nothing when paneId not found", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "a" };
    expect(removePaneFromLayout(layout, "missing")).toEqual(layout);
  });
});

describe("insertPaneInLayout", () => {
  it("inserts into a split at a given index", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
      ],
    };
    const result = insertPaneInLayout(layout, { path: [], axis: "vertical", index: 1 }, "new");
    const ids = collectPaneIds(result);
    expect(ids).toEqual(["a", "new", "b"]);
  });

  it("wraps in new axis when inserting horizontally into a vertical split", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
      ],
    };
    const result = insertPaneInLayout(layout, { path: [], axis: "horizontal", index: 0 }, "new");
    expect(result).toMatchObject({ kind: "split", axis: "horizontal" });
  });
});

describe("adjustInsertTargetForRemoval", () => {
  it("decrements target index when removed pane is before target in same parent", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
        { kind: "leaf", paneId: "c" },
      ],
    };
    const target = { path: [], axis: "vertical" as const, index: 2 };
    const adjusted = adjustInsertTargetForRemoval(layout, "a", target);
    expect(adjusted.index).toBe(1);
  });

  it("does not adjust when removed pane is after target", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        { kind: "leaf", paneId: "b" },
        { kind: "leaf", paneId: "c" },
      ],
    };
    const target = { path: [], axis: "vertical" as const, index: 1 };
    const adjusted = adjustInsertTargetForRemoval(layout, "c", target);
    expect(adjusted.index).toBe(1);
  });

  it("returns target unchanged if paneId not found", () => {
    const layout: PaneLayout = { kind: "leaf", paneId: "a" };
    const target = { path: [], axis: "vertical" as const, index: 0 };
    const adjusted = adjustInsertTargetForRemoval(layout, "missing", target);
    expect(adjusted).toEqual(target);
  });
});

describe("findPaneAlign", () => {
  it("returns center for a single leaf", () => {
    expect(findPaneAlign({ kind: "leaf", paneId: "a" }, "a")).toBe("center");
  });

  it("returns right for leftmost pane in vertical split", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "left" },
        { kind: "leaf", paneId: "right" },
      ],
    };
    expect(findPaneAlign(layout, "left")).toBe("right");
  });

  it("returns left for rightmost pane in vertical split", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "left" },
        { kind: "leaf", paneId: "right" },
      ],
    };
    expect(findPaneAlign(layout, "right")).toBe("left");
  });

  it("returns center for pane not found", () => {
    expect(findPaneAlign({ kind: "leaf", paneId: "a" }, "missing")).toBe("center");
  });
});

describe("findPanePath", () => {
  it("returns empty array for root leaf", () => {
    expect(findPanePath({ kind: "leaf", paneId: "a" }, "a")).toEqual([]);
  });

  it("returns null if pane not found", () => {
    expect(findPanePath({ kind: "leaf", paneId: "a" }, "missing")).toBeNull();
  });

  it("returns correct path for nested pane", () => {
    const layout: PaneLayout = {
      kind: "split",
      axis: "vertical",
      children: [
        { kind: "leaf", paneId: "a" },
        {
          kind: "split",
          axis: "horizontal",
          children: [
            { kind: "leaf", paneId: "b" },
            { kind: "leaf", paneId: "c" },
          ],
        },
      ],
    };
    expect(findPanePath(layout, "c")).toEqual([1, 1]);
    expect(findPanePath(layout, "a")).toEqual([0]);
  });
});
