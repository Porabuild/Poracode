import type { FileChangePayload } from "@/shared/contracts";
import { extractLeadingPath } from "@/shared/extractLeadingPath";
import { countLineChangeStats } from "@/shared/lineUnifiedDiff";

type DiffSummary = NonNullable<FileChangePayload["diffSummary"]>;

export function readDiffSummary(...sources: unknown[]): DiffSummary | undefined {
  for (const source of sources) {
    const summary = readDiffSummaryInner(source);
    if (summary) return summary;
  }
  return undefined;
}

function readDiffSummaryInner(source: unknown): DiffSummary | undefined {
  if (typeof source === "string") {
    return readPatchTextDiffSummary(source);
  }
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  return (
    readDiffSummaryRecord(record.diffSummary) ??
    readDiffSummaryRecord(record.diff_summary) ??
    readStructuredChangesDiffSummary(record.changes) ??
    readCreatedContentDiffSummary(record) ??
    readPatchTextDiffSummary(record.patchText) ??
    readPatchTextDiffSummary(record.patch_text) ??
    readPatchTextDiffSummary(record.patch) ??
    readDiffSummaryRecord(record)
  );
}

function readDiffSummaryRecord(source: unknown): DiffSummary | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  const added = readCount(record.added ?? record.additions);
  const removed = readCount(record.removed ?? record.deletions);
  return added !== undefined && removed !== undefined ? { added, removed } : undefined;
}

function readCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function readFileChangePath(...sources: unknown[]): string | undefined {
  for (const source of sources) {
    const path = readFileChangePathInner(source);
    if (path) return path;
  }
  return undefined;
}

function readFileChangePathInner(source: unknown): string | undefined {
  if (source && typeof source === "object") {
    const record = source as Record<string, unknown>;
    return (
      readPathField(record) ??
      readFirstStructuredChangePath(record.changes) ??
      readPatchTextPath(record.patchText) ??
      readPatchTextPath(record.patch_text) ??
      readPatchTextPath(record.patch) ??
      readFileChangePathInner(record.args) ??
      readFileChangePathInner(record.input) ??
      readFileChangePathInner(record.rawInput) ??
      readFileChangePathInner(record.output) ??
      readFileChangePathInner(record.result) ??
      readFileChangePathInner(record.rawOutput) ??
      extractTitlePath(record.title) ??
      extractTitlePath(record.name)
    );
  }
  if (typeof source !== "string") return undefined;

  const patchPath = /^\*\*\*\s+(?:Add|Update|Delete)\s+File:\s+(.+?)\s*$/m.exec(source);
  if (patchPath?.[1]) return patchPath[1].trim();

  const diffPath = readUnifiedDiffPath(source);
  if (diffPath) return diffPath;

  const leading = extractLeadingPath(source);
  if (leading) return leading;

  const writingTarget = /\b(?:to|file)\s+([^\s]+\.[^\s:]+)(?::|\s|$)/i.exec(source);
  if (writingTarget?.[1]) return writingTarget[1].trim();

  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fileListStart = lines.findIndex((line) => /following files:/i.test(line));
  if (fileListStart === -1) return undefined;
  for (const line of lines.slice(fileListStart + 1)) {
    const path = /^[A-Z?]\s+(.+)$/.exec(line)?.[1] ?? (/^[A-Z?]$/.test(line) ? undefined : line);
    if (path) return path.trim();
  }
  return undefined;
}

function readPatchTextPath(source: unknown): string | undefined {
  if (typeof source !== "string") return undefined;
  const paths = [...source.matchAll(/^\*\*\*\s+(?:Add|Update|Delete)\s+File:\s+(.+?)\s*$/gm)]
    .map((match) => match[1]?.trim())
    .filter((path): path is string => !!path);
  const uniquePaths = new Set(paths);
  return uniquePaths.size === 1 ? paths[0] : undefined;
}

function readUnifiedDiffPath(source: string): string | undefined {
  const newPath = /^\+\+\+\s+b\/(.+?)\s*$/m.exec(source)?.[1];
  if (newPath && newPath !== "/dev/null") return stripDiffPathQuotes(newPath);
  const oldPath = /^---\s+a\/(.+?)\s*$/m.exec(source)?.[1];
  if (oldPath && oldPath !== "/dev/null") return stripDiffPathQuotes(oldPath);
  const header = /^diff --git\s+(?:"a\/(.+?)"|a\/(\S+))\s+(?:"b\/(.+?)"|b\/(\S+))\s*$/m.exec(
    source,
  );
  return stripDiffPathQuotes(header?.[3] ?? header?.[4] ?? header?.[1] ?? header?.[2]);
}

function stripDiffPathQuotes(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.replace(/^"|"$/g, "").trim();
}

function readPathField(record: Record<string, unknown>): string | undefined {
  const keys = [
    "path",
    "file_path",
    "filePath",
    "filepath",
    "relative_path",
    "relativePath",
    "notebook_path",
    "notebookPath",
  ];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function readFirstStructuredChangePath(changes: unknown): string | undefined {
  if (!Array.isArray(changes)) return undefined;
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const record = change as Record<string, unknown>;
    const movePath = readMovePath(record.kind);
    if (movePath) return movePath;
    const path = readPathField(record);
    if (path) return path;
  }
  return undefined;
}

function readMovePath(kind: unknown): string | undefined {
  if (!kind || typeof kind !== "object") return undefined;
  const value = (kind as Record<string, unknown>).move_path;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function extractTitlePath(value: unknown): string | undefined {
  return typeof value === "string" ? readFileChangePathInner(value) : undefined;
}

function readStructuredChangesDiffSummary(changes: unknown): DiffSummary | undefined {
  if (!Array.isArray(changes)) return undefined;
  let added = 0;
  let removed = 0;
  let sawDiff = false;
  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    const diff = (change as Record<string, unknown>).diff;
    if (typeof diff !== "string" || diff.length === 0) continue;
    sawDiff = true;
    for (const line of diff.split(/\r?\n/)) {
      if (line.startsWith("+++") || line.startsWith("---")) continue;
      if (line.startsWith("+")) added++;
      else if (line.startsWith("-")) removed++;
    }
  }
  return sawDiff ? { added, removed } : undefined;
}

function readCreatedContentDiffSummary(record: Record<string, unknown>): DiffSummary | undefined {
  if (!readPathField(record)) return undefined;
  const content = record.content;
  if (typeof content !== "string") return undefined;
  const { added } = countLineChangeStats("", content);
  return added > 0 ? { added, removed: 0 } : undefined;
}

function readPatchTextDiffSummary(source: unknown): DiffSummary | undefined {
  if (typeof source !== "string") return undefined;
  let added = 0;
  let removed = 0;
  let sawDiff = false;
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      added += 1;
      sawDiff = true;
    } else if (line.startsWith("-")) {
      removed += 1;
      sawDiff = true;
    }
  }
  return sawDiff ? { added, removed } : undefined;
}
