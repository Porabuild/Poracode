import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { useAppStore } from "@/renderer/state/appStore";
import { loadOlderThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";

/**
 * Pages older history in until the thread's store holds `itemId`, reusing the
 * canonical fenced paging. Resolves false when history is exhausted first, or
 * when `isCurrent` turns false (the caller moved on); cancelling never changes
 * saved history. This is the legacy fallback for a host that cannot supply a
 * positioned, item-centered read.
 */
export async function loadRuntimeItemThroughHistory(
  threadId: string,
  itemId: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  const isLoaded = () => !!useAppStore.getState().runtimeItemsByIdByThread[threadId]?.[itemId];
  while (isCurrent() && !isLoaded()) {
    if (!(await loadOlderThreadRuntimeItems(threadId))) break;
  }
  return isCurrent() && isLoaded();
}

/** Neighbors on each side of the exact match in the one bounded read. */
export const CONVERSATION_MATCH_WINDOW = 8;
/** Raw-row limit for one item-centered window (positions `p±WINDOW`). */
export const CONVERSATION_MATCH_WINDOW_LIMIT = 2 * CONVERSATION_MATCH_WINDOW + 1;

/** One exact located item plus its contiguous, item-centered history window. */
export interface ConversationSearchFocus {
  readonly threadId: string;
  readonly itemId: string;
  /** Oldest → newest, contiguous, and containing `itemId`. */
  readonly items: readonly PersistedRuntimeItem[];
  /** False when neighbors could not be obtained (exact item shown alone). */
  readonly neighbors: boolean;
}

export type ConversationMatchLocation =
  | ({ readonly kind: "focused" } & ConversationSearchFocus)
  | { readonly kind: "legacy" }
  | { readonly kind: "unavailable" };

/** Injected read legs so the location logic is deterministic and cancellable. */
export interface ConversationMatchReaders {
  readLocatedItem(signal?: AbortSignal): Promise<{ item: PersistedRuntimeItem; position?: number }>;
  readWindow(
    beforePosition: number,
    signal?: AbortSignal,
  ): Promise<readonly PersistedRuntimeItem[] | undefined>;
}

/** Resolve the owning host lazily so this module stays light and testable. */
async function defaultConversationMatchReaders(
  threadId: string,
  itemId: string,
): Promise<ConversationMatchReaders> {
  const { createConversationSearchMatchReaders } = await import("./conversationSearchMatchReaders");
  return createConversationSearchMatchReaders(threadId, itemId);
}

/**
 * Locate a deep, unloaded conversation match with one exact item read plus one
 * bounded, item-centered window read, instead of paging every intervening page.
 *
 * - The exact item and its `position` come from the same authorized, fenced
 *   item-detail route as ordinary deferred bodies.
 * - `position` drives one fenced `beforePosition` bounded-items read.
 * - A host with no `position` (older response) yields `legacy`, so the caller
 *   keeps canonical bounded paging; a failed positioned read does the same.
 * - Neighbors are shown only when the window is contiguous AND contains the
 *   exact item; otherwise the exact item is shown alone (never a discontinuous
 *   set spliced onto the live tail). The persisted transcript is never mutated.
 * - Every await is re-fenced through `isCurrent()` and `signal`, so a host,
 *   session, thread or scope switch never attributes a stale result.
 */
export async function locateConversationSearchMatch(
  threadId: string,
  itemId: string,
  isCurrent: () => boolean,
  signal?: AbortSignal,
  readers?: ConversationMatchReaders,
): Promise<ConversationMatchLocation> {
  const use = readers ?? (await defaultConversationMatchReaders(threadId, itemId));
  let located: { item: PersistedRuntimeItem; position?: number };
  try {
    located = await use.readLocatedItem(signal);
  } catch {
    return { kind: "legacy" };
  }
  if (!isCurrent() || signal?.aborted) return { kind: "unavailable" };
  const { item, position } = located;
  if (position === undefined) return { kind: "legacy" };

  let windowItems: readonly PersistedRuntimeItem[] | undefined;
  try {
    windowItems = await use.readWindow(position + CONVERSATION_MATCH_WINDOW + 1, signal);
  } catch {
    windowItems = undefined;
  }
  if (!isCurrent() || signal?.aborted) return { kind: "unavailable" };

  const contiguous =
    windowItems && windowItems.some((entry) => entry.id === itemId) ? windowItems : undefined;
  return {
    kind: "focused",
    threadId,
    itemId,
    items: contiguous ?? [item],
    neighbors: contiguous !== undefined,
  };
}
