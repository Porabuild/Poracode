import type { ToolCallPayload } from "@/shared/contracts";
import { isDelegatedAgentTool } from "@/shared/toolCallClassification";
import { useAppStore } from "../appStore";
import type { RuntimeChatItem } from "../slices/runtimeEventSlice";
import { isStaleSubAgentItem } from "../slices/staleSubAgents";

/** Called only after the snapshot's connection and sequence fences pass. */
export function mergeTerminalDelegatedAgentItems(
  threadId: string,
  incomingItems: readonly RuntimeChatItem[],
): void {
  useAppStore.setState((current) => {
    const existingItems = current.runtimeItemsByIdByThread[threadId];
    if (!existingItems) return {};
    let nextItems: Record<string, RuntimeChatItem> | undefined;
    for (const incoming of incomingItems) {
      const existing = existingItems[incoming.id];
      if (
        !existing ||
        !isStaleSubAgentItem(existing) ||
        incoming.type !== "tool_call" ||
        incoming.state !== "completed" ||
        incoming.parentItemId !== existing.parentItemId
      )
        continue;
      const oldPayload = existing.payload as ToolCallPayload;
      const payload = incoming.payload as ToolCallPayload | undefined;
      if (
        !isDelegatedAgentTool(payload) ||
        !payload ||
        (payload.status !== "success" && payload.status !== "error") ||
        payload.name !== oldPayload.name ||
        (payload.isCrossagent === true) !== (oldPayload.isCrossagent === true)
      )
        continue;
      nextItems ??= { ...existingItems };
      // This is a terminal payload update, not a transcript replacement.
      // Keep the client's streamed output, retention proof and live timings.
      nextItems[incoming.id] = {
        ...existing,
        state: "completed",
        payload: { ...oldPayload, ...payload },
      };
    }
    if (!nextItems) return {};
    return {
      runtimeItemsByIdByThread: {
        ...current.runtimeItemsByIdByThread,
        [threadId]: nextItems,
      },
      runtimeStructuralVersionByThread: {
        ...current.runtimeStructuralVersionByThread,
        [threadId]: (current.runtimeStructuralVersionByThread[threadId] ?? 0) + 1,
      },
    };
  });
}
