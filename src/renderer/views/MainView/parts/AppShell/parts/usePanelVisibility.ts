import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { selectThreadTodoDockState } from "@/renderer/components/thread/threadTodoState";
import { useFocusedThreadId } from "@/renderer/hooks/uiSelectors";

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
  const currentThreadId = useFocusedThreadId();
  const todoDockPlacement = useThreadTodoDockStore((state) =>
    currentThreadId
      ? (state.byThreadId[currentThreadId]?.placement ?? state.defaultPlacement)
      : "composer",
  );
  const retiredTodoSourceItemId = useThreadTodoDockStore((state) =>
    currentThreadId ? state.byThreadId[currentThreadId]?.retiredSourceItemId : undefined,
  );
  const todoDockState = useAppStore((state) =>
    currentThreadId && todoDockPlacement === "right"
      ? selectThreadTodoDockState(state, currentThreadId)
      : null,
  );

  const isTerminalRight = terminalPosition === "right";
  const gitPanelOpen = !!gitReviewContext && gitReviewAsPanel;
  const filesPanelOpen = filesPanelContext !== null;
  const subAgentItemExists = useAppStore((state) =>
    subAgentPanelContext
      ? state.runtimeItemsByIdByThread[subAgentPanelContext.threadId]?.[
          subAgentPanelContext.parentItemId
        ] !== undefined
      : false,
  );
  const subAgentInCurrentThread =
    subAgentPanelContext !== null &&
    subAgentPanelContext.threadId === currentThreadId &&
    subAgentItemExists;
  const scopedSubAgentPanelOpen =
    subAgentPanelOpen && subAgentPanelContext !== null && subAgentInCurrentThread;
  const planPanelOpen =
    todoDockPlacement === "right" &&
    todoDockState !== null &&
    todoDockState.sourceItemId !== retiredTodoSourceItemId;

  const rightPanelOpen = isTerminalRight
    ? devTerminalOpen ||
      gitPanelOpen ||
      filesPanelOpen ||
      planPanelOpen ||
      scopedSubAgentPanelOpen ||
      browserPanelOpen ||
      usagePanelOpen ||
      notesPanelOpen
    : devTerminalOpen;
  const sideGitPanelOpen =
    !isTerminalRight &&
    (gitPanelOpen ||
      filesPanelOpen ||
      planPanelOpen ||
      scopedSubAgentPanelOpen ||
      browserPanelOpen ||
      usagePanelOpen ||
      notesPanelOpen);
  const sidePanelOpen = isTerminalRight ? rightPanelOpen : sideGitPanelOpen;

  return { rightPanelOpen, gitPanelOpen: sideGitPanelOpen, sidePanelOpen };
}
