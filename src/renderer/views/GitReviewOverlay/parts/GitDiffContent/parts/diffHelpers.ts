import type { GitStatusResult } from "@/shared/contracts";
import { extractDiffNames, getLang } from "../../diffBuildClient";

/** Skip rendering diffs larger than this many lines changed */
export const LARGE_DIFF_THRESHOLD = 500;

export interface DiffEntry {
  filePath: string;
  staged: boolean;
  rawDiff: string;
  oldName: string;
  newName: string;
  fileLang: string;
  estimatedHeight: number;
  loading: boolean;
  tooLarge: boolean;
  insertions: number;
  deletions: number;
}

export function entryKey(e: { staged: boolean; filePath: string }): string {
  return `${e.staged ? "s" : "u"}:${e.filePath}`;
}

export function normalizeDiffLookupPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function getBatchDiff(section: Record<string, string>, filePath: string): string {
  return section[filePath] ?? section[normalizeDiffLookupPath(filePath)] ?? "";
}

export function buildGitStatusKey(gitStatus: GitStatusResult | undefined): string {
  if (!gitStatus?.isRepo) {
    return "not-repo";
  }

  const serialize = (entries: GitStatusResult["staged"]) =>
    entries
      .map((entry) =>
        [
          normalizeDiffLookupPath(entry.path),
          entry.oldPath ? normalizeDiffLookupPath(entry.oldPath) : "",
          entry.status,
          entry.staged ? "1" : "0",
          entry.insertions,
          entry.deletions,
        ].join("|"),
      )
      .join("\n");

  return [
    gitStatus.branch,
    gitStatus.totalInsertions,
    gitStatus.totalDeletions,
    serialize(gitStatus.staged),
    serialize(gitStatus.unstaged),
  ].join("\n---\n");
}

export function buildEntry(
  filePath: string,
  staged: boolean,
  diff: string,
  insertions: number,
  deletions: number,
): DiffEntry {
  const tooLarge = insertions + deletions > LARGE_DIFF_THRESHOLD;
  const { oldName, newName } = diff.trim() ? extractDiffNames(diff) : { oldName: "", newName: "" };
  return {
    filePath,
    staged,
    rawDiff: diff,
    oldName,
    newName,
    fileLang: getLang(newName || filePath),
    estimatedHeight: Math.max(64, diff.split("\n").length * 20),
    loading: false,
    tooLarge,
    insertions,
    deletions,
  };
}

export function skeletonEntry(
  filePath: string,
  staged: boolean,
  insertions: number,
  deletions: number,
): DiffEntry {
  return {
    filePath,
    staged,
    rawDiff: "",
    oldName: "",
    newName: "",
    fileLang: "",
    estimatedHeight: 64,
    loading: true,
    tooLarge: false,
    insertions,
    deletions,
  };
}
