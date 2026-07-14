import { startTransition, useRef } from "react";
import { Trans } from "@lingui/react/macro";
import type {
  ExtractContextResult,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { resolveProjectLocation } from "@/shared/worktree";
import { toggleMarkThreadDone } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { useProject, useThread } from "@/renderer/state/useThread";
import { ThreadView } from "@/renderer/components/thread/ThreadView";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { useIsDraggingPane, usePaneDropIndicatorState, type DragSourceData } from "@/renderer/dnd";
import {
  useInstalledAgents,
  useProjectAgentStatuses,
  useThreadPendingLaunch,
} from "@/renderer/hooks/uiSelectors";

export function ThreadPane(props: {
  threadId: string;
  paneCount: number;
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
    closeOriginal: boolean,
    extractedContext: ExtractContextResult | null,
  ) => void;
}) {
  const thread = useThread(props.threadId);
  const experiment = useExperimentStore((state) =>
    Object.values(state.experiments).find((candidate) =>
      candidate.candidates.some((item) => item.threadId === props.threadId),
    ),
  );
  const project = useProject(thread?.projectId);
  const installedAgents = useInstalledAgents();
  const projectAgentStatuses = useProjectAgentStatuses(project?.location);
  const agentStatus = projectAgentStatuses.find((status) => status.kind === thread?.agentKind);
  const { prompt: pendingLaunchPrompt, segments: pendingLaunchSegments } = useThreadPendingLaunch(
    props.threadId,
  );
  const { applyRuntimeEvent, updateThreadRuntime, consumeThreadLaunch } = useAppStore.getState();

  const paneElementRef = useRef<HTMLDivElement>(null);
  const { handleRef } = useDraggable({
    id: `pane:${props.threadId}`,
    type: "pane",
    data: { type: "pane", paneId: props.threadId } satisfies DragSourceData,
    disabled: props.paneCount <= 1,
    element: paneElementRef,
  });
  useDroppable({
    id: `pane-drop:${props.threadId}`,
    accept: ["pane", "thread", "new-thread"],
    data: { type: "pane-drop-zone", paneId: props.threadId },
    element: paneElementRef,
  });

  const isDragging = useIsDraggingPane(props.threadId);
  const dropIndicator = usePaneDropIndicatorState(props.threadId);

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
      showCloseButton
      paneAlign={props.paneAlign}
      isDragging={isDragging}
      dropIndicator={dropIndicator}
      paneCount={props.paneCount}
      headerNeedsTrafficLightPad={props.headerNeedsTrafficLightPad}
      {...(props.paneCount > 1 ? { dragHandleRef: handleRef } : {})}
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
      installedAgents={installedAgents}
      onContinueInProvider={
        props.onContinueInProvider
          ? (targetKind, tConfig, targetPresentationMode, prompt, segments, closeOrig, ctx) => {
              props.onContinueInProvider?.(
                thread,
                targetKind,
                tConfig,
                targetPresentationMode,
                prompt,
                segments,
                closeOrig,
                ctx,
              );
            }
          : undefined
      }
    />
  );
}
