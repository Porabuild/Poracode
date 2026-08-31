import type { GoalItemPayload, GoalStatus } from "@/shared/contracts";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";
import { currentProviderItemStart } from "./threadProviderEra";

export interface ThreadGoalDockState {
  sourceItemId: string;
  itemState: RuntimeChatItem["state"];
  objective: string;
  status: GoalStatus;
  action: GoalItemPayload["action"];
  availableActions?: GoalItemPayload["availableActions"];
  tokenBudget?: number | null;
  tokensUsed?: number;
  timeUsedSeconds?: number;
  iterations?: number;
  lastReason?: string;
  updatedAt?: number;
}

interface ThreadGoalCandidate {
  item: RuntimeChatItem;
  payload: GoalItemPayload;
}

const goalDockStateCache = new Map<
  string,
  {
    itemIds: readonly string[] | undefined;
    latestGoalItem: RuntimeChatItem | undefined;
    result: ThreadGoalDockState | null;
  }
>();

export function selectThreadGoalDockState(
  state: AppStoreState,
  threadId: string,
): ThreadGoalDockState | null {
  const itemIds = state.runtimeItemIdsByThread[threadId];
  const itemsById = state.runtimeItemsByIdByThread[threadId];
  const latestGoalItem = selectLatestThreadGoalItem(itemIds, itemsById);
  const cached = goalDockStateCache.get(threadId);
  if (cached && cached.itemIds === itemIds && cached.latestGoalItem === latestGoalItem) {
    return cached.result;
  }
  const result = getThreadGoalDockStateFromThreadItems(itemIds, itemsById);
  if (goalDockStateCache.size > 200) goalDockStateCache.clear();
  goalDockStateCache.set(threadId, { itemIds, latestGoalItem, result });
  return result;
}

export function selectThreadGoalDockItem(
  state: AppStoreState,
  threadId: string,
): RuntimeChatItem | null {
  // Reuse the dock-state cache so non-goal streaming deltas skip a full scan.
  const dockState = selectThreadGoalDockState(state, threadId);
  if (!dockState) return null;
  return state.runtimeItemsByIdByThread[threadId]?.[dockState.sourceItemId] ?? null;
}

export function getThreadGoalDockStateFromThreadItems(
  itemIds: readonly string[] | undefined,
  itemsById: AppStoreState["runtimeItemsByIdByThread"][string] | undefined,
): ThreadGoalDockState | null {
  const latest = selectLatestThreadGoalCandidate(itemIds, itemsById);
  if (!latest) return null;

  const { item, payload } = latest;
  if (payload.action === "cleared") return null;

  const objective = normalizeObjective(payload.objective);
  if (!objective) return null;

  return {
    sourceItemId: item.id,
    itemState: item.state,
    objective,
    status: payload.status ?? "active",
    action: payload.action,
    ...(payload.availableActions ? { availableActions: payload.availableActions } : {}),
    ...(payload.tokenBudget !== undefined ? { tokenBudget: payload.tokenBudget } : {}),
    ...(payload.tokensUsed !== undefined ? { tokensUsed: payload.tokensUsed } : {}),
    ...(payload.timeUsedSeconds !== undefined ? { timeUsedSeconds: payload.timeUsedSeconds } : {}),
    ...(payload.iterations !== undefined ? { iterations: payload.iterations } : {}),
    ...(payload.lastReason ? { lastReason: payload.lastReason } : {}),
    ...(payload.updatedAt !== undefined ? { updatedAt: payload.updatedAt } : {}),
  };
}

function selectLatestThreadGoalCandidate(
  itemIds: readonly string[] | undefined,
  itemsById: AppStoreState["runtimeItemsByIdByThread"][string] | undefined,
): ThreadGoalCandidate | null {
  if (!itemIds?.length) return null;
  // A goal above the last handoff divider belongs to the previous provider.
  const start = currentProviderItemStart(itemIds, itemsById);
  for (let index = itemIds.length - 1; index >= start; index -= 1) {
    const item = itemsById?.[itemIds[index]!];
    if (!item || item.type !== "goal") continue;
    const payload = getRuntimeItemPayload<GoalItemPayload>(item, "goal");
    if (!payload) continue;
    return { item, payload };
  }
  return null;
}

function selectLatestThreadGoalItem(
  itemIds: readonly string[] | undefined,
  itemsById: AppStoreState["runtimeItemsByIdByThread"][string] | undefined,
): RuntimeChatItem | undefined {
  if (!itemIds?.length) return undefined;
  const start = currentProviderItemStart(itemIds, itemsById);
  for (let index = itemIds.length - 1; index >= start; index -= 1) {
    const item = itemsById?.[itemIds[index]!];
    if (item?.type === "goal") return item;
  }
  return undefined;
}

function normalizeObjective(objective: string | undefined): string {
  return (objective ?? "").replace(/\s+/g, " ").trim();
}
