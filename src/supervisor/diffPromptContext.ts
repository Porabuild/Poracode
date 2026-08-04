import type { GitFileChange } from "@/shared/contracts";

export type DiffPromptFile = Pick<
  GitFileChange,
  "path" | "oldPath" | "status" | "insertions" | "deletions"
>;

const DEFAULT_MAX_DIFF_CONTEXT_CHARS = 16_000;
const DEFAULT_MIN_DIFF_CHARS_PER_FILE = 400;
const DEFAULT_MAX_DIFF_CHARS_PER_FILE = 3_000;

function formatChangeSummary(file: DiffPromptFile): string {
  const oldPath = file.oldPath ? `${file.oldPath} -> ` : "";
  const stat =
    file.insertions > 0 || file.deletions > 0 ? ` (+${file.insertions}/-${file.deletions})` : "";
  return `- ${file.status} ${oldPath}${file.path}${stat}`;
}

function extractDiffPaths(header: string): { oldPath?: string; path?: string } {
  const match = header.match(/^diff --git (?:"a\/(.+?)"|a\/(\S+)) (?:"b\/(.+?)"|b\/(\S+))$/);
  const oldPath = match?.[1] ?? match?.[2];
  const path = match?.[3] ?? match?.[4];
  return {
    ...(oldPath ? { oldPath: oldPath.replace(/\\/g, "/") } : {}),
    ...(path ? { path: path.replace(/\\/g, "/") } : {}),
  };
}

function inferDiffStatus(diff: string): string {
  if (/^new file mode /m.test(diff)) return "A";
  if (/^deleted file mode /m.test(diff)) return "D";
  if (/^rename from /m.test(diff)) return "R";
  return "M";
}

export function splitDiffSections(
  diff: string,
): { path: string; oldPath?: string; diff: string }[] {
  return diff
    .split(/(?=^diff --git )/m)
    .map((chunk) => chunk.trimEnd())
    .filter(Boolean)
    .map((chunk, index) => {
      const header = chunk.split(/\r?\n/, 1)[0] ?? "";
      const paths = extractDiffPaths(header);
      return {
        path: paths.path ?? paths.oldPath ?? `diff-${index + 1}`,
        ...(paths.oldPath && paths.oldPath !== paths.path ? { oldPath: paths.oldPath } : {}),
        diff: chunk,
      };
    });
}

export function getFilesFromDiff(diff: string): DiffPromptFile[] {
  return splitDiffSections(diff).map((section) => ({
    path: section.path,
    ...(section.oldPath ? { oldPath: section.oldPath } : {}),
    status: inferDiffStatus(section.diff),
    insertions: 0,
    deletions: 0,
  }));
}

function truncateFileDiff(diff: string, maxChars: number): string {
  if (diff.length <= maxChars) return diff;
  const marker = "\n[diff middle truncated for this file]\n";
  const available = Math.max(0, maxChars - marker.length);
  const headChars = Math.ceil(available / 2);
  const tailChars = Math.floor(available / 2);
  return `${diff.slice(0, headChars)}${marker}${tailChars > 0 ? diff.slice(-tailChars) : ""}`;
}

export function buildDiffExcerpts(
  diff: string,
  options?: {
    maxTotalChars?: number;
    minCharsPerFile?: number;
    maxCharsPerFile?: number;
  },
): string {
  const maxTotalChars = options?.maxTotalChars ?? DEFAULT_MAX_DIFF_CONTEXT_CHARS;
  const minCharsPerFile = options?.minCharsPerFile ?? DEFAULT_MIN_DIFF_CHARS_PER_FILE;
  const maxCharsPerFile = options?.maxCharsPerFile ?? DEFAULT_MAX_DIFF_CHARS_PER_FILE;
  const sections = splitDiffSections(diff);
  if (sections.length === 0) {
    return truncateFileDiff(diff, maxTotalChars);
  }

  const charsPerFile = Math.min(
    maxCharsPerFile,
    Math.max(minCharsPerFile, Math.floor(maxTotalChars / sections.length)),
  );

  return sections
    .map(
      (section, index) =>
        `--- ${section.path} (${index + 1}/${sections.length}) ---\n${truncateFileDiff(
          section.diff,
          charsPerFile,
        )}`,
    )
    .join("\n\n");
}

export function buildDiffPromptContext(args: {
  diff: string;
  files: readonly DiffPromptFile[];
  sourceLabel: string;
  maxTotalDiffChars?: number;
}): string {
  const excerptOptions =
    args.maxTotalDiffChars === undefined ? undefined : { maxTotalChars: args.maxTotalDiffChars };
  const fileSummary =
    args.files.length > 0
      ? args.files.map(formatChangeSummary).join("\n")
      : "- File list unavailable; infer coverage from the diff sections below";

  const diffExcerpts = args.diff.trim()
    ? buildDiffExcerpts(args.diff, excerptOptions)
    : "[No textual diff available for these files]";

  return (
    `${args.sourceLabel}\n\n` +
    `Changed files (${args.files.length}):\n${fileSummary}\n\n` +
    `Balanced diff excerpts:\n${diffExcerpts}`
  );
}
