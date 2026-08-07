import type { GitFileChange, GitRemoteInfo, GitStatusResult } from "@/shared/contracts";
import { parseRemoteUrl, toForwardSlash } from "./exec";

export interface ParsedPorcelainStatus {
  branch: string;
  headSha: string;
  tracking: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  conflictFiles: string[];
  mergeInProgress: boolean;
}

export interface DiffStatEntry {
  path: string;
  insertions: number;
  deletions: number;
}

/** Derive remote presence + parsed origin info from `git remote -v` output. */
export function parseRemoteInfo(remoteOutput: string): {
  hasRemote: boolean;
  remoteInfo: GitRemoteInfo | null;
} {
  const remoteLines = remoteOutput.trim().split("\n").filter(Boolean);
  const hasRemote = remoteLines.length > 0;
  let remoteInfo: GitRemoteInfo | null = null;
  if (hasRemote) {
    const originLine =
      remoteLines.find((line) => line.startsWith("origin\t") && line.includes("(fetch)")) ??
      remoteLines.find((line) => line.includes("(fetch)"));
    if (originLine) {
      const urlMatch = originLine.match(/^\S+\t(\S+)/);
      if (urlMatch) {
        remoteInfo = parseRemoteUrl(urlMatch[1]!);
      }
    }
  }
  return { hasRemote, remoteInfo };
}

/**
 * Read a batched-bridge command result as a numstat output for
 * {@link applyNumstatCounts}: `null` when the command failed, so an errored
 * numstat is never mistaken for "no tracked file has a diff".
 */
export function numstatFromBatchResult(
  result: { ok: boolean; stdout: string } | undefined,
): string | null {
  return result?.ok ? result.stdout : null;
}

/**
 * Merge one side's `--numstat` counts into its porcelain entries and drop the
 * tracked rows numstat has nothing to say about. `null` means the numstat
 * command failed — the rows are returned untouched rather than wiped.
 */
function applyNumstatToSide(
  files: readonly GitFileChange[],
  numstat: string | null,
): GitFileChange[] {
  if (numstat === null) return [...files];
  const stats = new Map(parseDiffNumstat(numstat).map((entry) => [entry.path, entry]));
  const result: GitFileChange[] = [];
  for (const file of files) {
    // Untracked files never appear in `git diff`; their counts are filled
    // separately by reading the file (see `replaceUntrackedEntries`).
    if (file.status === "?") {
      result.push(file);
      continue;
    }
    const entry = stats.get(file.path);
    if (!entry) continue;
    result.push({ ...file, insertions: entry.insertions, deletions: entry.deletions });
  }
  return result;
}

/**
 * Merge staged/unstaged `--numstat` counts into the parsed porcelain entries,
 * dropping tracked entries that carry no diff at all.
 *
 * `git status` can call a tracked file modified from cached stat data alone:
 * git's `ie_modified()` short-circuits on a size mismatch and never re-reads the
 * blob. On Windows with `core.autocrlf=true` that fires en masse — a tool
 * rewrites files with LF endings, so each file's on-disk size drops below the
 * CRLF size the index cached at checkout while the content git actually tracks
 * is unchanged. `git status` then reports hundreds of modified files that
 * `git diff` has nothing to say about, and the Changes panel fills with rows
 * that show no +/- and open an empty diff.
 *
 * `git diff --numstat` is the ground truth for "this file has a diff": every
 * real change surfaces there — binaries as `- -`, mode-only changes as `0 0`,
 * dirty submodules through the `-dirty` commit marker — so a tracked row missing
 * from it has nothing to show and is dropped. Pass `null` for a side whose
 * numstat command failed so neither counts nor pruning are applied to it.
 */
export function applyNumstatCounts(
  parsed: ParsedPorcelainStatus,
  stagedNumstat: string | null,
  unstagedNumstat: string | null,
): void {
  parsed.staged = applyNumstatToSide(parsed.staged, stagedNumstat);
  parsed.unstaged = applyNumstatToSide(parsed.unstaged, unstagedNumstat);
}

/** Sum insertions/deletions across staged + unstaged entries. */
export function sumChangeTotals(parsed: ParsedPorcelainStatus): {
  totalInsertions: number;
  totalDeletions: number;
} {
  return {
    totalInsertions:
      parsed.staged.reduce((sum, file) => sum + file.insertions, 0) +
      parsed.unstaged.reduce((sum, file) => sum + file.insertions, 0),
    totalDeletions:
      parsed.staged.reduce((sum, file) => sum + file.deletions, 0) +
      parsed.unstaged.reduce((sum, file) => sum + file.deletions, 0),
  };
}

/**
 * Decode git's C-quoted path form. We force `core.quotepath=false` on every git
 * invocation (see {@link withQuotePathDisabled}), so non-ASCII bytes come
 * through raw — but git ALWAYS quotes a path that contains a double quote,
 * backslash, or control character, regardless of that setting. When `raw` is
 * such a quoted blob (starts and ends with `"`) strip the quotes and decode the
 * C escapes; otherwise return it unchanged.
 *
 * Octal escapes (`\NNN`) are raw UTF-8 BYTES, not code points, so decoded bytes
 * are accumulated into a Buffer and read back as UTF-8 once at the end — decoding
 * each escape as a character would mojibake any multi-byte sequence.
 */
export function unquoteGitPath(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) {
    return raw;
  }
  const body = raw.slice(1, -1);
  const bytes: number[] = [];
  const pushUtf8 = (char: string): void => {
    for (const b of Buffer.from(char, "utf-8")) bytes.push(b);
  };
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (ch !== "\\") {
      pushUtf8(ch);
      continue;
    }
    const next = body[i + 1];
    if (next === undefined) {
      bytes.push(0x5c); // trailing backslash — keep literal
      break;
    }
    if (next >= "0" && next <= "7") {
      // Octal escape: up to 3 octal digits collapse to one byte.
      let oct = "";
      let j = i + 1;
      while (j < body.length && oct.length < 3 && body[j]! >= "0" && body[j]! <= "7") {
        oct += body[j]!;
        j += 1;
      }
      bytes.push(parseInt(oct, 8) & 0xff);
      i = j - 1;
      continue;
    }
    switch (next) {
      case "\\":
        bytes.push(0x5c);
        break;
      case '"':
        bytes.push(0x22);
        break;
      case "t":
        bytes.push(0x09);
        break;
      case "n":
        bytes.push(0x0a);
        break;
      case "r":
        bytes.push(0x0d);
        break;
      default:
        pushUtf8(next); // unknown escape — keep the escaped char literally
    }
    i += 1;
  }
  return Buffer.from(bytes).toString("utf-8");
}

function parseUntrackedPaths(output: string): string[] {
  return output
    .split("\0")
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => toForwardSlash(path));
}

/** Lists untracked, non-ignored files NUL-separated — one path per file. */
export const LS_FILES_UNTRACKED_ARGS = ["ls-files", "--others", "--exclude-standard", "-z"];

export function parseStatusPorcelainV2(output: string): ParsedPorcelainStatus {
  let branch = "";
  let headSha = "";
  let tracking = "";
  let ahead = 0;
  let behind = 0;
  const staged: GitFileChange[] = [];
  const unstaged: GitFileChange[] = [];
  const conflictFiles: string[] = [];
  let mergeInProgress = false;

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (line.startsWith("# ")) {
      if (line.startsWith("# branch.oid ")) {
        headSha = line.slice("# branch.oid ".length).trim();
      } else if (line.startsWith("# branch.head ")) {
        branch = line.slice("# branch.head ".length).trim();
      } else if (line.startsWith("# branch.upstream ")) {
        tracking = line.slice("# branch.upstream ".length).trim();
      } else if (line.startsWith("# branch.ab ")) {
        const match = line.match(/^# branch\.ab \+(\d+) -(\d+)$/);
        ahead = parseInt(match?.[1] ?? "0", 10);
        behind = parseInt(match?.[2] ?? "0", 10);
      }
      continue;
    }

    if (line.startsWith("u ")) {
      mergeInProgress = true;
      const parts = line.split(" ");
      const path = toForwardSlash(unquoteGitPath(parts.slice(10).join(" ")));
      conflictFiles.push(path);
      continue;
    }

    if (line.startsWith("? ")) {
      unstaged.push({
        path: toForwardSlash(unquoteGitPath(line.slice(2))),
        status: "?",
        staged: false,
        insertions: 0,
        deletions: 0,
      });
      continue;
    }

    const kind = line[0];
    if (kind !== "1" && kind !== "2") {
      continue;
    }

    const parts = line.split("\t");
    const fields = parts[0]!.split(" ");
    const xy = fields[1]!;
    const indexStatus = xy[0]!;
    const worktreeStatus = xy[1]!;

    const path = toForwardSlash(unquoteGitPath(fields.slice(kind === "2" ? 9 : 8).join(" ")));
    const oldPath = kind === "2" ? toForwardSlash(unquoteGitPath(parts[1] ?? "")) : undefined;

    if (indexStatus !== ".") {
      staged.push({
        path,
        ...(oldPath ? { oldPath } : {}),
        status: indexStatus,
        staged: true,
        insertions: 0,
        deletions: 0,
      });
    }
    if (worktreeStatus !== ".") {
      unstaged.push({
        path,
        ...(oldPath ? { oldPath } : {}),
        status: worktreeStatus,
        staged: false,
        insertions: 0,
        deletions: 0,
      });
    }
  }

  return {
    branch,
    headSha,
    tracking,
    ahead,
    behind,
    staged,
    unstaged,
    conflictFiles,
    mergeInProgress,
  };
}

/**
 * `git diff --numstat` collapses a rename into the source/destination combined
 * syntax in its path field. Resolve it to the NEW path so counts merge against
 * the porcelain-v2 rename entries (which carry the new path):
 *   - brace form: `src/{old => new}/file.txt` → `src/new/file.txt`
 *   - empty side: `dir/{ => sub}/file.txt`   → `dir/sub/file.txt`
 *   - plain form: `src/old.txt => deep/new.txt` → `deep/new.txt`
 * A literal ` => ` inside a filename is vanishingly rare; the brace form is
 * unambiguous, and the plain form is only applied when no braces are present.
 *
 * C-quoting is decoded per side, because git quotes each side of a rename
 * independently (e.g. `"\321\204.txt" => "\320\261.txt"`) rather than the field
 * as a whole. A non-rename field that is quoted as a whole (`"\321\204.txt"`)
 * is decoded on the return path. The brace form with an embedded quote is rare;
 * when git quotes the whole `prefix{old => new}suffix` field we decode it first
 * so the braces are visible, then resolve.
 */
function resolveNumstatRenamePath(rawPath: string): string {
  // Plain `old => new` rename with no braces: git quotes each side on its own,
  // so split on the arrow and decode only the new side. Guarded by the absence
  // of `{` so the brace form falls through to the dedicated handling below.
  const plainArrow = rawPath.indexOf(" => ");
  if (plainArrow !== -1 && rawPath.indexOf("{") === -1) {
    return unquoteGitPath(rawPath.slice(plainArrow + " => ".length));
  }
  // Brace form (and whole-field-quoted non-renames): decode any whole-field
  // quoting first so the `{`/`}`/`=>` structure is visible to the resolver.
  const decoded = unquoteGitPath(rawPath);
  const braceStart = decoded.indexOf("{");
  if (braceStart !== -1) {
    const braceEnd = decoded.indexOf("}", braceStart);
    const arrow = decoded.indexOf(" => ", braceStart);
    if (braceEnd !== -1 && arrow !== -1 && arrow < braceEnd) {
      const prefix = decoded.slice(0, braceStart);
      const suffix = decoded.slice(braceEnd + 1);
      const newInner = decoded.slice(arrow + " => ".length, braceEnd);
      // An empty side (`{ => sub}` / `{sub => }`) leaves the prefix/suffix
      // slashes adjacent; collapse the resulting `//` back to a single `/`.
      return `${prefix}${newInner}${suffix}`.replace(/\/{2,}/g, "/");
    }
  }
  return decoded;
}

export function parseDiffNumstat(output: string): DiffStatEntry[] {
  const entries: DiffStatEntry[] = [];
  for (const line of output.trim().split(/\r?\n/)) {
    if (!line) continue;
    // numstat has exactly two leading numeric fields; the path is the rest,
    // rejoined so a tab inside a filename isn't truncated.
    const parts = line.split("\t");
    const insertionsRaw = parts[0];
    const deletionsRaw = parts[1];
    const rawPath = parts.slice(2).join("\t");
    if (!rawPath) continue;
    entries.push({
      path: toForwardSlash(resolveNumstatRenamePath(rawPath)),
      insertions: Number.isNaN(Number(insertionsRaw ?? "0"))
        ? 0
        : parseInt(insertionsRaw ?? "0", 10),
      deletions: Number.isNaN(Number(deletionsRaw ?? "0")) ? 0 : parseInt(deletionsRaw ?? "0", 10),
    });
  }
  return entries;
}

/**
 * Assemble a {@link GitStatusResult} from raw git outputs collected by
 * `git status --porcelain=v2 -b`, `git remote -v`, `git diff --cached --numstat`,
 * and `git diff --numstat`. Lets snapshot orchestrators batch the raw command
 * outputs and feed them through one parser.
 */
export function buildGitStatusResultFromOutputs(args: {
  isRepo: boolean;
  statusOutput: string;
  remoteOutput: string;
  /** `null` when the numstat command failed — see {@link applyNumstatCounts}. */
  stagedNumstat: string | null;
  /** `null` when the numstat command failed — see {@link applyNumstatCounts}. */
  unstagedNumstat: string | null;
}): GitStatusResult {
  if (!args.isRepo) {
    return {
      isRepo: false,
      branch: "",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    };
  }

  const parsed = parseStatusPorcelainV2(args.statusOutput);
  const { hasRemote, remoteInfo } = parseRemoteInfo(args.remoteOutput);
  applyNumstatCounts(parsed, args.stagedNumstat, args.unstagedNumstat);
  const { totalInsertions, totalDeletions } = sumChangeTotals(parsed);

  return {
    isRepo: true,
    branch: parsed.branch,
    ...(parsed.headSha ? { headSha: parsed.headSha } : {}),
    tracking: parsed.tracking,
    hasRemote,
    remoteInfo,
    ahead: parsed.ahead,
    behind: parsed.behind,
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    totalInsertions,
    totalDeletions,
  };
}

/**
 * Expand the single collapsed `? dir/` porcelain entries into one entry per
 * untracked file, using the paths from `git ls-files --others --exclude-standard
 * -z`. Insertion/deletion counts are left at 0 so the summary path stays cheap
 * (no file reads); {@link mergeSummaryStatus} in the renderer backfills the
 * counts from the prior full refresh by matching `path`/`status` keys.
 *
 * The point is to keep the summary file list structurally identical to the full
 * path's expanded list. Without this, the cheap summary (poll/fetch) returns one
 * collapsed directory row while the full refresh (watcher/initial) returns one
 * row per file — so the Changes panel visibly flips between a collapsed and an
 * expanded view of the same working tree, and the key-based count backfill fails.
 */
export function expandUntrackedEntries(parsed: ParsedPorcelainStatus, lsFilesOutput: string): void {
  if (!parsed.unstaged.some((file) => file.status === "?")) return;
  const untrackedPaths = parseUntrackedPaths(lsFilesOutput);
  if (untrackedPaths.length === 0) return;
  const trackedUnstaged = parsed.unstaged.filter((file) => file.status !== "?");
  const untracked: GitFileChange[] = untrackedPaths.map((path) => ({
    path,
    status: "?",
    staged: false,
    insertions: 0,
    deletions: 0,
  }));
  parsed.unstaged = [...trackedUnstaged, ...untracked];
}

export function buildGitStatusSummaryFromOutput(
  statusOutput: string,
  untrackedOutput: string,
): GitStatusResult {
  const parsed = parseStatusPorcelainV2(statusOutput);
  expandUntrackedEntries(parsed, untrackedOutput);
  return {
    detail: "summary",
    isRepo: true,
    branch: parsed.branch,
    ...(parsed.headSha ? { headSha: parsed.headSha } : {}),
    tracking: parsed.tracking,
    hasRemote: parsed.tracking.length > 0,
    remoteInfo: null,
    ahead: parsed.ahead,
    behind: parsed.behind,
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    totalInsertions: 0,
    totalDeletions: 0,
    ...(parsed.mergeInProgress
      ? {
          mergeInProgress: true,
          conflictFiles: parsed.conflictFiles.map((path) => ({
            path,
            status: "U",
            staged: false,
            insertions: 0,
            deletions: 0,
          })),
        }
      : {}),
  };
}

export function nonRepoSummaryStatus(): GitStatusResult {
  return {
    detail: "summary",
    isRepo: false,
    branch: "",
    tracking: "",
    hasRemote: false,
    remoteInfo: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
  };
}
