import { msg } from "@lingui/core/macro";
import type { ToolCallPayload } from "@/shared/contracts";
import { isDelegatedAgentTool } from "@/shared/toolCallClassification";
import { i18n } from "@/renderer/i18n/i18n";
import type { RuntimeChatItem } from "./runtimeEventSlice";

const STALE_SUB_AGENT_ERROR_MESSAGE = msg`Interrupted: agent session ended before completion.`;

/**
 * A delegated-agent row (native sub-agent or Crossagents run) that still reads
 * as running. Once the session that owned it is gone — exited, or replaced by
 * another provider in place — nothing will ever complete it.
 */
export function isStaleSubAgentItem(item: RuntimeChatItem): boolean {
  if (item.type !== "tool_call") return false;
  const payload = item.payload as ToolCallPayload | undefined;
  if (!isDelegatedAgentTool(payload)) return false;
  return item.state !== "completed" || payload?.status === "running";
}

export function terminateSubAgentItem(item: RuntimeChatItem): RuntimeChatItem {
  const payload: ToolCallPayload = (item.payload as ToolCallPayload | undefined) ?? {
    name: "Task",
    status: "error",
  };
  const nextPayload: ToolCallPayload = {
    ...payload,
    status: "error",
    ...(payload.isCrossagent &&
    (payload.crossagentStatus === undefined || payload.crossagentStatus === "running")
      ? { crossagentStatus: "failed" as const }
      : {}),
    ...(payload.result === undefined
      ? { result: { error: i18n._(STALE_SUB_AGENT_ERROR_MESSAGE) } }
      : {}),
  };
  return {
    ...item,
    state: "completed",
    payload: nextPayload,
  };
}

/**
 * Terminate every stale delegated-agent row in a thread's item map. Returns the
 * replacement map, or undefined when nothing needed terminating so callers can
 * skip the state write. `preserveObservedLive` keeps rows this renderer saw
 * stream live, for reconciles that run while the session may still be up.
 */
export function terminateStaleSubAgentItems(
  items: Readonly<Record<string, RuntimeChatItem>>,
  options?: { preserveObservedLive?: boolean },
): Record<string, RuntimeChatItem> | undefined {
  let nextItems: Record<string, RuntimeChatItem> | undefined;
  for (const [id, item] of Object.entries(items)) {
    if (options?.preserveObservedLive === true && item.observedLive === true) continue;
    if (!isStaleSubAgentItem(item)) continue;
    nextItems ??= { ...items };
    nextItems[id] = terminateSubAgentItem(item);
  }
  return nextItems;
}
