import { collectPaneIds, type PaneLayout, type PaneLayoutAxis } from "@/shared/paneLayout";

export const SPLIT_SIZE_STORAGE_PREFIX = "poracode-pane-sizes";
const PANE_ID_SEPARATOR = "\0";

export const MIN_PANE_PERCENT = 15;

export function equalSizes(count: number): number[] {
  return Array.from({ length: count }, () => 100 / count);
}

export function splitStorageKey(layout: PaneLayout, axis: PaneLayoutAxis): string {
  return `${SPLIT_SIZE_STORAGE_PREFIX}:${axis}:${collectPaneIds(layout).join(PANE_ID_SEPARATOR)}`;
}

function normalizeSizes(raw: number[], count: number): number[] | null {
  if (
    raw.length !== count ||
    raw.some((value) => !Number.isFinite(value) || value < MIN_PANE_PERCENT)
  ) {
    return null;
  }
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const normalized = raw.map((value) => (value / total) * 100);
  if (normalized.some((value) => value < MIN_PANE_PERCENT)) return null;
  return normalized;
}

export function readStoredSizes(key: string, count: number): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return equalSizes(count);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return equalSizes(count);
    return normalizeSizes(parsed, count) ?? equalSizes(count);
  } catch {
    return equalSizes(count);
  }
}

export function writeStoredSizes(key: string, sizes: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(sizes));
  } catch {
    // ignore quota / privacy errors
  }
}

/**
 * Rewrite split-size localStorage keys by remapping pane ids. The storage key
 * encodes the full pane id list (in tree order), so any change to that list —
 * a rename (draft → real thread id) or a swap (drag-to-replace pane reorder) —
 * shifts the key. Without rewriting the stored entry, `readStoredSizes` falls
 * back to equal sizes and the user's custom proportions are silently lost.
 *
 * Sizes are stored as a positional array; this only rewrites the *key*, so
 * size-per-slot is preserved while the contents of those slots change.
 */
function remapPaneIdsInStorage(mapper: (paneId: string) => string): void {
  if (typeof localStorage === "undefined") return;

  const matchingKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!key.startsWith(`${SPLIT_SIZE_STORAGE_PREFIX}:`)) continue;
    matchingKeys.push(key);
  }

  for (const key of matchingKeys) {
    const axisSeparator = key.indexOf(":", SPLIT_SIZE_STORAGE_PREFIX.length + 1);
    if (axisSeparator === -1) continue;
    const idsPart = key.slice(axisSeparator + 1);
    const ids = idsPart.split(PANE_ID_SEPARATOR);
    const nextIds = ids.map(mapper);
    if (nextIds.every((id, i) => id === ids[i])) continue;
    const nextKey = `${key.slice(0, axisSeparator + 1)}${nextIds.join(PANE_ID_SEPARATOR)}`;
    if (nextKey === key) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    try {
      localStorage.removeItem(key);
      localStorage.setItem(nextKey, value);
    } catch {
      // ignore quota / privacy errors
    }
  }
}

export function migratePaneSizeStorage(oldPaneId: string, newPaneId: string): void {
  if (oldPaneId === newPaneId) return;
  remapPaneIdsInStorage((id) => (id === oldPaneId ? newPaneId : id));
}

/**
 * Swap two pane ids in all split-size localStorage keys at once. Used when the
 * user drags one pane onto another to swap positions: each slot keeps its size,
 * only the pane id occupying that slot changes.
 */
export function swapPaneIdsInStorage(firstPaneId: string, secondPaneId: string): void {
  if (firstPaneId === secondPaneId) return;
  remapPaneIdsInStorage((id) => {
    if (id === firstPaneId) return secondPaneId;
    if (id === secondPaneId) return firstPaneId;
    return id;
  });
}

type SplitStorageEntry = {
  layout: Extract<PaneLayout, { kind: "split" }>;
  path: number[];
  paneIds: Set<string>;
  childPaneIds: Set<string>[];
};

function collectSplitStorageEntries(
  layout: PaneLayout,
  path: number[] = [],
  entries: SplitStorageEntry[] = [],
): SplitStorageEntry[] {
  if (layout.kind === "leaf") return entries;

  entries.push({
    layout,
    path,
    paneIds: new Set(collectPaneIds(layout)),
    childPaneIds: layout.children.map((child) => new Set(collectPaneIds(child))),
  });

  for (let i = 0; i < layout.children.length; i++) {
    collectSplitStorageEntries(layout.children[i]!, [...path, i], entries);
  }

  return entries;
}

function countOverlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const id of left) {
    if (right.has(id)) count++;
  }
  return count;
}

export function samePath(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findBestPreviousSplit(
  next: SplitStorageEntry,
  previousEntries: SplitStorageEntry[],
): SplitStorageEntry | undefined {
  let best: { entry: SplitStorageEntry; score: number } | undefined;

  for (const previous of previousEntries) {
    if (previous.layout.axis !== next.layout.axis) continue;
    const overlap = countOverlap(previous.paneIds, next.paneIds);
    if (overlap === 0) continue;
    const score =
      overlap * 10 +
      (samePath(previous.path, next.path) ? 1000 : 0) +
      (previous.layout.children.length === next.layout.children.length ? 500 : 0);
    if (!best || score > best.score) {
      best = { entry: previous, score };
    }
  }

  return best?.entry;
}

function projectSizes(previous: SplitStorageEntry, next: SplitStorageEntry): number[] {
  const previousKey = splitStorageKey(previous.layout, previous.layout.axis);
  const previousSizes = readStoredSizes(previousKey, previous.layout.children.length);

  if (previous.layout.children.length === next.layout.children.length) {
    return previousSizes;
  }

  const usedPreviousIndexes = new Set<number>();
  const nextCount = next.layout.children.length;
  const equalNewSize = 100 / nextCount;
  // `null` marks a child with no previous counterpart (a newly inserted pane).
  const matchedSizes = next.childPaneIds.map((nextChildIds) => {
    let bestIndex = -1;
    let bestOverlap = 0;
    for (let i = 0; i < previous.childPaneIds.length; i++) {
      if (usedPreviousIndexes.has(i)) continue;
      const overlap = countOverlap(previous.childPaneIds[i]!, nextChildIds);
      if (overlap > bestOverlap) {
        bestIndex = i;
        bestOverlap = overlap;
      }
    }
    if (bestIndex === -1) return null;
    usedPreviousIndexes.add(bestIndex);
    return previousSizes[bestIndex] ?? null;
  });

  const insertedCount = matchedSizes.filter((value) => value === null).length;
  const survivingTotal = matchedSizes.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (survivingTotal <= 0) return equalSizes(nextCount);

  // Newly inserted children take an equal share of the split; the surviving
  // children shrink proportionally into what's left. Normalizing a mixed list
  // instead would shrink the new pane along with the others, so it would always
  // end up smaller than its siblings (2 panes at 50/50 + 1 new → 37.5/37.5/25).
  const remainingTotal = 100 - insertedCount * equalNewSize;
  if (remainingTotal <= 0) return equalSizes(nextCount);
  const scale = remainingTotal / survivingTotal;
  return matchedSizes.map((value) => (value === null ? equalNewSize : value * scale));
}

export function preservePaneSizeStorageForLayoutChange(
  previousLayout: PaneLayout,
  nextLayout: PaneLayout,
): void {
  const previousEntries = collectSplitStorageEntries(previousLayout);
  if (previousEntries.length === 0) return;

  for (const nextEntry of collectSplitStorageEntries(nextLayout)) {
    const previousEntry = findBestPreviousSplit(nextEntry, previousEntries);
    if (!previousEntry) continue;
    const nextKey = splitStorageKey(nextEntry.layout, nextEntry.layout.axis);
    writeStoredSizes(nextKey, projectSizes(previousEntry, nextEntry));
  }
}
