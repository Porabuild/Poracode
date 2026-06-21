import { PixelLoader } from "../common";
import { useThread } from "@/renderer/state/useThread";
import { TerminalPane } from "./TerminalPane";
import { ThreadComposerSection } from "./ThreadComposerSection";
import type { ThreadContentCommonProps } from "./ThreadContent";

const emptyTodoComposerProps = {
  todoDockCollapsed: false,
  todoDockPlacement: "composer" as const,
  todoDockState: null,
  goalDockState: null,
  errorDockStates: [],
  onGoalDockDismiss: () => undefined,
  onTodoDockCollapsedChange: () => undefined,
  onTodoDockPlacementChange: () => undefined,
  onDismissError: () => undefined,
};

export function TerminalThreadContent(
  props: ThreadContentCommonProps & {
    onTerminalResize: (size: { cols: number; rows: number }) => void;
  },
) {
  const thread = useThread(props.threadId) ?? props.fallbackThread;

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-visible">
        <TerminalPane
          ref={props.terminalPaneRef}
          key={thread.id}
          onTerminalResize={props.onTerminalResize}
          status={thread.status}
          threadId={thread.id}
        />
        {thread.status === "launching" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <PixelLoader size="md" />
          </div>
        ) : null}
      </div>
      <ThreadComposerSection {...props} {...emptyTodoComposerProps} />
    </>
  );
}
