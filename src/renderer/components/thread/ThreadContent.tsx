import { type RefObject } from "react";
import { Trans } from "@lingui/react/macro";
import type { AgentStatus, ProjectLocation, PromptSegment, Thread } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThread } from "@/renderer/state/useThread";
import { ChatPane } from "./ChatPane/ChatPane";
import { ChatRuntimeDebugPanel } from "./ChatPane/ChatRuntimeDebugPanel";
import { guiChatFontCssVars } from "./ChatPane/chatFontVars";
import type { TerminalPaneHandle } from "./TerminalPane";
import { ThreadComposerSection } from "./ThreadComposerSection";
import { ThreadTodoDock } from "./ThreadTodoDock";
import { useThreadDockState, type ThreadDockState } from "./useThreadDockState";

export type ThreadContentCommonProps = {
  threadId: string;
  fallbackThread: Thread;
  agentStatus: AgentStatus | undefined;
  projectLocation: ProjectLocation;
  paneCount: number;
  terminalPaneRef: RefObject<TerminalPaneHandle | null>;
  /**
   * Optional override for the thread-input submit. Desktop omits this so the
   * composer calls the shared action directly; mobile injects its own wrapper.
   */
  onSubmitInput?: ((prompt: string, segments?: PromptSegment[]) => Promise<void>) | undefined;
  onOpenProjectRelativePath?: ((path: string, lineNumber?: number) => void) | undefined;
  onRevealProjectFolderInTree?: ((path: string) => void) | undefined;
  canShowProjectEntryInExplorer?: boolean | undefined;
};

export function GuiThreadContent(
  props: ThreadContentCommonProps & {
    runtimeDebugOpen: boolean;
    dockState?: ThreadDockState;
    hideComposer?: boolean;
  },
) {
  const { runtimeDebugOpen } = props;
  const thread = useThread(props.threadId) ?? props.fallbackThread;
  const guiChatFontSize = useSharedSettings((s) => s.guiChatFontSize);
  const ownDockState = useThreadDockState(thread.id);
  const dockState = props.dockState ?? ownDockState;
  const { todoDockState } = dockState;
  const showTodoInRightRail = dockState.showTodoInRightRail;
  const showThreadSideRail = runtimeDebugOpen || showTodoInRightRail;

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full min-h-0 w-full gap-2 text-[length:var(--lc-chat-font-size)]"
          style={guiChatFontCssVars(guiChatFontSize)}
        >
          <div className="min-h-0 min-w-0 flex-1">
            <ChatPane
              thread={thread}
              hasSupplementaryContent={dockState.showTodoDock || dockState.showGoalDock}
              hiddenRuntimeItemId={dockState.hiddenRuntimeItemId}
              layoutChangeToken={dockState.dockLayoutToken}
              {...(props.onOpenProjectRelativePath
                ? { onOpenProjectRelativePath: props.onOpenProjectRelativePath }
                : {})}
              {...(props.onRevealProjectFolderInTree
                ? { onRevealProjectFolderInTree: props.onRevealProjectFolderInTree }
                : {})}
              {...(props.canShowProjectEntryInExplorer !== undefined
                ? { canShowProjectEntryInExplorer: props.canShowProjectEntryInExplorer }
                : {})}
            />
          </div>
          {showThreadSideRail ? (
            <div className="flex h-full min-h-0 w-[min(44%,24rem)] shrink-0 flex-col gap-2 border-l border-[color:var(--border)] pl-2">
              {showTodoInRightRail ? (
                <div
                  className={
                    runtimeDebugOpen && !dockState.todoDockCollapsed
                      ? "min-h-0 max-h-[45%] shrink-0"
                      : "min-h-0 flex-1"
                  }
                >
                  <ThreadTodoDock
                    collapsed={dockState.todoDockCollapsed}
                    placement={dockState.todoDockPlacement}
                    state={todoDockState!}
                    onCollapsedChange={dockState.onTodoDockCollapsedChange}
                    onPlacementChange={dockState.onTodoDockPlacementChange}
                    onRetire={dockState.onTodoDockRetire}
                  />
                </div>
              ) : null}
              {runtimeDebugOpen ? (
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <p className="shrink-0 text-xs font-medium text-foreground">
                    <Trans>Runtime debug</Trans>
                  </p>
                  <ChatRuntimeDebugPanel threadId={thread.id} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {props.hideComposer ? null : (
        <ThreadComposerSection
          {...props}
          todoDockCollapsed={dockState.todoDockCollapsed}
          todoDockPlacement={dockState.todoDockPlacement}
          todoDockState={dockState.todoDockState}
          goalDockState={dockState.goalDockState}
          errorDockStates={dockState.errorDockStates}
          onGoalDockDismiss={dockState.onGoalDockDismiss}
          onDismissError={dockState.onDismissError}
          onTodoDockCollapsedChange={dockState.onTodoDockCollapsedChange}
          onTodoDockPlacementChange={dockState.onTodoDockPlacementChange}
          onTodoDockRetire={dockState.onTodoDockRetire}
        />
      )}
    </>
  );
}
