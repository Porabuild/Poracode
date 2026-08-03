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
import { readBridge } from "@/renderer/bridge";
import { toggleMarkThreadDone } from "@/renderer/actions/threadActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useExperimentStore } from "@/renderer/state/experimentStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useProject, useThread } from "@/renderer/state/useThread";
import { ThreadView } from "@/renderer/components/thread/ThreadView";
import type { RemoteTerminalTransport } from "@/renderer/components/thread/TerminalPane";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { useIsDraggingPane, usePaneDropIndicatorState, type DragSourceData } from "@/renderer/dnd";
import {
  useInstalledAgents,
  useProjectAgentStatuses,
  useThreadPendingLaunch,
} from "@/renderer/hooks/uiSelectors";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { watchRoutedTerminal } from "@/renderer/state/remoteTerminalFeed";

export function ThreadPane(props: {
  threadId: string;
  paneCount: number;
  paneAlign: "left" | "center" | "right";
  headerNeedsTrafficLightPad?: boolean;
  /** Mounted but hidden for keep-alive. */
  hidden?: boolean;
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
    thread?.groupId ? state.experiments[thread.groupId] : undefined,
  );
  const project = useProject(thread?.projectId);
  const installedAgents = useInstalledAgents();
  const projectAgentStatuses = useProjectAgentStatuses(project?.location);
  const remoteRuntime = useRemoteServersStore((state) =>
    thread?.remoteServerId ? state.runtime[thread.remoteServerId] : undefined,
  );
  const openRemoteThread = useRemoteServersStore((state) => state.openThread);
  const remoteAgentStatuses =
    project?.location.kind === "wsl"
      ? remoteRuntime?.agentStatuses?.wsl
      : remoteRuntime?.agentStatuses?.windows;
  const effectiveAgentStatuses = thread?.remoteServerId
    ? (remoteAgentStatuses ?? [])
    : projectAgentStatuses;
  const agentStatus = effectiveAgentStatuses.find((status) => status.kind === thread?.agentKind);
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
  const owner = remoteOwner(thread);
  const remoteDesktopId = owner?.desktopId;
  const remoteThreadId = owner?.remoteId;
  const remoteTerminalTransport: RemoteTerminalTransport | undefined =
    remoteDesktopId && remoteThreadId
      ? {
          initialScrollback:
            openRemoteThread?.desktopId === remoteDesktopId &&
            openRemoteThread.threadId === remoteThreadId
              ? (openRemoteThread.terminalScrollback ?? "")
              : "",
          outputSource: (listener) =>
            watchRoutedTerminal(remoteThreadId, listener, remoteDesktopId),
          writeInput: (data: string) =>
            readBridge().writeTerminal({ threadId: props.threadId, data }),
          resizeBackingTerminal: (size) =>
            readBridge().resizeTerminal({ threadId: props.threadId, ...size }),
        }
      : undefined;
  function pickRemoteFiles() {
    if (!remoteDesktopId || !remoteThreadId) return Promise.resolve(null);
    return useRemoteServersStore.getState().pickAndUploadFiles(remoteDesktopId, remoteThreadId);
  }
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
      installedAgents={thread.remoteServerId ? effectiveAgentStatuses : installedAgents}
      {...(thread.remoteServerId
        ? {
            canShowProjectEntryInExplorer: false,
            remoteTerminalTransport,
            pickFiles: pickRemoteFiles,
          }
        : {})}
      onContinueInProvider={
        props.onContinueInProvider && !thread.remoteServerId
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
