import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  AgentStatus,
  ProjectLocation,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThread } from "@/renderer/state/useThread";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { ChatPane } from "./ChatPane/ChatPane";
import { ChatRuntimeDebugPanel } from "./ChatPane/ChatRuntimeDebugPanel";
import { guiChatFontCssVars } from "./ChatPane/chatFontVars";
import type { TerminalPaneHandle } from "./TerminalPane";
import { ThreadComposerSection } from "./ThreadComposerSection";
import { ThreadTodoDock } from "./ThreadTodoDock";
import { selectThreadErrorDockStates } from "./threadErrorState";
import { selectThreadGoalDockItem, selectThreadGoalDockState } from "./threadGoalState";
import { selectThreadTodoDockItem, selectThreadTodoDockState } from "./threadTodoState";

export type ThreadContentCommonProps = {
  threadId: string;
  fallbackThread: Thread;
  agentStatus: AgentStatus | undefined;
  projectLocation: ProjectLocation;
  paneCount: number;
  terminalPaneRef: RefObject<TerminalPaneHandle | null>;
  onConfigChange: (config: ThreadConfig) => void;
  onResolveServerRequest: (input: {
    requestId: ThreadServerRequestId;
    method: string;
    response: unknown;
  }) => Promise<void>;
  onSubmitInput: (prompt: string, segments?: PromptSegment[]) => Promise<void>;
};

export function GuiThreadContent(
  props: ThreadContentCommonProps & {
    runtimeDebugOpen: boolean;
  },
) {
  const { runtimeDebugOpen } = props;
  const thread = useThread(props.threadId) ?? props.fallbackThread;
  const guiChatFontSize = useSharedSettings((s) => s.guiChatFontSize);
  const todoDockPlacement = useThreadTodoDockStore(
    (s) => s.byThreadId[thread.id]?.placement ?? s.defaultPlacement,
  );
  const todoDockCollapsed = useThreadTodoDockStore(
    (s) => s.byThreadId[thread.id]?.collapsed ?? s.defaultCollapsed,
  );
  const retiredSourceItemId = useThreadTodoDockStore(
    (s) => s.byThreadId[thread.id]?.retiredSourceItemId,
  );
  const setTodoDockPlacement = useThreadTodoDockStore((s) => s.setPlacement);
  const setTodoDockCollapsed = useThreadTodoDockStore((s) => s.setCollapsed);
  const retireTodoDock = useThreadTodoDockStore((s) => s.retire);
  const todoDockState = useAppStore((s) => selectThreadTodoDockState(s, props.threadId));
  const goalDockState = useAppStore((s) => selectThreadGoalDockState(s, props.threadId));
  const todoItem = useAppStore((s) => selectThreadTodoDockItem(s, props.threadId));
  const goalItem = useAppStore((s) => selectThreadGoalDockItem(s, props.threadId));

  // If the plan is retired, but the agent sends an update (new object reference
  // in the store), un-retire it so the user sees the progress.
  const lastTodoItemRef = useRef(todoItem);
  useEffect(() => {
    if (
      retiredSourceItemId &&
      todoItem?.id === retiredSourceItemId &&
      todoItem !== lastTodoItemRef.current
    ) {
      retireTodoDock(thread.id, undefined);
    }
    lastTodoItemRef.current = todoItem;
  }, [todoItem, retiredSourceItemId, thread.id, retireTodoDock]);

  const [dismissedGoalItemId, setDismissedGoalItemId] = useState<string | null>(null);
  const lastGoalItemRef = useRef(goalItem);
  useEffect(() => {
    if (
      dismissedGoalItemId &&
      goalItem?.id === dismissedGoalItemId &&
      goalItem !== lastGoalItemRef.current
    ) {
      setDismissedGoalItemId(null);
    }
    lastGoalItemRef.current = goalItem;
  }, [dismissedGoalItemId, goalItem]);

  const errorDockStatesRaw = useAppStore(
    useShallow((s) => selectThreadErrorDockStates(s, props.threadId)),
  );
  const [dismissedErrorItemIds, setDismissedErrorItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    setDismissedErrorItemIds(new Set());
  }, [props.threadId]);
  const errorDockStates = useMemo(
    () => errorDockStatesRaw.filter((state) => !dismissedErrorItemIds.has(state.sourceItemId)),
    [dismissedErrorItemIds, errorDockStatesRaw],
  );
  const showTodoDock = todoDockState !== null && todoDockState.sourceItemId !== retiredSourceItemId;
  const showGoalDock = goalDockState !== null && goalDockState.sourceItemId !== dismissedGoalItemId;
  const showTodoInRightRail = showTodoDock && todoDockPlacement === "right";
  const showThreadSideRail = runtimeDebugOpen || showTodoInRightRail;
  const hiddenRuntimeItemId = showTodoDock ? todoDockState?.sourceItemId : undefined;
  const dockLayoutToken =
    [
      showGoalDock ? `goal:${goalDockState.sourceItemId}` : null,
      showTodoDock
        ? `todo:${todoDockState.sourceItemId}:${todoDockPlacement}:${todoDockCollapsed ? "collapsed" : "expanded"}`
        : null,
    ]
      .filter(Boolean)
      .join("|") || null;

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
              hasSupplementaryContent={showTodoDock || showGoalDock}
              hiddenRuntimeItemId={hiddenRuntimeItemId}
              layoutChangeToken={dockLayoutToken}
            />
          </div>
          {showThreadSideRail ? (
            <div className="flex h-full min-h-0 w-[min(44%,24rem)] shrink-0 flex-col gap-2 border-l border-[color:var(--border)] pl-2">
              {showTodoInRightRail ? (
                <div
                  className={
                    runtimeDebugOpen && !todoDockCollapsed
                      ? "min-h-0 max-h-[45%] shrink-0"
                      : "min-h-0 flex-1"
                  }
                >
                  <ThreadTodoDock
                    collapsed={todoDockCollapsed}
                    placement={todoDockPlacement}
                    state={todoDockState!}
                    onCollapsedChange={(collapsed) => setTodoDockCollapsed(thread.id, collapsed)}
                    onPlacementChange={(placement) => setTodoDockPlacement(thread.id, placement)}
                    onRetire={() => retireTodoDock(thread.id, todoDockState!.sourceItemId)}
                  />
                </div>
              ) : null}
              {runtimeDebugOpen ? (
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <p className="shrink-0 text-xs font-medium text-foreground">Runtime debug</p>
                  <ChatRuntimeDebugPanel threadId={thread.id} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <ThreadComposerSection
        {...props}
        todoDockCollapsed={todoDockCollapsed}
        todoDockPlacement={todoDockPlacement}
        todoDockState={showTodoDock ? todoDockState : null}
        goalDockState={showGoalDock ? goalDockState : null}
        errorDockStates={errorDockStates}
        onGoalDockDismiss={() =>
          goalDockState && setDismissedGoalItemId(goalDockState.sourceItemId)
        }
        onDismissError={(sourceItemId) =>
          setDismissedErrorItemIds((prev) => new Set([...prev, sourceItemId]))
        }
        onTodoDockCollapsedChange={(collapsed) => setTodoDockCollapsed(thread.id, collapsed)}
        onTodoDockPlacementChange={(placement) => setTodoDockPlacement(thread.id, placement)}
        onTodoDockRetire={() =>
          todoDockState && retireTodoDock(thread.id, todoDockState.sourceItemId)
        }
      />
    </>
  );
}
