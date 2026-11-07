import { usePanelStore } from "@/renderer/state/panelStore";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";

/** Reveal the chosen destination while retaining editor tabs and unsaved buffers. */
export function revealSearchDestination(destination: "thread" | "file" | "setting"): void {
  const panels = usePanelStore.getState();
  panels.closeSettings();
  panels.closeProjectSettings();
  panels.closeMobileUtilityPage();
  panels.setGitOverlayOpen(false);
  panels.setBrowserOverlayOpen(false);
  panels.closePullRequestsOverlay();
  panels.setGitHubActionsContext(null);
  if (destination !== "file") useFileEditorStore.getState().setOverlayMode(null);
}
