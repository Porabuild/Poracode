import type {
  CanonicalItemType,
  MessageItemPayload,
  ReasoningItemPayload,
} from "@/shared/contracts";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";

/**
 * What the composer's resume button sends for a cut-off turn. When the agent
 * never answered the latest message, that message is sent again; once it had
 * started answering, the agent is asked to continue.
 */
export type ThreadResumePlan =
  | { readonly kind: "resend"; readonly prompt: string }
  | { readonly kind: "continue" };

/** Rows that are not the agent's own work on the turn. */
const NON_OUTPUT_ITEM_TYPES: ReadonlySet<CanonicalItemType> = new Set([
  "error",
  "provider_handoff",
]);

const CONTINUE_PLAN: ThreadResumePlan = { kind: "continue" };

// Neither index retains evicted history. Streaming can replace the item map
// without replacing the IDs, so both identities must be weak keys.
const resumePlanCache = new WeakMap<
  readonly string[],
  WeakMap<AppStoreState["runtimeItemsByIdByThread"][string], ThreadResumePlan | null>
>();

/** Null when nothing in the loaded history can be resumed. */
export function selectThreadResumePlan(
  state: AppStoreState,
  threadId: string,
): ThreadResumePlan | null {
  const itemIds = state.runtimeItemIdsByThread[threadId];
  // Streamed text fills an existing row without changing the id list.
  const itemsById = state.runtimeItemsByIdByThread[threadId];
  if (!itemIds?.length || !itemsById) return null;
  let byItems = resumePlanCache.get(itemIds);
  if (byItems?.has(itemsById)) return byItems.get(itemsById)!;
  const result = resolveThreadResumePlan(itemIds, itemsById);
  if (!byItems) {
    byItems = new WeakMap();
    resumePlanCache.set(itemIds, byItems);
  }
  byItems.set(itemsById, result);
  return result;
}

function resolveThreadResumePlan(
  itemIds: readonly string[] | undefined,
  itemsById: AppStoreState["runtimeItemsByIdByThread"][string] | undefined,
): ThreadResumePlan | null {
  if (!itemIds?.length) return null;
  let sawOutput = false;
  for (let index = itemIds.length - 1; index >= 0; index -= 1) {
    const item = itemsById?.[itemIds[index]!];
    // A sub-agent's rows belong to its parent's delegation, which already
    // counts as the agent's work; its prompt is not the user's message.
    if (!item || item.parentItemId) continue;
    if (item.type !== "user_message") {
      if (isAgentOutput(item)) sawOutput = true;
      continue;
    }
    const payload = getRuntimeItemPayload<MessageItemPayload>(item, "user_message");
    // A live voice transcript is not a turn the agent was asked to work on.
    if (payload?.turnIndependent) continue;
    if (sawOutput) return CONTINUE_PLAN;
    const prompt = resendableText(payload);
    return prompt ? { kind: "resend", prompt } : CONTINUE_PLAN;
  }
  // The latest message scrolled out of the loaded window behind a long reply.
  return sawOutput ? CONTINUE_PLAN : null;
}

/** A reply or reasoning row the provider opened but never filled is not output. */
function isAgentOutput(item: RuntimeChatItem): boolean {
  if (NON_OUTPUT_ITEM_TYPES.has(item.type)) return false;
  if (item.detailsDeferred) return true;
  if (Object.values(item.streams).some((text) => text?.trim())) return true;
  if (item.type === "assistant_message") {
    const payload = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message");
    return (
      payload?.content.some((block) => block.kind !== "text" || block.text.trim().length > 0) ??
      false
    );
  }
  if (item.type === "reasoning") {
    return Boolean(getRuntimeItemPayload<ReasoningItemPayload>(item, "reasoning")?.summary?.trim());
  }
  return true;
}

/**
 * Only plain typed text is sent again. Attachments, skills, mentions and form
 * answers cannot be rebuilt from the painted message, so those turns continue.
 */
function resendableText(payload: MessageItemPayload | undefined): string | null {
  if (!payload || payload.questionAnswer || payload.replyForm) return null;
  if (payload.content.some((block) => block.kind !== "text")) return null;
  const text = payload.content.map((block) => (block.kind === "text" ? block.text : "")).join("");
  return text.trim().length > 0 ? text : null;
}
