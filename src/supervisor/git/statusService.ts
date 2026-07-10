import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type GitDiffBatchResult,
  type GitDiffResult,
  type GitFileChange,
  type GitFileContentResult,
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
  toForwardSlash,
} from "./exec";
import {
  applyNumstatCounts,
  buildGitStatusResultFromOutputs,
  buildGitStatusSummaryFromOutput,
  expandUntrackedEntries,
  LS_FILES_UNTRACKED_ARGS,
  nonRepoSummaryStatus,
  parseDiffNumstat,
  parseRemoteInfo,
  parseStatusPorcelainV2,
  sumChangeTotals,
  type ParsedPorcelainStatus,
} from "./statusParsing";

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
    const { hasRemote, remoteInfo } = parseRemoteInfo(remoteOutput);
    applyNumstatCounts(parsed, stagedNumstat, unstagedNumstat);

    await this.replaceUntrackedEntries(location, parsed);

    const { totalInsertions, totalDeletions } = sumChangeTotals(parsed);

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
    const { totalInsertions, totalDeletions } = sumChangeTotals(parsed);
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
