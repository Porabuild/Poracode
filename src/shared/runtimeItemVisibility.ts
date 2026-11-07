import { assistantDisplayText, hasVisibleAssistantText } from "./assistantMessageText";
import { isChatVideoSource } from "./chatVideo";
import {
  RUNTIME_REQUEST_ITEM_TYPE,
  type MessageItemPayload,
  type ToolCallPayload,
} from "./contracts";
import { isMessageReplyFormFallbackText } from "./messageReplyForm";
import { isAskUserQuestionToolName, isCrossagentSpawnAgentTool } from "./toolCallClassification";

/**
 * Structural item shape covering both RuntimeChatItem (renderer store) and
 * PersistedRuntimeItem (host/remote item pages) — the fields the visibility
 * predicate and the checkpoint anchor scan read.
 */
export interface CheckpointRuntimeItem {
  type: string;
  state: "started" | "updated" | "completed";
  payload?: unknown;
  streams: { assistant_text?: string };
  parentItemId?: string;
}

export function getRuntimeItemPayload<T>(
  item: CheckpointRuntimeItem,
  expectedType: string,
): T | undefined {
  return item.type === expectedType ? (item.payload as T | undefined) : undefined;
}

export function isToolLikeItem(item: CheckpointRuntimeItem): boolean {
  return (
    item.type === "tool_call" ||
    item.type === "mcp_tool_call" ||
    item.type === "image_view" ||
    item.type === "dynamic_tool_call"
  );
}

export function getToolLikePayload(item: CheckpointRuntimeItem): ToolCallPayload | undefined {
  return isToolLikeItem(item) ? (item.payload as ToolCallPayload | undefined) : undefined;
}

export function isMessageReplyFormFallback(item: CheckpointRuntimeItem, text: string): boolean {
  const form = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message")?.replyForm;
  return !item.parentItemId && isMessageReplyFormFallbackText(form, text);
}

export function isVisibleRuntimeItem(item: CheckpointRuntimeItem): boolean {
  // Plans and goals are rendered exclusively in composer docks — never inline
  // in chat. Empty completed reasoning items are already dropped at the data
  // layer.
  if (item.type === "plan" || item.type === "goal") return false;
  // Open agent requests (approvals/questions) are persisted only so remote
  // clients can recover the pending prompt from a snapshot; they render as the
  // blocking request form, never as a chat row.
  if ((item.type as string) === RUNTIME_REQUEST_ITEM_TYPE) return false;
  // Error items have no renderer in the chat row switch (ChatItemRow returns
  // null for `error`); excluding them here keeps the virtualized list from
  // allocating an empty slot that shows up as a gap.
  if (item.type === "error") return false;
  // Old ACP sessions may contain completed assistant items created from a blank
  // provider stream-boundary chunk — empty, or whitespace-only (Factory Droid
  // emits "\n\n" after tool calls). They have no renderable content, so
  // allocating a virtualized row for them only produces a blank gap. Keep an
  // empty in-flight item visible for its loader. Display-text arbitration is
  // the shared helper's: the stream wins unless a completed payload is marked
  // `displayAuthoritative` (a display hook may suppress output with empty
  // text, hiding the row). Inline image payloads keep the row regardless.
  if (item.type === "assistant_message" && item.state === "completed") {
    const payload = getRuntimeItemPayload<MessageItemPayload>(item, "assistant_message");
    const hasImage =
      payload?.content.some(
        (block) =>
          block.kind === "image" ||
          (block.kind === "file" && isChatVideoSource(block.path, block.mimeType)),
      ) ?? false;
    const hasReplyForm = (payload?.replyForm?.questions.length ?? 0) > 0;
    if (!hasImage && hasReplyForm && isMessageReplyFormFallback(item, assistantDisplayText(item)))
      return false;
    if (!hasImage && !hasReplyForm && !hasVisibleAssistantText(item)) return false;
  }
  if (isToolLikeItem(item)) {
    const payload = getToolLikePayload(item);
    // AskUserQuestion is rendered as the blocking request form while open and
    // as a question_answer row after submission. ACP providers may reveal the
    // tool name only on a later update, so filter it here as a final defense
    // against both live races and already-persisted redundant rows.
    if (isAskUserQuestionToolName(payload?.name) || isAskUserQuestionToolName(payload?.title)) {
      return false;
    }
    // Successful Crossagents runs render as the richer delegated-agent row.
    // Keep failed transport calls visible because they may have no delegated row.
    if (payload?.status !== "error" && isCrossagentSpawnAgentTool(payload)) return false;
    // Tool renderers defer rows without a name. Keep those incomplete calls out
    // of the virtualized timeline and group counts until a later update names them.
    if (!payload?.name?.trim()) return false;
  }
  return true;
}
