import { startTransition, useRef } from "react";
import type {
  ExtractContextResult,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { buildWorktreeLocation } from "@/shared/worktree";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { readBridge } from "@/renderer/bridge";
import { captureThreadInputSubmitted } from "@/renderer/analytics/posthog";
import { toggleMarkThreadDone } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { captureFileCheckpoint } from "@/renderer/state/fileCheckpointActions";
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
  const project = useProject(thread?.projectId);
  const installedAgents = useInstalledAgents();
  const projectAgentStatuses = useProjectAgentStatuses(project?.location);
  const agentStatus = projectAgentStatuses.find((status) => status.kind === thread?.agentKind);
  const { prompt: pendingLaunchPrompt, segments: pendingLaunchSegments } = useThreadPendingLaunch(
    props.threadId,
  );
  const {
    applyRuntimeEvent,
    updateThreadConfig,
    updateThreadRuntime,
    consumeThreadLaunch,
    touchThread,
  } = useAppStore.getState();

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
  const projectLocation = thread.worktreePath
    ? buildWorktreeLocation(project.location, thread.worktreePath)
    : project.location;
  const providerInstalledAgents =
    project.location.kind === "ssh"
      ? projectAgentStatuses.filter((status) => status.installed)
      : installedAgents;
  return (
    <ThreadView
      key={props.threadId}
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
      onMarkDone={() => {
        toggleMarkThreadDone(props.threadId);
      }}
      onConfigChange={(config) => {
        updateThreadConfig(thread.id, config);
        // If the thread was in an error state, clearing it now lets the user
        // see the header status return to normal (non-red) as they've taken
        // action to address the failure (e.g. by switching models).
        if (thread.status === "error") {
          updateThreadRuntime(thread.id, {
            status: "idle",
            attention: "none",
            canResumeWithConfig: thread.canResumeWithConfig,
            ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
          });
        }
      }}
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
      onResolveServerRequest={async ({ requestId, method, response }) => {
        await readBridge().resolveThreadServerRequest({
          threadId: thread.id,
          requestId,
          method,
          response,
        });
        touchThread(thread.id);
      }}
      {...(pendingLaunchPrompt !== undefined ? { pendingLaunchPrompt } : {})}
      {...(pendingLaunchSegments ? { pendingLaunchSegments } : {})}
      onSubmitInput={async (prompt, segments) => {
        // Optimistic user_message for GUI threads: paint the typed prompt
        // into the chat pane synchronously so it shows before the IPC
        // round-trip + (for first prompts) ACP handshake completes. The
        // supervisor reuses the same item id end-to-end so duplicates are
        // dropped by the renderer's per-id dedupe in `applyRuntimeEvent`.
        const presentation = thread.presentationMode ?? "terminal";
        let optimisticUserMessageItemId: string | undefined;
        let markedWorking = false;
        if (presentation === "gui" && prompt.length > 0) {
          optimisticUserMessageItemId = `user-${crypto.randomUUID()}`;
          useAppStore.getState().applyRuntimeEvent(thread.id, {
            type: "item.started",
            threadId: thread.id,
            itemId: optimisticUserMessageItemId,
            itemType: "user_message",
            payload: { content: buildPromptContentBlocks(prompt, segments) },
          });
          useAppStore.getState().applyRuntimeEvent(thread.id, {
            type: "item.completed",
            threadId: thread.id,
            itemId: optimisticUserMessageItemId,
          });
          updateThreadRuntime(thread.id, {
            status: "working",
            attention: "working",
            canResumeWithConfig: thread.canResumeWithConfig,
            ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
          });
          markedWorking = true;
          if (!isHomeProjectId(thread.projectId)) {
            await captureFileCheckpoint({
              threadId: thread.id,
              checkpointItemId: optimisticUserMessageItemId,
              projectLocation,
            });
          }
        }
        try {
          await readBridge().sendThreadInput({
            threadId: thread.id,
            prompt,
            ...(segments ? { segments } : {}),
            config: thread.config,
            ...(optimisticUserMessageItemId
              ? { userMessageItemId: optimisticUserMessageItemId }
              : {}),
          });
        } catch (error) {
          if (markedWorking) {
            updateThreadRuntime(thread.id, {
              status: thread.status,
              attention: thread.attention,
              canResumeWithConfig: thread.canResumeWithConfig,
              forceCloseActiveTurn: true,
              ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
            });
          }
          throw error;
        }
        captureThreadInputSubmitted(thread, segments);
        touchThread(thread.id);
      }}
      installedAgents={providerInstalledAgents}
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
