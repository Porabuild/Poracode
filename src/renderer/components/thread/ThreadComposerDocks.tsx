import type {
  AgentSlashCommand,
  AgentStatus,
  Project,
  ProjectLocation,
  PendingSteerState,
  ThreadConfig,
} from "@/shared/contracts";
import {
  changeThreadConfig,
  resolveThreadServerRequest,
} from "@/renderer/actions/threadRuntimeActions";
import { openFileInEditor } from "@/renderer/utils/gitHelpers";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";
import { ActiveSubAgentTile } from "./ChatPane/parts/items/ActiveSubAgentTile";
import { ThreadCommandPanel } from "./ThreadCommandPanel";
import { ThreadContextDock } from "./ThreadContextDock";
import { ThreadErrorDock } from "./ThreadErrorDock";
import { ThreadGoalDock } from "./ThreadGoalDock";
import { ThreadPendingSteerStrip } from "./ThreadPendingSteerStrip";
import { ThreadRuntimeRequestPanel } from "./ThreadRuntimeRequestPanel";
import { ThreadAuthRequiredDock } from "./ThreadAuthRequiredDock";
import { ThreadBackgroundTasksDock } from "./ThreadBackgroundTasksDock";
import { ThreadTodoDock } from "./ThreadTodoDock";
import type { ThreadContextUsageSummary } from "./threadContextUsage";
import type { ThreadErrorDockState } from "./threadErrorState";
import type { ThreadGoalDockState } from "./threadGoalState";
import type { ThreadTodoDockState } from "./threadTodoState";

type ThreadComposerDocksProps = {
  // Visibility flags — each gates one dock.
  hasActiveSubAgent: boolean;
  hasBackgroundTasks: boolean;
  showContextInComposer: boolean;
  showErrorInComposer: boolean;
  showGoalInComposer: boolean;
  showTodoInComposer: boolean;
  authRequired: boolean;
  showCommandPanel: boolean;
  // Dock-relevant data.
  threadId: string;
  projectLocation: ProjectLocation;
  threadConfig: ThreadConfig;
  worktreePath: string | undefined;
  branchName: string | undefined;
  agentStatus: AgentStatus | undefined;
  project: Project | undefined;
  contextSummary: ThreadContextUsageSummary;
  errorDockStates: ThreadErrorDockState[];
  goalDockState: ThreadGoalDockState | null;
  todoDockState: ThreadTodoDockState | null;
  todoDockCollapsed: boolean;
  pendingSteer: PendingSteerState | undefined;
  activeRuntimeRequest: OpenRuntimeRequest | undefined;
  filteredCommands: AgentSlashCommand[];
  slashActiveIndex: number;
  commandListId: string;
  // Callbacks.
  onCloseContextDock: () => void;
  onDismissError: (sourceItemId: string) => void;
  onGoalDockDismiss: () => void;
  onTodoDockCollapsedChange: (collapsed: boolean) => void;
  onTodoDockRetire?: () => void;
  onCancelPendingSteer: () => void;
  onOpenProjectRelativePath?: ((path: string, lineNumber?: number) => void) | undefined;
  onSlashActiveIndexChange: (index: number) => void;
  onSelectCommand: (command: AgentSlashCommand) => void;
};

/**
 * Renders the conditional dock tree shown in the composer's `fixedContent`.
 * Pure presentational extraction from ThreadComposerSection — each dock is
 * gated by a visibility flag computed in the parent; this component does not
 * own any state.
 */
export function ThreadComposerDocks(props: ThreadComposerDocksProps) {
  const {
    hasActiveSubAgent,
    hasBackgroundTasks,
    showContextInComposer,
    showErrorInComposer,
    showGoalInComposer,
    showTodoInComposer,
    authRequired,
    showCommandPanel,
    threadId,
    projectLocation,
    threadConfig,
    worktreePath,
    branchName,
    agentStatus,
    project,
    contextSummary,
    errorDockStates,
    goalDockState,
    todoDockState,
    todoDockCollapsed,
    pendingSteer,
    activeRuntimeRequest,
    filteredCommands,
    slashActiveIndex,
    commandListId,
    onCloseContextDock,
    onDismissError,
    onGoalDockDismiss,
    onTodoDockCollapsedChange,
    onTodoDockRetire,
    onCancelPendingSteer,
    onOpenProjectRelativePath,
    onSlashActiveIndexChange,
    onSelectCommand,
  } = props;

  const firstInformationalDock = hasActiveSubAgent
    ? "agents"
    : hasBackgroundTasks
      ? "backgroundTasks"
      : showGoalInComposer
        ? "goal"
        : showTodoInComposer
          ? "plan"
          : null;

  return (
    <>
      {hasActiveSubAgent ? (
        <ActiveSubAgentTile
          threadId={threadId}
          projectLocation={projectLocation}
          placement="composer"
          showPlacementToggle={firstInformationalDock === "agents"}
        />
      ) : null}
      {hasBackgroundTasks ? (
        <ThreadBackgroundTasksDock
          threadId={threadId}
          placement="composer"
          showPlacementToggle={firstInformationalDock === "backgroundTasks"}
        />
      ) : null}
      {showContextInComposer ? (
        <ThreadContextDock summary={contextSummary} onClose={onCloseContextDock} />
      ) : null}
      {showErrorInComposer
        ? errorDockStates.map((state) => (
            <ThreadErrorDock
              key={state.sourceItemId}
              state={state}
              onDismiss={() => onDismissError(state.sourceItemId)}
            />
          ))
        : null}
      {showGoalInComposer ? (
        <ThreadGoalDock
          threadId={threadId}
          state={goalDockState!}
          placement="composer"
          showPlacementToggle={firstInformationalDock === "goal"}
          onDismiss={onGoalDockDismiss}
        />
      ) : null}
      {showTodoInComposer ? (
        <ThreadTodoDock
          collapsed={todoDockCollapsed}
          placement="composer"
          showPlacementToggle={firstInformationalDock === "plan"}
          state={todoDockState!}
          onCollapsedChange={onTodoDockCollapsedChange}
          onRetire={() => onTodoDockRetire?.()}
        />
      ) : null}
      {authRequired && agentStatus ? (
        <ThreadAuthRequiredDock agentStatus={agentStatus} {...(project ? { project } : {})} />
      ) : null}
      {pendingSteer ? (
        <ThreadPendingSteerStrip pending={pendingSteer} onCancel={onCancelPendingSteer} />
      ) : null}
      {activeRuntimeRequest ? (
        <ThreadRuntimeRequestPanel
          key={activeRuntimeRequest.requestId}
          threadId={threadId}
          agentLabel={agentStatus?.label}
          request={activeRuntimeRequest}
          onResolve={(input) => resolveThreadServerRequest(threadId, input)}
          onPlanApproved={(optionId) =>
            changeThreadConfig(threadId, {
              ...threadConfig,
              mode: "agent",
              ...(optionId === "default" || optionId === "auto"
                ? { approvalPolicy: optionId }
                : {}),
            })
          }
          onOpenPlanFile={
            project
              ? (path) => {
                  if (onOpenProjectRelativePath) {
                    onOpenProjectRelativePath(path);
                    return;
                  }
                  void openFileInEditor(project, worktreePath, branchName, path, {
                    markdownPreview: true,
                  });
                }
              : undefined
          }
        />
      ) : null}
      {showCommandPanel ? (
        <ThreadCommandPanel
          commands={filteredCommands}
          activeIndex={slashActiveIndex}
          listId={commandListId}
          onActiveIndexChange={onSlashActiveIndexChange}
          onSelect={onSelectCommand}
        />
      ) : null}
    </>
  );
}
