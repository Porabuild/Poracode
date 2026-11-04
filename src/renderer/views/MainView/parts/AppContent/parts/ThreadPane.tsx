import { startTransition } from "react";
import { Trans } from "@lingui/react/macro";
import type {
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { resolveProjectLocation } from "@/shared/worktree";
import { toggleMarkThreadDone } from "@/renderer/actions/threadActions";
import type { ProviderHandoffContext } from "@/renderer/actions/providerHandoff";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { resolveHostFileAccess } from "@/renderer/state/hostFileAccess";
import { useProject, useThread } from "@/renderer/state/useThread";
import type { ContinueIntent } from "@/renderer/components/thread/ContinueInProviderDialog";
import { ThreadView } from "@/renderer/components/thread/ThreadView";
import { useIsDraggingPane, usePaneDropIndicatorState } from "@/renderer/dnd";
import { usePaneDragAndDrop } from "@/renderer/components/thread/PaneDragAndDrop";
import { useThreadAgentStatuses, useThreadPendingLaunch } from "@/renderer/hooks/uiSelectors";
import { useHostAgentStatuses } from "@/renderer/hooks/useHostAgentStatuses";

// Non-subscribing action read: these stable store actions don't need a
// subscription, and aliasing keeps the render path from referencing the hook
// as a value.
const getAppState = useAppStore.getState;

export function ThreadPane(props: {
  threadId: string;
  paneCount: number;
  chatOnly?: boolean;
  hidden?: boolean;
  paneAlign: "left" | "center" | "right";
  headerNeedsTrafficLightPad?: boolean;
  onClose: () => void;
  onContinueInProvider?: (
    sourceThread: Thread,
    targetKind: string,
    targetConfig: ThreadConfig,
    targetPresentationMode: ThreadPresentationMode,
    prompt: string,
    segments: PromptSegment[] | undefined,
    intent: ContinueIntent,
    handoffContext: ProviderHandoffContext,
  ) => void;
}) {
  const thread = useThread(props.threadId);
  const experiment = useExperimentStore((state) =>
    thread?.groupId ? state.experiments[thread.groupId] : undefined,
  );
  const project = useProject(thread?.projectId);
  const installedAgents = useThreadAgentStatuses({
    remoteServerId: thread?.remoteServerId,
    projectLocation: project?.location,
  });
  const hostAgentStatuses = useHostAgentStatuses(thread?.remoteServerId, project?.location);
  const agentStatus = hostAgentStatuses.find((status) => status.kind === thread?.agentKind);
  const {
    prompt: pendingLaunchPrompt,
    segments: pendingLaunchSegments,
    userMessageItemId: pendingLaunchUserMessageItemId,
    providerSwitch: pendingLaunchProviderSwitch,
    mentionHandoff: pendingLaunchMentionHandoff,
  } = useThreadPendingLaunch(props.threadId);
  const { applyRuntimeEvent, updateThreadRuntime, consumeThreadLaunch } = getAppState();

  const { paneElementRef, dragHandleRef } = usePaneDragAndDrop({
    paneId: props.threadId,
    // The unavailable-worktree placeholder below renders no pane header, so it
    // has no drag handle to attach.
    handleRendered: props.paneCount > 1 && !(experiment && !thread?.worktreePath),
  });

  const isDragging = useIsDraggingPane(props.threadId);
  const dropIndicator = usePaneDropIndicatorState(props.threadId);
  // Picked files and pasted images must land where the owning host can read
  // them; the agent runs there and cannot read a path saved on this machine.
  const fileAccess = resolveHostFileAccess(thread, "thread");
  if (!thread) return null;
  if (!project) return null;
  if (experiment && !thread.worktreePath) {
    return (
      <div
        ref={paneElementRef}
        className="flex h-full min-w-0 flex-1 items-center justify-center px-6 text-center text-sm text-foreground-muted"
      >
        <Trans>The experiment candidate worktree is unavailable.</Trans>
      </div>
    );
  }
  const projectLocation = resolveProjectLocation(project.location, thread.worktreePath);
  return (
    <ThreadView
      thread={thread}
      projectName={project.name}
      agentStatus={agentStatus}
      isWsl={project.location.kind === "wsl"}
      {...(props.chatOnly ? { chatOnly: true } : {})}
      showCloseButton
      paneAlign={props.paneAlign}
      isDragging={isDragging}
      dropIndicator={dropIndicator}
      paneCount={props.paneCount}
      headerNeedsTrafficLightPad={props.headerNeedsTrafficLightPad}
      {...(props.paneCount > 1 ? { dragHandleRef } : {})}
      droppableRef={paneElementRef}
      onClose={props.onClose}
      {...(!experiment
        ? {
            onMarkDone: () => {
              toggleMarkThreadDone(props.threadId);
            },
          }
        : {})}
      projectLocation={projectLocation}
      {...(props.hidden ? { hidden: true } : {})}
      onLaunchConsumed={() => consumeThreadLaunch(thread.id)}
      onLaunchFailed={(message) => {
        startTransition(() => {
          applyRuntimeEvent(thread.id, {
            type: "error",
            threadId: thread.id,
            message,
          });
          updateThreadRuntime(thread.id, {
            status: "error",
            attention: "error",
            ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
            canResumeWithConfig: thread.canResumeWithConfig || thread.sessionRef !== undefined,
          });
        });
      }}
      {...(pendingLaunchPrompt !== undefined ? { pendingLaunchPrompt } : {})}
      {...(pendingLaunchSegments ? { pendingLaunchSegments } : {})}
      {...(pendingLaunchUserMessageItemId ? { pendingLaunchUserMessageItemId } : {})}
      {...(pendingLaunchProviderSwitch ? { pendingLaunchProviderSwitch } : {})}
      {...(pendingLaunchMentionHandoff ? { pendingLaunchMentionHandoff: true } : {})}
      installedAgents={installedAgents}
      {...fileAccess}
      onContinueInProvider={
        props.onContinueInProvider
          ? (targetKind, tConfig, targetPresentationMode, prompt, segments, intent, ctx) => {
              props.onContinueInProvider?.(
                thread,
                targetKind,
                tConfig,
                targetPresentationMode,
                prompt,
                segments,
                intent,
                ctx,
              );
            }
          : undefined
      }
    />
  );
}
