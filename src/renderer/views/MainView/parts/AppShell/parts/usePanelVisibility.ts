import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAppStore } from "@/renderer/state/appStore";

export function usePanelVisibility() {
  const devTerminalOpen = useDevTerminalStore((s) => s.isOpen);
  const gitReviewContext = usePanelStore((s) => s.gitReviewContext);
  const gitReviewAsPanel = usePanelStore((s) => s.gitReviewAsPanel);
  const filesPanelContext = usePanelStore((s) => s.filesPanelContext);
  const subAgentPanelContext = usePanelStore((s) => s.subAgentPanelContext);
  const subAgentPanelOpen = usePanelStore((s) => s.subAgentPanelOpen);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const usagePanelOpen = usePanelStore((s) => s.usagePanelOpen);
  const notesPanelOpen = usePanelStore((s) => s.notesPanelOpen);
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);

  const isTerminalRight = terminalPosition === "right";
  const gitPanelOpen = !!gitReviewContext && gitReviewAsPanel;
  const filesPanelOpen = filesPanelContext !== null;
  const subAgentInCurrentThread = useAppStore((state) => {
    if (!subAgentPanelContext || state.view.kind !== "thread") return false;
    const activeThreadId =
      state.focusedPaneId && state.view.panes.includes(state.focusedPaneId)
        ? state.focusedPaneId
        : state.view.panes[0];
    return (
      activeThreadId === subAgentPanelContext.threadId &&
      state.runtimeItemsByIdByThread[subAgentPanelContext.threadId]?.[
        subAgentPanelContext.parentItemId
      ] !== undefined
    );
  });
  const scopedSubAgentPanelOpen =
    subAgentPanelOpen && subAgentPanelContext !== null && subAgentInCurrentThread;

  const rightPanelOpen = isTerminalRight
    ? devTerminalOpen ||
      gitPanelOpen ||
      filesPanelOpen ||
      scopedSubAgentPanelOpen ||
      browserPanelOpen ||
      usagePanelOpen ||
      notesPanelOpen
    : devTerminalOpen;
  const sideGitPanelOpen =
    !isTerminalRight &&
    (gitPanelOpen ||
      filesPanelOpen ||
      scopedSubAgentPanelOpen ||
      browserPanelOpen ||
      usagePanelOpen ||
      notesPanelOpen);
  const sidePanelOpen = isTerminalRight ? rightPanelOpen : sideGitPanelOpen;

  return { rightPanelOpen, gitPanelOpen: sideGitPanelOpen, sidePanelOpen };
}
