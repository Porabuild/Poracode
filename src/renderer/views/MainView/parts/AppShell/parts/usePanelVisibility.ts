import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

export function usePanelVisibility() {
  const devTerminalOpen = useDevTerminalStore((s) => s.isOpen);
  const gitReviewContext = usePanelStore((s) => s.gitReviewContext);
  const gitReviewAsPanel = usePanelStore((s) => s.gitReviewAsPanel);
  const filesPanelContext = usePanelStore((s) => s.filesPanelContext);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const usagePanelOpen = usePanelStore((s) => s.usagePanelOpen);
  const notesPanelOpen = usePanelStore((s) => s.notesPanelOpen);
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);

  const isTerminalRight = terminalPosition === "right";
  const gitPanelOpen = !!gitReviewContext && gitReviewAsPanel;
  const filesPanelOpen = filesPanelContext !== null;

  const rightPanelOpen = isTerminalRight
    ? devTerminalOpen ||
      gitPanelOpen ||
      filesPanelOpen ||
      browserPanelOpen ||
      usagePanelOpen ||
      notesPanelOpen
    : devTerminalOpen;
  const sideGitPanelOpen =
    !isTerminalRight &&
    (gitPanelOpen || filesPanelOpen || browserPanelOpen || usagePanelOpen || notesPanelOpen);

  return { rightPanelOpen, gitPanelOpen: sideGitPanelOpen };
}
