/**
 * Size estimation and bounded projection for the browser metadata cache (B5).
 *
 * `estimateCacheValueBytes` walks the object graph instead of calling
 * `JSON.stringify`. Sizes are memoized per object reference, so an unchanged
 * thread/project subtree is measured once and a new snapshot root reuses those
 * results instead of re-walking every leaf. The walk is still synchronous and
 * runs on the main thread in the coalesced drain; its real cost with a full
 * catalog clone remains to be measured in a browser.
 *
 * `projectBoundedCacheValue` keeps the disk cache under the per-record cap by
 * dropping the oldest threads. It never drops the persisted view, the project
 * list, group layouts, or keep-alive ids, and it pins every thread referenced
 * by them, so selections and open panes survive a reload on a truncated cache.
 * Composer drafts live in their own storage (`composerDraftStorage`) and are
 * never part of this snapshot. The cache stays a cache: a truncated projection
 * is never written back to the host.
 */

export const MAX_BROWSER_METADATA_RECORD_BYTES = 8 * 1024 * 1024;

export type BrowserMetadataCacheProjection =
  | { readonly kind: "unchanged"; readonly value: unknown; readonly bytes: number }
  | {
      readonly kind: "truncated";
      readonly value: unknown;
      readonly bytes: number;
      readonly droppedThreadCount: number;
    }
  /** Over the cap and not trimmable: callers keep it in memory only. */
  | { readonly kind: "oversized"; readonly bytes: number };

/** Content size of each measured object, keyed by the object reference. */
const nodeByteEstimates = new WeakMap<object, number>();

export function estimateCacheValueBytes(value: unknown): number {
  return measureCacheValueBytes(value, new WeakSet<object>());
}

function measureCacheValueBytes(node: unknown, seen: WeakSet<object>): number {
  if (node === null || node === undefined) return 4;
  switch (typeof node) {
    case "string":
      return 16 + node.length * 2;
    case "number":
      return 8;
    case "boolean":
      return 4;
    case "bigint":
      return 16;
    case "symbol":
    case "function":
      return 8;
    default:
      break;
  }
  const object = node as object;
  if (seen.has(object)) {
    // Cycle: stable cost per re-entry instead of recursing forever.
    return 8;
  }
  const cached = nodeByteEstimates.get(object);
  if (cached !== undefined) return cached;
  seen.add(object);
  let bytes = 16;
  if (Array.isArray(object)) {
    for (let index = 0; index < object.length; index += 1) {
      bytes += measureCacheValueBytes(object[index], seen);
    }
  } else if (object instanceof ArrayBuffer || ArrayBuffer.isView(object)) {
    bytes += (object as ArrayBufferView | ArrayBuffer).byteLength;
  } else if (object instanceof Date) {
    // Fixed 16-byte overhead only.
  } else if (object instanceof Map) {
    for (const [key, entryValue] of object) {
      bytes += 8 + measureCacheValueBytes(key, seen) + measureCacheValueBytes(entryValue, seen);
    }
  } else if (object instanceof Set) {
    for (const entryValue of object) {
      bytes += 8 + measureCacheValueBytes(entryValue, seen);
    }
  } else {
    for (const [key, entryValue] of Object.entries(object)) {
      bytes += 16 + key.length * 2 + measureCacheValueBytes(entryValue, seen);
    }
  }
  nodeByteEstimates.set(object, bytes);
  return bytes;
}

export function projectBoundedCacheValue(
  value: unknown,
  maxBytes: number = MAX_BROWSER_METADATA_RECORD_BYTES,
): BrowserMetadataCacheProjection {
  const bytes = estimateCacheValueBytes(value);
  if (bytes <= maxBytes) return { kind: "unchanged", value, bytes };
  const trimmed = trimThreadsToBudget(value, maxBytes);
  if (trimmed === null) return { kind: "oversized", bytes };
  const projectedBytes = estimateCacheValueBytes(trimmed.value);
  if (projectedBytes > maxBytes) return { kind: "oversized", bytes };
  return {
    kind: "truncated",
    value: trimmed.value,
    bytes: projectedBytes,
    droppedThreadCount: trimmed.droppedThreadCount,
  };
}

interface TrimmedCacheValue {
  readonly value: unknown;
  readonly droppedThreadCount: number;
}

/**
 * Keeps the newest threads that fit the remaining budget plus every pinned
 * thread. Ordering is preserved: threads are dropped from the old (tail) end,
 * which is where `[thread, ...state.threads]` insertions put them.
 */
function trimThreadsToBudget(value: unknown, maxBytes: number): TrimmedCacheValue | null {
  const persisted = asRecord(value);
  const state = persisted ? asRecord(persisted.state) : null;
  if (!persisted || !state) return null;
  const threads = state.threads;
  if (!Array.isArray(threads) || threads.length === 0) return null;

  const pinned = pinnedThreadIds(state);
  const emptyShell = { ...persisted, state: { ...state, threads: [] } };
  // Pinned threads are always kept, so charge them up front: the remaining
  // budget can then only admit non-pinned threads that still fit under the cap.
  let pinnedBytes = 0;
  for (const thread of threads) {
    const id = threadIdOf(thread);
    if (id !== null && pinned.has(id)) pinnedBytes += measureCacheValueBytes(thread, new WeakSet());
  }
  let budget = maxBytes - measureCacheValueBytes(emptyShell, new WeakSet()) - pinnedBytes;
  const kept: unknown[] = [];
  let droppedThreadCount = 0;
  let dropping = false;
  for (const thread of threads) {
    const id = threadIdOf(thread);
    if (id !== null && pinned.has(id)) {
      kept.push(thread);
      continue;
    }
    if (dropping) {
      droppedThreadCount += 1;
      continue;
    }
    const threadBytes = measureCacheValueBytes(thread, new WeakSet());
    if (threadBytes <= budget) {
      budget -= threadBytes;
      kept.push(thread);
    } else {
      dropping = true;
      droppedThreadCount += 1;
    }
  }
  if (droppedThreadCount === 0) return null;
  return {
    value: { ...persisted, state: { ...state, threads: kept } },
    droppedThreadCount,
  };
}

/**
 * Thread ids the cached UI must be able to restore: the active view panes and
 * pane layout, keep-alive terminal panes, and every saved group layout. Draft
 * pane ids have no thread row to keep and are ignored.
 */
function pinnedThreadIds(state: Record<string, unknown>): ReadonlySet<string> {
  const pinned = new Set<string>();
  const view = asRecord(state.view);
  if (view?.kind === "thread") {
    addStrings(pinned, view.panes);
    collectLayoutPaneIds(view.paneLayout, pinned);
  }
  addStrings(pinned, state.keepAlivePaneIds);
  const groupLayouts = asRecord(state.groupLayouts);
  if (groupLayouts) {
    for (const layout of Object.values(groupLayouts)) {
      const record = asRecord(layout);
      if (!record) continue;
      addStrings(pinned, record.panes);
      collectLayoutPaneIds(record.paneLayout, pinned);
    }
  }
  return pinned;
}

function addStrings(target: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (typeof entry === "string") target.add(entry);
  }
}

function collectLayoutPaneIds(layout: unknown, target: Set<string>): void {
  const record = asRecord(layout);
  if (!record) return;
  if (record.kind === "leaf") {
    if (typeof record.paneId === "string") target.add(record.paneId);
    return;
  }
  if (record.kind === "split" && Array.isArray(record.children)) {
    for (const child of record.children) collectLayoutPaneIds(child, target);
  }
}

function threadIdOf(thread: unknown): string | null {
  const record = asRecord(thread);
  return record && typeof record.id === "string" ? record.id : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
