import { useLingui } from "@lingui/react/macro";
import { PixelLoader } from "../common/PixelLoader";
import { useAppStore } from "@/renderer/state/appStore";
import { useThread } from "@/renderer/state/useThread";
import { TerminalPane } from "./TerminalPane";
import { ThreadComposerSection } from "./ThreadComposerSection";
import type { ThreadContentCommonProps } from "./ThreadContent";

const emptyTodoComposerProps = {
  todoDockCollapsed: false,
  docksPlacement: "composer" as const,
  todoDockState: null,
  goalDockState: null,
  errorDockStates: [],
  onGoalDockDismiss: () => undefined,
  onTodoDockCollapsedChange: () => undefined,
  onDismissError: () => undefined,
};

export function TerminalThreadContent(
  props: ThreadContentCommonProps & {
    onTerminalResize: (size: { cols: number; rows: number }) => void;
    /** Mounted but hidden for keep-alive. */
    hidden?: boolean;
  },
) {
  const thread = useThread(props.threadId) ?? props.fallbackThread;
  const { t } = useLingui();
  const awaitingWorktree = useAppStore(
    (state) =>
      state.provisioningWorktreeThreadIds[thread.id] === true && thread.status === "launching",
  );

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-visible">
        {thread.remoteServerId && !props.remoteTerminalTransport ? null : (
          <TerminalPane
            ref={props.terminalPaneRef}
            key={thread.id}
            onTerminalResize={props.onTerminalResize}
            status={thread.status}
            threadId={thread.id}
            {...(props.hidden ? { hidden: true } : {})}
            {...(props.remoteTerminalTransport
              ? { remoteTransport: props.remoteTerminalTransport }
              : {})}
          />
        )}
        {thread.status === "launching" ||
        (thread.remoteServerId && !props.remoteTerminalTransport) ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-foreground-muted"
            aria-live="polite"
          >
            <PixelLoader size="md" />
            {awaitingWorktree ? <span>{t`Creating worktree…`}</span> : null}
          </div>
        ) : null}
      </div>
      <ThreadComposerSection {...props} {...emptyTodoComposerProps} />
    </>
  );
}
