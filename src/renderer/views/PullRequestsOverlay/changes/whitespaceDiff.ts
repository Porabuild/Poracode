/**
 * Client-side "hide whitespace" for one file's unified patch.
 *
 * Rule (the same idea as `git diff -w`, applied to an already fetched patch):
 *
 * - A hunk body is read as context, `-` and `+` lines. A maximal run of `-`/`+`
 *   lines is one change block. `\ No newline at end of file` markers belong to
 *   the line before them.
 * - Inside a block, the removed lines and the added lines are matched in order
 *   (longest common subsequence). Two lines match when they are equal after
 *   removing every whitespace character (spaces, tabs, `\r`, ...).
 * - Each matched pair becomes one context line carrying the new-side text, so
 *   old and new line numbers stay correct. Unmatched lines stay `-` / `+`, and
 *   a marker attached to a converted line is dropped with it.
 * - Hunk headers are recounted from the remaining lines (start lines and the
 *   trailing section text are kept) and a hunk with no `-`/`+` line left is
 *   dropped. Context is not re-trimmed, so a surviving hunk keeps its context.
 * - A patch without hunks (rename only, binary) and a patch with nothing to
 *   hide are returned unchanged. When every change was whitespace-only the
 *   result is `whitespaceOnly` and `patch` is just the file header.
 */

import { parsePatch, type Hunk, type PatchLine } from "./unifiedPatch";

const WHITESPACE = /\s+/g;
/** Above this many line pairs in one block, matching falls back to position. */
const MAX_LCS_CELLS = 4_000_000;

export interface WhitespaceFilterResult {
  patch: string;
  /** `-`/`+` lines turned into context (counted per line, so a pair is 2). */
  hiddenLines: number;
  /** `-`/`+` lines still in the patch. */
  remainingChanges: number;
  /** The patch had changes and every one of them was whitespace-only. */
  whitespaceOnly: boolean;
}

function normalize(text: string): string {
  return text.replace(WHITESPACE, "");
}

/** In-order pairs `[removedIndex, addedIndex]` of whitespace-equal lines. */
function matchPairs(removed: string[], added: string[]): [number, number][] {
  const rows = removed.length;
  const columns = added.length;
  if (rows === 0 || columns === 0) return [];
  if (rows * columns > MAX_LCS_CELLS) {
    const pairs: [number, number][] = [];
    for (let at = 0; at < Math.min(rows, columns); at += 1) {
      if (removed[at] === added[at]) pairs.push([at, at]);
    }
    return pairs;
  }
  // lengths[i][j] is the match count for removed[i..] against added[j..].
  const width = columns + 1;
  const lengths = new Uint32Array((rows + 1) * width);
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      lengths[row * width + column] =
        removed[row] === added[column]
          ? lengths[(row + 1) * width + column + 1]! + 1
          : Math.max(lengths[(row + 1) * width + column]!, lengths[row * width + column + 1]!);
    }
  }
  const pairs: [number, number][] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (removed[row] === added[column]) {
      pairs.push([row, column]);
      row += 1;
      column += 1;
    } else if (lengths[(row + 1) * width + column]! >= lengths[row * width + column + 1]!) {
      row += 1;
    } else {
      column += 1;
    }
  }
  return pairs;
}

function rewriteBlock(removed: PatchLine[], added: PatchLine[], out: PatchLine[]): number {
  const pairs = matchPairs(
    removed.map((line) => normalize(line.text)),
    added.map((line) => normalize(line.text)),
  );
  let removedAt = 0;
  let addedAt = 0;
  for (const [removedIndex, addedIndex] of pairs) {
    while (removedAt < removedIndex) out.push(removed[removedAt++]!);
    while (addedAt < addedIndex) out.push(added[addedAt++]!);
    out.push({ kind: " ", text: added[addedIndex]!.text, noEol: false });
    removedAt = removedIndex + 1;
    addedAt = addedIndex + 1;
  }
  while (removedAt < removed.length) out.push(removed[removedAt++]!);
  while (addedAt < added.length) out.push(added[addedAt++]!);
  return pairs.length * 2;
}

function rewriteHunk(hunk: Hunk): { lines: PatchLine[]; hidden: number } {
  const out: PatchLine[] = [];
  let hidden = 0;
  let removed: PatchLine[] = [];
  let added: PatchLine[] = [];
  const flush = () => {
    hidden += rewriteBlock(removed, added, out);
    removed = [];
    added = [];
  };
  for (const line of hunk.lines) {
    if (line.kind === "-") removed.push(line);
    else if (line.kind === "+") added.push(line);
    else {
      flush();
      out.push(line);
    }
  }
  flush();
  return { lines: out, hidden };
}

function countText(start: number, count: number): string {
  return count === 1 ? `${start}` : `${start},${count}`;
}

function serializeHunk(hunk: Hunk, lines: PatchLine[]): string[] {
  const oldCount = lines.filter((line) => line.kind !== "+").length;
  const newCount = lines.filter((line) => line.kind !== "-").length;
  const out = [
    `@@ -${countText(hunk.oldStart, oldCount)} +${countText(hunk.newStart, newCount)} @@${hunk.section}`,
  ];
  for (const line of lines) {
    out.push(`${line.kind}${line.text}`);
    if (line.noEol) out.push("\\ No newline at end of file");
  }
  return out;
}

function changeCount(lines: PatchLine[]): number {
  return lines.filter((line) => line.kind !== " ").length;
}

export function hideWhitespaceChanges(patch: string): WhitespaceFilterResult {
  const { header, hunks, tail } = parsePatch(patch);
  if (hunks.length === 0) {
    return { patch, hiddenLines: 0, remainingChanges: 0, whitespaceOnly: false };
  }
  let hiddenLines = 0;
  let originalChanges = 0;
  let remainingChanges = 0;
  const kept: string[][] = [];
  for (const hunk of hunks) {
    originalChanges += changeCount(hunk.lines);
    const rewritten = rewriteHunk(hunk);
    hiddenLines += rewritten.hidden;
    const remaining = changeCount(rewritten.lines);
    remainingChanges += remaining;
    if (remaining > 0) kept.push(serializeHunk(hunk, rewritten.lines));
  }
  if (hiddenLines === 0) {
    return { patch, hiddenLines: 0, remainingChanges, whitespaceOnly: false };
  }
  const whitespaceOnly = originalChanges > 0 && remainingChanges === 0;
  const body = kept.flat();
  // A trailing empty piece is the patch's final newline; keep it.
  const result = [...header, ...body, ...tail].join("\n");
  return { patch: result, hiddenLines, remainingChanges, whitespaceOnly };
}
