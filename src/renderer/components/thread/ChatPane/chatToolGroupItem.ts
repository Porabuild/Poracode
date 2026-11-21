import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeChatItem";
import { isUserAttachmentImageReadPayload } from "@/shared/inlineImagePayload";
import { readMcpAppResource } from "@/shared/mcpAppResources";
import { completedToolVideoSources } from "@/shared/chatVideo";
import type { ToolCallPayload } from "@/shared/contracts";
import { isDelegatedAgentTool } from "@/shared/toolCallClassification";
import { imageViewRendersInline } from "./parts/items/imageViewSource";
import {
  isToolGroupItem as isGroupableItemType,
  isToolLikeItem,
} from "./parts/items/toolCallCategorization";

/**
 * Whether a timeline item renders as a standalone inline image card (and can
 * join a consecutive `image_group` mosaic). Excludes sub-agent parents, tool
 * videos, and MCP App interactive cards so those keep their own dedicated rows.
 */
export function isStandaloneImageItem(
  item: RuntimeChatItem,
  userAttachmentPaths?: ReadonlySet<string>,
): boolean {
  if (!isToolLikeItem(item)) return false;
  const payload = item.payload as ToolCallPayload | undefined;
  if (item.type === "tool_call" && isDelegatedAgentTool(payload)) return false;
  if (completedToolVideoSources(item).length > 0) return false;
  if (
    item.state === "completed" &&
    payload?.status === "success" &&
    readMcpAppResource(payload.result)
  ) {
    return false;
  }
  return imageViewRendersInline(payload, userAttachmentPaths);
}

/**
 * Whether an in-flight `image_view` tool call can reserve a pending skeleton
 * slot inside a preceding `image_group` instead of flashing a transient tool
 * row below the mosaic before completing.
 */
export function isPendingImageGroupFollower(
  item: RuntimeChatItem,
  userAttachmentPaths?: ReadonlySet<string>,
): boolean {
  if (item.type !== "image_view" || item.state === "completed") return false;
  const payload = item.payload as ToolCallPayload | undefined;
  if (payload?.status === "error") return false;
  if (isUserAttachmentImageReadPayload(payload, userAttachmentPaths)) return false;
  return true;
}

/**
 * Whether a timeline item joins a tool-call group on the desktop chat pane.
 * React-free so the TUI transcript groups rows identically.
 */
export function isToolGroupItem(
  item: RuntimeChatItem,
  userAttachmentPaths?: ReadonlySet<string>,
): boolean {
  // Sub-agent parents render as their own pill (with overlay) — never fold
  // them into a tool-call group.
  if (
    item.type === "tool_call" &&
    isDelegatedAgentTool(item.payload as ToolCallPayload | undefined)
  ) {
    return false;
  }
  // Any tool-like row that renders as a standalone inline image card
  // (ImageView) is never folded into a "Ran N tools" group. Rows that fall back
  // to the generic accordion (still running, errored, or non-image) keep the
  // default grouping — `imageViewRendersInline` mirrors ImageView's render
  // decision so the two never disagree.
  const payload = item.payload as ToolCallPayload | undefined;
  if (completedToolVideoSources(item).length > 0) return false;
  if (
    isToolLikeItem(item) &&
    (imageViewRendersInline(payload, userAttachmentPaths) ||
      (item.state === "completed" &&
        payload?.status === "success" &&
        readMcpAppResource(payload.result)))
  ) {
    return false;
  }
  // The groupable type set (tools, reasoning, commands, edits, searches) lives
  // in toolCallCategorization so it is maintained in one place.
  return isGroupableItemType(item);
}
