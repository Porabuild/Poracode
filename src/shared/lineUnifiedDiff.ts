export interface LineChangeStats {
  added: number;
  removed: number;
}

export type DiffOp =
  | { kind: "equal"; text: string }
  | { kind: "delete"; text: string }
  | { kind: "insert"; text: string };

const CONTEXT_LINES = 3;
/** LCS DP allocates `(n+1)*(m+1)` cells. Beyond this we degrade to a coarse diff. */
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
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const n = oldLines.length;
  const m = newLines.length;
  if ((n + 1) * (m + 1) > MAX_DP_CELLS) {
    return [
      ...oldLines.map<DiffOp>((text) => ({ kind: "delete", text })),
      ...newLines.map<DiffOp>((text) => ({ kind: "insert", text })),
    ];
  }
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
