import { useLayoutEffect, type RefObject } from "react";
import { Trans } from "@lingui/react/macro";
import type { AgentStatus, ProjectLocation, PromptSegment, Thread } from "@/shared/contracts";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThread } from "@/renderer/state/useThread";
import { ChatPane } from "./ChatPane/ChatPane";
import { ChatRuntimeDebugPanel } from "./ChatPane/ChatRuntimeDebugPanel";
import { guiChatFontCssVars } from "./ChatPane/chatFontVars";
import { clearUserMessageCollapsedHeightCache } from "./ChatPane/parts/items/userMessageOverflow";
import type { RemoteTerminalTransport, TerminalPaneHandle } from "./TerminalPane";
import type { CheckpointRevertActions } from "./ChatPane/parts/MessageList";
import { ThreadComposerSection } from "./ThreadComposerSection";
import { useThreadDockState, type ThreadDockState } from "./useThreadDockState";
import type { SaveClipboardImage } from "../composer/useAttachments";

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
  onOpenThread?: ((threadId: string) => void) | undefined;
  onRevealProjectFolderInTree?: ((path: string) => void) | undefined;
  onOpenSubAgent?:
    | ((parentItemId: string, projectLocation: ProjectLocation | undefined) => void)
    | undefined;
  canShowProjectEntryInExplorer?: boolean | undefined;
  checkpointActions?: CheckpointRevertActions | undefined;
  checkpointProjectLocation?: ProjectLocation | undefined;
  remoteTerminalTransport?: RemoteTerminalTransport | undefined;
  pickFiles?: (() => Promise<string[] | null>) | undefined;
  saveClipboardImage?: SaveClipboardImage | undefined;
};

export function GuiThreadContent(
  props: ThreadContentCommonProps & {
    runtimeDebugOpen: boolean;
    dockState?: ThreadDockState;
    hideComposer?: boolean;
    initialScrollRevealDelayMs?: number;
    onInitialScrollSettled?: () => void;
  },
) {
  const runtimeDebugOpen = import.meta.env.DEV && props.runtimeDebugOpen;
  const thread = useThread(props.threadId) ?? props.fallbackThread;
  const guiChatFontSize = useSharedSettings((s) => s.guiChatFontSize);
  useLayoutEffect(() => {
    clearUserMessageCollapsedHeightCache();
  }, [guiChatFontSize]);
  const ownDockState = useThreadDockState(thread.id);
  const dockState = props.dockState ?? ownDockState;

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
              {...(props.onOpenThread ? { onOpenThread: props.onOpenThread } : {})}
              {...(props.onRevealProjectFolderInTree
                ? { onRevealProjectFolderInTree: props.onRevealProjectFolderInTree }
                : {})}
              {...(props.onOpenSubAgent ? { onOpenSubAgent: props.onOpenSubAgent } : {})}
              {...(props.canShowProjectEntryInExplorer !== undefined
                ? { canShowProjectEntryInExplorer: props.canShowProjectEntryInExplorer }
                : {})}
              {...(props.checkpointActions ? { checkpointActions: props.checkpointActions } : {})}
              {...(props.checkpointProjectLocation
                ? { checkpointProjectLocation: props.checkpointProjectLocation }
                : {})}
              {...(props.initialScrollRevealDelayMs !== undefined
                ? { initialScrollRevealDelayMs: props.initialScrollRevealDelayMs }
                : {})}
              {...(props.onInitialScrollSettled
                ? { onInitialScrollSettled: props.onInitialScrollSettled }
                : {})}
            />
          </div>
          {runtimeDebugOpen ? (
            <div className="flex h-full min-h-0 w-[min(44%,24rem)] shrink-0 flex-col gap-2 border-l border-[color:var(--border)] pl-2">
              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                <p className="shrink-0 text-xs font-medium text-foreground">
                  <Trans>Runtime debug</Trans>
                </p>
                <ChatRuntimeDebugPanel threadId={thread.id} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {props.hideComposer ? null : (
        <ThreadComposerSection
          {...props}
          todoDockCollapsed={dockState.todoDockCollapsed}
          docksPlacement={dockState.docksPlacement}
          todoDockState={dockState.todoDockState}
          goalDockState={dockState.goalDockState}
          errorDockStates={dockState.errorDockStates}
          onGoalDockDismiss={dockState.onGoalDockDismiss}
          onDismissError={dockState.onDismissError}
          onTodoDockCollapsedChange={dockState.onTodoDockCollapsedChange}
          onTodoDockRetire={dockState.onTodoDockRetire}
        />
      )}
    </>
  );
}
