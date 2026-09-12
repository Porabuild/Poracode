import type {
  ProjectLocation,
  PromptSegment,
  RequestOutcome,
  SendThreadInputPayload,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import { toast } from "@heroui/react";
import { DEFAULT_TERMINAL_SIZE } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { friendlyError } from "@/shared/messages";
import { isUnknownThreadSessionError } from "@/shared/threadRelaunch";
import { resolveProjectLocation } from "@/shared/worktree";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { readBridge } from "@/renderer/bridge";
import {
  captureThreadPromptSubmitted,
  threadProductProperties,
} from "@/renderer/analytics/posthog";
import { captureProductEvent } from "@/renderer/analytics/productAnalytics";
import { useAppStore } from "@/renderer/state/appStore";
import { captureFileCheckpoint } from "@/renderer/state/fileCheckpointActions";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { performInitialThreadLaunch } from "./threadLaunchActions";

/** Resolve a thread and its on-disk project location from the store. */
function resolveThreadProjectLocation(
  threadId: string,
): { thread: Thread; projectLocation: ProjectLocation } | undefined {
  const state = useAppStore.getState();
  const thread = state.threads.find((item) => item.id === threadId);
  if (!thread) return undefined;
  const project = state.projects.find((item) => item.id === thread.projectId);
  if (!project) return undefined;
  return { thread, projectLocation: resolveProjectLocation(project.location, thread.worktreePath) };
}

/** Minimal transport a prompt submit needs; runtime adapters inject either the
 * local IPC bridge or the authenticated remote client. */
export interface ThreadInputTransport {
  sendThreadInput: (payload: SendThreadInputPayload) => Promise<unknown>;
}

/**
 * Submit a prompt to a running thread — the single implementation behind the
 * local action ({@link submitThreadInput}) and remote browser prompt sends.
 * Optimistically paints the user_message for GUI threads (the
 * supervisor reuses the same item id, so the live event dedupes), flips the
 * runtime to "working", runs the injected checkpoint capture (desktop-only),
 * then forwards the prompt over the injected transport. On error, rolls back
 * the optimistic working-state flip and forces the active turn closed —
 * rejecting so promise-chained UI (e.g. the mobile dock collapse) only reacts
 * to a successful send.
 */
export async function performThreadInputSubmit(input: {
  thread: Thread;
  prompt: string;
  segments?: PromptSegment[];
  transport: ThreadInputTransport;
  /** Desktop-only: capture a file checkpoint keyed to the optimistic user message. */
  captureCheckpoint?: (checkpointItemId: string) => Promise<void>;
  /**
   * Relaunch the thread and deliver this prompt as the resumed session's first
   * input. Called only when the host has no session left for a thread that is
   * still resumable, so the prompt is never dropped.
   */
  resumeLaunch?: (args: {
    prompt: string;
    segments?: PromptSegment[];
    userMessageItemId?: string;
  }) => Promise<void>;
}): Promise<void> {
  const { thread, prompt, segments, transport } = input;

  // Optimistic user_message for GUI threads: paint the typed prompt
  // into the chat pane synchronously so it shows before the IPC
  // round-trip + (for first prompts) ACP handshake completes. The
  // supervisor reuses the same item id end-to-end so duplicates are
  // dropped by the renderer's per-id dedupe in `applyRuntimeEvent`.
  const presentation = thread.presentationMode ?? "terminal";
  let optimisticUserMessageItemId: string | undefined;
  let markedWorking = false;
  const store = useAppStore.getState();
  if (presentation === "gui" && prompt.length > 0) {
    optimisticUserMessageItemId = `user-${crypto.randomUUID()}`;
    store.applyRuntimeEvent(thread.id, {
      type: "item.started",
      threadId: thread.id,
      itemId: optimisticUserMessageItemId,
      itemType: "user_message",
      payload: { content: buildPromptContentBlocks(prompt, segments) },
    });
    store.applyRuntimeEvent(thread.id, {
      type: "item.completed",
      threadId: thread.id,
      itemId: optimisticUserMessageItemId,
    });
    store.updateThreadRuntime(thread.id, {
      status: "working",
      attention: "working",
      canResumeWithConfig: thread.canResumeWithConfig,
      ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    });
    markedWorking = true;
    if (input.captureCheckpoint) {
      await input.captureCheckpoint(optimisticUserMessageItemId);
    }
  }
  const rollbackOptimisticWorking = (): void => {
    if (!markedWorking) return;
    store.updateThreadRuntime(thread.id, {
      status: thread.status,
      attention: thread.attention,
      canResumeWithConfig: thread.canResumeWithConfig,
      forceCloseActiveTurn: true,
      ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    });
  };
  try {
    await transport.sendThreadInput({
      threadId: thread.id,
      prompt,
      ...(segments ? { segments } : {}),
      config: thread.config,
      ...(optimisticUserMessageItemId ? { userMessageItemId: optimisticUserMessageItemId } : {}),
    });
  } catch (error) {
    // The host session is gone (thread unloaded, supervisor restarted) but the
    // thread can still be resumed: relaunch it with this prompt instead of
    // dropping it. The optimistic paint stays — the relaunch reuses its item id.
    if (
      input.resumeLaunch &&
      isUnknownThreadSessionError(error) &&
      (thread.sessionRef || thread.canResumeWithConfig)
    ) {
      try {
        await input.resumeLaunch({
          prompt,
          ...(segments ? { segments } : {}),
          ...(optimisticUserMessageItemId
            ? { userMessageItemId: optimisticUserMessageItemId }
            : {}),
        });
      } catch (resumeError) {
        rollbackOptimisticWorking();
        throw resumeError;
      }
      // The relaunch captures its own prompt-submitted event.
      store.touchThread(thread.id);
      return;
    }
    rollbackOptimisticWorking();
    throw error;
  }
  captureThreadPromptSubmitted(thread, prompt, segments);
  store.touchThread(thread.id);
}

/**
 * Desktop entry point: resolves the thread and its project location from the
 * store, then submits over the local IPC bridge with checkpoint capture.
 *
 * Extracted byte-for-byte from the former ThreadPane.onSubmitInput inline
 * handler — this is the app's most critical action.
 */
export async function submitThreadInput(
  threadId: string,
  prompt: string,
  segments?: PromptSegment[],
): Promise<void> {
  const resolved = resolveThreadProjectLocation(threadId);
  if (!resolved) return;
  const { thread, projectLocation } = resolved;
  const owner = remoteOwner(thread);
  await performThreadInputSubmit({
    thread,
    prompt,
    ...(segments ? { segments } : {}),
    transport: readBridge(),
    resumeLaunch: async (resume) => {
      // Re-resolve the thread: the pre-send snapshot can miss a sessionRef
      // discovered since, and the resume payload must carry the latest one.
      // Abort if the thread or project disappeared (or changed ownership)
      // between send and resume — relaunching a deleted row would recreate it.
      const latest = resolveThreadProjectLocation(threadId);
      if (!latest || Boolean(remoteOwner(latest.thread)) !== Boolean(owner)) return;
      await performInitialThreadLaunch({
        thread: latest.thread,
        projectLocation: latest.projectLocation,
        prompt: resume.prompt,
        ...(resume.segments ? { segments: resume.segments } : {}),
        ...(resume.userMessageItemId ? { userMessageItemId: resume.userMessageItemId } : {}),
        initialSize: DEFAULT_TERMINAL_SIZE,
      });
    },
    ...(!owner
      ? {
          captureCheckpoint: async (checkpointItemId: string) => {
            if (isHomeProjectId(thread.projectId)) return;
            await captureFileCheckpoint({
              threadId: thread.id,
              checkpointItemId,
              projectLocation,
            });
          },
        }
      : {}),
  });
}

/**
 * Forward a runtime approval/elicitation response to the supervisor, then mark
 * the thread as recently touched so it stays sorted at the top of the sidebar.
 */
export async function resolveThreadServerRequest(
  threadId: string,
  input: {
    requestId: ThreadServerRequestId;
    method: string;
    response: unknown;
    analytics?: {
      outcome: RequestOutcome;
      requestType: string;
    };
  },
): Promise<void> {
  const store = useAppStore.getState();
  const thread = store.threads.find((candidate) => candidate.id === threadId);
  await readBridge().resolveThreadServerRequest({
    threadId,
    requestId: input.requestId,
    method: input.method,
    response: input.response,
  });
  if (input.analytics) {
    captureProductEvent("thread.request_resolved", {
      ...(thread ? threadProductProperties(thread) : {}),
      outcome: input.analytics.outcome,
      request_type: input.analytics.requestType,
    });
  }
  store.touchThread(threadId);
}

/**
 * Apply a config change (model, mode, effort, MCP toggles, …) to a thread. If
 * the thread was in an error state, clearing it now lets the user see the
 * header status return to normal (non-red) as they've taken action to address
 * the failure (e.g. by switching models).
 */
export function changeThreadConfig(threadId: string, config: ThreadConfig): void {
  const state = useAppStore.getState();
  const thread = state.threads.find((item) => item.id === threadId);
  if (!thread) return;
  state.updateThreadConfig(thread.id, config);
  if (thread.status === "error") {
    state.updateThreadRuntime(thread.id, {
      status: "idle",
      attention: "none",
      canResumeWithConfig: thread.canResumeWithConfig,
      ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
    });
  }
}

/**
 * Drop a queued steer message through either local or remote transport.
 */
export function clearThreadPendingSteer(threadId: string): void {
  void readBridge()
    .clearPendingSteer({ threadId })
    .catch((error: unknown) => {
      console.error("[thread] failed to clear pending steer", error);
      toast.danger(friendlyError(error));
    });
}

export async function setThreadPendingSteer(
  thread: Thread,
  prompt: string,
  segments: PromptSegment[] | undefined,
): Promise<void> {
  await readBridge().setPendingSteer({
    threadId: thread.id,
    prompt,
    ...(segments ? { segments } : {}),
    config: thread.config,
  });
}
