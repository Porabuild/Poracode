import { findPaneSlotId, type PaneLayout } from "@/shared/paneLayout";

export function resolveResponsivePaneLayout(input: {
  fullPaneLayout: PaneLayout;
  panes: string[];
  focusedPaneId: string | null;
  compactLayout: boolean;
}): {
  paneLayout: PaneLayout;
  visiblePaneIds: string[];
  hiddenCurrentPaneIds: string[];
} {
  if (!input.compactLayout) {
    return {
      paneLayout: input.fullPaneLayout,
      visiblePaneIds: input.panes,
      hiddenCurrentPaneIds: [],
    };
  }

  const paneId =
    input.focusedPaneId && input.panes.includes(input.focusedPaneId)
      ? input.focusedPaneId
      : input.panes[0];
  if (!paneId) throw new Error("Compact pane layout requires at least one pane");
  const slotId = findPaneSlotId(input.fullPaneLayout, paneId);
  return {
    paneLayout: { kind: "leaf", paneId, ...(slotId ? { slotId } : {}) },
    visiblePaneIds: [paneId],
    hiddenCurrentPaneIds: input.panes.filter((id) => id !== paneId),
  };
}
