import type { PrFile } from "@/shared/contracts";
import { splitUnifiedDiff, viewedFingerprint } from "@/shared/reviewDiff";
import { buildFileTree, flattenTree } from "./fileTree";
import { patchKind, patchStats, type PatchKind } from "./unifiedPatch";

/** A file with this many changed lines starts collapsed behind a "Load diff" button. */
export const LARGE_FILE_CHANGED_LINES = 1500;

export interface ChangeEntry {
  file: PrFile;
  /** `undefined` while the diff has no patch for this path. */
  patch: string | undefined;
  kind: PatchKind;
  /** Fingerprint used for viewed marks (matches the legacy overlay). */
  fingerprint: string;
  large: boolean;
}

const SPLIT_CACHE_SIZE = 6;
const splitCache = new Map<string, Map<string, string>>();

/** Splits a raw diff once per distinct text, however many components ask. */
export function splitDiffOnce(raw: string): Map<string, string> {
  const cached = splitCache.get(raw);
  if (cached) return cached;
  const split = splitUnifiedDiff(raw);
  splitCache.set(raw, split);
  if (splitCache.size > SPLIT_CACHE_SIZE) {
    const oldest = splitCache.keys().next();
    if (!oldest.done) splitCache.delete(oldest.value);
  }
  return split;
}

const entriesCache = new WeakMap<Map<string, string>, WeakMap<PrFile[], ChangeEntry[]>>();

/** Files in tree order with their patch, kind and viewed fingerprint; built once per input pair. */
export function buildChangeEntries(files: PrFile[], patches: Map<string, string>): ChangeEntry[] {
  const perFiles = entriesCache.get(patches);
  const cached = perFiles?.get(files);
  if (cached) return cached;
  const tree = buildFileTree(files.map((file) => file.path));
  const byPath = new Map(files.map((file) => [file.path, file]));
  const entries: ChangeEntry[] = [];
  for (const path of flattenTree(tree)) {
    const file = byPath.get(path);
    if (!file) continue;
    const patch = patches.get(path);
    entries.push({
      file,
      patch,
      kind: patch === undefined ? "modified" : patchKind(patch),
      fingerprint: viewedFingerprint(patch, file),
      large: file.additions + file.deletions >= LARGE_FILE_CHANGED_LINES,
    });
  }
  const next = perFiles ?? new WeakMap<PrFile[], ChangeEntry[]>();
  next.set(files, entries);
  entriesCache.set(patches, next);
  return entries;
}

const commitFilesCache = new WeakMap<Map<string, string>, PrFile[]>();

/** The file list of one commit, read from its diff (no extra request). */
export function filesFromDiff(patches: Map<string, string>): PrFile[] {
  const cached = commitFilesCache.get(patches);
  if (cached) return cached;
  const files = [...patches].map(([path, patch]) => ({ path, ...patchStats(patch) }));
  commitFilesCache.set(patches, files);
  return files;
}

export const NO_PATH_GROUPS: ReadonlyMap<string, never[]> = new Map();

/**
 * A grouping of items by file path that is computed once per source array, so
 * the per-file lists keep their identity until the array is replaced.
 */
export function createPathGrouper<T extends object>(pathOf: (item: T) => string | undefined) {
  const cache = new WeakMap<readonly T[], ReadonlyMap<string, readonly T[]>>();
  return (items: readonly T[] | undefined): ReadonlyMap<string, readonly T[]> => {
    if (!items || items.length === 0) return NO_PATH_GROUPS;
    const cached = cache.get(items);
    if (cached) return cached;
    const grouped = new Map<string, T[]>();
    for (const item of items) {
      const path = pathOf(item);
      if (path === undefined) continue;
      const list = grouped.get(path);
      if (list) list.push(item);
      else grouped.set(path, [item]);
    }
    cache.set(items, grouped);
    return grouped;
  };
}
