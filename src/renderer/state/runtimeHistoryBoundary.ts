import type { RuntimeChatItem } from "./slices/runtimeEventSlice";

export interface RuntimeHistoryBoundary {
  /** Replaced whenever an authoritative installation changes the read proof. */
  generation: object;
  cursor: number | null | undefined;
  /** Hidden rows older than the contiguous ordinary timeline, not page anchors. */
  sparseControlIds: Set<string>;
  needsRebase: boolean;
  scan: {
    beforePosition: number;
    boundaryItemId: string | null;
    findingBoundary: boolean;
  } | null;
  /** Latest global goal known to precede a visible handoff that may be evicted. */
  obsoleteGoalId: string | null;
  /** A new snapshot pin whose position inside a preserved reader span is unknown. */
  unlocatedControl: {
    readonly id: string;
    readonly beforeItemId: string;
    readonly cursor: number;
  } | null;
}

// One disposable installation registry for snapshot writes, cursor seeds and
// awaited page merges. Neither this metadata nor the runtime store is persisted.
const boundaries = new Map<string, RuntimeHistoryBoundary>();
const sourceStarts = new WeakMap<RuntimeChatItem, string>();

export function runtimeHistoryBoundary(threadId: string): RuntimeHistoryBoundary {
  let boundary = boundaries.get(threadId);
  if (!boundary) {
    boundary = {
      generation: {},
      cursor: undefined,
      sparseControlIds: new Set(),
      needsRebase: false,
      scan: null,
      obsoleteGoalId: null,
      unlocatedControl: null,
    };
    boundaries.set(threadId, boundary);
  }
  return boundary;
}

export function isRuntimeHistoryBoundaryCurrent(
  threadId: string,
  boundary: RuntimeHistoryBoundary,
  generation: object,
): boolean {
  return boundaries.get(threadId) === boundary && boundary.generation === generation;
}

export function forgetRuntimeHistoryBoundary(threadId: string): void {
  boundaries.delete(threadId);
}

/** A rollback may target a checkpoint outside this bounded projection. */
export function invalidateRuntimeHistoryRead(threadId: string): void {
  const boundary = boundaries.get(threadId);
  if (!boundary) return;
  boundary.generation = {};
  boundary.scan = null;
  boundary.needsRebase = true;
}

export function hasUnlocatedRuntimeHistoryControl(threadId: string): boolean {
  return boundaries.get(threadId)?.unlocatedControl != null;
}

/** A synthetic summary's first raw row, never an invented DB position. */
export function runtimeHistorySourceStart(item: RuntimeChatItem): string {
  return sourceStarts.get(item) ?? item.id;
}

export function recordRuntimeSummarySource(summary: RuntimeChatItem, first: RuntimeChatItem): void {
  sourceStarts.set(summary, runtimeHistorySourceStart(first));
}

export function isRuntimeHistoryAnchor(item: RuntimeChatItem | undefined): boolean {
  return item !== undefined && item.type !== "error" && item.type !== "goal";
}

/** Remember only evidence actually observed in ordered history, not a vendor hint. */
export function observeRuntimeHistoryGoalEra(
  boundary: RuntimeHistoryBoundary,
  ids: readonly string[],
  items: Readonly<Record<string, RuntimeChatItem>>,
): void {
  if (boundary.unlocatedControl) return;
  let sawHandoff = false;
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    const item = items[ids[index]!];
    if (item?.type === "provider_handoff") sawHandoff = true;
    if (item?.type === "goal") {
      boundary.obsoleteGoalId = sawHandoff ? item.id : null;
      return;
    }
  }
}
