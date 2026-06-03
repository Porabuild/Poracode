import { useEffect } from "react";
import type { editor as MonacoEditor } from "monaco-editor";
import { type DiffOp, diffLineOps } from "@/shared/lineUnifiedDiff";
import type { FileEditorGitDiffContext } from "@/renderer/state/fileEditorStore";

/**
 * Renders git-diff gutter rails plus deleted-line view zones in the Monaco editor and keeps
 * them live as the user types. Mirrors `useMergeConflictContribution`: the heavy diff logic
 * lives here rather than in the view, and content-change recomputes are coalesced per frame.
 */
export function useGitDiffContribution(args: {
  editor: MonacoEditor.IStandaloneCodeEditor | null;
  gitDiff: FileEditorGitDiffContext | null;
  bufferStatus: string;
}) {
  const { editor, gitDiff, bufferStatus } = args;

  useEffect(() => {
    if (!gitDiff || !editor || bufferStatus !== "ready") return;
    const fallbackDecorations = buildGitDiffDecorations(gitDiff.diff);
    const baseline = buildGitDiffBaseline(gitDiff.diff, editor.getValue());
    const decorations = editor.createDecorationsCollection();
    const zoneIds: string[] = [];

    const render = () => {
      const diffDecorations = baseline
        ? buildLiveGitDiffDecorations(baseline, editor.getValue(), fallbackDecorations)
        : fallbackDecorations;
      decorations.set(diffDecorations.decorations);
      replaceGitDiffZones(editor, zoneIds, diffDecorations.deletedZones);
    };

    let frame: number | null = null;
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        render();
      });
    };

    render();
    const contentListener = editor.onDidChangeModelContent(schedule);

    return () => {
      contentListener.dispose();
      if (frame !== null) window.cancelAnimationFrame(frame);
      replaceGitDiffZones(editor, zoneIds, []);
      decorations.clear();
    };
  }, [gitDiff, editor, bufferStatus]);
}

interface GitDiffEditorDecorations {
  decorations: MonacoEditor.IModelDeltaDecoration[];
  deletedZones: Array<{ afterLineNumber: number; lines: string[] }>;
}

/** LCS DP allocates `(n+1)*(m+1)` cells; beyond this we fall back to the static diff parse. */
const MAX_GIT_DIFF_DECORATION_CELLS = 4_000_000;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function buildGitDiffBaseline(diff: string, currentText: string): string | null {
  const currentLines = splitDiffTextLines(currentText);
  const baselineLines: string[] = [];
  let currentIndex = 0;
  let foundHunk = false;

  for (const hunk of parseGitDiffHunks(diff)) {
    foundHunk = true;
    const hunkCurrentIndex = Math.max(0, hunk.newStart - 1);
    if (hunkCurrentIndex < currentIndex || hunkCurrentIndex > currentLines.length) return null;

    baselineLines.push(...currentLines.slice(currentIndex, hunkCurrentIndex));
    currentIndex = hunkCurrentIndex;

    for (const rawLine of hunk.lines) {
      if (rawLine.startsWith(" ")) {
        const expectedLine = rawLine.slice(1);
        if (currentLines[currentIndex] !== expectedLine) return null;
        baselineLines.push(expectedLine);
        currentIndex += 1;
        continue;
      }
      if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
        if (currentLines[currentIndex] !== rawLine.slice(1)) return null;
        currentIndex += 1;
        continue;
      }
      if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
        baselineLines.push(rawLine.slice(1));
      }
    }
  }

  if (!foundHunk || currentIndex > currentLines.length) return null;
  baselineLines.push(...currentLines.slice(currentIndex));
  return baselineLines.join("\n");
}

function buildLiveGitDiffDecorations(
  baseline: string,
  currentText: string,
  fallbackDecorations: GitDiffEditorDecorations,
): GitDiffEditorDecorations {
  const ops = diffBaselineOps(baseline, currentText);
  if (!ops) return fallbackDecorations;
  return buildGitDiffDecorationsFromOps(ops);
}

/**
 * Diff the reconstructed baseline against the live editor text, returning `null` (so callers fall
 * back to the static diff) when the file is too large for the LCS DP. Delegates to the shared
 * `diffLineOps`; baseline is already `\n`-joined, so only the current text needs CRLF normalizing.
 */
function diffBaselineOps(baseline: string, currentText: string): DiffOp[] | null {
  const normalizedCurrent = currentText.replace(/\r\n/g, "\n");
  const oldLineCount = splitDiffTextLines(baseline).length;
  const newLineCount = splitDiffTextLines(normalizedCurrent).length;
  if ((oldLineCount + 1) * (newLineCount + 1) > MAX_GIT_DIFF_DECORATION_CELLS) return null;
  return diffLineOps(baseline, normalizedCurrent);
}

function parseGitDiffHunks(diff: string): Array<{ newStart: number; lines: string[] }> {
  const hunks: Array<{ newStart: number; lines: string[] }> = [];
  let currentHunk: { newStart: number; lines: string[] } | null = null;

  for (const rawLine of diff.split(/\r?\n/)) {
    const hunk = HUNK_HEADER.exec(rawLine);
    if (hunk) {
      currentHunk = { newStart: Number(hunk[1] ?? "1"), lines: [] };
      hunks.push(currentHunk);
      continue;
    }
    if (!currentHunk) continue;
    currentHunk.lines.push(rawLine);
  }

  return hunks;
}

/** Accumulates added/deleted line decorations and groups runs of deleted lines into view zones. */
function createDecorationCollector() {
  const decorations: MonacoEditor.IModelDeltaDecoration[] = [];
  const deletedZones: GitDiffEditorDecorations["deletedZones"] = [];
  let deletedLines: string[] = [];
  let deletedAfterLineNumber = 0;

  const flushDeleted = () => {
    if (deletedLines.length === 0) return;
    deletedZones.push({ afterLineNumber: deletedAfterLineNumber, lines: deletedLines });
    deletedLines = [];
  };

  return {
    unchanged() {
      flushDeleted();
    },
    added(newLine: number) {
      flushDeleted();
      decorations.push(createAddedLineDecoration(newLine));
    },
    deleted(newLine: number, text: string) {
      if (deletedLines.length === 0) deletedAfterLineNumber = Math.max(0, newLine - 1);
      deletedLines.push(text);
      decorations.push(createDeletedLineDecoration(Math.max(1, newLine)));
    },
    finish(): GitDiffEditorDecorations {
      flushDeleted();
      return { decorations, deletedZones };
    },
  };
}

function buildGitDiffDecorationsFromOps(ops: DiffOp[]): GitDiffEditorDecorations {
  const collector = createDecorationCollector();
  let newLine = 1;
  for (const op of ops) {
    if (op.kind === "equal") {
      collector.unchanged();
      newLine += 1;
    } else if (op.kind === "insert") {
      collector.added(newLine);
      newLine += 1;
    } else {
      collector.deleted(newLine, op.text);
    }
  }
  return collector.finish();
}

function buildGitDiffDecorations(diff: string): GitDiffEditorDecorations {
  const collector = createDecorationCollector();
  let newLine: number | null = null;

  for (const rawLine of diff.split(/\r?\n/)) {
    const hunk = HUNK_HEADER.exec(rawLine);
    if (hunk) {
      collector.unchanged();
      newLine = Number(hunk[1] ?? "1");
      continue;
    }
    if (newLine === null) continue;
    if (rawLine.startsWith(" ")) {
      collector.unchanged();
      newLine += 1;
      continue;
    }
    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      collector.added(newLine);
      newLine += 1;
      continue;
    }
    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      collector.deleted(newLine, rawLine.slice(1));
    }
  }
  return collector.finish();
}

function createAddedLineDecoration(lineNumber: number): MonacoEditor.IModelDeltaDecoration {
  return {
    range: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 },
    options: {
      isWholeLine: true,
      className: "lc-git-add-line",
      linesDecorationsClassName: "lc-git-add-rail",
      stickiness: 1,
    },
  };
}

function createDeletedLineDecoration(lineNumber: number): MonacoEditor.IModelDeltaDecoration {
  return {
    range: {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: 1,
    },
    options: {
      isWholeLine: true,
      linesDecorationsClassName: "lc-git-delete-rail",
      stickiness: 1,
    },
  };
}

function replaceGitDiffZones(
  editor: MonacoEditor.IStandaloneCodeEditor,
  zoneIds: string[],
  deletedZones: GitDiffEditorDecorations["deletedZones"],
) {
  try {
    editor.changeViewZones((accessor) => {
      for (const id of zoneIds) accessor.removeZone(id);
      zoneIds.length = 0;
      for (const zone of deletedZones) {
        zoneIds.push(
          accessor.addZone({
            afterLineNumber: zone.afterLineNumber,
            heightInLines: zone.lines.length,
            domNode: createDeletedLinesNode(zone.lines),
            marginDomNode: createDeletedLinesMarginNode(),
            suppressMouseDown: true,
          }),
        );
      }
    });
  } catch {}
}

function splitDiffTextLines(text: string): string[] {
  if (text.length === 0) return [];
  const normalized = text.replace(/\r\n/g, "\n");
  const withoutTrailingNewline = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return withoutTrailingNewline.split("\n");
}

function createDeletedLinesNode(lines: string[]): HTMLElement {
  const node = document.createElement("div");
  node.className = "lc-git-delete-zone";
  for (const line of lines) {
    const row = document.createElement("div");
    row.className = "lc-git-delete-zone-line";
    const marker = document.createElement("span");
    marker.className = "lc-git-delete-zone-marker";
    marker.textContent = "-";
    const content = document.createElement("span");
    content.textContent = line.length > 0 ? line : " ";
    row.append(marker, content);
    node.append(row);
  }
  return node;
}

function createDeletedLinesMarginNode(): HTMLElement {
  const node = document.createElement("div");
  node.className = "lc-git-delete-zone-margin";
  return node;
}
