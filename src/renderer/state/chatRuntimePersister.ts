import type { ToolCallPayload } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import { isDelegatedAgentTool } from "@/shared/toolCallClassification";
import { captureRendererException } from "../diagnostics/sentry";
import { imageViewRendersInline } from "../components/thread/ChatPane/parts/items/imageViewSource";
import { clearRuntimeItemStoreSelectorCacheForThread } from "../components/thread/ChatPane/chatPaneSelectors";
import { readBridge } from "../bridge";
import { hasClientCapability } from "../clientRuntime";
import { useAppStore } from "./appStore";
import {
  isManagedRootHistoryThread,
  isManagedRootThreadAbsentError,
  loadManagedRootRuntimeItemsPage,
  noteManagedRootHistoryFailure,
  readManagedRootHistoryPage,
} from "./managedRootCatalog/rootHistory";
import { toCompletedTurnRecords } from "./remoteServers/catalog/boundedHistory";
import {
  toRuntimeChatItem,
  type CompletedTurnRecord,
  type RuntimeChatItem,
} from "./slices/runtimeEventSlice";

const RUNTIME_PAGE_SCAN_SIZE = 500;
const RUNTIME_TIMELINE_PAGE_SIZE = 40;
const MAX_CACHED_THREAD_TRANSCRIPTS = 10;
const MAX_CACHED_THREAD_RUNTIME_ITEMS = 5_000;
/**
 * BEHAVIOR CHANGE (Gate 4 Batch 1, bounded visible window): a LIVE thread
 * (retained by an open ChatPane) previously grew its in-memory transcript
 * without bound — `MAX_CACHED_THREAD_RUNTIME_ITEMS` only evicts INACTIVE
 * threads, so an open thread streaming for hours accumulated every item. The
 * visible window below bounds that live growth by estimated bytes while the
 * DB (and the existing older-page cursor) remains the durable source.
 */
/** Byte budget for the most recent history kept visible of a live thread. */
const VISIBLE_WINDOW_TAIL_BYTES = 6 * 1024 * 1024;
/** Byte budget of explicitly user-paged history kept pinned at the front. */
const VISIBLE_WINDOW_PAGED_PROTECTED_BYTES = 2 * 1024 * 1024;
/** Minimum new items between window passes; bounds the pass frequency. */
const WINDOW_BOUND_MIN_GROWTH_ITEMS = 400;
/** A full re-measure + trim pass runs at most this often per thread. */
const WINDOW_BOUND_PASS_INTERVAL_MS = 5_000;
/** Hard cap on retained completed-turn records (anchor metadata is small but unbounded). */
const MAX_CACHED_COMPLETED_TURN_RECORDS = 500;

const hydratedThreadRuntimeIds = new Set<string>();
const pendingThreadRuntimeHydrations = new Map<string, Promise<boolean>>();
const olderRuntimePageCursorByThread = new Map<string, number | null>();
const pendingOlderRuntimePages = new Map<
  string,
  { cancelled: boolean; readonly promise: Promise<boolean> }
>();
const retainedThreadRuntimeCounts = new Map<string, number>();
const inactiveThreadRuntimeLru = new Set<string>();

/**
 * Per-thread byte ledger for the bounded visible window. Sizes are UTF-16
 * length estimates (JSON payload + stream buckets), not exact UTF-8 bytes —
 * they bound memory, they do not bill bytes. All state is session-local and
 * never persisted, so no storage version participates.
 */
interface ThreadWindowLedger {
  bytesByItemId: Map<string, number>;
  measuredBytes: number;
  measuredCount: number;
  pagedProtectedIds: Set<string>;
  pagedProtectedOrder: string[];
  pagedProtectedBytes: number;
  lastPassAtMs: number;
}

const threadWindowLedgers = new Map<string, ThreadWindowLedger>();

/**
 * Reconcile options for DB hydration paths. Against the local backend the
 * same-build host settles orphaned Crossagent rows itself at boot and on
 * every supervisor reset, so a running Crossagent row in that database is a
 * live run of the currently attached supervisor — terminating it at
 * hydration is exactly the false "Failed" the reconcile exists to prevent,
 * so such rows are preserved outright. Non-local sources (remote hosts,
 * which may predate the sweep) keep the terminate-and-self-heal behavior:
 * an orphaned row there is settled by nothing, and a live one recovers on
 * its next progress frame.
 */
function hydrationReconcileOptions(): { preserveObservedLive: true; preserveCrossagent?: boolean } {
  return hasClientCapability("localBackend")
    ? { preserveObservedLive: true, preserveCrossagent: true }
    : { preserveObservedLive: true };
}

function estimateRuntimeItemBytes(item: RuntimeChatItem | undefined): number {
  if (!item) return 0;
  // id/type/state fields plus per-item object overhead approximation.
  let bytes = 96;
  if (item.payload !== undefined) {
    try {
      bytes += JSON.stringify(item.payload)?.length ?? 0;
    } catch {
      // A non-serializable payload still occupies memory; charge a page.
      bytes += 1024;
    }
  }
  for (const value of Object.values(item.streams)) bytes += value.length;
  return bytes;
}

function getThreadWindowLedger(threadId: string): ThreadWindowLedger {
  let ledger = threadWindowLedgers.get(threadId);
  if (!ledger) {
    ledger = {
      bytesByItemId: new Map(),
      measuredBytes: 0,
      measuredCount: 0,
      pagedProtectedIds: new Set(),
      pagedProtectedOrder: [],
      pagedProtectedBytes: 0,
      lastPassAtMs: 0,
    };
    threadWindowLedgers.set(threadId, ledger);
  }
  return ledger;
}

function forgetThreadWindowLedger(threadId: string): void {
  threadWindowLedgers.delete(threadId);
}

/**
 * Registers explicitly user-paged items (an `loadOlderThreadRuntimeItems`
 * prepend) as protected window history so the bound cannot discard the page
 * the user just scrolled to. Protection is FIFO-capped at
 * {@link VISIBLE_WINDOW_PAGED_PROTECTED_BYTES}: the OLDEST paged history
 * loses protection first, so a reader who pages deep keeps their recent
 * pages and the total stays bounded.
 */
function markRuntimeItemsPaged(threadId: string, items: readonly RuntimeChatItem[]): void {
  if (items.length === 0) return;
  const ledger = getThreadWindowLedger(threadId);
  for (const item of items) {
    if (ledger.pagedProtectedIds.has(item.id)) continue;
    ledger.pagedProtectedIds.add(item.id);
    ledger.pagedProtectedOrder.push(item.id);
    ledger.pagedProtectedBytes += estimateRuntimeItemBytes(item);
  }
  while (
    ledger.pagedProtectedBytes > VISIBLE_WINDOW_PAGED_PROTECTED_BYTES &&
    ledger.pagedProtectedOrder.length > 0
  ) {
    const oldest = ledger.pagedProtectedOrder.shift()!;
    const bytes = ledger.bytesByItemId.get(oldest) ?? 0;
    if (ledger.pagedProtectedIds.delete(oldest)) ledger.pagedProtectedBytes -= bytes;
  }
}

/**
 * Bounds the visible window of LIVE (retained) threads to
 * {@link VISIBLE_WINDOW_TAIL_BYTES} of recent history plus the protected
 * paged prefix. Trimming removes a middle range — everything between the
 * protected prefix and the recent tail — and drops completed-turn records
 * anchored in the trimmed range. The DB keeps every row and remains
 * authoritative, but NOTE: the trimmed middle is NOT lazily restorable in
 * this session — the older-page cursor only pages strictly older than the
 * last page boundary, while the trimmed middle sits at newer DB positions,
 * and hydration early-returns while the thread stays cached. The gap is
 * closed on the next real rehydration (thread leaves the 10-thread LRU or
 * the app restarts).
 *
 * Passes are gated (≥ 400 new items or ≥ 5 s since the last pass) so the
 * re-measure walk stays amortized; between passes at most the gated growth
 * is unbounded, which is itself bounded by the drain cadence.
 */
export function boundVisibleThreadRuntimeWindows(threadIds: readonly string[]): void {
  for (const threadId of threadIds) {
    const state = useAppStore.getState();
    const itemIds = state.runtimeItemIdsByThread[threadId];
    if (!itemIds) {
      forgetThreadWindowLedger(threadId);
      continue;
    }
    const ledger = getThreadWindowLedger(threadId);
    const nowMs = Date.now();
    if (
      nowMs - ledger.lastPassAtMs < WINDOW_BOUND_PASS_INTERVAL_MS &&
      itemIds.length - ledger.measuredCount < WINDOW_BOUND_MIN_GROWTH_ITEMS
    ) {
      continue;
    }
    ledger.lastPassAtMs = nowMs;

    // Full re-measure: streaming deltas mutate EXISTING items, so byte sizes
    // go stale without a fresh walk. Cost is proportional to the visible
    // window (a few MB stringify), amortized by the pass gate.
    const itemsById = state.runtimeItemsByIdByThread[threadId] ?? {};
    const bytesByItemId = new Map<string, number>();
    let measuredBytes = 0;
    for (const id of itemIds) {
      const bytes = estimateRuntimeItemBytes(itemsById[id]);
      bytesByItemId.set(id, bytes);
      measuredBytes += bytes;
    }
    ledger.bytesByItemId = bytesByItemId;
    ledger.measuredBytes = measuredBytes;
    ledger.measuredCount = itemIds.length;

    // Protected contiguous prefix: explicitly paged history (byte-capped at
    // registration) plus pinned goal rows, which must stay visible because
    // the composer dock reads them.
    let protectedEnd = 0;
    while (protectedEnd < itemIds.length) {
      const id = itemIds[protectedEnd]!;
      if (!ledger.pagedProtectedIds.has(id) && itemsById[id]?.type !== "goal") break;
      protectedEnd += 1;
    }

    // Recent tail: walk backwards until the byte budget is spent. The newest
    // item is always kept even when it alone exceeds the budget. Goal rows
    // and live non-completed rows are unbreakable: the composer dock reads
    // in-memory goals wherever they sit (a mid-session goal drifts backward
    // as newer payload arrives), and trimming a still-streaming row would
    // silently drop its remaining events for the whole session (the reducer
    // no-ops updates for absent ids).
    let tailStart = itemIds.length;
    let tailBytes = 0;
    for (let index = itemIds.length - 1; index >= protectedEnd; index -= 1) {
      const id = itemIds[index]!;
      const item = itemsById[id];
      const unbreakable = item?.type === "goal" || (item != null && item.state !== "completed");
      const bytes = bytesByItemId.get(id) ?? 0;
      if (
        index < itemIds.length - 1 &&
        !unbreakable &&
        tailBytes + bytes > VISIBLE_WINDOW_TAIL_BYTES
      )
        break;
      tailBytes += bytes;
      tailStart = index;
    }

    const trimCount = tailStart - protectedEnd;
    if (measuredBytes > VISIBLE_WINDOW_TAIL_BYTES + ledger.pagedProtectedBytes && trimCount > 0) {
      const removedIds = itemIds.slice(protectedEnd, tailStart);
      useAppStore.getState().trimThreadRuntimeItems(threadId, protectedEnd, trimCount);
      for (const id of removedIds) {
        const removedBytes = bytesByItemId.get(id) ?? 0;
        ledger.measuredBytes -= removedBytes;
        bytesByItemId.delete(id);
        if (ledger.pagedProtectedIds.has(id)) {
          // Defensive: a trimmed paged row must not keep its protection charge.
          ledger.pagedProtectedIds.delete(id);
          ledger.pagedProtectedBytes = Math.max(0, ledger.pagedProtectedBytes - removedBytes);
        }
      }
      ledger.measuredCount = itemIds.length - trimCount;
      // Trimmed rows void the selector memo caches the same way evictions do.
      clearRuntimeItemStoreSelectorCacheForThread(threadId);
      boundThreadCompletedTurns(threadId, new Set(removedIds));
    } else {
      boundThreadCompletedTurns(threadId, null);
    }
  }
}

/** Drops turn records anchored in trimmed ranges and enforces the record cap. */
function boundThreadCompletedTurns(threadId: string, removedIds: ReadonlySet<string> | null): void {
  const turns = useAppStore.getState().runtimeCompletedTurnsByThread[threadId];
  if (!turns || turns.length === 0) return;
  let kept = removedIds
    ? turns.filter((turn) => !turn.anchorItemId || !removedIds.has(turn.anchorItemId))
    : turns;
  if (kept.length > MAX_CACHED_COMPLETED_TURN_RECORDS) {
    kept = kept.slice(-MAX_CACHED_COMPLETED_TURN_RECORDS);
  }
  if (kept !== turns) useAppStore.getState().replaceThreadCompletedTurns(threadId, kept);
}

/**
 * Seed the older-page cursor when a remote thread snapshot supplies its tail.
 * A remote snapshot is already the thread's authoritative hydration, so mark
 * it hydrated before ChatPane mounts; otherwise the PWA bridge's intentional
 * empty initial-DB response would overwrite this cursor with `null`.
 *
 * Preserve a cursor that has already moved farther back only when the caller
 * confirms the refreshed tail overlaps the transcript currently in memory.
 * A disjoint authoritative tail replaced that transcript, so its cursor must
 * replace the old one as well or pagination skips the missing middle pages.
 */
export function seedOlderThreadRuntimeItemsCursor(
  threadId: string,
  cursor: number | null,
  options: { readonly preserveExistingCursor?: boolean } = {},
): void {
  const currentCursor = olderRuntimePageCursorByThread.get(threadId);
  if (
    options.preserveExistingCursor !== true ||
    (cursor === null && currentCursor !== undefined && currentCursor !== null)
  )
    cancelPendingOlderRuntimePage(threadId);
  hydratedThreadRuntimeIds.add(threadId);
  if (options.preserveExistingCursor !== true || currentCursor === undefined || cursor === null) {
    olderRuntimePageCursorByThread.set(threadId, cursor);
    return;
  }
  if (currentCursor === null) return;
  olderRuntimePageCursorByThread.set(threadId, Math.min(currentCursor, cursor));
}

export function runtimePageOverlapsExistingTranscript(
  runtimeItems: readonly Pick<PersistedRuntimeItem, "id" | "type">[],
  existingItemIds: readonly string[],
): boolean {
  const existingIds = new Set(existingItemIds);
  return runtimeItems.some((item) => item.type !== "goal" && existingIds.has(item.id));
}

export function hasHydratedThreadRuntimeItems(threadId: string): boolean {
  return hydratedThreadRuntimeIds.has(threadId);
}

/**
 * Optional older-history continuation for threads whose transcript is not fed
 * by the local DB (remote/pairing surfaces register one). Invoked alongside
 * the local older-items load, so reaching the top of a remote transcript also
 * continues any non-item older level (B4 `ct1.` completed turns).
 */
export type OlderThreadHistoryContinuation = (threadId: string) => Promise<boolean> | boolean;

let olderThreadHistoryContinuation: OlderThreadHistoryContinuation | null = null;

export function setOlderThreadHistoryContinuation(
  continuation: OlderThreadHistoryContinuation | null,
): void {
  olderThreadHistoryContinuation = continuation;
}

/**
 * Optional invalidation for a thread's non-item older-history continuation
 * (remote/pairing surfaces register one). Called when the local timeline is
 * reset or evicted so a continuation cursor into the replaced transcript
 * cannot survive and append stale older history.
 */
export type OlderThreadHistoryInvalidation = (threadId: string) => void;

let olderThreadHistoryInvalidation: OlderThreadHistoryInvalidation | null = null;

export function setOlderThreadHistoryInvalidation(
  invalidation: OlderThreadHistoryInvalidation | null,
): void {
  olderThreadHistoryInvalidation = invalidation;
}

export function retainThreadRuntimeItems(threadId: string): void {
  retainedThreadRuntimeCounts.set(threadId, (retainedThreadRuntimeCounts.get(threadId) ?? 0) + 1);
  inactiveThreadRuntimeLru.delete(threadId);
}

export function releaseThreadRuntimeItems(threadId: string): void {
  const nextCount = (retainedThreadRuntimeCounts.get(threadId) ?? 1) - 1;
  if (nextCount > 0) {
    retainedThreadRuntimeCounts.set(threadId, nextCount);
    return;
  }
  retainedThreadRuntimeCounts.delete(threadId);
  inactiveThreadRuntimeLru.delete(threadId);
  inactiveThreadRuntimeLru.add(threadId);
  evictOversizedInactiveThreadRuntimeItems([threadId]);
  evictInactiveThreadRuntimeItems();
}

export async function loadOlderThreadRuntimeItems(threadId: string): Promise<boolean> {
  // A registered continuation may extend a different older-history level
  // (remote completed turns) even when this thread has no older item cursor.
  const historyContinuation = olderThreadHistoryContinuation;
  if (historyContinuation) {
    void Promise.resolve(historyContinuation(threadId)).catch(() => false);
  }
  const cursor = olderRuntimePageCursorByThread.get(threadId);
  if (cursor === undefined || cursor === null) return false;
  const pending = pendingOlderRuntimePages.get(threadId);
  if (pending && !pending.cancelled) return pending.promise;

  const request = { cancelled: false, promise: Promise.resolve(false) };
  const load = (async () => {
    const managedRootPage = isManagedRootHistoryThread(threadId);
    const page = managedRootPage
      ? await loadManagedRootRuntimeItemsPage({
          threadId,
          beforePosition: cursor,
          limit: RUNTIME_PAGE_SCAN_SIZE,
          targetTimelineEntryCount: RUNTIME_TIMELINE_PAGE_SIZE,
        })
      : await readBridge().dbGetThreadRuntimeItemsPage({
          threadId,
          beforePosition: cursor,
          limit: RUNTIME_PAGE_SCAN_SIZE,
          targetTimelineEntryCount: RUNTIME_TIMELINE_PAGE_SIZE,
        });
    // A root thread without a live bounded tail has no bounded source: this is
    // a truthful stop, never a fallback to the local-DB page read.
    if (page === undefined) return false;
    if (request.cancelled || !hydratedThreadRuntimeIds.has(threadId)) {
      return false;
    }
    olderRuntimePageCursorByThread.set(threadId, page.nextCursor);
    if (page.items.length === 0) return false;
    const items = compactRuntimeItemsForHydration(page.items.map(toRuntimeChatItem));
    useAppStore.getState().prependThreadRuntimeItems(threadId, items);
    useAppStore.getState().reconcileStaleSubAgents(threadId, hydrationReconcileOptions());
    // The user explicitly loaded this page: protect it from the window bound
    // (byte-capped) and re-bound the window since the tail may have grown
    // while the read was in flight.
    markRuntimeItemsPaged(threadId, items);
    boundVisibleThreadRuntimeWindows([threadId]);
    evictOversizedInactiveThreadRuntimeItems([threadId]);
    evictInactiveThreadRuntimeItems();
    return true;
  })().catch((error: unknown) => {
    console.warn("[chat] failed to load older runtime items for thread %s", threadId, error);
    captureRendererException(error, { featureArea: "runtime-persistence" });
    return false;
  });
  request.promise = load;
  pendingOlderRuntimePages.set(threadId, request);
  try {
    return await load;
  } finally {
    if (pendingOlderRuntimePages.get(threadId) === request) {
      pendingOlderRuntimePages.delete(threadId);
    }
  }
}

/**
 * Fetch persisted items for a thread and seed the Zustand store. Called on
 * `ChatPane` mount so reopening a thread shows past messages even after an
 * app restart.
 */
export async function hydrateThreadRuntimeItems(threadId: string): Promise<void> {
  if (hydratedThreadRuntimeIds.has(threadId)) return;
  const pending = pendingThreadRuntimeHydrations.get(threadId);
  if (pending) {
    await pending;
    return;
  }

  // Surface loading/error for the pane's first read so an opening thread does
  // not flash a false "No messages yet" (WS6). Only meaningful while the
  // transcript is still empty; a re-hydration of a retained thread is silent.
  const isEmptyBefore =
    (useAppStore.getState().runtimeItemIdsByThread[threadId]?.length ?? 0) === 0;
  if (isEmptyBefore) useAppStore.getState().setRuntimeHydrationStatus(threadId, "pending");
  const hydration = hydrateThreadRuntimeItemsFromDb(threadId);
  pendingThreadRuntimeHydrations.set(threadId, hydration);
  try {
    const completed = await hydration;
    if (completed) {
      hydratedThreadRuntimeIds.add(threadId);
      useAppStore.getState().setRuntimeHydrationStatus(threadId, null);
      evictOversizedInactiveThreadRuntimeItems([threadId]);
      evictInactiveThreadRuntimeItems();
    } else if (isEmptyBefore) {
      useAppStore.getState().setRuntimeHydrationStatus(threadId, "failed");
    }
  } finally {
    pendingThreadRuntimeHydrations.delete(threadId);
  }
}

async function hydrateThreadRuntimeItemsFromDb(threadId: string): Promise<boolean> {
  // The managed desktop's own threads read their transcript through the SAME
  // bounded HTTP contract remote threads use (items + completed turns +
  // `ct1.` cursor + durable notice) over the ONE loopback client. The ordinary
  // root path must never invoke the unbounded local completed-turns read.
  if (isManagedRootHistoryThread(threadId)) {
    return hydrateManagedRootThreadRuntimeItems(threadId);
  }
  const bridge = readBridge();
  const [itemsResult, turnsResult, contextResult, latestGoalResult] = await Promise.allSettled([
    Promise.resolve().then(() =>
      bridge.dbGetThreadRuntimeItemsPage({
        threadId,
        limit: RUNTIME_PAGE_SCAN_SIZE,
        targetTimelineEntryCount: RUNTIME_TIMELINE_PAGE_SIZE,
      }),
    ),
    Promise.resolve().then(() => bridge.dbGetThreadCompletedTurns(threadId)),
    Promise.resolve().then(() => bridge.dbGetThreadContextUsage(threadId)),
    Promise.resolve().then(() => bridge.dbGetLatestThreadGoalItem({ threadId })),
  ]);

  if (itemsResult.status === "fulfilled") {
    olderRuntimePageCursorByThread.set(threadId, itemsResult.value.nextCursor);
  }
  if (itemsResult.status === "fulfilled" && itemsResult.value.items.length > 0) {
    installHydratedRuntimeItems(threadId, itemsResult.value.items);
  } else if (itemsResult.status === "rejected") {
    console.warn(
      "[chat] failed to hydrate runtime items for thread %s",
      threadId,
      itemsResult.reason,
    );
    captureRendererException(itemsResult.reason, { featureArea: "runtime-persistence" });
  }

  // Goal rows are hidden from the timeline but still drive the composer dock.
  // Re-pin the latest one when paged hydration omits it.
  if (latestGoalResult.status === "fulfilled" && latestGoalResult.value) {
    pinOutOfWindowGoalItem(threadId, latestGoalResult.value);
  } else if (latestGoalResult.status === "rejected") {
    console.warn(
      "[chat] failed to read the latest goal item for thread %s",
      threadId,
      latestGoalResult.reason,
    );
    captureRendererException(latestGoalResult.reason, { featureArea: "runtime-persistence" });
  }

  if (turnsResult.status === "fulfilled" && turnsResult.value.length > 0) {
    const records: CompletedTurnRecord[] = turnsResult.value.flatMap((row) => {
      const startedAt = new Date(row.startedAt).getTime();
      const endedAt = new Date(row.endedAt).getTime();
      if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return [];
      return [{ startedAt, endedAt, anchorItemId: row.anchorItemId }];
    });
    // Bounded visible window: keep only the most recent records so a
    // thousands-of-turns thread cannot accumulate anchor metadata forever.
    useAppStore
      .getState()
      .hydrateThreadCompletedTurns(threadId, records.slice(-MAX_CACHED_COMPLETED_TURN_RECORDS));
  } else if (turnsResult.status === "rejected") {
    console.warn(
      "[chat] failed to hydrate completed turns for thread %s",
      threadId,
      turnsResult.reason,
    );
    captureRendererException(turnsResult.reason, { featureArea: "runtime-persistence" });
  }

  if (contextResult.status === "fulfilled" && contextResult.value) {
    useAppStore.getState().hydrateThreadContextUsage(threadId, contextResult.value);
  } else if (contextResult.status === "rejected") {
    console.warn(
      "[chat] failed to hydrate context usage for thread %s",
      threadId,
      contextResult.reason,
    );
    captureRendererException(contextResult.reason, { featureArea: "runtime-persistence" });
  }

  return (
    itemsResult.status !== "rejected" &&
    turnsResult.status !== "rejected" &&
    contextResult.status !== "rejected" &&
    latestGoalResult.status !== "rejected"
  );
}

/**
 * Persisted rows can contain raw tool runs or legacy synthetic summaries;
 * normalize both forms during hydration. An existing transcript keeps the
 * already-loaded prefix and prepends only the disjoint part.
 */
function installHydratedRuntimeItems(
  threadId: string,
  persistedItems: readonly PersistedRuntimeItem[],
): void {
  const items = persistedItems.map(toRuntimeChatItem);
  const state = useAppStore.getState();
  const existingItemIds = state.runtimeItemIdsByThread[threadId] ?? [];
  if (existingItemIds.length === 0) {
    state.hydrateThreadRuntimeItems(threadId, compactRuntimeItemsForHydration(items));
  } else {
    const existingItemIdSet = new Set(existingItemIds);
    const overlapIndex = items.findIndex((item) => existingItemIdSet.has(item.id));
    const persistedPrefix = overlapIndex < 0 ? items : items.slice(0, overlapIndex);
    state.prependThreadRuntimeItems(threadId, compactRuntimeItemsForHydration(persistedPrefix));
  }
  // Any sub-agent tool_call that was mid-flight when the prior session ended
  // will hydrate here as still "running" and show up in the active sub-agent
  // dock forever. Reconcile in place so those rows render as terminated
  // immediately instead of waiting for a live event that will never come.
  // Crossagent rows are kept whole against the local backend (see
  // hydrationReconcileOptions); a run whose start this renderer never saw then
  // stays running until its authoritative settle tile, and one mis-terminated
  // against a non-local source self-heals on its next live progress frame.
  useAppStore.getState().reconcileStaleSubAgents(threadId, hydrationReconcileOptions());
}

/**
 * Managed-root hydration from ONE bounded history read. The page carries the
 * transcript tail, the newest completed turns with a `ct1.` continuation
 * cursor, context usage and the durable notice; recording the tail is what
 * makes older-item pages and the `ct1.` walk continue over the same bounded
 * routes.
 */
async function hydrateManagedRootThreadRuntimeItems(threadId: string): Promise<boolean> {
  let page: Awaited<ReturnType<typeof readManagedRootHistoryPage>>;
  try {
    // The bounded history response already carries the latest goal, including
    // goals before the tail window. A separate DB read would duplicate work
    // and dispatch a host-owned operation to the supervisor.
    page = await readManagedRootHistoryPage(threadId);
  } catch (error) {
    if (isManagedRootThreadAbsentError(error)) {
      // An unpersisted or authoritatively removed row has no transcript to
      // lose. A later pass/pin fills the empty transcript when it is created.
      olderRuntimePageCursorByThread.set(threadId, null);
      return true;
    }
    console.warn(
      "[chat] failed to hydrate the managed root transcript for thread %s",
      threadId,
      error,
    );
    captureRendererException(error, { featureArea: "runtime-persistence" });
    noteManagedRootHistoryFailure(threadId, error);
    return false;
  }

  if (page.runtimeItems.length > 0) {
    installHydratedRuntimeItems(threadId, page.runtimeItems);
  }
  const existingItemIds = useAppStore.getState().runtimeItemIdsByThread[threadId] ?? [];
  seedOlderThreadRuntimeItemsCursor(threadId, page.runtimeNextCursor ?? null, {
    preserveExistingCursor: runtimePageOverlapsExistingTranscript(
      page.runtimeItems,
      existingItemIds,
    ),
  });
  const records = toCompletedTurnRecords(page.completedTurns).slice(
    -MAX_CACHED_COMPLETED_TURN_RECORDS,
  );
  if (page.completedTurnsNextCursor === null) {
    // A complete tail replaces the level, so reverted turns can be dropped.
    useAppStore.getState().replaceThreadCompletedTurns(threadId, records);
  } else {
    // A tail with older history merges losslessly with already-loaded pages.
    useAppStore.getState().hydrateThreadCompletedTurns(threadId, records);
  }
  if (page.contextUsage) {
    useAppStore.getState().hydrateThreadContextUsage(threadId, page.contextUsage);
  }
  return true;
}

/**
 * Prepends the thread's latest persisted goal item when the loaded window has
 * none. The item is older than everything in the tail window, so prepending
 * keeps insertion order; later older-page loads that contain the same item id
 * are deduped by `prependThreadRuntimeItems`, and live `item.updated` events
 * for the goal keep landing on the pinned row.
 */
function pinOutOfWindowGoalItem(threadId: string, goalItem: PersistedRuntimeItem): void {
  const state = useAppStore.getState();
  const itemIds = state.runtimeItemIdsByThread[threadId];
  if (!itemIds) return;
  const itemsById = state.runtimeItemsByIdByThread[threadId];
  if (itemIds.some((itemId) => itemsById?.[itemId]?.type === "goal")) return;
  state.prependThreadRuntimeItems(threadId, [toRuntimeChatItem(goalItem)]);
}

function evictInactiveThreadRuntimeItems(): void {
  while (inactiveThreadRuntimeLru.size > MAX_CACHED_THREAD_TRANSCRIPTS) {
    const threadId = inactiveThreadRuntimeLru.keys().next().value as string | undefined;
    if (!threadId) return;
    evictThreadRuntimeItems(threadId);
  }
}

function evictThreadRuntimeItems(threadId: string): void {
  inactiveThreadRuntimeLru.delete(threadId);
  hydratedThreadRuntimeIds.delete(threadId);
  olderRuntimePageCursorByThread.delete(threadId);
  cancelPendingOlderRuntimePage(threadId);
  // The transcript is gone: its non-item older-history continuation must not
  // survive to feed a future hydration with pre-eviction cursors.
  olderThreadHistoryInvalidation?.(threadId);
  forgetThreadWindowLedger(threadId);
  clearRuntimeItemStoreSelectorCacheForThread(threadId);
  useAppStore.getState().evictThreadRuntimeItems(threadId);
}

/**
 * WS6 P1-10: a `thread-reset` (loss-range rebuild) wipes the in-memory
 * transcript. Without clearing the hydration marker, the next ChatPane mount
 * early-returns "already hydrated" and the transcript would stay empty.
 * Re-seeds the thread from the local DB, which still holds the events the
 * live stream lost (the backend persists them before broadcast).
 */
export async function rehydrateThreadRuntimeItemsAfterReset(threadId: string): Promise<boolean> {
  hydratedThreadRuntimeIds.delete(threadId);
  olderRuntimePageCursorByThread.delete(threadId);
  // An in-flight older page from before the reset must not prepend across the
  // reset boundary or write back its stale cursor after the fresh read.
  cancelPendingOlderRuntimePage(threadId);
  // The non-item older level (bounded completed turns) follows the same reset.
  olderThreadHistoryInvalidation?.(threadId);
  await hydrateThreadRuntimeItems(threadId);
  return useAppStore.getState().runtimeHydrationStatus[threadId] !== "failed";
}

function cancelPendingOlderRuntimePage(threadId: string): void {
  const pending = pendingOlderRuntimePages.get(threadId);
  if (pending) pending.cancelled = true;
}

export function evictOversizedInactiveThreadRuntimeItems(threadIds: readonly string[]): void {
  for (const threadId of threadIds) {
    if (retainedThreadRuntimeCounts.has(threadId)) continue;
    const itemCount = useAppStore.getState().runtimeItemIdsByThread[threadId]?.length ?? 0;
    if (itemCount > MAX_CACHED_THREAD_RUNTIME_ITEMS) evictThreadRuntimeItems(threadId);
  }
}

export function compactRuntimeItemsForHydration(
  items: readonly RuntimeChatItem[],
): RuntimeChatItem[] {
  const compacted: RuntimeChatItem[] = [];
  let idx = 0;
  while (idx < items.length) {
    const item = items[idx]!;
    // Error items are session-transient: they describe a failure of the run
    // that produced them, so hydrating them would resurface stale errors in
    // the composer dock every time the thread is reopened.
    if (item.type === "error" || isEmptyCompletedReasoning(item)) {
      idx += 1;
      continue;
    }
    if (!isToolGroupItem(item) || item.state !== "completed") {
      compacted.push(item);
      idx += 1;
      continue;
    }
    const run: RuntimeChatItem[] = [item];
    idx += 1;
    while (idx < items.length) {
      const next = items[idx]!;
      if (!isToolGroupItem(next) || next.state !== "completed") break;
      run.push(next);
      idx += 1;
    }
    const persistedItem =
      run.length === 1 ? normalizeToolSummaryItem(run[0]!) : summarizeToolCallRun(run);
    compacted.push(persistedItem);
  }
  return compacted;
}

function normalizeToolSummaryItem(item: RuntimeChatItem): RuntimeChatItem {
  if (!item.id.startsWith("tool-call-summary:") || item.type !== "tool_call") return item;
  const payload = item.payload as Partial<ToolCallPayload> | undefined;
  return {
    ...item,
    payload: {
      ...payload,
      name: payload?.name ?? "Tool calls",
      status: "success",
    } satisfies ToolCallPayload,
  };
}

function summarizeToolCallRun(items: readonly RuntimeChatItem[]): RuntimeChatItem {
  const first = items[0]!;
  const last = items[items.length - 1]!;
  return {
    id: `tool-call-summary:${first.id}:${last.id}:${items.length}`,
    type: "tool_call",
    state: "completed",
    payload: {
      name: summarizeToolCallNames(items),
      status: "success",
    } satisfies ToolCallPayload,
    streams: {},
  };
}

type SummaryCategory = "viewed" | "searched" | "edited" | "executed" | "other";

const CATEGORY_LABELS: Record<SummaryCategory, { singular: string; plural: string }> = {
  viewed: { singular: "view", plural: "views" },
  searched: { singular: "search", plural: "searches" },
  edited: { singular: "edit", plural: "edits" },
  executed: { singular: "command", plural: "commands" },
  other: { singular: "tool", plural: "tools" },
};

const CATEGORY_PRIORITY: Record<SummaryCategory, number> = {
  viewed: 0,
  searched: 1,
  edited: 2,
  executed: 3,
  other: 4,
};

function summarizeToolCallNames(items: readonly RuntimeChatItem[]): string {
  const counts = new Map<SummaryCategory, number>();
  for (const item of items) {
    const category = categorizeItem(item);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort(
    ([aCat, aCount], [bCat, bCount]) =>
      bCount - aCount || CATEGORY_PRIORITY[aCat] - CATEGORY_PRIORITY[bCat],
  );
  const parts = sorted.map(([category, count]) => {
    const meta = CATEGORY_LABELS[category];
    return `${count} ${count === 1 ? meta.singular : meta.plural}`;
  });
  return parts.length > 0 ? parts.join(", ") : `${items.length} tools`;
}

function isToolGroupItem(item: RuntimeChatItem): boolean {
  // Sub-agent children must stay as discrete rows so the overlay can replay
  // them on reopen. Sub-agent parents carry the final result on their payload;
  // bundling either into a tool-call summary would erase that history.
  if (item.parentItemId) return false;
  if (
    item.type === "tool_call" &&
    isDelegatedAgentTool(item.payload as ToolCallPayload | undefined)
  ) {
    return false;
  }
  // Tool rows that render as a standalone inline image (ImageView) must NOT be
  // folded into a "N tools" summary: `summarizeToolCallRun` keeps only a name +
  // status, which would strip the image off the payload and lose it on reload.
  // Keep them as discrete rows so the picture survives hydration.
  if (
    (item.type === "tool_call" ||
      item.type === "mcp_tool_call" ||
      item.type === "image_view" ||
      item.type === "dynamic_tool_call") &&
    imageViewRendersInline(item.payload)
  ) {
    return false;
  }
  return (
    item.type === "tool_call" ||
    item.type === "mcp_tool_call" ||
    item.type === "image_view" ||
    item.type === "dynamic_tool_call" ||
    item.type === "command_execution" ||
    item.type === "file_change" ||
    item.type === "web_search"
  );
}

function isEmptyCompletedReasoning(item: RuntimeChatItem): boolean {
  return (
    item.type === "reasoning" &&
    item.state === "completed" &&
    !(item.streams.reasoning_text ?? "").trim()
  );
}

function categorizeItem(item: RuntimeChatItem): SummaryCategory {
  if (item.type === "command_execution") return "executed";
  if (item.type === "file_change") return "edited";
  if (item.type === "web_search") return "searched";
  const payload = item.payload as Partial<ToolCallPayload> | undefined;
  if (!payload) return "other";
  if (isDelegatedAgentTool(payload as ToolCallPayload)) return "executed";

  switch (payload.kind) {
    case "read":
      return "viewed";
    case "search":
    case "fetch":
      return "searched";
    case "edit":
    case "delete":
    case "move":
      return "edited";
    case "execute":
      return "executed";
  }

  const summary = categorizePersistedToolSummary(payload.name ?? "");
  if (summary) return summary;

  const byName = categorizeToolName(payload.name ?? "");
  if (byName !== "other") return byName;
  return categorizeVerbPrefix(payload.name ?? "");
}

function categorizeToolName(name: string): SummaryCategory {
  switch (name) {
    case "Read":
    case "NotebookRead":
      return "viewed";
    case "Grep":
    case "Glob":
    case "LS":
    case "List":
    case "WebSearch":
    case "WebFetch":
    case "ToolSearch":
      return "searched";
    case "Edit":
    case "Write":
    case "MultiEdit":
    case "NotebookEdit":
    case "Patch":
      return "edited";
    case "Bash":
    case "BashOutput":
    case "KillBash":
    case "KillShell":
      return "executed";
    default:
      return "other";
  }
}

const SUMMARY_CATEGORY_LABELS: Record<SummaryCategory, readonly string[]> = {
  viewed: ["view", "views"],
  searched: ["search", "searches"],
  edited: ["edit", "edits"],
  executed: ["command", "commands"],
  other: ["tool", "tools"],
};

function categorizePersistedToolSummary(name: string): SummaryCategory | null {
  const parts = name
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return null;

  const counts = new Map<SummaryCategory, number>();
  for (const part of parts) {
    const match = /^(\d+)\s+([a-z]+)$/i.exec(part);
    if (!match) return null;
    const count = Number(match[1]);
    const category = categoryFromSummaryLabel(match[2]!);
    if (!Number.isFinite(count) || !category) return null;
    counts.set(category, (counts.get(category) ?? 0) + count);
  }

  return (
    [...counts.entries()].sort(
      ([aCat, aCount], [bCat, bCount]) =>
        bCount - aCount || CATEGORY_PRIORITY[aCat] - CATEGORY_PRIORITY[bCat],
    )[0]?.[0] ?? null
  );
}

function categoryFromSummaryLabel(label: string): SummaryCategory | null {
  const normalized = label.toLowerCase();
  for (const [category, labels] of Object.entries(SUMMARY_CATEGORY_LABELS) as Array<
    [SummaryCategory, readonly string[]]
  >) {
    if (labels.includes(normalized)) return category;
  }
  return null;
}

function categorizeVerbPrefix(name: string): SummaryCategory {
  const t = name.toLowerCase().trim();
  if (t.startsWith("viewing") || t.startsWith("reading") || t.startsWith("read ")) return "viewed";
  if (
    t.startsWith("searching") ||
    t.startsWith("finding") ||
    t.startsWith("grep") ||
    t.startsWith("listing") ||
    t.startsWith("fetch")
  ) {
    return "searched";
  }
  if (
    t.startsWith("editing") ||
    t.startsWith("writing") ||
    t.startsWith("patching") ||
    t.startsWith("creating") ||
    t.startsWith("deleting") ||
    t.startsWith("removing")
  ) {
    return "edited";
  }
  if (t.startsWith("running") || t.startsWith("executing") || t.startsWith("shell")) {
    return "executed";
  }
  return "other";
}
