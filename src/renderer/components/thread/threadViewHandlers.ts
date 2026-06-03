import { startTransition, type ComponentProps } from "react";
import type { ProjectLocation, Thread } from "@/shared/contracts";
import { isHomeProjectId } from "@/shared/homeScope";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import { readBridge } from "@/renderer/bridge";
import { captureThreadInputSubmitted } from "@/renderer/analytics/posthog";
import { useAppStore } from "@/renderer/state/appStore";
import { captureFileCheckpoint } from "@/renderer/state/fileCheckpointActions";
import { ThreadView } from "@/renderer/components/thread/ThreadView";

type ThreadViewProps = ComponentProps<typeof ThreadView>;

export interface ThreadViewHandlers {
  onConfigChange: NonNullable<ThreadViewProps["onConfigChange"]>;
  onLaunchConsumed: NonNullable<ThreadViewProps["onLaunchConsumed"]>;
  onLaunchFailed: NonNullable<ThreadViewProps["onLaunchFailed"]>;
  onResolveServerRequest: NonNullable<ThreadViewProps["onResolveServerRequest"]>;
  onSubmitInput: NonNullable<ThreadViewProps["onSubmitInput"]>;
}

/**
 * Shared `ThreadView` host handlers used wherever a thread is driven (the main
 * window panes and the quick-composer overlay). Returns fresh closures over the
 * current `thread`, matching the per-render semantics of inline handlers.
 */
export function buildThreadViewHandlers(
  thread: Thread,
  projectLocation: ProjectLocation,
): ThreadViewHandlers {
  const {
    applyRuntimeEvent,
    updateThreadConfig,
    updateThreadRuntime,
    consumeThreadLaunch,
    touchThread,
  } = useAppStore.getState();

  return {
    onConfigChange: (config) => {
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
    },
    onLaunchConsumed: () => consumeThreadLaunch(thread.id),
    onLaunchFailed: (message) => {
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
    },
    onResolveServerRequest: async ({ requestId, method, response }) => {
      await readBridge().resolveThreadServerRequest({
        threadId: thread.id,
        requestId,
        method,
        response,
      });
      touchThread(thread.id);
    },
    onSubmitInput: async (prompt, segments) => {
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
        applyRuntimeEvent(thread.id, {
          type: "item.started",
          threadId: thread.id,
          itemId: optimisticUserMessageItemId,
          itemType: "user_message",
          payload: { content: buildPromptContentBlocks(prompt, segments) },
        });
        applyRuntimeEvent(thread.id, {
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
    },
  };
}
