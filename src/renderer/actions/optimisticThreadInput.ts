import type { PromptSegment, QuestionAnswerItemPayload, Thread } from "@/shared/contracts";
import { buildPromptContentBlocks, hasSendablePromptContent } from "@/shared/promptContent";
import { useAppStore } from "@/renderer/state/appStore";
import {
  notePendingThreadInputMessage,
  retainPendingThreadInput,
  threadInterruptedTurnStatements,
} from "@/renderer/state/pendingThreadInput";

export interface PreparedOptimisticThreadInput {
  readonly userMessageItemId: string;
  readonly releasePendingInput: (() => void) | undefined;
  readonly interruptedTurnStatementsAtSend: number;
  abortBeforeDispatch(): void;
  releaseUnconsumed(): void;
}

const preparedByThreadId = new Map<string, PreparedOptimisticThreadInput[]>();

export function takePreparedOptimisticThreadInput(
  threadId: string,
): PreparedOptimisticThreadInput | undefined {
  const queue = preparedByThreadId.get(threadId);
  if (!queue?.length) return undefined;
  const next = queue.shift();
  if (queue.length === 0) preparedByThreadId.delete(threadId);
  return next;
}

export function allocateInitialUserMessageItemId(
  thread: Thread,
  prompt: string,
  segments?: PromptSegment[],
): string | undefined {
  const presentation = thread.presentationMode ?? "terminal";
  if (
    presentation !== "gui" ||
    !hasSendablePromptContent(prompt, segments) ||
    thread.sessionRef !== undefined
  ) {
    return undefined;
  }
  return `user-${crypto.randomUUID()}`;
}

/**
 * Paint the user's first message for a launch that has not reached the
 * supervisor yet, so the chat shows what was sent instead of a bare working
 * row. The supervisor reuses the returned id for its own canonical
 * `user_message`, and the store's per-id dedupe drops the duplicate.
 */
export function appendOptimisticInitialUserMessage(
  thread: Thread,
  prompt: string,
  segments?: PromptSegment[],
): string | undefined {
  const itemId = allocateInitialUserMessageItemId(thread, prompt, segments);
  if (!itemId) return undefined;

  const store = useAppStore.getState();
  if (typeof store.applyRuntimeEvent !== "function") return itemId;
  store.requestChatScrollToPrompt?.(thread.id);
  store.applyRuntimeEvent(thread.id, {
    type: "item.started",
    threadId: thread.id,
    itemId,
    itemType: "user_message",
    payload: { content: buildPromptContentBlocks(prompt, segments) },
  });
  store.applyRuntimeEvent(thread.id, {
    type: "item.completed",
    threadId: thread.id,
    itemId,
  });
  return itemId;
}

/**
 * Paint an active GUI prompt right after local draft preservation so slow
 * context snapshots and attachment materialization never keep the message
 * stuck in the composer. Consumed transparently by `performThreadInputSubmit`,
 * or rolled back via `abortBeforeDispatch()` when a pre-dispatch step fails.
 */
export function beginOptimisticThreadInput(
  thread: Thread,
  prompt: string,
  segments?: PromptSegment[],
  questionAnswer?: QuestionAnswerItemPayload,
): PreparedOptimisticThreadInput | undefined {
  const presentation = thread.presentationMode ?? "terminal";
  if (presentation !== "gui" || !hasSendablePromptContent(prompt, segments)) {
    return undefined;
  }
  const store = useAppStore.getState();
  if (
    typeof store.applyRuntimeEvent !== "function" ||
    typeof store.updateThreadRuntime !== "function"
  ) {
    return undefined;
  }
  const releasePendingInput = retainPendingThreadInput(thread.id);
  const interruptedTurnStatementsAtSend = threadInterruptedTurnStatements(thread.id);
  const userMessageItemId = `user-${crypto.randomUUID()}`;
  notePendingThreadInputMessage(thread.id, userMessageItemId);
  store.applyRuntimeEvent(thread.id, {
    type: "item.started",
    threadId: thread.id,
    itemId: userMessageItemId,
    itemType: "user_message",
    payload: {
      content: buildPromptContentBlocks(prompt, segments),
      ...(questionAnswer ? { questionAnswer } : {}),
      clientInputDelivery: "pending",
    },
  });
  store.applyRuntimeEvent(thread.id, {
    type: "item.completed",
    threadId: thread.id,
    itemId: userMessageItemId,
  });
  store.updateThreadRuntime(thread.id, {
    status: "working",
    attention: "working",
    canResumeWithConfig: thread.canResumeWithConfig,
    ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
  });
  let settled = false;
  const removeQueued = (entry: PreparedOptimisticThreadInput) => {
    const queue = preparedByThreadId.get(thread.id);
    if (!queue) return false;
    const idx = queue.indexOf(entry);
    if (idx === -1) return false;
    queue.splice(idx, 1);
    if (queue.length === 0) preparedByThreadId.delete(thread.id);
    return true;
  };
  const entry: PreparedOptimisticThreadInput = {
    userMessageItemId,
    releasePendingInput,
    interruptedTurnStatementsAtSend,
    abortBeforeDispatch() {
      if (settled) return;
      settled = true;
      removeQueued(entry);
      releasePendingInput();
      const latestStore = useAppStore.getState();
      latestStore.removeThreadRuntimeItem?.(thread.id, userMessageItemId);
      const hostStatedMarker =
        threadInterruptedTurnStatements(thread.id) !== interruptedTurnStatementsAtSend;
      latestStore.updateThreadRuntime?.(thread.id, {
        status: thread.status,
        attention: thread.attention,
        canResumeWithConfig: thread.canResumeWithConfig,
        ...(!hostStatedMarker ? { interruptedTurn: thread.interruptedTurn ?? null } : {}),
        forceCloseActiveTurn: true,
        ...(thread.sessionRef ? { sessionRef: thread.sessionRef } : {}),
      });
    },
    releaseUnconsumed() {
      if (settled) return;
      if (removeQueued(entry)) {
        settled = true;
        releasePendingInput();
      }
    },
  };
  const queue = preparedByThreadId.get(thread.id) ?? [];
  queue.push(entry);
  preparedByThreadId.set(thread.id, queue);
  return entry;
}
