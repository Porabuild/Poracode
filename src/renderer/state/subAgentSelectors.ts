import type { Thread, ToolCallPayload } from "@/shared/contracts";
import { isSubAgentTool, isWorkflowTool } from "@/shared/toolCallClassification";
import type { AppStoreState } from "./slices/shared";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";

function classifyActiveSubAgent(item: RuntimeChatItem): "workflow" | "native" | null {
  if (item.type !== "tool_call") return null;
  const payload = item.payload as ToolCallPayload | undefined;
  if (!payload || !isSubAgentTool(payload)) return null;
  // Workflow tools complete on the parent SDK stream the moment they're
  // launched (background), but the real work continues for minutes. Keep
  // them in the active list as long as the SDK didn't reject the launch —
  // ActiveSubAgentTile subscribes to the manifest and auto-dismisses once
  // it sees a terminal status.
  if (isWorkflowTool(payload)) return payload.status === "error" ? null : "workflow";
  if (item.state === "completed" && payload.status !== "running") return null;
  return "native";
}

interface ActiveSubAgentSelection {
  itemIds: readonly string[];
  hasActiveNativeSubAgent: boolean;
}

interface ActiveSubAgentCacheEntry extends ActiveSubAgentSelection {
  sourceItemIds: readonly string[];
  structuralVersion: number;
}

const activeSubAgentCache = new Map<string, ActiveSubAgentCacheEntry>();

const EMPTY_ACTIVE_SUB_AGENT_IDS = Object.freeze([]) as readonly string[];
const EMPTY_ACTIVE_SUB_AGENTS: ActiveSubAgentSelection = Object.freeze({
  itemIds: EMPTY_ACTIVE_SUB_AGENT_IDS,
  hasActiveNativeSubAgent: false,
});

function selectActiveSubAgents(state: AppStoreState, threadId: string): ActiveSubAgentSelection {
  const sourceItemIds = state.runtimeItemIdsByThread[threadId];
  if (!sourceItemIds?.length) return EMPTY_ACTIVE_SUB_AGENTS;
  const structuralVersion = state.runtimeStructuralVersionByThread?.[threadId] ?? 0;
  const cached = activeSubAgentCache.get(threadId);
  if (
    cached &&
    cached.sourceItemIds === sourceItemIds &&
    cached.structuralVersion === structuralVersion
  ) {
    return cached;
  }

  const items = state.runtimeItemsByIdByThread[threadId];
  const itemIds: string[] = [];
  let hasActiveNativeSubAgent = false;
  for (const id of sourceItemIds) {
    const item = items?.[id];
    if (!item) continue;
    const kind = classifyActiveSubAgent(item);
    if (!kind) continue;
    itemIds.push(id);
    if (kind === "native") hasActiveNativeSubAgent = true;
  }

  const result: ActiveSubAgentCacheEntry = {
    sourceItemIds,
    structuralVersion,
    itemIds: itemIds.length === 0 ? EMPTY_ACTIVE_SUB_AGENT_IDS : itemIds,
    hasActiveNativeSubAgent,
  };
  if (activeSubAgentCache.size > 200) activeSubAgentCache.clear();
  activeSubAgentCache.set(threadId, result);
  return result;
}

const activeNativeSubAgentThreadIdsCache = new WeakMap<
  readonly Thread[],
  {
    structuralVersions: AppStoreState["runtimeStructuralVersionByThread"];
    result: readonly string[];
  }
>();

export function selectActiveNativeSubAgentThreadIds(
  state: AppStoreState,
  threads: readonly Thread[],
): readonly string[] {
  const structuralVersions = state.runtimeStructuralVersionByThread;
  const cached = activeNativeSubAgentThreadIdsCache.get(threads);
  if (cached?.structuralVersions === structuralVersions) return cached.result;

  const result: string[] = [];
  for (const thread of threads) {
    if (selectThreadHasActiveNativeSubAgent(state, thread.id)) result.push(thread.id);
  }
  // Streaming replaces runtimeStructuralVersionByThread on every item event, so
  // the identity-keyed cache above misses continuously while a sub-agent runs.
  // Reuse the prior array when membership is unchanged (deterministic order —
  // threads are iterated identically) so consumers keep a stable reference and
  // the sidebar does not re-render/reallocate on every delta.
  let finalResult: readonly string[] = result.length === 0 ? EMPTY_ACTIVE_SUB_AGENT_IDS : result;
  if (
    cached &&
    cached.result.length === finalResult.length &&
    cached.result.every((id, i) => id === finalResult[i])
  ) {
    finalResult = cached.result;
  }
  activeNativeSubAgentThreadIdsCache.set(threads, {
    structuralVersions,
    result: finalResult,
  });
  return finalResult;
}

/**
 * Item ids of every currently-running sub-agent parent in the thread, in
 * chronological order. Drives the pinned `ActiveSubAgentTile` strip above the
 * composer. Cached by structural version so streaming deltas do not reallocate.
 */
export function selectActiveSubAgentParentItemIds(
  state: AppStoreState,
  threadId: string,
): readonly string[] {
  return selectActiveSubAgents(state, threadId).itemIds;
}

/** True while the thread has at least one native provider sub-agent still running. */
export function selectThreadHasActiveNativeSubAgent(
  state: AppStoreState,
  threadId: string,
): boolean {
  return selectActiveSubAgents(state, threadId).hasActiveNativeSubAgent;
}
