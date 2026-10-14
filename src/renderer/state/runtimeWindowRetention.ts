import { isWorkflowRunLive, type ToolCallPayload } from "@/shared/contracts";
import { isWorkflowTool } from "@/shared/toolCallClassification";
import { clearRuntimeItemStoreSelectorCacheForThread } from "../components/thread/ChatPane/chatPaneSelectors";
import { parseWorkflowInfo } from "../components/thread/ChatPane/parts/items/workflowDisplay";
import { useAppStore } from "./appStore";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import { useWorkflowRunStore } from "./workflowRunStore";
import {
  forgetRuntimeHistoryBoundary,
  isRuntimeHistoryAnchor,
  observeRuntimeHistoryGoalEra,
  runtimeHistoryBoundary,
} from "./runtimeHistoryBoundary";

// These are UTF-16 size estimates, including JSON payloads and per-item
// overhead; they are neither UTF-8 byte counts nor a hard heap ceiling.
const VISIBLE_WINDOW_TAIL_BYTES = 6 * 1024 * 1024;
const VISIBLE_WINDOW_PAGED_PROTECTED_BYTES = 2 * 1024 * 1024;
const WINDOW_BOUND_MIN_GROWTH_ITEMS = 400;
const WINDOW_BOUND_PASS_INTERVAL_MS = 5_000;
export const MAX_CACHED_COMPLETED_TURN_RECORDS = 500;

interface ThreadWindowLedger {
  measuredCount: number;
  lastPassAtMs: number;
  /** Map insertion order is the order of explicit page requests (FIFO). */
  pagedProtectedSizes: Map<string, number>;
  paging: boolean;
}

// Disposable session-local metadata. Runtime items/turns and these ledgers
// are excluded from app-store persistence; no versioned shape changes.
const threadWindowLedgers = new Map<string, ThreadWindowLedger>();

function estimateRuntimeItemBytes(item: RuntimeChatItem | undefined): number {
  if (!item) return 0;
  let bytes = 96;
  if (item.payload !== undefined) {
    try {
      bytes += JSON.stringify(item.payload)?.length ?? 0;
    } catch {
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
      measuredCount: 0,
      lastPassAtMs: 0,
      pagedProtectedSizes: new Map(),
      paging: false,
    };
    threadWindowLedgers.set(threadId, ledger);
  }
  return ledger;
}

export function forgetThreadWindowLedger(threadId: string): void {
  threadWindowLedgers.delete(threadId);
  forgetRuntimeHistoryBoundary(threadId);
}

/** A pending explicit read owns its retained boundary until it settles. */
export function setRuntimeWindowPaging(threadId: string, paging: boolean): void {
  const ledger = paging ? getThreadWindowLedger(threadId) : threadWindowLedgers.get(threadId);
  if (ledger) ledger.paging = paging;
}

function capPagedProtection(ledger: ThreadWindowLedger): void {
  let bytes = 0;
  for (const size of ledger.pagedProtectedSizes.values()) bytes += size;
  for (const [id, size] of ledger.pagedProtectedSizes) {
    if (bytes <= VISIBLE_WINDOW_PAGED_PROTECTED_BYTES) break;
    // A single oversized requested row remains readable until navigation.
    if (ledger.pagedProtectedSizes.size === 1) break;
    ledger.pagedProtectedSizes.delete(id);
    bytes -= size;
  }
}

/** Protect the most recently requested pages, independently of their position. */
export function markRuntimeItemsPaged(threadId: string, items: readonly RuntimeChatItem[]): void {
  if (items.length === 0) return;
  const ledger = getThreadWindowLedger(threadId);
  for (const item of items) {
    // Hidden controls do not represent a reader's visible page.
    if (item.type !== "goal")
      ledger.pagedProtectedSizes.set(item.id, estimateRuntimeItemBytes(item));
  }
  capPagedProtection(ledger);
}

function isLiveItem(item: RuntimeChatItem): boolean {
  if (item.state !== "completed") return true;
  if (item.type !== "tool_call") return false;
  const payload = item.payload as ToolCallPayload | undefined;
  // Canonical tool completion can precede background work completion. Use
  // the same payload/manifest contract as the delegated-agent row and dock.
  if (payload?.status === "running") return true;
  if (!payload || !isWorkflowTool(payload) || item.observedLive !== true) return false;
  if (!parseWorkflowInfo(payload).manifestPath) return false;
  const run = useWorkflowRunStore.getState().byItemId[item.id]?.run;
  return !run || isWorkflowRunLive(run);
}

/**
 * Keep a contiguous ordinary suffix plus the latest hidden goal control.
 * Live/workflow rows, reader pages and ancestry may extend that suffix; a
 * normal goal never protects the completed history between it and the tail.
 * The control stays before the tail until canonical paging locates its row.
 */
export function boundThreadRuntimeWindows(threadIds: readonly string[]): void {
  for (const threadId of new Set(threadIds)) {
    const state = useAppStore.getState();
    const itemIds = state.runtimeItemIdsByThread[threadId];
    if (!itemIds) {
      forgetThreadWindowLedger(threadId);
      continue;
    }
    const ledger = getThreadWindowLedger(threadId);
    const boundary = runtimeHistoryBoundary(threadId);
    if (ledger.paging) {
      boundThreadCompletedTurns(threadId, new Set());
      continue;
    }
    const now = Date.now();
    if (
      now - ledger.lastPassAtMs < WINDOW_BOUND_PASS_INTERVAL_MS &&
      itemIds.length - ledger.measuredCount < WINDOW_BOUND_MIN_GROWTH_ITEMS
    )
      continue;
    ledger.lastPassAtMs = now;

    const items = state.runtimeItemsByIdByThread[threadId] ?? {};
    observeRuntimeHistoryGoalEra(boundary, itemIds, items);
    const sizes = new Map(itemIds.map((id) => [id, estimateRuntimeItemBytes(items[id])]));
    for (const id of ledger.pagedProtectedSizes.keys()) {
      if (!sizes.has(id)) ledger.pagedProtectedSizes.delete(id);
      else ledger.pagedProtectedSizes.set(id, sizes.get(id)!);
    }
    capPagedProtection(ledger);

    const keep = new Set(ledger.pagedProtectedSizes.keys());
    // A rejected read can leave resumable scan progress. Keep its source.
    if (boundary.scan?.boundaryItemId) keep.add(boundary.scan.boundaryItemId);
    let tailBytes = 0;
    let tailFull = false;
    let seekingCurrentGoal = true;
    let currentGoalId: string | undefined;
    for (let index = itemIds.length - 1; index >= 0; index -= 1) {
      const id = itemIds[index]!;
      const item = items[id];
      if (!item) continue;
      // The goal dock reads only the latest goal after the latest handoff,
      // including a cleared marker. Earlier completed goals are history.
      // Older goals leave with their handoff; canonical paging restores both
      // in source order, so history cannot resurrect a previous-era goal.
      if (item.type === "provider_handoff") seekingCurrentGoal = false;
      if (item.type === "goal" && seekingCurrentGoal) {
        currentGoalId = id;
        seekingCurrentGoal = false;
      }
      if (item.type !== "goal" && isLiveItem(item)) keep.add(id);
      const bytes = sizes.get(id)!;
      if (
        !tailFull &&
        (index === itemIds.length - 1 || tailBytes + bytes <= VISIBLE_WINDOW_TAIL_BYTES)
      ) {
        keep.add(id);
        tailBytes += bytes;
      } else {
        tailFull = true;
      }
    }
    let firstKept = itemIds.findIndex((id) => keep.has(id));
    const indices = new Map(itemIds.map((id, index) => [id, index]));
    // Close ancestry over the entire retained suffix, including intervening
    // completed children. Expanding the start extends this same backward walk.
    for (let index = itemIds.length - 1; index >= Math.max(0, firstKept); index -= 1) {
      const item = items[itemIds[index]!];
      const parentIndex = item?.parentItemId ? indices.get(item.parentItemId) : undefined;
      if (parentIndex !== undefined && parentIndex < firstKept) firstKept = parentIndex;
      // Renderer error rows have generated, non-durable IDs; out-of-window
      // goals may be pinned independently. Retain a durable predecessor so
      // the rebase has an ordered boundary before either kind of row.
      if (index === firstKept && firstKept > 0 && !isRuntimeHistoryAnchor(item)) firstKept -= 1;
    }
    const prefix = itemIds.slice(0, Math.max(0, firstKept));
    const controls = new Set(prefix.filter((id) => id === currentGoalId));
    const removedIds = new Set(prefix.filter((id) => !controls.has(id)));
    if (removedIds.size > 0) {
      // Remove the ordinary prefix, retaining hidden controls in place and
      // preserving surviving objects, requests and replay state.
      boundary.sparseControlIds = controls;
      boundary.needsRebase = true;
      boundary.scan = null;
      useAppStore.getState().trimThreadRuntimeItems(threadId, 0, prefix.length, controls);
      clearRuntimeItemStoreSelectorCacheForThread(threadId);
    }
    ledger.measuredCount = itemIds.length - removedIds.size;
    boundThreadCompletedTurns(threadId, removedIds);
  }
}

function boundThreadCompletedTurns(threadId: string, removedIds: ReadonlySet<string>): void {
  const turns = useAppStore.getState().runtimeCompletedTurnsByThread[threadId];
  if (!turns?.length) return;
  let kept =
    removedIds.size > 0
      ? turns.filter((turn) => !turn.anchorItemId || !removedIds.has(turn.anchorItemId))
      : turns;
  if (kept.length > MAX_CACHED_COMPLETED_TURN_RECORDS) {
    kept = kept.slice(-MAX_CACHED_COMPLETED_TURN_RECORDS);
  }
  if (kept !== turns) useAppStore.getState().replaceThreadCompletedTurns(threadId, kept);
}
