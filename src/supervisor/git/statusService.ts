import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type GitDiffBatchResult,
  type GitDiffResult,
  type GitFileChange,
  type GitFileContentResult,
  type GitRemoteInfo,
  type GitStatusResult,
  type ProjectLocation,
} from "@/shared/contracts";
import { getProjectFsPath, toWslUncPath } from "@/shared/wsl";
import {
  execGit,
  execGitBatchWslBridge,
  GIT_DIFF_TIMEOUT,
  GIT_STATUS_TIMEOUT,
  getLocationIdentity,
  parseRemoteUrl,
  toForwardSlash,
} from "./exec";

interface ParsedPorcelainStatus {
  branch: string;
  tracking: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  conflictFiles: string[];
  mergeInProgress: boolean;
}

interface DiffStatEntry {
  path: string;
  insertions: number;
  deletions: number;
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
const LS_FILES_UNTRACKED_ARGS = ["ls-files", "--others", "--exclude-standard", "-z"];

export function parseStatusPorcelainV2(output: string): ParsedPorcelainStatus {
  let branch = "";
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
      if (line.startsWith("# branch.head ")) {
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

interface UntrackedStatsCacheEntry {
  signature: string;
  insertions: number;
}

const BINARY_SCAN_BYTES = 8000;

function isProbablyBinary(buffer: Buffer): boolean {
  const scanLength = Math.min(buffer.length, BINARY_SCAN_BYTES);
  if (scanLength === 0) {
    return false;
  }

  let suspiciousBytes = 0;
  for (let i = 0; i < scanLength; i++) {
    const byte = buffer[i]!;
    if (byte === 0) {
      return true;
    }
    if (byte < 7 || (byte > 13 && byte < 32)) {
      suspiciousBytes++;
    }
  }

  return suspiciousBytes / scanLength > 0.3;
}

function countTextLines(buffer: Buffer): number {
  if (buffer.length === 0) {
    return 0;
  }

  const content = buffer.toString("utf-8");
  return content.endsWith("\n") ? content.split("\n").length - 1 : content.split("\n").length;
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
  stagedNumstat: string;
  unstagedNumstat: string;
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
  const remoteLines = args.remoteOutput.trim().split("\n").filter(Boolean);
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

  for (const entry of parseDiffNumstat(args.stagedNumstat)) {
    const match = parsed.staged.find((file) => file.path === entry.path);
    if (match) {
      match.insertions = entry.insertions;
      match.deletions = entry.deletions;
    }
  }
  for (const entry of parseDiffNumstat(args.unstagedNumstat)) {
    const match = parsed.unstaged.find((file) => file.path === entry.path);
    if (match) {
      match.insertions = entry.insertions;
      match.deletions = entry.deletions;
    }
  }

  const totalInsertions =
    parsed.staged.reduce((sum, file) => sum + file.insertions, 0) +
    parsed.unstaged.reduce((sum, file) => sum + file.insertions, 0);
  const totalDeletions =
    parsed.staged.reduce((sum, file) => sum + file.deletions, 0) +
    parsed.unstaged.reduce((sum, file) => sum + file.deletions, 0);

  return {
    isRepo: true,
    branch: parsed.branch,
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

function nonRepoSummaryStatus(): GitStatusResult {
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

export class GitStatusService {
  private readonly untrackedStatsCache = new Map<string, UntrackedStatsCacheEntry>();

  async getStatus(location: ProjectLocation): Promise<GitStatusResult> {
    if (location.kind === "wsl") {
      return this.getStatusBatchedWsl(location);
    }

    try {
      await execGit(location, ["rev-parse", "--is-inside-work-tree"], {
        timeout: GIT_STATUS_TIMEOUT,
      });
    } catch {
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

    const [statusOutput, remoteOutput, stagedNumstat, unstagedNumstat] = await Promise.all([
      execGit(location, ["status", "--porcelain=v2", "-b"], { timeout: GIT_STATUS_TIMEOUT }),
      execGit(location, ["remote", "-v"], { timeout: GIT_STATUS_TIMEOUT }).catch((error) => {
        console.warn("[git] 'remote -v' failed:", error);
        return "";
      }),
      execGit(location, ["diff", "--cached", "--numstat"], { timeout: GIT_STATUS_TIMEOUT }).catch(
        (error) => {
          console.warn("[git] 'diff --cached --numstat' failed:", error);
          return "";
        },
      ),
      execGit(location, ["diff", "--numstat"], { timeout: GIT_STATUS_TIMEOUT }).catch((error) => {
        console.warn("[git] 'diff --numstat' failed:", error);
        return "";
      }),
    ]);

    const parsed = parseStatusPorcelainV2(statusOutput);
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

    for (const entry of parseDiffNumstat(stagedNumstat)) {
      const match = parsed.staged.find((file) => file.path === entry.path);
      if (match) {
        match.insertions = entry.insertions;
        match.deletions = entry.deletions;
      }
    }
    for (const entry of parseDiffNumstat(unstagedNumstat)) {
      const match = parsed.unstaged.find((file) => file.path === entry.path);
      if (match) {
        match.insertions = entry.insertions;
        match.deletions = entry.deletions;
      }
    }

    await this.replaceUntrackedEntries(location, parsed);

    const totalInsertions =
      parsed.staged.reduce((sum, file) => sum + file.insertions, 0) +
      parsed.unstaged.reduce((sum, file) => sum + file.insertions, 0);
    const totalDeletions =
      parsed.staged.reduce((sum, file) => sum + file.deletions, 0) +
      parsed.unstaged.reduce((sum, file) => sum + file.deletions, 0);

    const conflictFileChanges: GitFileChange[] =
      parsed.mergeInProgress && parsed.conflictFiles.length > 0
        ? await this.buildConflictFileChanges(location, parsed.conflictFiles)
        : [];

    return {
      isRepo: true,
      branch: parsed.branch,
      tracking: parsed.tracking,
      hasRemote,
      remoteInfo,
      ahead: parsed.ahead,
      behind: parsed.behind,
      staged: parsed.staged,
      unstaged: parsed.unstaged,
      totalInsertions,
      totalDeletions,
      ...(parsed.mergeInProgress
        ? { mergeInProgress: true, conflictFiles: conflictFileChanges }
        : {}),
    };
  }

  async getStatusSummary(location: ProjectLocation): Promise<GitStatusResult> {
    if (location.kind === "wsl") {
      const results = await execGitBatchWslBridge(
        location,
        [
          { cwd: location.linuxPath, args: ["status", "--porcelain=v2", "-b"] },
          { cwd: location.linuxPath, args: LS_FILES_UNTRACKED_ARGS },
        ],
        GIT_STATUS_TIMEOUT,
      );
      const result = results[0];
      const untracked = results[1];
      return result?.ok
        ? buildGitStatusSummaryFromOutput(result.stdout, untracked?.ok ? untracked.stdout : "")
        : nonRepoSummaryStatus();
    }

    try {
      const [statusOutput, untrackedOutput] = await Promise.all([
        execGit(location, ["status", "--porcelain=v2", "-b"], { timeout: GIT_STATUS_TIMEOUT }),
        execGit(location, LS_FILES_UNTRACKED_ARGS, { timeout: GIT_STATUS_TIMEOUT }).catch(
          (error) => {
            console.warn("[git] ls-files untracked failed:", error);
            return "";
          },
        ),
      ]);
      return buildGitStatusSummaryFromOutput(statusOutput, untrackedOutput);
    } catch (error) {
      console.warn("[git] status summary failed, treating as non-repo:", error);
      return nonRepoSummaryStatus();
    }
  }

  /**
   * Apply untracked-file stats and conflict-file enrichment to a status result
   * built from raw outputs. Exposed for the snapshot orchestrator that bypasses
   * the per-method git calls in favor of one batched WSL spawn.
   */
  async enrichStatus(location: ProjectLocation, base: GitStatusResult): Promise<GitStatusResult> {
    return this.enrichStatusInternal(location, base);
  }

  /**
   * Re-parse the porcelain status output to recover `mergeInProgress` and
   * `conflictFiles` after `buildGitStatusResultFromOutputs` / `enrichStatus`,
   * which both drop those fields. Without this, the project snapshot path
   * (used on app refresh) reports no merge in progress even when the working
   * tree has unmerged paths.
   */
  async applyMergeState(
    location: ProjectLocation,
    statusOutput: string,
    base: GitStatusResult,
  ): Promise<GitStatusResult> {
    if (!base.isRepo) return base;
    const parsed = parseStatusPorcelainV2(statusOutput);
    if (!parsed.mergeInProgress || parsed.conflictFiles.length === 0) {
      return base;
    }
    const conflictFileChanges = await this.buildConflictFileChanges(location, parsed.conflictFiles);
    return { ...base, mergeInProgress: true, conflictFiles: conflictFileChanges };
  }

  private async getStatusBatchedWsl(
    location: ProjectLocation & { kind: "wsl" },
  ): Promise<GitStatusResult> {
    const cwd = location.linuxPath;
    const results = await execGitBatchWslBridge(
      location,
      [
        { cwd, args: ["rev-parse", "--is-inside-work-tree"] },
        { cwd, args: ["status", "--porcelain=v2", "-b"] },
        { cwd, args: ["remote", "-v"] },
        { cwd, args: ["diff", "--cached", "--numstat"] },
        { cwd, args: ["diff", "--numstat"] },
      ],
      GIT_STATUS_TIMEOUT,
    );
    const isRepo = results[0]!.ok;
    const base = buildGitStatusResultFromOutputs({
      isRepo,
      statusOutput: results[1]!.stdout,
      remoteOutput: results[2]!.stdout,
      stagedNumstat: results[3]!.stdout,
      unstagedNumstat: results[4]!.stdout,
    });
    if (!isRepo) return base;
    const enriched = await this.enrichStatusInternal(location, base);
    return this.applyMergeState(location, results[1]!.stdout, enriched);
  }

  /**
   * Run `rev-parse + status + remote + diff --cached + diff` for each of N
   * worktree paths through the in-distro bridge.
   */
  async getWorktreeStatusBatchWsl(
    location: ProjectLocation & { kind: "wsl" },
    worktreePaths: string[],
  ): Promise<Record<string, GitStatusResult>> {
    if (worktreePaths.length === 0) return {};

    const PER_WORKTREE_CMDS = 5;
    const bridgeCommands: { cwd: string; args: string[] }[] = [];
    for (const cwd of worktreePaths) {
      bridgeCommands.push(
        { cwd, args: ["rev-parse", "--is-inside-work-tree"] },
        { cwd, args: ["status", "--porcelain=v2", "-b"] },
        { cwd, args: ["remote", "-v"] },
        { cwd, args: ["diff", "--cached", "--numstat"] },
        { cwd, args: ["diff", "--numstat"] },
      );
    }
    const results = await execGitBatchWslBridge(location, bridgeCommands, GIT_STATUS_TIMEOUT);

    const out: Record<string, GitStatusResult> = {};
    await Promise.all(
      worktreePaths.map(async (path, i) => {
        const off = i * PER_WORKTREE_CMDS;
        const isRepo = results[off]!.ok;
        const statusOutput = results[off + 1]!.stdout;
        const base = buildGitStatusResultFromOutputs({
          isRepo,
          statusOutput,
          remoteOutput: results[off + 2]!.stdout,
          stagedNumstat: results[off + 3]!.stdout,
          unstagedNumstat: results[off + 4]!.stdout,
        });
        if (!isRepo) {
          out[path] = base;
          return;
        }
        const wtLocation: ProjectLocation = {
          kind: "wsl",
          distro: location.distro,
          linuxPath: path,
          uncPath: toWslUncPath(location.distro, path),
        };
        try {
          const enriched = await this.enrichStatusInternal(wtLocation, base);
          out[path] = await this.applyMergeState(wtLocation, statusOutput, enriched);
        } catch {
          // Fall back to the raw batched result rather than dropping the
          // worktree from the response — callers prefer slightly stale data
          // over a missing key.
          out[path] = base;
        }
      }),
    );
    return out;
  }

  async getWorktreeStatusSummaryBatchWsl(
    location: ProjectLocation & { kind: "wsl" },
    worktreePaths: string[],
  ): Promise<Record<string, GitStatusResult>> {
    if (worktreePaths.length === 0) return {};

    const PER_WORKTREE_CMDS = 2;
    const bridgeCommands: { cwd: string; args: string[] }[] = [];
    for (const cwd of worktreePaths) {
      bridgeCommands.push(
        { cwd, args: ["status", "--porcelain=v2", "-b"] },
        { cwd, args: LS_FILES_UNTRACKED_ARGS },
      );
    }
    const results = await execGitBatchWslBridge(location, bridgeCommands, GIT_STATUS_TIMEOUT);

    const out: Record<string, GitStatusResult> = {};
    for (let i = 0; i < worktreePaths.length; i += 1) {
      const off = i * PER_WORKTREE_CMDS;
      const statusResult = results[off];
      if (!statusResult) continue;
      const untrackedResult = results[off + 1];
      out[worktreePaths[i]!] = statusResult.ok
        ? buildGitStatusSummaryFromOutput(
            statusResult.stdout,
            untrackedResult?.ok ? untrackedResult.stdout : "",
          )
        : nonRepoSummaryStatus();
    }
    return out;
  }

  private async enrichStatusInternal(
    location: ProjectLocation,
    base: GitStatusResult,
  ): Promise<GitStatusResult> {
    if (!base.isRepo) return base;
    // The parsed status has unstaged untracked entries with status "?" but no
    // insertion/deletion counts; replaceUntrackedEntries fills them in.
    const parsed: ParsedPorcelainStatus = {
      branch: base.branch,
      tracking: base.tracking,
      ahead: base.ahead,
      behind: base.behind,
      staged: base.staged,
      unstaged: base.unstaged,
      conflictFiles: [],
      mergeInProgress: false,
    };
    await this.replaceUntrackedEntries(location, parsed);
    const totalInsertions =
      parsed.staged.reduce((sum, file) => sum + file.insertions, 0) +
      parsed.unstaged.reduce((sum, file) => sum + file.insertions, 0);
    const totalDeletions =
      parsed.staged.reduce((sum, file) => sum + file.deletions, 0) +
      parsed.unstaged.reduce((sum, file) => sum + file.deletions, 0);
    return {
      ...base,
      staged: parsed.staged,
      unstaged: parsed.unstaged,
      totalInsertions,
      totalDeletions,
    };
  }

  private async buildConflictFileChanges(
    location: ProjectLocation,
    paths: string[],
  ): Promise<GitFileChange[]> {
    const headNumstat = await execGit(location, ["diff", "HEAD", "--numstat"], {
      timeout: GIT_STATUS_TIMEOUT,
    }).catch((err: unknown) => {
      console.warn("[git] conflict numstat failed; counts will show as 0", err);
      return "";
    });
    const stats = new Map<string, { insertions: number; deletions: number }>();
    for (const entry of parseDiffNumstat(headNumstat)) {
      stats.set(entry.path, { insertions: entry.insertions, deletions: entry.deletions });
    }
    return paths.map((path) => {
      const entry = stats.get(path);
      return {
        path,
        status: "U",
        staged: false,
        insertions: entry?.insertions ?? 0,
        deletions: entry?.deletions ?? 0,
      };
    });
  }

  async getDiff(
    location: ProjectLocation,
    filePath?: string,
    staged?: boolean,
  ): Promise<GitDiffResult> {
    const args = ["diff"];
    if (staged) args.push("--cached");
    if (filePath) args.push("--", filePath);

    let diff = await execGit(location, args, { timeout: GIT_DIFF_TIMEOUT });
    if (filePath && /^diff --(?:cc|combined)\b/m.test(diff)) {
      const headDiff = await execGit(location, ["diff", "HEAD", "--", filePath], {
        timeout: GIT_DIFF_TIMEOUT,
      }).catch((error) => {
        console.warn(`[git] diff HEAD -- ${filePath} failed:`, error);
        return "";
      });
      if (headDiff.trim()) diff = headDiff;
    }
    if (!diff.trim() && filePath) {
      diff = await execGit(location, ["diff", "--no-index", "--", "/dev/null", filePath], {
        timeout: GIT_DIFF_TIMEOUT,
        allowNonZeroExit: true,
      }).catch((error) => {
        console.warn(`[git] diff --no-index for ${filePath} failed:`, error);
        return "";
      });
    }

    return { diff };
  }

  async getDiffBatch(
    location: ProjectLocation,
    untrackedPaths: string[],
  ): Promise<GitDiffBatchResult> {
    const [stagedRaw, unstagedRaw] = await Promise.all([
      execGit(location, ["diff", "--cached"], { timeout: GIT_DIFF_TIMEOUT }).catch((error) => {
        console.warn("[git] diff --cached failed:", error);
        return "";
      }),
      execGit(location, ["diff"], { timeout: GIT_DIFF_TIMEOUT }).catch((error) => {
        console.warn("[git] diff failed:", error);
        return "";
      }),
    ]);

    const staged = this.splitCombinedDiff(stagedRaw);
    const unstaged = this.splitCombinedDiff(unstagedRaw);

    if (untrackedPaths.length > 0) {
      const untrackedResults = await Promise.all(
        untrackedPaths.map(async (filePath) => ({
          filePath,
          diff: (await this.getDiff(location, filePath, false)).diff,
        })),
      );
      for (const { filePath, diff } of untrackedResults) {
        if (diff.trim()) {
          unstaged[filePath] = diff;
        }
      }
    }

    return { staged, unstaged };
  }

  async getFileContent(
    location: ProjectLocation,
    filePath: string,
    staged: boolean,
  ): Promise<GitFileContentResult> {
    if (staged) {
      const [oldContent, newContent] = await Promise.all([
        execGit(location, ["show", `HEAD:${filePath}`], { timeout: GIT_DIFF_TIMEOUT }).catch(
          () => "", // expected for newly added files not yet in HEAD
        ),
        execGit(location, ["show", `:${filePath}`], { timeout: GIT_DIFF_TIMEOUT }).catch(
          () => "", // expected for deleted files not in the index
        ),
      ]);
      return { oldContent, newContent };
    }

    const repoPath = getProjectFsPath(location);
    const [oldContent, newContent] = await Promise.all([
      execGit(location, ["show", `:${filePath}`], { timeout: GIT_DIFF_TIMEOUT }).catch(
        () => "", // expected for untracked files not in the index
      ),
      readFile(join(repoPath, filePath), "utf-8").catch(
        () => "", // expected for deleted files
      ),
    ]);
    return { oldContent, newContent };
  }

  private splitCombinedDiff(raw: string): Record<string, string> {
    if (!raw.trim()) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const chunk of raw.split(/(?=^diff --git )/m)) {
      if (!chunk.trim()) continue;
      const headerMatch = chunk.match(/^diff --git (?:"a\/.+?"|a\/.+?) (?:"b\/(.+?)"|b\/(.+?))$/m);
      const matched = headerMatch?.[1] ?? headerMatch?.[2];
      if (!matched) continue;
      result[toForwardSlash(matched)] = chunk;
    }
    return result;
  }

  private async replaceUntrackedEntries(
    location: ProjectLocation,
    parsed: ParsedPorcelainStatus,
  ): Promise<void> {
    if (!parsed.unstaged.some((file) => file.status === "?")) return;

    const lsFilesOutput = await execGit(location, LS_FILES_UNTRACKED_ARGS, {
      timeout: GIT_STATUS_TIMEOUT,
    }).catch((error) => {
      console.warn("[git] ls-files untracked failed:", error);
      return "";
    });
    // Share the row-shaping with the summary path so the two never disagree on
    // untracked-entry shape (the key the renderer's count backfill matches on).
    expandUntrackedEntries(parsed, lsFilesOutput);

    // The full path additionally counts insertions per untracked file; the
    // expanded rows arrive with counts at 0, so fill them in here.
    await Promise.all(
      parsed.unstaged.map(async (file) => {
        if (file.status !== "?") return;
        file.insertions = await this.readUntrackedInsertions(location, file.path);
      }),
    );
  }

  private async readUntrackedInsertions(
    location: ProjectLocation,
    filePath: string,
  ): Promise<number> {
    const absolutePath = join(getProjectFsPath(location), filePath);
    try {
      const stats = await stat(absolutePath);
      if (!stats.isFile()) {
        return 0;
      }
      const cacheKey = `${getLocationIdentity(location)}|${filePath}`;
      const signature = `${stats.size}:${stats.mtimeMs}`;
      const cached = this.untrackedStatsCache.get(cacheKey);
      if (cached?.signature === signature) {
        return cached.insertions;
      }
      const content = await readFile(absolutePath);
      const buffer = typeof content === "string" ? Buffer.from(content) : content;
      const insertions = isProbablyBinary(buffer) ? 0 : countTextLines(buffer);
      this.untrackedStatsCache.set(cacheKey, { signature, insertions });
      return insertions;
    } catch {
      return 0;
    }
  }
}
