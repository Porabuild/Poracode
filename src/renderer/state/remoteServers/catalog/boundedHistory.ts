import type { RemoteThreadSnapshot } from "@/shared/remote";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { mergeCompletedTurns } from "@/renderer/state/slices/runtimeEventReducer";
import type { CompletedTurnRecord } from "@/renderer/state/slices/runtimeEventSlice";
import {
  __resetBoundedHistoryRegistryForTest,
  advanceBoundedHistoryTailCursor,
  boundedClientInvoker,
  managedRootHistoryClient,
  readBoundedHistoryTail,
} from "./boundedHistoryRegistry";

/**
 * B4 bounded-history continuation ownership (W1, renderer).
 *
 * The bounded history read returns a tail plus `completedTurnsNextCursor`. This
 * module turns that into UI behavior:
 *
 * - the tail install merges with already-loaded older turns instead of
 *   dropping them (lossless union by `(startedAt, endedAt)`, the same window
 *   key the DB append dedupe uses);
 * - the ChatPane's "load older" gesture continues the completed-turn level
 *   through `boundedThreadTurns` (route `limit`, never `completedTurnsLimit`).
 *
 * The cursor/proof registry itself lives in `boundedHistoryRegistry.ts` (no
 * app-store imports) so the procedure router and browser bridge can use it
 * without a module cycle.
 */

export const BOUNDED_HISTORY_TAIL_PAGE_LIMIT = 200;

export {
  configureBoundedHistoryClient,
  configureBoundedHistoryManagedRootClient,
  forgetBoundedHistoryForServer,
  forgetBoundedHistoryThread,
  forgetBoundedHistoryThreadByViewId,
  invokeBoundedRuntimeItemsPage,
  invokeManagedRootRuntimeItemsPage,
  managedRootHistoryClient,
  recordBoundedHistoryTail,
  recordManagedRootBoundedHistoryTail,
  type BoundedHistoryTail,
  type ManagedRootHistoryClientSnapshot,
} from "./boundedHistoryRegistry";

export function __resetBoundedHistoryForTest(): void {
  __resetBoundedHistoryRegistryForTest();
}

export function toCompletedTurnRecords(
  turns: RemoteThreadSnapshot["completedTurns"],
): CompletedTurnRecord[] {
  return turns.flatMap((turn) => {
    const startedAt = new Date(turn.startedAt).getTime();
    const endedAt = new Date(turn.endedAt).getTime();
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return [];
    return [{ startedAt, endedAt, anchorItemId: turn.anchorItemId }];
  });
}

/**
 * Lossless tail install: when the page carries an older-turn cursor, the
 * incoming newest `completedTurnsLimit` turns replace the tail while
 * previously loaded older turns survive. A complete tail (cursor `null`)
 * keeps the existing replacement semantics, so reverted turns can still be
 * dropped.
 */
export function mergeBoundedTailTurns(
  snapshot: RemoteThreadSnapshot,
  viewThreadId: string,
): RemoteThreadSnapshot {
  if (
    snapshot.completedTurnsNextCursor === null ||
    snapshot.completedTurnsNextCursor === undefined
  ) {
    return snapshot;
  }
  const existing = useAppStore.getState().runtimeCompletedTurnsByThread[viewThreadId] ?? [];
  if (existing.length === 0) return snapshot;
  const incoming = toCompletedTurnRecords(snapshot.completedTurns);
  const merged = mergeCompletedTurns(existing, incoming);
  if (merged === existing || merged.length === incoming.length) return snapshot;
  return {
    ...snapshot,
    completedTurns: merged.map((turn) => ({
      startedAt: new Date(turn.startedAt).toISOString(),
      endedAt: new Date(turn.endedAt).toISOString(),
      anchorItemId: turn.anchorItemId,
    })),
  };
}

/**
 * One `ct1.` older-turn page. Returns true when older turns remain. The merged
 * level keeps every record ever loaded for the thread (lossless across tail
 * refreshes and continuation pages).
 *
 * One engine for both connection kinds: a projected remote tail continues
 * through the remote store's client, a managed-root tail through the ONE
 * managed loopback client (same route, same cursor, same merge).
 */
export async function loadOlderBoundedCompletedTurns(viewThreadId: string): Promise<boolean> {
  const tail = readBoundedHistoryTail(viewThreadId);
  if (!tail || tail.cursor === null) return false;
  const cursor = tail.cursor;
  const applyPage = async (client: RemoteDesktopClient): Promise<boolean> => {
    const page = await client.boundedThreadTurns({
      threadId: tail.threadId,
      cursor,
      limit: BOUNDED_HISTORY_TAIL_PAGE_LIMIT,
      maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
      maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
    });
    // Fence: a truncate/reset/re-open while this page was in flight replaced or
    // dropped the tail. Advancing the captured entry's cursor and merging its
    // rows would append stale history to the replacement transcript.
    if (!advanceBoundedHistoryTailCursor(viewThreadId, tail, page.completedTurnsNextCursor)) {
      return false;
    }
    const incoming = toCompletedTurnRecords(page.turns);
    useAppStore.setState((state) => {
      const existing = state.runtimeCompletedTurnsByThread[viewThreadId] ?? [];
      const merged = mergeCompletedTurns(existing, incoming);
      if (merged === existing) return {};
      return {
        runtimeCompletedTurnsByThread: {
          ...state.runtimeCompletedTurnsByThread,
          [viewThreadId]: merged,
        },
      };
    });
    return page.completedTurnsNextCursor !== null;
  };
  if (tail.connectionKind === "managed-root") {
    const managed = managedRootHistoryClient();
    if (!managed) return false;
    return applyPage(managed.client);
  }
  const invoke = boundedClientInvoker();
  if (!invoke) return false;
  return invoke(tail.desktopId, applyPage);
}

/**
 * Back-compat alias of {@link loadOlderBoundedCompletedTurns} for the remote
 * continuation registration; kept so existing remote-only callers/tests read
 * unchanged while the implementation dispatches by tail connection kind.
 */
export const loadOlderRemoteCompletedTurns = loadOlderBoundedCompletedTurns;
