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
import { parallelWslCommandsAsync } from "../agents/base";
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

function parseUntrackedPaths(output: string): string[] {
  return output
    .split("\0")
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => toForwardSlash(path));
}

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
      const path = toForwardSlash(parts.slice(10).join(" "));
      conflictFiles.push(path);
      continue;
    }

    if (line.startsWith("? ")) {
      unstaged.push({
        path: toForwardSlash(line.slice(2)),
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

    const path = toForwardSlash(fields.slice(kind === "2" ? 9 : 8).join(" "));
    const oldPath = kind === "2" ? toForwardSlash(parts[1] ?? "") : undefined;

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

export function parseDiffNumstat(output: string): DiffStatEntry[] {
  const entries: DiffStatEntry[] = [];
  for (const line of output.trim().split(/\r?\n/)) {
    if (!line) continue;
    const [insertionsRaw, deletionsRaw, path] = line.split("\t");
    if (!path) continue;
    entries.push({
      path: toForwardSlash(path),
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
      execGit(location, ["remote", "-v"], { timeout: GIT_STATUS_TIMEOUT }).catch(() => ""),
      execGit(location, ["diff", "--cached", "--numstat"], { timeout: GIT_STATUS_TIMEOUT }).catch(
        () => "",
      ),
      execGit(location, ["diff", "--numstat"], { timeout: GIT_STATUS_TIMEOUT }).catch(() => ""),
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
    const bridgeResults = await execGitBatchWslBridge(
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
    const results =
      bridgeResults ??
      (await parallelWslCommandsAsync(
        location.distro,
        [
          { cwd, cmd: "git rev-parse --is-inside-work-tree" },
          { cwd, cmd: "git status --porcelain=v2 -b" },
          { cwd, cmd: "git remote -v" },
          { cwd, cmd: "git diff --cached --numstat" },
          { cwd, cmd: "git diff --numstat" },
        ],
        { timeoutMs: GIT_STATUS_TIMEOUT },
      ));
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
   * worktree paths through the in-distro bridge when available. Falls back to
   * the older single `wsl.exe` parallel batch when the bridge is unavailable.
   */
  async getWorktreeStatusBatchWsl(
    location: ProjectLocation & { kind: "wsl" },
    worktreePaths: string[],
  ): Promise<Record<string, GitStatusResult>> {
    if (worktreePaths.length === 0) return {};

    const PER_WORKTREE_CMDS = 5;
    const bridgeCommands: { cwd: string; args: string[] }[] = [];
    const commands: { cwd: string; cmd: string }[] = [];
    for (const cwd of worktreePaths) {
      bridgeCommands.push(
        { cwd, args: ["rev-parse", "--is-inside-work-tree"] },
        { cwd, args: ["status", "--porcelain=v2", "-b"] },
        { cwd, args: ["remote", "-v"] },
        { cwd, args: ["diff", "--cached", "--numstat"] },
        { cwd, args: ["diff", "--numstat"] },
      );
      commands.push(
        { cwd, cmd: "git rev-parse --is-inside-work-tree" },
        { cwd, cmd: "git status --porcelain=v2 -b" },
        { cwd, cmd: "git remote -v" },
        { cwd, cmd: "git diff --cached --numstat" },
        { cwd, cmd: "git diff --numstat" },
      );
    }
    const bridgeResults = await execGitBatchWslBridge(location, bridgeCommands, GIT_STATUS_TIMEOUT);
    const results =
      bridgeResults ??
      (await parallelWslCommandsAsync(location.distro, commands, {
        timeoutMs: GIT_STATUS_TIMEOUT,
      }));

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
      }).catch(() => "");
      if (headDiff.trim()) diff = headDiff;
    }
    if (!diff.trim() && filePath) {
      diff = await execGit(location, ["diff", "--no-index", "--", "/dev/null", filePath], {
        timeout: GIT_DIFF_TIMEOUT,
        allowNonZeroExit: true,
      }).catch(() => "");
    }

    return { diff };
  }

  async getDiffBatch(
    location: ProjectLocation,
    untrackedPaths: string[],
  ): Promise<GitDiffBatchResult> {
    const [stagedRaw, unstagedRaw] = await Promise.all([
      execGit(location, ["diff", "--cached"], { timeout: GIT_DIFF_TIMEOUT }).catch(() => ""),
      execGit(location, ["diff"], { timeout: GIT_DIFF_TIMEOUT }).catch(() => ""),
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
          () => "",
        ),
        execGit(location, ["show", `:${filePath}`], { timeout: GIT_DIFF_TIMEOUT }).catch(() => ""),
      ]);
      return { oldContent, newContent };
    }

    const repoPath = getProjectFsPath(location);
    const [oldContent, newContent] = await Promise.all([
      execGit(location, ["show", `:${filePath}`], { timeout: GIT_DIFF_TIMEOUT }).catch(() => ""),
      readFile(join(repoPath, filePath), "utf-8").catch(() => ""),
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
    const hasUntracked = parsed.unstaged.some((file) => file.status === "?");
    if (!hasUntracked) {
      return;
    }

    const lsFilesOutput = await execGit(
      location,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      {
        timeout: GIT_STATUS_TIMEOUT,
      },
    ).catch(() => "");
    const actualUntrackedPaths = parseUntrackedPaths(lsFilesOutput);
    if (actualUntrackedPaths.length === 0) {
      return;
    }

    const trackedUnstaged = parsed.unstaged.filter((file) => file.status !== "?");
    const untracked = await Promise.all(
      actualUntrackedPaths.map(async (path) => ({
        path,
        status: "?",
        staged: false,
        insertions: await this.readUntrackedInsertions(location, path),
        deletions: 0,
      })),
    );
    parsed.unstaged = [...trackedUnstaged, ...untracked];
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
