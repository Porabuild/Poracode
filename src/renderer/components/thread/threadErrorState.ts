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

const EMPTY_ERROR_DOCK_STATES: ThreadErrorDockState[] = [];

const errorDockStatesCache = new Map<
  string,
  {
    itemIds: readonly string[] | undefined;
    result: ThreadErrorDockState[];
  }
>();

const errorDockStateByItem = new WeakMap<RuntimeChatItem, ThreadErrorDockState>();

/** Errors since the latest user message, oldest → newest (composer order). */
export function selectThreadErrorDockStates(
  state: AppStoreState,
  threadId: string,
): ThreadErrorDockState[] {
  const itemIds = state.runtimeItemIdsByThread[threadId];
  const cached = errorDockStatesCache.get(threadId);
  if (cached && cached.itemIds === itemIds) {
    return cached.result;
  }

  if (!itemIds?.length) {
    errorDockStatesCache.set(threadId, { itemIds, result: EMPTY_ERROR_DOCK_STATES });
    return EMPTY_ERROR_DOCK_STATES;
  }

  const itemsById = state.runtimeItemsByIdByThread[threadId];
  const sinceLastUser: ThreadErrorDockState[] = [];
  for (let index = itemIds.length - 1; index >= 0; index -= 1) {
    const item = itemsById?.[itemIds[index]!];
    if (!item) continue;
    if (item.type === "user_message") break;
    const dock = item.type === "error" ? getThreadErrorDockStateForItem(item) : null;
    if (dock) sinceLastUser.push(dock);
  }
  const result = sinceLastUser.length === 0 ? EMPTY_ERROR_DOCK_STATES : sinceLastUser.reverse();
  errorDockStatesCache.set(threadId, { itemIds, result });
  return result;
}

export function getThreadErrorDockStateForItem(item: RuntimeChatItem): ThreadErrorDockState | null {
  if (item.type !== "error") return null;
  const payload = getRuntimeItemPayload<ErrorItemPayload>(item, "error");
  const message = payload?.message?.trim();
  if (!message) return null;
  if (isAbortOnlyErrorMessage(message)) return null;
  const cached = errorDockStateByItem.get(item);
  if (cached && cached.message === message) return cached;
  const dock = { sourceItemId: item.id, message };
  errorDockStateByItem.set(item, dock);
  return dock;
}

function isAbortOnlyErrorMessage(message: string): boolean {
  return /^(?:error:\s*)?(?:aborterror:\s*)?aborted\.?$/i.test(message.trim());
}

/**
 * Heuristic for runtime errors that indicate the agent is unauthenticated.
 * Covers strings emitted by the Claude binary ("Failed to authenticate. API
 * Error: 401 …", "Please run /login", "Session expired …") and the
 * Anthropic-SDK error codes the agent SDK surfaces ("authentication_failed",
 * "oauth_org_not_allowed"). When this returns true, the composer should
 * render the auth-required dock (with its Login button) rather than the
 * generic error dock — `/login` itself isn't reachable through the SDK
 * transport, so the user needs the terminal-login affordance.
 */
export function isAuthErrorMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to authenticate") ||
    m.includes("invalid authentication credentials") ||
    m.includes("api error: 401") ||
    m.includes("please run /login") ||
    m.includes("session expired") ||
    m.includes("authentication_failed") ||
    m.includes("oauth_org_not_allowed") ||
    /\bnot logged in\b/.test(m)
  );
}
