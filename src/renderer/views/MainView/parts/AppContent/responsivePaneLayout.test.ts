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
  it("keeps a selected second pane through compact and desktop resizing", () => {
    for (const compactLayout of [true, false, true]) {
      const result = resolveResponsivePaneLayout({
        fullPaneLayout: desktopLayout,
        panes: ["gui-a", "draft:project-b"],
        focusedPaneId: "draft:project-b",
        compactLayout,
      });
      expect(result.paneLayout).toEqual(
        compactLayout
          ? { kind: "leaf", paneId: "draft:project-b", slotId: "slot-b" }
          : desktopLayout,
      );
      expect(result.visiblePaneIds).toEqual(
        compactLayout ? ["draft:project-b"] : ["gui-a", "draft:project-b"],
      );
    }
  });

  it.each([null, "removed-pane"])("uses a valid pane when focus is %s", (focusedPaneId) => {
    const result = resolveResponsivePaneLayout({
      fullPaneLayout: desktopLayout,
      panes: ["gui-a", "draft:project-b"],
      focusedPaneId,
      compactLayout: true,
    });
    expect(result.visiblePaneIds).toEqual(["gui-a"]);
    expect(result.hiddenCurrentPaneIds).toEqual(["draft:project-b"]);
  });

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
