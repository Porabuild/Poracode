import type { AppStoreState } from "@/renderer/state/appStore";
import { useAppStore } from "@/renderer/state/appStore";
import { openThread } from "./threadActions";

/**
 * A captured cursor into the most-recently-viewed (MRU) chat order. The order is
 * frozen when a cycle begins so that repeatedly pressing the shortcut walks the
 * whole history instead of reshuffling it as each visited chat jumps back to the
 * front (which would just toggle between the two most-recent chats).
 */
export interface RecentCycleAnchor {
  /** Frozen MRU snapshot, most-recently-viewed first. */
  readonly order: readonly string[];
  /** Index into {@link order} of the chat the cursor currently points at. */
  readonly index: number;
}

export interface RecentCycleInput {
  /**
   * Candidate thread ids in MRU order (most-recent first), already filtered to
   * existing, non-archived chats the user has viewed this session.
   */
  readonly candidateOrder: readonly string[];
  /** The chat currently in focus, or null when none is (e.g. the home view). */
  readonly activeThreadId: string | null;
  /** The in-progress cycle's anchor, or null to begin a fresh cycle. */
  readonly anchor: RecentCycleAnchor | null;
  /** +1 = next (older in recency), -1 = previous (newer in recency). */
  readonly direction: 1 | -1;
}

export interface RecentCycleResult {
  /** The chat to switch to, or null when there is nothing to cycle to. */
  readonly targetThreadId: string | null;
  /** The anchor to remember for the next step (null clears the cycle). */
  readonly anchor: RecentCycleAnchor | null;
}

/**
 * Pure cursor math for cycling through recently-viewed chats. Continues an
 * in-progress cycle from its frozen order as long as the user hasn't navigated
 * away (the focused chat still matches the cursor) and every anchored chat still
 * exists; otherwise it starts a fresh cycle from the current MRU snapshot.
 */
export function computeRecentCycleTarget(input: RecentCycleInput): RecentCycleResult {
  const { candidateOrder, activeThreadId, anchor, direction } = input;

  if (
    anchor !== null &&
    anchor.order.length > 0 &&
    anchor.order[anchor.index] === activeThreadId &&
    anchor.order.every((id) => candidateOrder.includes(id))
  ) {
    const { order } = anchor;
    const nextIndex = (anchor.index + direction + order.length) % order.length;
    return { targetThreadId: order[nextIndex] ?? null, anchor: { order, index: nextIndex } };
  }

  if (candidateOrder.length === 0) return { targetThreadId: null, anchor: null };

  const current = activeThreadId ? candidateOrder.indexOf(activeThreadId) : -1;
  // No active chat (e.g. home view): "next" lands on the most-recent chat,
  // "previous" on the oldest. Otherwise step relative to the current chat.
  const nextIndex =
    current === -1
      ? direction === 1
        ? 0
        : candidateOrder.length - 1
      : (current + direction + candidateOrder.length) % candidateOrder.length;

  return {
    targetThreadId: candidateOrder[nextIndex] ?? null,
    anchor: { order: candidateOrder, index: nextIndex },
  };
}

/**
 * Ephemeral cursor for the in-progress recent-chat cycle. Lives in the module
 * (not the store) because it is pure UI navigation state with no need to persist
 * or trigger renders — it is read and rewritten only by {@link cycleRecentThread}.
 */
let recentCycleAnchor: RecentCycleAnchor | null = null;

/**
 * Existing, non-archived chats the user has viewed this session, ordered
 * most-recently-viewed first. Built from the ephemeral `lastViewedAtByThreadId`
 * map the thread lifecycle maintains for every visible pane.
 */
function buildRecentThreadOrder(state: AppStoreState): string[] {
  const viewedAt = state.lastViewedAtByThreadId;
  return state.threads
    .filter((thread) => !thread.archived && viewedAt[thread.id] !== undefined)
    .sort((a, b) => (viewedAt[b.id] ?? 0) - (viewedAt[a.id] ?? 0))
    .map((thread) => thread.id);
}

/**
 * The thread id of the focused pane (or the first pane), or null when not in a
 * thread view or the focused pane isn't a chat (e.g. a draft).
 */
function resolveActiveThreadId(state: AppStoreState): string | null {
  if (state.view.kind !== "thread") return null;
  const { panes } = state.view;
  const focused = state.focusedPaneId;
  const paneId = focused && panes.includes(focused) ? focused : panes[0];
  if (!paneId) return null;
  return state.threads.some((thread) => thread.id === paneId) ? paneId : null;
}

/**
 * Switch to the next (`+1`) or previous (`-1`) recently-viewed chat, MRU-style.
 * Backs the `thread.recent.next` / `thread.recent.previous` shortcuts (Ctrl+Tab /
 * Ctrl+Shift+Tab). The frozen-order cursor (see {@link computeRecentCycleTarget})
 * lets a run of presses walk the whole history rather than toggling between the
 * two most-recent chats.
 */
export function cycleRecentThread(direction: 1 | -1): void {
  const state = useAppStore.getState();
  const activeThreadId = resolveActiveThreadId(state);
  const { targetThreadId, anchor } = computeRecentCycleTarget({
    candidateOrder: buildRecentThreadOrder(state),
    activeThreadId,
    anchor: recentCycleAnchor,
    direction,
  });
  recentCycleAnchor = anchor;
  if (targetThreadId && targetThreadId !== activeThreadId) openThread(targetThreadId);
}
