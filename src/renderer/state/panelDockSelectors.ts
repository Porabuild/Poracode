import {
  EMPTY_BOTTOM_PANEL_DOCKS,
  usePanelStore,
  type BottomPanelDocks,
  type RightPanelTab,
} from "./panelStore";
import { useSharedSettings } from "./sharedSettingsStore";

/**
 * Bottom docks only render while the terminal owns the bottom edge; with the
 * terminal on the right there is no bottom row to dock into, so stale slots are
 * reported as empty instead of hiding the tab from the right panel.
 */
export function useBottomDockedTabs(): BottomPanelDocks {
  const docks = usePanelStore((s) => s.bottomPanelDocks);
  const isBottom = useSharedSettings((s) => s.terminalPosition === "bottom");
  return isBottom ? docks : EMPTY_BOTTOM_PANEL_DOCKS;
}

export function getBottomDockedTabs(): BottomPanelDocks {
  return useSharedSettings.getState().terminalPosition === "bottom"
    ? usePanelStore.getState().bottomPanelDocks
    : EMPTY_BOTTOM_PANEL_DOCKS;
}

export function isTabBottomDocked(tab: RightPanelTab): boolean {
  const docks = getBottomDockedTabs();
  return docks.left === tab || docks.right === tab;
}

/**
 * Whether a tab is currently painted somewhere on screen — as the right
 * panel's active layer, as its split section, or in a bottom dock slot.
 * Surfaces positioned from the outside (the browser webview) key off this.
 */
export function useIsPanelTabVisible(tab: RightPanelTab): boolean {
  const isActiveTab = usePanelStore((s) => s.rightPanelTab === tab);
  const isSplitTab = usePanelStore((s) => s.rightPanelSplit?.tab === tab);
  const docks = useBottomDockedTabs();
  return isActiveTab || isSplitTab || docks.left === tab || docks.right === tab;
}
