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
