import { describe, expect, it } from "vitest";
import type { PaneLayout } from "@/shared/paneLayout";
import { resolveResponsivePaneLayout } from "./responsivePaneLayout";

const desktopLayout: PaneLayout = {
  kind: "split",
  axis: "vertical",
  children: [
    { kind: "leaf", paneId: "gui-a", slotId: "slot-a" },
    { kind: "leaf", paneId: "draft:project-b", slotId: "slot-b" },
  ],
};

describe("resolveResponsivePaneLayout", () => {
  it("preserves the focused pane slot and keeps sibling panes mounted in compact layout", () => {
    const compact = resolveResponsivePaneLayout({
      fullPaneLayout: desktopLayout,
      panes: ["gui-a", "draft:project-b"],
      focusedPaneId: "gui-a",
      compactLayout: true,
    });

    expect(compact.paneLayout).toEqual({ kind: "leaf", paneId: "gui-a", slotId: "slot-a" });
    expect(compact.visiblePaneIds).toEqual(["gui-a"]);
    expect(compact.hiddenCurrentPaneIds).toEqual(["draft:project-b"]);
  });

  it("returns the original layout unchanged after leaving compact mode", () => {
    const desktop = resolveResponsivePaneLayout({
      fullPaneLayout: desktopLayout,
      panes: ["gui-a", "draft:project-b"],
      focusedPaneId: "gui-a",
      compactLayout: false,
    });

    expect(desktop.paneLayout).toBe(desktopLayout);
    expect(desktop.visiblePaneIds).toEqual(["gui-a", "draft:project-b"]);
    expect(desktop.hiddenCurrentPaneIds).toEqual([]);
  });
});
