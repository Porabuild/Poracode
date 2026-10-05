import type { TerminalPosition } from "@/shared/contracts";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { clearEagerShellStart } from "@/renderer/utils/shellUtils";
import { closeAllPanels } from "./panelActions";

/**
 * Removes a terminal tab from the store. When the panel was showing the tab's
 * scope and no tabs are left in it, hides the panel too. In right mode it also
 * takes the terminal off the right panel. Returns true when it hid the panel.
 * It does not close the tab's shells. That is the caller's job.
 */
export function removeTerminalTab(
  tab: DevTerminalTab,
  options: {
    /** The caller knows the panel shows this tab, e.g. a click on its close button. */
    panelShowsTab?: boolean;
    position?: TerminalPosition;
  } = {},
): boolean {
  const store = useDevTerminalStore.getState();
  const panelShowsTab =
    options.panelShowsTab ??
    (store.isOpen &&
      store.activeProjectId === tab.projectId &&
      (store.activeWorktreePath ?? undefined) === tab.worktreePath);
  store.removeTab(tab.id);
  if (!panelShowsTab) return false;
  const scopeHasTabs = useDevTerminalStore
    .getState()
    .tabs.some(
      (other) => other.projectId === tab.projectId && other.worktreePath === tab.worktreePath,
    );
  if (scopeHasTabs) return false;
  const position = options.position ?? useSharedSettings.getState().terminalPosition;
  if (position !== "bottom") closeRightPanelTerminal();
  useDevTerminalStore.getState().closePanel();
  return true;
}

/**
 * Hides the right panel only when the terminal is all it shows. A terminal in
 * the split section gives the whole panel back to the active tab, a split
 * sibling takes over from an active terminal, and a terminal hidden behind
 * another tab leaves the panel alone.
 */
function closeRightPanelTerminal(): void {
  const panel = usePanelStore.getState();
  const split = panel.rightPanelSplit;
  if (split?.tab === "terminal") {
    panel.setRightPanelSplit(null);
    return;
  }
  if (panel.rightPanelTab !== "terminal") return;
  if (split) {
    panel.setRightPanelTab(split.tab);
    panel.setRightPanelSplit(null);
    return;
  }
  closeAllPanels();
}

/**
 * Closes the tab or split pane whose shell exited, as if its close button was
 * clicked. A Run-action tab stays open to keep the command's output, so its
 * own shell exiting only clears the running marker.
 */
export function closeExitedShell(shellId: string): void {
  const store = useDevTerminalStore.getState();
  store.markShellExited(shellId);
  clearEagerShellStart(shellId);
  const tab = store.tabs.find((other) => other.id === shellId || other.splitId === shellId);
  if (!tab) return;
  if (shellId === tab.splitId) {
    if (tab.mainExited) removeTerminalTab(tab);
    else store.closeSplit(tab.id);
    return;
  }
  if (tab.runActionId) return;
  if (tab.splitId) store.markMainShellExited(tab.id);
  else removeTerminalTab(tab);
}
