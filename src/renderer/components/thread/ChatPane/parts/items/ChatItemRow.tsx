import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import type { ToolCallPayload } from "@/shared/contracts";
import { memo } from "react";
import { useAppStore } from "@/renderer/state/appStore";
import type { CheckpointRevertRequest } from "../CheckpointRevertControls";
import { getRuntimeItemStoreSelector, type ChatTimelineEntry } from "../../chatPaneSelectors";
import { AssistantMessage } from "./AssistantMessage";
import { CommandExecution } from "./CommandExecution";
import { FileChange } from "./FileChange";
import { ImageView } from "./ImageView";
import { PlanItem } from "./PlanItem";
import { QuestionAnswer } from "./QuestionAnswer";
import { Reasoning } from "./Reasoning";
import { SubAgentToolCall } from "./SubAgentToolCall";
import { ToolCallGroup } from "./ToolCallGroup";
import { UserMessage } from "./UserMessage";
import { WebSearchItem } from "./WebSearchItem";
import { isSubAgentTool } from "./toolDisplay";

interface ChatItemRowProps {
  threadId: string;
  entry: ChatTimelineEntry;
  /** True when this is the tail of the visible timeline. Drives live-group expand state. */
  isLastEntry?: boolean;
  checkpointRevert: CheckpointRevertRequest | null;
}

/**
 * Per-id store subscription: only re-renders when this row's `RuntimeChatItem`
 * reference changes (e.g. streaming deltas), not when other rows update.
 *
 * `memo`: `MessageList` re-renders whenever TanStack Virtual measures/relayouts
 * (expand/collapse, scroll). React Compiler does not guarantee skipping those
 * parent-driven passes for siblings — explicit memo isolates rows (AGENTS.md escape).
 */
export const ChatItemRow = memo(function ChatItemRow({
  threadId,
  entry,
  isLastEntry = false,
  checkpointRevert,
}: ChatItemRowProps) {
  "use no memo";
  if (entry.kind === "tool_call_group") {
    return <ToolCallGroup threadId={threadId} itemIds={entry.itemIds} isLive={isLastEntry} />;
  }
  return (
    <SingleChatItemRow threadId={threadId} itemId={entry.id} checkpointRevert={checkpointRevert} />
  );
});

const SingleChatItemRow = memo(function SingleChatItemRow({
  threadId,
  itemId,
  checkpointRevert,
}: {
  threadId: string;
  itemId: string;
  checkpointRevert: CheckpointRevertRequest | null;
}) {
  const item = useAppStore(getRuntimeItemStoreSelector(threadId, itemId));
  if (import.meta.env.DEV && window.localStorage.getItem("lc-chat-debug-renders") === "1") {
    console.log("[lc-chat-debug] ChatItemRow render", {
      threadId,
      itemId,
      type: item?.type ?? "(missing)",
      state: item?.state ?? "(n/a)",
    });
  }
  if (!item) return null;
  if (item.type === "tool_call") {
    const payload = getRuntimeItemPayload<ToolCallPayload>(item, "tool_call");
    if (isSubAgentTool(payload)) {
      return <SubAgentToolCall threadId={threadId} item={item} />;
    }
  }
  return renderItem(threadId, item, checkpointRevert);
});

function renderItem(
  threadId: string,
  item: RuntimeChatItem,
  checkpointRevert: CheckpointRevertRequest | null,
) {
  switch (item.type) {
    case "user_message":
      return <UserMessage item={item} checkpointRevert={checkpointRevert} />;
    case "question_answer":
      return <QuestionAnswer item={item} checkpointRevert={checkpointRevert} />;
    case "assistant_message":
      return <AssistantMessage threadId={threadId} item={item} />;
    case "reasoning":
      return <Reasoning item={item} />;
    case "plan":
      return <PlanItem item={item} />;
    case "command_execution":
      return <CommandExecution item={item} />;
    case "file_change":
      return <FileChange item={item} />;
    // Any tool-like row may carry a generated image (Codex `imageGeneration`,
    // ACP/Claude image tools). ImageView renders the inline image card and
    // falls back to the standard ToolCall accordion when there's no image.
    case "image_view":
    case "tool_call":
    case "mcp_tool_call":
    case "dynamic_tool_call":
      return <ImageView item={item} />;
    case "web_search":
      return <WebSearchItem item={item} />;
    case "error":
      return null;
    default:
      return null;
  }
}
