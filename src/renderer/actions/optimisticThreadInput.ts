import type {
  ModelSwitchItemPayload,
  PromptSegment,
  QuestionAnswerItemPayload,
  Thread,
} from "@/shared/contracts";
import { lastTurnModelFromItems } from "@/shared/modelSwitch";
import { buildPromptContentBlocks, hasSendablePromptContent } from "@/shared/promptContent";
import { useAppStore } from "@/renderer/state/appStore";
import {
  notePendingThreadInputMessage,
  retainPendingThreadInput,
  threadInterruptedTurnStatements,
} from "@/renderer/state/pendingThreadInput";

export interface PreparedOptimisticThreadInput {
  readonly userMessageItemId: string;
  /** Optimistic `model_switch` divider painted ahead of this input, if any. */
  readonly modelSwitchItemId: string | undefined;
  /** The model that answered the previous turn, when a divider was painted. */
  readonly previousTurnModel: string | undefined;
  readonly releasePendingInput: (() => void) | undefined;
  readonly interruptedTurnStatementsAtSend: number;
  abortBeforeDispatch(): void;
  releaseUnconsumed(): void;
}

/** A painted optimistic model-switch divider and the models it separates. */
export interface OptimisticModelSwitch {
  readonly itemId: string;
  readonly fromModel: string;
  readonly toModel: string;
}

/** The model that answered `threadId`'s previous turn, from its loaded items. */
export function previousTurnModelForThread(threadId: string): string | undefined {
  const state = useAppStore.getState();
  const ids = state.runtimeItemIdsByThread?.[threadId] ?? [];
  const byId = state.runtimeItemsByIdByThread?.[threadId] ?? {};
  return lastTurnModelFromItems(ids.flatMap((id) => byId[id] ?? []));
}

/**
 * Paint the `model_switch` divider for a prompt about to be painted, when
 * the thread's selected model differs from the one that answered its
 * previous turn. The supervisor re-emits the divider with this same id when
 * it records the switch, so per-id dedupe keeps the painted position ahead
 * of the prompt. Returns undefined when the model is unchanged or unknown.
 */
export function paintOptimisticModelSwitch(thread: Thread): OptimisticModelSwitch | undefined {
  const toModel = thread.config.model?.trim();
  if (!toModel) return undefined;
  const fromModel = previousTurnModelForThread(thread.id);
  if (!fromModel || fromModel === toModel) return undefined;
  const store = useAppStore.getState();
  if (typeof store.applyRuntimeEvent !== "function") return undefined;
  const itemId = `model-switch-${crypto.randomUUID()}`;
  const payload: ModelSwitchItemPayload = {
    fromModel,
    toModel,
    at: new Date().toISOString(),
  };
  store.applyRuntimeEvent(thread.id, {
    type: "item.started",
    threadId: thread.id,
    itemId,
    itemType: "model_switch",
    payload,
  });
  store.applyRuntimeEvent(thread.id, { type: "item.completed", threadId: thread.id, itemId });
  return { itemId, fromModel, toModel };
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

/** Ids of the optimistic rows painted for a launch's first prompt. */
export interface OptimisticInitialInput {
  readonly userMessageItemId: string;
  readonly modelSwitch: OptimisticModelSwitch | undefined;
}

/**
 * Paint the user's first message for a launch that has not reached the
 * supervisor yet (plus its model-switch divider when the launch answers
 * with a different model), so the chat shows what was sent instead of a
 * bare working row. The supervisor reuses the returned ids for its own
 * canonical rows, and the store's per-id dedupe drops the duplicates.
 */
export function appendOptimisticInitialInput(
  thread: Thread,
  prompt: string,
  segments?: PromptSegment[],
): OptimisticInitialInput | undefined {
  const itemId = allocateInitialUserMessageItemId(thread, prompt, segments);
  if (!itemId) return undefined;

  const store = useAppStore.getState();
  if (typeof store.applyRuntimeEvent !== "function") {
    return { userMessageItemId: itemId, modelSwitch: undefined };
  }
  const modelSwitch = paintOptimisticModelSwitch(thread);
  store.requestChatScrollToPrompt?.(thread.id);
  store.applyRuntimeEvent(thread.id, {
    type: "item.started",
    threadId: thread.id,
    itemId,
    itemType: "user_message",
    payload: {
      content: buildPromptContentBlocks(prompt, segments),
      ...(thread.config.model?.trim() ? { model: thread.config.model } : {}),
    },
  });
  store.applyRuntimeEvent(thread.id, {
    type: "item.completed",
    threadId: thread.id,
    itemId,
  });
  return { userMessageItemId: itemId, modelSwitch };
}

/** {@link appendOptimisticInitialInput}, returning only the user message id. */
export function appendOptimisticInitialUserMessage(
  thread: Thread,
  prompt: string,
  segments?: PromptSegment[],
): string | undefined {
  return appendOptimisticInitialInput(thread, prompt, segments)?.userMessageItemId;
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
  const modelSwitch = paintOptimisticModelSwitch(thread);
  store.applyRuntimeEvent(thread.id, {
    type: "item.started",
    threadId: thread.id,
    itemId: userMessageItemId,
    itemType: "user_message",
    payload: {
      content: buildPromptContentBlocks(prompt, segments),
      ...(questionAnswer ? { questionAnswer } : {}),
      ...(thread.config.model?.trim() ? { model: thread.config.model } : {}),
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
    modelSwitchItemId: modelSwitch?.itemId,
    previousTurnModel: modelSwitch?.fromModel,
    releasePendingInput,
    interruptedTurnStatementsAtSend,
    abortBeforeDispatch() {
      if (settled) return;
      settled = true;
      removeQueued(entry);
      releasePendingInput();
      const latestStore = useAppStore.getState();
      latestStore.removeThreadRuntimeItem?.(thread.id, userMessageItemId);
      if (modelSwitch) latestStore.removeThreadRuntimeItem?.(thread.id, modelSwitch.itemId);
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
