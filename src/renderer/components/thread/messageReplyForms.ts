import type { MessageItemPayload, QuestionAnswerItemPayload } from "@/shared/contracts";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import { getRuntimeItemPayload } from "@/renderer/state/slices/runtimeEventSlice";
import { readThreadInputDelivery } from "@/renderer/state/threadInputDelivery";
import { readMessageReplyAnswer } from "./ChatPane/parts/items/messageReplyAnswerPayload";

const EMPTY_IDS: readonly string[] = Object.freeze([]);
type ReplyState = "none" | "pending" | "answered";
type ReplyFormState = Pick<
  AppStoreState,
  "runtimeItemIdsByThread" | "runtimeItemsByIdByThread" | "runtimeStructuralVersionByThread"
>;
const cache = new Map<
  string,
  {
    ids: readonly string[];
    version: number;
    pendingIds: readonly string[];
    answers: ReadonlyMap<string, QuestionAnswerItemPayload>;
    replyStates: ReadonlyMap<string, ReplyState>;
  }
>();

/** Content deltas never change form metadata or delivery; reuse the structural cache. */
function messageReplyForms(state: ReplyFormState, threadId: string) {
  const ids = state.runtimeItemIdsByThread[threadId] ?? EMPTY_IDS;
  const version = state.runtimeStructuralVersionByThread[threadId] ?? 0;
  const cached = cache.get(threadId);
  if (cached?.ids === ids && cached.version === version) return cached;
  const items = state.runtimeItemsByIdByThread[threadId];
  const answers = new Map<string, QuestionAnswerItemPayload>();
  const replyStates = new Map<string, ReplyState>();
  let pendingIds: string[] = [];
  for (const id of ids) {
    const item = items?.[id];
    if (!item || item.parentItemId) continue;
    if (item.type === "assistant_message") {
      if (getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message")?.replyForm)
        pendingIds.push(id);
    } else if (item.type === "user_message") {
      const delivery = readThreadInputDelivery(item.payload);
      if (delivery === "failed") continue;
      const sourceIds = pendingIds;
      if (delivery === "pending") {
        for (const sourceId of pendingIds) replyStates.set(sourceId, "pending");
      } else {
        // A normal composer reply also supersedes outstanding async questions.
        pendingIds = [];
        for (const sourceId of sourceIds) replyStates.set(sourceId, "answered");
      }
      const payload = getRuntimeItemPayload<MessageItemPayload>(item, "user_message");
      if (!payload || (!payload.questionAnswer && sourceIds.length === 0)) continue;
      if (!payload.content.every((block) => block.kind === "text")) continue;
      if (payload.questionAnswer) {
        answers.set(id, payload.questionAnswer);
        continue;
      }
      const prompt = payload.content.map((block) => block.text).join("");
      for (const sourceId of sourceIds.toReversed()) {
        const form = getRuntimeItemPayload<MessageItemPayload>(
          items![sourceId]!,
          "assistant_message",
        )?.replyForm;
        const answer = form && prompt ? readMessageReplyAnswer(form, prompt) : undefined;
        if (answer) {
          answers.set(id, answer);
          break;
        }
      }
    }
  }
  const result = { ids, version, pendingIds, answers, replyStates };
  if (cache.size > 500) cache.clear();
  cache.set(threadId, result);
  return result;
}

export function selectPendingMessageReplyIds(
  state: ReplyFormState,
  threadId: string,
): readonly string[] {
  return messageReplyForms(state, threadId).pendingIds;
}

export function selectMessageReplyAnswer(
  state: ReplyFormState,
  threadId: string,
  itemId: string,
): QuestionAnswerItemPayload | undefined {
  return messageReplyForms(state, threadId).answers.get(itemId);
}

export function selectMessageReplyState(
  state: ReplyFormState,
  threadId: string,
  itemId: string,
): ReplyState {
  return messageReplyForms(state, threadId).replyStates.get(itemId) ?? "none";
}

import { isMessageReplyFormFallback } from "@/shared/checkpointRevert";
/** Generated question text belongs to the composer; independent assistant context stays in chat. */
export { isMessageReplyFormFallback };
