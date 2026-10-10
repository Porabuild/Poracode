import type { PersistedRuntimeItem } from "@/shared/ipc";
import { captureRendererException } from "../diagnostics/sentry";
import { clearRuntimeItemStoreSelectorCacheForThread } from "../components/thread/ChatPane/chatPaneSelectors";
import { readBridge } from "../bridge";
import { hasClientCapability, isBrowserClientRuntime } from "../clientRuntime";
import {
  browserRuntimeHydrationResults,
  readBrowserRuntimeHydrationCache,
} from "../browser/runtimeHydrationCache";
import {
  readThreadHistoryNotice,
  recordThreadHistoryNoticeRead,
} from "./remote/historyNoticeStore";
import { useAppStore } from "./appStore";
import {
  isManagedRootHistoryThread,
  isManagedRootThreadAbsentError,
  loadManagedRootRuntimeItemsPage,
  noteManagedRootHistoryFailure,
  readManagedRootHistoryPage,
} from "./managedRootCatalog/rootHistory";
import { toCompletedTurnRecords } from "./remoteServers/catalog/boundedHistory";
import { toRuntimeChatItem, type CompletedTurnRecord } from "./slices/runtimeEventSlice";

import {
  boundThreadRuntimeWindows,
  forgetThreadWindowLedger as forgetWindowLedger,
  markRuntimeItemsPaged,
  MAX_CACHED_COMPLETED_TURN_RECORDS,
  setRuntimeWindowPaging,
} from "./runtimeWindowRetention";
import {
  isRuntimeHistoryAnchor,
  isRuntimeHistoryBoundaryCurrent,
  observeRuntimeHistoryGoalEra,
  runtimeHistoryBoundary,
  type RuntimeHistoryBoundary,
} from "./runtimeHistoryBoundary";
import { readRuntimeWindowPage, runtimeWindowPageCursor } from "./runtimeHistoryPaging";
import { compactRuntimeItemsForHydration } from "./runtimeHistoryCompaction";
import { alignRuntimeHistoryControl } from "./runtimeHistoryControlAlignment";
export { compactRuntimeItemsForHydration } from "./runtimeHistoryCompaction";

const RUNTIME_PAGE_SCAN_SIZE = 500;
const RUNTIME_TIMELINE_PAGE_SIZE = 40;
const MAX_CACHED_THREAD_TRANSCRIPTS = 10;
const MAX_CACHED_THREAD_RUNTIME_ITEMS = 5_000;
const hydratedThreadRuntimeIds = new Set<string>();
const pendingThreadRuntimeHydrations = new Map<
  string,
  { cancelled: boolean; readonly promise: Promise<boolean> }
>();
const pendingOlderRuntimePages = new Map<
  string,
  { cancelled: boolean; readonly promise: Promise<boolean> }
>();
const pendingControlAlignments = new Map<
  string,
  { generation: object; promise: Promise<boolean> }
>();
const retainedThreadRuntimeCounts = new Map<string, number>();
const inactiveThreadRuntimeLru = new Set<string>();
export function forgetThreadRuntimeWindow(threadId: string): void {
  cancelPendingOlderRuntimePage(threadId);
  forgetWindowLedger(threadId);
}

export function boundVisibleThreadRuntimeWindows(threadIds: readonly string[]): void {
  for (const threadId of threadIds) {
    if (!useAppStore.getState().runtimeItemIdsByThread[threadId]) {
      forgetThreadRuntimeWindow(threadId);
    }
  }
  boundThreadRuntimeWindows(threadIds);
}

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
  options: {
    readonly preserveExistingCursor?: boolean;
    readonly sparseControlIds?: ReadonlySet<string>;
    readonly obsoleteGoalId?: string | null;
    readonly unlocatedControl?: RuntimeHistoryBoundary["unlocatedControl"];
  } = {},
): void {
  cancelPendingOlderRuntimePage(threadId);
  cancelPendingThreadRuntimeHydration(threadId);
  const boundary = runtimeHistoryBoundary(threadId);
  const currentCursor = boundary.cursor;
  // A fresh installation always fences pending reads, even when the older
  // prefix and its cursor were proven preserved. Page protections survive it.
  boundary.generation = {};
  boundary.scan = null;
  if (options.preserveExistingCursor !== true) boundary.needsRebase = false;
  if (options.sparseControlIds) boundary.sparseControlIds = new Set(options.sparseControlIds);
  else if (options.preserveExistingCursor !== true) boundary.sparseControlIds.clear();
  if (options.obsoleteGoalId !== undefined) boundary.obsoleteGoalId = options.obsoleteGoalId;
  else if (options.preserveExistingCursor !== true) boundary.obsoleteGoalId = null;
  boundary.unlocatedControl = options.unlocatedControl ?? null;
  hydratedThreadRuntimeIds.add(threadId);
  boundary.cursor =
    options.preserveExistingCursor !== true || currentCursor === undefined || cursor === null
      ? cursor
      : currentCursor === null
        ? null
        : Math.min(currentCursor, cursor);
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
  if (
    runtimeHistoryBoundary(threadId).unlocatedControl &&
    !(await alignThreadRuntimeHistoryControl(threadId))
  )
    return false;
  // A registered continuation may extend a different older-history level
  // (remote completed turns) even when this thread has no older item cursor.
  const historyContinuation = olderThreadHistoryContinuation;
  if (historyContinuation) {
    void Promise.resolve(historyContinuation(threadId)).catch(() => false);
  }
  const cursor = runtimeWindowPageCursor(threadId);
  if (cursor === undefined || cursor === null) return false;
  const pending = pendingOlderRuntimePages.get(threadId);
  if (pending && !pending.cancelled) return pending.promise;

  const request = { cancelled: false, promise: Promise.resolve(false) };
  const boundary = runtimeHistoryBoundary(threadId);
  const generation = boundary.generation;
  const initialIds = useAppStore.getState().runtimeItemIdsByThread[threadId];
  const initialTail = initialIds?.at(-1);
  // A truncate can retain the oldest boundary but remove the tail. Observe
  // that removal synchronously, so a later append cannot mask invalidation.
  const unsubscribe = useAppStore.subscribe((state) => {
    if (initialTail && !state.runtimeItemsByIdByThread[threadId]?.[initialTail]) {
      request.cancelled = true;
    }
  });
  const isCurrent = () =>
    !request.cancelled &&
    hydratedThreadRuntimeIds.has(threadId) &&
    isRuntimeHistoryBoundaryCurrent(threadId, boundary, generation);
  setRuntimeWindowPaging(threadId, true);
  const load = (async () => {
    while (isCurrent()) {
      const result = await readRuntimeWindowPage(
        threadId,
        (beforePosition) => readOlderRuntimePage(threadId, beforePosition),
        isCurrent,
      );
      if (!isCurrent() || result.kind === "unavailable") return false;
      if (result.kind === "page") {
        const { page } = result;
        // Resolve control overlap BEFORE compaction. The generic ordered splice
        // reuses existing objects, including goals updated during this read.
        const items = compactRuntimeItemsForHydration(page.items.map(toRuntimeChatItem));
        const existing = useAppStore.getState().runtimeItemsByIdByThread[threadId];
        const addedVisibleItems = items.filter(
          (item) => item.type !== "goal" && !existing?.[item.id],
        );
        const sparseControls = new Set(boundary.sparseControlIds);
        for (const item of page.items) boundary.sparseControlIds.delete(item.id);
        boundary.cursor = page.nextCursor;
        boundary.needsRebase = false;
        boundary.scan = null;
        useAppStore.getState().prependThreadRuntimeItems(threadId, items, sparseControls);
        useAppStore.getState().reconcileStaleSubAgents(threadId, hydrationReconcileOptions());
        const state = useAppStore.getState();
        observeRuntimeHistoryGoalEra(
          boundary,
          state.runtimeItemIdsByThread[threadId] ?? [],
          state.runtimeItemsByIdByThread[threadId] ?? {},
        );
        markRuntimeItemsPaged(threadId, addedVisibleItems);
        evictOversizedInactiveThreadRuntimeItems([threadId]);
        evictInactiveThreadRuntimeItems();
        if (addedVisibleItems.length > 0) return true;
        if (page.nextCursor === null) return false;
      }
      // Batch exhaustion and fully filtered pages are progress, not "no more".
      // Keep the same pending request and yield a task before reading again.
      // Strictly decreasing canonical cursors and generation checks fence it.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return false;
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
    unsubscribe();
    if (pendingOlderRuntimePages.get(threadId) === request) {
      pendingOlderRuntimePages.delete(threadId);
      releaseRuntimeWindowPagingIfIdle(threadId);
    }
  }
}

function readOlderRuntimePage(threadId: string, beforePosition: number) {
  const input = {
    threadId,
    beforePosition,
    limit: RUNTIME_PAGE_SCAN_SIZE,
    targetTimelineEntryCount: RUNTIME_TIMELINE_PAGE_SIZE,
  };
  return isManagedRootHistoryThread(threadId)
    ? loadManagedRootRuntimeItemsPage(input)
    : readBridge().dbGetThreadRuntimeItemsPage(input);
}

/** Resolve only unfamiliar snapshot controls; ordinary streaming never calls I/O. */
export async function alignThreadRuntimeHistoryControl(threadId: string): Promise<boolean> {
  const boundary = runtimeHistoryBoundary(threadId);
  if (!boundary.unlocatedControl) return true;
  const pending = pendingControlAlignments.get(threadId);
  if (pending?.generation === boundary.generation) return pending.promise;
  const request = { generation: boundary.generation, promise: Promise.resolve(false) };
  setRuntimeWindowPaging(threadId, true);
  request.promise = alignRuntimeHistoryControl(threadId, (cursor) =>
    readOlderRuntimePage(threadId, cursor),
  ).catch((error: unknown) => {
    console.warn("[chat] failed to locate runtime control for thread %s", threadId, error);
    captureRendererException(error, { featureArea: "runtime-persistence" });
    return false;
  });
  pendingControlAlignments.set(threadId, request);
  try {
    return await request.promise;
  } finally {
    if (pendingControlAlignments.get(threadId) === request) {
      pendingControlAlignments.delete(threadId);
      releaseRuntimeWindowPagingIfIdle(threadId);
    }
  }
}

function releaseRuntimeWindowPagingIfIdle(threadId: string): void {
  const older = pendingOlderRuntimePages.get(threadId);
  if ((!older || older.cancelled) && !pendingControlAlignments.has(threadId)) {
    setRuntimeWindowPaging(threadId, false);
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
  if (pending && !pending.cancelled) {
    await pending.promise;
    return;
  }

  // Surface loading/error for the pane's first read so an opening thread does
  // not flash a false "No messages yet" (WS6). Only meaningful while the
  // transcript is still empty; a re-hydration of a retained thread is silent.
  const isEmptyBefore =
    (useAppStore.getState().runtimeItemIdsByThread[threadId]?.length ?? 0) === 0;
  if (isEmptyBefore) useAppStore.getState().setRuntimeHydrationStatus(threadId, "pending");
  const request = { cancelled: false, promise: Promise.resolve(false) };
  const hydration = hydrateThreadRuntimeItemsFromDb(threadId, request);
  request.promise = hydration;
  pendingThreadRuntimeHydrations.set(threadId, request);
  try {
    const completed = await hydration;
    // A reset superseded this read mid-flight: it owns neither the hydration
    // marker nor the visible status — the replacement read owns both.
    if (request.cancelled) return;
    if (completed) {
      hydratedThreadRuntimeIds.add(threadId);
      useAppStore.getState().setRuntimeHydrationStatus(threadId, null);
      evictOversizedInactiveThreadRuntimeItems([threadId]);
      evictInactiveThreadRuntimeItems();
    } else if (isEmptyBefore) {
      useAppStore.getState().setRuntimeHydrationStatus(threadId, "failed");
    }
  } finally {
    if (pendingThreadRuntimeHydrations.get(threadId) === request) {
      pendingThreadRuntimeHydrations.delete(threadId);
    }
  }
}

async function hydrateThreadRuntimeItemsFromDb(
  threadId: string,
  request: { readonly cancelled: boolean },
): Promise<boolean> {
  // The managed desktop's own threads read their transcript through the SAME
  // bounded HTTP contract remote threads use (items + completed turns +
  // `ct1.` cursor + durable notice) over the ONE loopback client. The ordinary
  // root path must never invoke the unbounded local completed-turns read.
  if (isManagedRootHistoryThread(threadId)) {
    return hydrateManagedRootThreadRuntimeItems(threadId, request);
  }
  // Browser startup can restore the same complete cached snapshot already
  // written by the remote installer. Routing four derived reads to the host
  // would both duplicate its tail response and fail this initial read offline.
  const initialState = useAppStore.getState();
  const initialVersion = initialState.runtimeStructuralVersionByThread[threadId] ?? 0;
  let cachedSnapshot = isBrowserClientRuntime()
    ? await readBrowserRuntimeHydrationCache(
        initialState.threads.find((thread) => thread.id === threadId),
      )
    : null;
  if (request.cancelled) return false;
  // An authoritative snapshot installed while IndexedDB was pending owns its
  // cursor and payload, including an intentionally empty replacement.
  if (hydratedThreadRuntimeIds.has(threadId)) return true;
  const currentState = useAppStore.getState();
  const currentThread = currentState.threads.find((thread) => thread.id === threadId);
  if (
    (currentState.runtimeStructuralVersionByThread[threadId] ?? 0) !== initialVersion ||
    !currentThread ||
    currentThread.remoteServerId !== cachedSnapshot?.thread.remoteServerId ||
    currentThread.remoteId !== cachedSnapshot?.thread.remoteId
  )
    cachedSnapshot = null;
  if (cachedSnapshot?.thread.remoteServerId && !readThreadHistoryNotice(threadId)) {
    recordThreadHistoryNoticeRead(
      threadId,
      cachedSnapshot.thread.remoteServerId,
      cachedSnapshot.runtimeNotice,
    );
  }
  const bridge = readBridge();
  const [itemsResult, turnsResult, contextResult, latestGoalResult] = cachedSnapshot
    ? browserRuntimeHydrationResults(cachedSnapshot)
    : await Promise.allSettled([
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
  // A reset superseded this read while it was in flight: install nothing and
  // claim no cursor — the replacement read owns both.
  if (request.cancelled) return false;

  if (itemsResult.status === "fulfilled") {
    runtimeHistoryBoundary(threadId).cursor = itemsResult.value.nextCursor;
  }
  if (itemsResult.status === "fulfilled" && itemsResult.value.items.length > 0) {
    installHydratedRuntimeItems(threadId, itemsResult.value.items, itemsResult.value.nextCursor, {
      provisional: cachedSnapshot !== null,
    });
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
  cursor: number | null,
  options: { readonly provisional?: boolean } = {},
): void {
  const items = persistedItems.map(toRuntimeChatItem);
  const boundary = runtimeHistoryBoundary(threadId);
  const firstOrdinary = items.findIndex(isRuntimeHistoryAnchor);
  const leading =
    cursor !== null ? items.slice(0, firstOrdinary < 0 ? items.length : firstOrdinary) : [];
  for (const item of leading) if (item.type === "goal") boundary.sparseControlIds.add(item.id);
  const state = useAppStore.getState();
  const existingItemIds = state.runtimeItemIdsByThread[threadId] ?? [];
  if (existingItemIds.length === 0) {
    state.hydrateThreadRuntimeItems(threadId, compactRuntimeItemsForHydration(items));
  } else {
    const existingItemIdSet = new Set(existingItemIds);
    const overlapIndex = items.findIndex(
      (item) => isRuntimeHistoryAnchor(item) && existingItemIdSet.has(item.id),
    );
    const persistedPrefix = overlapIndex < 0 ? items : items.slice(0, overlapIndex);
    state.prependThreadRuntimeItems(
      threadId,
      compactRuntimeItemsForHydration(persistedPrefix),
      boundary.sparseControlIds,
    );
  }
  // Any sub-agent tool_call that was mid-flight when the prior session ended
  // will hydrate here as still "running" and show up in the active sub-agent
  // dock forever. Reconcile in place so those rows render as terminated
  // immediately instead of waiting for a live event that will never come.
  // Crossagent rows are kept whole against the local backend (see
  // hydrationReconcileOptions); a run whose start this renderer never saw then
  // stays running until its authoritative settle tile, and one mis-terminated
  // against a non-local source self-heals on its next live progress frame.
  // Cached rows describe last-known work, not an authoritative orphan verdict.
  // The host refresh reconciles them after reconnect.
  if (!options.provisional) {
    useAppStore.getState().reconcileStaleSubAgents(threadId, hydrationReconcileOptions());
  }
}

/**
 * Managed-root hydration from ONE bounded history read. The page carries the
 * transcript tail, the newest completed turns with a `ct1.` continuation
 * cursor, context usage and the durable notice; recording the tail is what
 * makes older-item pages and the `ct1.` walk continue over the same bounded
 * routes.
 */
async function hydrateManagedRootThreadRuntimeItems(
  threadId: string,
  request: { readonly cancelled: boolean },
): Promise<boolean> {
  let page: Awaited<ReturnType<typeof readManagedRootHistoryPage>>;
  try {
    // The bounded history response already carries the latest goal, including
    // goals before the tail window. A separate DB read would duplicate work
    // and dispatch a host-owned operation to the supervisor.
    page = await readManagedRootHistoryPage(threadId);
  } catch (error) {
    // A reset superseded this read mid-flight: install nothing, seed no
    // cursor, and surface no failure of its own (the replacement read owns
    // the outcome).
    if (request.cancelled) return false;
    if (isManagedRootThreadAbsentError(error)) {
      // An unpersisted or authoritatively removed row has no transcript to
      // lose. A later pass/pin fills the empty transcript when it is created.
      runtimeHistoryBoundary(threadId).cursor = null;
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

  if (request.cancelled) return false;
  if (page.runtimeItems.length > 0) {
    installHydratedRuntimeItems(threadId, page.runtimeItems, page.runtimeNextCursor ?? null);
  }
  runtimeHistoryBoundary(threadId).cursor = page.runtimeNextCursor ?? null;
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
  runtimeHistoryBoundary(threadId).sparseControlIds.add(goalItem.id);
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

  cancelPendingOlderRuntimePage(threadId);
  // The transcript is gone: its non-item older-history continuation must not
  // survive to feed a future hydration with pre-eviction cursors.
  olderThreadHistoryInvalidation?.(threadId);
  forgetThreadRuntimeWindow(threadId);
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
export function invalidateThreadRuntimeHydration(threadId: string): void {
  forgetThreadRuntimeWindow(threadId);
  hydratedThreadRuntimeIds.delete(threadId);

  // An in-flight older page from before the reset must not prepend across the
  // reset boundary or write back its stale cursor after the fresh read.
  cancelPendingOlderRuntimePage(threadId);
  // Same for an in-flight FIRST hydration: awaiting it would adopt the
  // pre-reset read — installing pre-reset rows, re-seeding the pre-reset
  // cursor, and marking the thread hydrated. Supersede it so a fresh read
  // serves the rebuilt transcript instead.
  cancelPendingThreadRuntimeHydration(threadId);
  // The non-item older level (bounded completed turns) follows the same reset.
  olderThreadHistoryInvalidation?.(threadId);
}

export async function rehydrateThreadRuntimeItemsAfterReset(threadId: string): Promise<boolean> {
  invalidateThreadRuntimeHydration(threadId);
  await hydrateThreadRuntimeItems(threadId);
  return useAppStore.getState().runtimeHydrationStatus[threadId] !== "failed";
}

function cancelPendingOlderRuntimePage(threadId: string): void {
  const pending = pendingOlderRuntimePages.get(threadId);
  if (pending) {
    pending.cancelled = true;
    setRuntimeWindowPaging(threadId, false);
  }
}

function cancelPendingThreadRuntimeHydration(threadId: string): void {
  const pending = pendingThreadRuntimeHydrations.get(threadId);
  if (pending) pending.cancelled = true;
}

export function evictOversizedInactiveThreadRuntimeItems(threadIds: readonly string[]): void {
  for (const threadId of threadIds) {
    if (retainedThreadRuntimeCounts.has(threadId)) continue;
    const itemCount = useAppStore.getState().runtimeItemIdsByThread[threadId]?.length ?? 0;
    if (itemCount > MAX_CACHED_THREAD_RUNTIME_ITEMS) evictThreadRuntimeItems(threadId);
  }
}
