export interface LineChangeStats {
  added: number;
  removed: number;
}

export interface UnifiedDiffStats {
  files: number;
  insertions: number;
  deletions: number;
}

export type DiffOp =
  | { kind: "equal"; text: string }
  | { kind: "delete"; text: string }
  | { kind: "insert"; text: string };

const CONTEXT_LINES = 3;
/**
 * LCS DP allocates `(n+1)*(m+1)` cells. Beyond this we anchor on lines that are
 * unique to both sides (patience-style) and recurse; only anchor-free oversized
 * regions degrade to a coarse delete-all/insert-all diff.
 */
const MAX_DP_CELLS = 4_000_000;

/**
 * Normalize a filesystem path for unified-diff headers. Absolute Windows paths
 * break `@git-diff-view` parsing; keep a stable repo-relative tail when possible.
 */
export function normalizeDiffFilePath(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  const withoutDrive = normalized.replace(/^[a-zA-Z]:\//, "");
  const segments = withoutDrive.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return path.trim();
  if (segments.length <= 4) return withoutDrive;
  return segments.slice(-4).join("/");
}

export function countLineChangeStats(oldText: string, newText: string): LineChangeStats {
  let added = 0;
  let removed = 0;
  for (const op of diffLineOps(oldText, newText)) {
    if (op.kind === "insert") added += 1;
    if (op.kind === "delete") removed += 1;
  }
  return { added, removed };
}

export function countUnifiedDiffStats(diff: string): UnifiedDiffStats {
  let files = 0;
  let insertions = 0;
  let deletions = 0;
  let lineStart = 0;
  while (lineStart < diff.length) {
    if (diff.startsWith("diff --git ", lineStart)) files += 1;
    else if (diff.startsWith("+", lineStart) && !diff.startsWith("+++", lineStart)) {
      insertions += 1;
    } else if (diff.startsWith("-", lineStart) && !diff.startsWith("---", lineStart)) {
      deletions += 1;
    }
    const newline = diff.indexOf("\n", lineStart);
    if (newline === -1) break;
    lineStart = newline + 1;
  }
  return { files, insertions, deletions };
}

/**
 * The `diff --git` / `---` / `+++` header lines for a unified diff. `displayPath`
 * must already be normalized via {@link normalizeDiffFilePath}.
 */
export function buildDiffHeaderLines(
  displayPath: string,
  isCreate: boolean,
  isDelete: boolean,
): string[] {
  return [
    `diff --git a/${displayPath} b/${displayPath}`,
    isCreate ? "--- /dev/null" : `--- a/${displayPath}`,
    isDelete ? "+++ /dev/null" : `+++ b/${displayPath}`,
  ];
}

/** Git hunk ranges drop the `,count` suffix when the range covers a single line. */
export function formatHunkRange(start: number, count: number): string {
  return count === 1 ? String(start) : `${start},${count}`;
}

/** Build a minimal unified diff suitable for InlineDiffView / git-diff-view. */
export function buildLineUnifiedDiff(path: string, oldText: string, newText: string): string {
  const displayPath = normalizeDiffFilePath(path);
  const ops = diffLineOps(oldText, newText);
  const isCreate = oldText.length === 0;
  const isDelete = newText.length === 0;
  const hunks = buildHunks(ops);
  return [...buildDiffHeaderLines(displayPath, isCreate, isDelete), ...hunks, ""].join("\n");
}

export function diffLineOps(oldText: string, newText: string): DiffOp[] {
  if (oldText === newText) {
    return splitLines(oldText).map((text) => ({ kind: "equal", text }));
  }
  return diffLinesTrimmed(splitLines(oldText), splitLines(newText));
}

/** Peel matching prefix/suffix lines before dispatching to the core diff. */
function diffLinesTrimmed(oldLines: readonly string[], newLines: readonly string[]): DiffOp[] {
  const shorter = Math.min(oldLines.length, newLines.length);
  let prefix = 0;
  while (prefix < shorter && oldLines[prefix] === newLines[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < shorter - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return [
    ...oldLines.slice(0, prefix).map<DiffOp>((text) => ({ kind: "equal", text })),
    ...diffLinesCore(
      oldLines.slice(prefix, oldLines.length - suffix),
      newLines.slice(prefix, newLines.length - suffix),
    ),
    ...oldLines.slice(oldLines.length - suffix).map<DiffOp>((text) => ({ kind: "equal", text })),
  ];
}

function diffLinesCore(oldLines: readonly string[], newLines: readonly string[]): DiffOp[] {
  if (oldLines.length === 0) return newLines.map((text) => ({ kind: "insert", text }));
  if (newLines.length === 0) return oldLines.map((text) => ({ kind: "delete", text }));
  if ((oldLines.length + 1) * (newLines.length + 1) <= MAX_DP_CELLS) {
    return diffLinesLcs(oldLines, newLines);
  }
  const anchors = findUniqueLineAnchors(oldLines, newLines);
  if (anchors.length === 0) {
    return [
      ...oldLines.map<DiffOp>((text) => ({ kind: "delete", text })),
      ...newLines.map<DiffOp>((text) => ({ kind: "insert", text })),
    ];
  }
  const ops: DiffOp[] = [];
  let oldFrom = 0;
  let newFrom = 0;
  for (const anchor of anchors) {
    ops.push(
      ...diffLinesTrimmed(
        oldLines.slice(oldFrom, anchor.oldIndex),
        newLines.slice(newFrom, anchor.newIndex),
      ),
      { kind: "equal", text: oldLines[anchor.oldIndex]! },
    );
    oldFrom = anchor.oldIndex + 1;
    newFrom = anchor.newIndex + 1;
  }
  ops.push(...diffLinesTrimmed(oldLines.slice(oldFrom), newLines.slice(newFrom)));
  return ops;
}

function diffLinesLcs(oldLines: readonly string[], newLines: readonly string[]): DiffOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (oldLines[i] === newLines[j]) dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      else dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: "equal", text: oldLines[i]! });
      i += 1;
      j += 1;
    } else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) {
      ops.push({ kind: "delete", text: oldLines[i]! });
      i += 1;
    } else {
      ops.push({ kind: "insert", text: newLines[j]! });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: "delete", text: oldLines[i]! });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: "insert", text: newLines[j]! });
    j += 1;
  }
  return ops;
}

interface LineAnchor {
  oldIndex: number;
  newIndex: number;
}

/**
 * Patience-diff anchoring: lines that appear exactly once on both sides, kept
 * in a longest increasing subsequence so anchor order is consistent on both
 * sides. Splitting at these anchors keeps oversized diffs minimal instead of
 * degrading to delete-all/insert-all.
 */
function findUniqueLineAnchors(
  oldLines: readonly string[],
  newLines: readonly string[],
): LineAnchor[] {
  const oldUnique = collectUniqueLineIndexes(oldLines);
  const newUnique = collectUniqueLineIndexes(newLines);
  const candidates: LineAnchor[] = [];
  for (const [text, oldIndex] of oldUnique) {
    const newIndex = newUnique.get(text);
    if (newIndex !== undefined) candidates.push({ oldIndex, newIndex });
  }
  candidates.sort((a, b) => a.oldIndex - b.oldIndex);
  return longestIncreasingByNewIndex(candidates);
}

function collectUniqueLineIndexes(lines: readonly string[]): Map<string, number> {
  const indexes = new Map<string, number>();
  const duplicates = new Set<string>();
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i]!;
    if (duplicates.has(text)) continue;
    if (indexes.has(text)) {
      indexes.delete(text);
      duplicates.add(text);
    } else {
      indexes.set(text, i);
    }
  }
  return indexes;
}

/** O(k log k) LIS over `newIndex` for candidates already sorted by `oldIndex`. */
function longestIncreasingByNewIndex(candidates: readonly LineAnchor[]): LineAnchor[] {
  const tailIndexes: number[] = [];
  const predecessors = new Array<number>(candidates.length).fill(-1);
  for (let i = 0; i < candidates.length; i += 1) {
    const value = candidates[i]!.newIndex;
    let low = 0;
    let high = tailIndexes.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (candidates[tailIndexes[mid]!]!.newIndex < value) low = mid + 1;
      else high = mid;
    }
    if (low > 0) predecessors[i] = tailIndexes[low - 1]!;
    tailIndexes[low] = i;
  }
  const result: LineAnchor[] = [];
  let cursor = tailIndexes.length > 0 ? tailIndexes[tailIndexes.length - 1]! : -1;
  while (cursor >= 0) {
    result.push(candidates[cursor]!);
    cursor = predecessors[cursor]!;
  }
  return result.reverse();
}

function buildHunks(ops: DiffOp[]): string[] {
  const changed = ops
    .map((op, index) => (op.kind === "equal" ? -1 : index))
    .filter((index) => index >= 0);
  if (changed.length === 0) return [];

  const regions: Array<{ start: number; end: number }> = [];
  let regionStart = changed[0]!;
  let regionEnd = changed[0]!;
  for (let c = 1; c < changed.length; c += 1) {
    const index = changed[c]!;
    if (index - regionEnd <= CONTEXT_LINES * 2 + 1) {
      regionEnd = index;
    } else {
      regions.push({ start: regionStart, end: regionEnd });
      regionStart = index;
      regionEnd = index;
    }
  }
  regions.push({ start: regionStart, end: regionEnd });

  const hunks: string[] = [];
  for (const region of regions) {
    const hunkStart = Math.max(0, region.start - CONTEXT_LINES);
    const hunkEnd = Math.min(ops.length - 1, region.end + CONTEXT_LINES);
    const slice = ops.slice(hunkStart, hunkEnd + 1);
    const oldLinesBefore = countOldLinesBefore(ops, hunkStart);
    const newLinesBefore = countNewLinesBefore(ops, hunkStart);
    const oldCount = slice.filter((op) => op.kind !== "insert").length;
    const newCount = slice.filter((op) => op.kind !== "delete").length;
    const body = slice.flatMap((op) => {
      if (op.kind === "equal") return [` ${op.text}`];
      if (op.kind === "delete") return [`-${op.text}`];
      return [`+${op.text}`];
    });
    hunks.push(
      `@@ -${formatOldHunkRange(oldCount, oldLinesBefore)} +${formatNewHunkRange(newCount, newLinesBefore)} @@`,
      ...body,
    );
  }
  return hunks;
}

function countOldLinesBefore(ops: DiffOp[], endExclusive: number): number {
  let count = 0;
  for (let i = 0; i < endExclusive; i += 1) {
    if (ops[i]?.kind !== "insert") count += 1;
  }
  return count;
}

function countNewLinesBefore(ops: DiffOp[], endExclusive: number): number {
  let count = 0;
  for (let i = 0; i < endExclusive; i += 1) {
    if (ops[i]?.kind !== "delete") count += 1;
  }
  return count;
}

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const withoutTrailingNewline = text.endsWith("\n") ? text.slice(0, -1) : text;
  return withoutTrailingNewline.split("\n");
}

/** Git unified-diff old-file range (`-0,0` when the hunk only adds lines). */
function formatOldHunkRange(count: number, linesBefore: number): string {
  if (count === 0) return "0,0";
  return formatHunkRange(linesBefore + 1, count);
}

/** Git unified-diff new-file range. */
function formatNewHunkRange(count: number, linesBefore: number): string {
  if (count === 0) return "0,0";
  return formatHunkRange(linesBefore + 1, count);
}
