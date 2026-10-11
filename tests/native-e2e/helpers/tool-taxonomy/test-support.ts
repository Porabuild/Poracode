import type { CanonicalItemType, ToolCallPayload } from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import { taxonomyItem } from "../../fixtures/tool-taxonomy-workload";

export const toolTypes = new Set<CanonicalItemType>([
  "tool_call",
  "mcp_tool_call",
  "image_view",
  "dynamic_tool_call",
]);
export function payload(id: string): ToolCallPayload {
  return taxonomyItem(id).payload as ToolCallPayload;
}
// Selectors need just these three stores. This is the same partial-state seam
// used by chatPaneSelectors.test.ts, not a fabricated runtime API.
export function selectorState(items: readonly RuntimeChatItem[], threadId: string): AppStoreState {
  return {
    runtimeItemIdsByThread: { [threadId]: items.map((i) => i.id) },
    runtimeItemsByIdByThread: { [threadId]: Object.fromEntries(items.map((i) => [i.id, i])) },
    runtimeStructuralVersionByThread: { [threadId]: 1 },
    runtimeRequestsByThread: {},
    runtimeContextByThread: {},
    runtimeBackgroundTasksByThread: {},
    runtimeCompletedTurnsByThread: {},
    runtimeOpenTurnByThread: {},
    threads: [],
  } as unknown as AppStoreState;
}
