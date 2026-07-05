import type {
  ProjectLocation,
  PromptSegment,
  Thread,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { resolveProjectLocation } from "@/shared/worktree";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { readBridge } from "@/renderer/bridge";
import { captureThreadInputSubmitted } from "@/renderer/analytics/posthog";
import { useAppStore } from "@/renderer/state/appStore";
import { captureFileCheckpoint } from "@/renderer/state/fileCheckpointActions";

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

/**
 * Submit a prompt to a running thread. Optimistically paints the user_message
 * for GUI threads (the supervisor reuses the same item id, so the live event
 * dedupes), flips the runtime to "working", captures a file checkpoint, then
 * forwards the prompt over IPC. On error, rolls back the optimistic
 * working-state flip and forces the active turn closed.
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
      ...(optimisticUserMessageItemId ? { userMessageItemId: optimisticUserMessageItemId } : {}),
    });
  } catch (error) {
    if (markedWorking) {
      store.updateThreadRuntime(thread.id, {
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
  store.touchThread(thread.id);
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
  },
): Promise<void> {
  await readBridge().resolveThreadServerRequest({
    threadId,
    requestId: input.requestId,
    method: input.method,
    response: input.response,
  });
  useAppStore.getState().touchThread(threadId);
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
