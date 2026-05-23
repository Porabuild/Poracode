import type { ErrorItemPayload } from "@/shared/contracts";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";

export interface ThreadErrorDockState {
  sourceItemId: string;
  message: string;
}

export function selectThreadErrorDockState(
  state: AppStoreState,
  threadId: string,
): ThreadErrorDockState | null {
  const item = selectThreadLatestErrorItem(state, threadId);
  return item ? getThreadErrorDockStateForItem(item) : null;
}

export function selectThreadLatestErrorItem(
  state: AppStoreState,
  threadId: string,
): RuntimeChatItem | null {
  const itemIds = state.runtimeItemIdsByThread[threadId];
  if (!itemIds?.length) return null;
  const itemsById = state.runtimeItemsByIdByThread[threadId];
  // Walk newest → oldest. If we hit a user_message before any error, the user
  // has already retried since the last error, so suppress the dock.
  for (let index = itemIds.length - 1; index >= 0; index -= 1) {
    const item = itemsById?.[itemIds[index]!];
    if (!item) continue;
    if (item.type === "user_message") return null;
    if (item.type === "error" && getThreadErrorDockStateForItem(item)) return item;
  }
  return null;
}

export function getThreadErrorDockStateForItem(item: RuntimeChatItem): ThreadErrorDockState | null {
  if (item.type !== "error") return null;
  const payload = getRuntimeItemPayload<ErrorItemPayload>(item, "error");
  const message = payload?.message?.trim();
  if (!message) return null;
  if (isAbortOnlyErrorMessage(message)) return null;
  return { sourceItemId: item.id, message };
}

function isAbortOnlyErrorMessage(message: string): boolean {
  return /^(?:error:\s*)?(?:aborterror:\s*)?aborted\.?$/i.test(message.trim());
}
