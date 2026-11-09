import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeChatItem";
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
 * Whether a timeline item joins a tool-call group on the desktop chat pane.
 * React-free so the TUI transcript groups rows identically.
 */
export function isToolGroupItem(item: RuntimeChatItem): boolean {
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
    (imageViewRendersInline(payload) ||
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
