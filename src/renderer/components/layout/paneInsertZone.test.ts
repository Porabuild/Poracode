import { describe, expect, it } from "vitest";
import type { PaneLayout } from "@/shared/paneLayout";
import { resolveSiblingInsertTarget } from "@/renderer/dnd";
import { computeLayout } from "./SplitPaneContainer";

const layout: PaneLayout = {
  kind: "split",
  axis: "vertical",
  children: [
    { kind: "leaf", paneId: "a" },
    { kind: "leaf", paneId: "b" },
    { kind: "leaf", paneId: "c" },
  ],
};

const equalSizes = (_key: string, count: number) =>
  Array.from({ length: count }, () => 100 / count);

function dividerZoneIds() {
  return computeLayout(
    layout,
    { left: 0, top: 0, width: 900, height: 600 },
    equalSizes,
  ).dividers.map((divider) => divider.zoneId);
}

describe("pane insert zone ids", () => {
  // A drag over a pane's inner edge and a drag over the divider itself resolve
  // to the same insert position, so they must produce the same zone id —
  // otherwise the edge drag highlights nothing.
  it("matches the divider zone id when hovering the pane edge before it", () => {
    const target = resolveSiblingInsertTarget(layout, "b", "left");
    expect(target?.zoneId).toBe(dividerZoneIds()[0]);
    expect(target?.target).toEqual({ path: [], axis: "vertical", index: 1 });
  });

  it("matches the divider zone id when hovering the pane edge after it", () => {
    const target = resolveSiblingInsertTarget(layout, "b", "right");
    expect(target?.zoneId).toBe(dividerZoneIds()[1]);
    expect(target?.target).toEqual({ path: [], axis: "vertical", index: 2 });
  });

  it("has no sibling divider on the outer edges or across axes", () => {
    expect(resolveSiblingInsertTarget(layout, "a", "left")).toBeNull();
    expect(resolveSiblingInsertTarget(layout, "c", "right")).toBeNull();
    expect(resolveSiblingInsertTarget(layout, "b", "top")).toBeNull();
    expect(resolveSiblingInsertTarget(layout, "b", "bottom")).toBeNull();
  });
});
