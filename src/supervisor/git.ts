import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize, posix } from "node:path";
import { promisify } from "node:util";
import type {
  ProjectLocation,
  GitStatusResult,
  GitDiffResult,
  GitDiffBatchResult,
  GitFileChange,
  GitBranchInfo,
  GitBranchListResult,
  GitAddWorktreeResult,
  GitWorktreeInfo,
  GitWorktreeListResult,
  GitMergeToSourceResult,
  GitGetWorktreeSourceBranchResult,
  GitPullFromSourceResult,
  GitRemoteInfo,
  RemoteHostPlatform,
} from "../shared/contracts";
import { getWslCommand, readWslCommandOutputAsync, resolveWslShellPathAsync } from "./agents/base";
import { resolveLightcodePaths } from "../shared/lightcodePaths";
import { sanitizeWorktreeBranchName, sanitizeWorktreePathSegment } from "../shared/worktree";
import { getProjectName } from "../shared/wsl";

const execFileAsync = promisify(execFile);

function quotePosixShellArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// ── Timeouts ─────────────────────────────────────────────

const GIT_STATUS_TIMEOUT = 10_000;
const GIT_DIFF_TIMEOUT = 15_000;
const GIT_NETWORK_TIMEOUT = 30_000;
const GIT_DEFAULT_TIMEOUT = 15_000;

// ── Native git executor ──────────────────────────────────

/**
 * Execute a git command using native CLI.
 * - Sets GIT_OPTIONAL_LOCKS=0 on every call to avoid index.lock contention.
 * - Configurable per-command timeout.
 * - Supports both Windows native paths and WSL via `wsl.exe git`.
 *
 * Returns stdout. Throws on non-zero exit (with stderr in message).
 * Pass `allowNonZeroExit: true` to capture stdout even on exit code 1
 * (useful for `git diff --no-index` which exits 1 when files differ).
 */
export async function execGit(
  location: ProjectLocation,
  args: string[],
  options?: { timeout?: number; allowNonZeroExit?: boolean },
): Promise<string> {
  const timeout = options?.timeout ?? GIT_DEFAULT_TIMEOUT;
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };

  let command: string;
  let fullArgs: string[];
  let cwd: string | undefined;

  if (location.kind === "wsl") {
    command = "wsl.exe";
    fullArgs = ["-d", location.distro, "--cd", location.linuxPath, "--", "git", ...args];
    cwd = undefined;
  } else {
    command = "git";
    fullArgs = args;
    cwd = location.path;
  }

  try {
    const { stdout } = await execFileAsync(command, fullArgs, {
      cwd,
      env,
      timeout,
      maxBuffer: 50 * 1024 * 1024, // 50MB for large diffs
      windowsHide: true,
    });
    return stdout;
  } catch (err: unknown) {
    if (options?.allowNonZeroExit && err && typeof err === "object" && "stdout" in err) {
      const stdout = String((err as { stdout: unknown }).stdout);
      if (stdout) return stdout;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`git ${args[0]} failed: ${msg}`, { cause: err });
  }
}

// ── Helpers ──────────────────────────────────────────────

function getRepoPath(location: ProjectLocation): string {
  if (location.kind === "wsl") return location.uncPath;
  return location.path;
}

/** Convert backslash paths to forward-slash (for UNC paths, git file paths, etc.). */
function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

function normalizeWorktreePath(location: ProjectLocation, path: string): string {
  return location.kind === "wsl" ? path : normalize(path);
}

export function getLocationIdentity(location: ProjectLocation): string {
  if (location.kind === "wsl") {
    return `wsl:${location.distro}:${location.linuxPath}`;
  }
  if (location.kind === "windows") {
    return `windows:${location.path.replace(/\\/g, "/").toLowerCase()}`;
  }
  return `posix:${location.path}`;
}

function getWorktreeRepoDirName(location: ProjectLocation): string {
  const repoName = sanitizeWorktreePathSegment(getProjectName(location));
  const hash = createHash("sha256").update(getLocationIdentity(location)).digest("hex").slice(0, 8);
  return `${repoName}-${hash}`;
}

async function resolveWslHomeDirectory(distro: string): Promise<string> {
  const result = await readWslCommandOutputAsync(distro, "sh", ["-lc", 'printf %s "$HOME"']);
  const homePath = result.stdout.trim();
  if (!result.ok || !homePath) {
    throw new Error(`Unable to resolve home directory for WSL distro "${distro}".`);
  }
  return homePath;
}

export async function computeDefaultWorktreePath(
  location: ProjectLocation,
  branch: string,
): Promise<string> {
  const repoDir = getWorktreeRepoDirName(location);
  const branchDir = sanitizeWorktreeBranchName(branch);

  if (location.kind === "wsl") {
    const homePath = await resolveWslHomeDirectory(location.distro);
    return posix.join(homePath, ".lightcode", "worktrees", repoDir, branchDir);
  }

  return join(
    resolveLightcodePaths(join(homedir(), ".lightcode")).worktreesDir,
    repoDir,
    branchDir,
  );
}

async function ensureWorktreeParentExists(
  location: ProjectLocation,
  worktreePath: string,
): Promise<void> {
  if (location.kind === "wsl") {
    const parentPath = posix.dirname(worktreePath);
    const result = await readWslCommandOutputAsync(location.distro, "mkdir", ["-p", parentPath]);
    if (!result.ok) {
      throw new Error(
        result.stderr || `Unable to create WSL worktree directory parent "${parentPath}".`,
      );
    }
    return;
  }

  await mkdir(dirname(worktreePath), { recursive: true });
}

// ── Remote URL parsing ───────────────────────────────────

function detectPlatform(hostname: string): RemoteHostPlatform {
  const h = hostname.toLowerCase();
  if (h === "github.com" || h.includes("github")) return "github";
  if (h === "gitlab.com" || h.includes("gitlab")) return "gitlab";
  if (h === "bitbucket.org" || h.includes("bitbucket")) return "bitbucket";
  return "unknown";
}

/** Parse a git remote URL into structured info. Handles HTTPS, SSH, and GHE patterns. */
export function parseRemoteUrl(url: string): GitRemoteInfo | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    const [, hostname, owner, repo] = httpsMatch;
    return { url, platform: detectPlatform(hostname!), owner: owner!, repo: repo! };
  }

  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/^[^@]+@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, hostname, owner, repo] = sshMatch;
    return { url, platform: detectPlatform(hostname!), owner: owner!, repo: repo! };
  }

  return null;
}

// ── Porcelain v2 status parser ───────────────────────────

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

/**
 * Parse output of `git status --porcelain=v2 -b`.
 *
 * Format reference: https://git-scm.com/docs/git-status#_porcelain_format_version_2
 *
 * Header lines start with #:
 *   # branch.oid <commit>
 *   # branch.head <branch>
 *   # branch.upstream <upstream>
 *   # branch.ab +<ahead> -<behind>
 *
 * Changed entries (type 1):
 *   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
 *
 * Renamed/copied entries (type 2):
 *   2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>\t<origPath>
 *
 * Unmerged entries:
 *   u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
 *
 * Untracked:
 *   ? <path>
 *
 * Ignored:
 *   ! <path>
 */
export function parseStatusPorcelainV2(output: string): ParsedPorcelainStatus {
  const result: ParsedPorcelainStatus = {
    branch: "",
    tracking: "",
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    conflictFiles: [],
    mergeInProgress: false,
  };

  if (!output.trim()) return result;

  for (const line of output.split("\n")) {
    if (!line) continue;

    if (line.startsWith("# ")) {
      // Header line
      if (line.startsWith("# branch.head ")) {
        result.branch = line.slice(14);
      } else if (line.startsWith("# branch.upstream ")) {
        result.tracking = line.slice(18);
      } else if (line.startsWith("# branch.ab ")) {
        const abMatch = line.match(/\+(\d+) -(\d+)/);
        if (abMatch) {
          result.ahead = parseInt(abMatch[1]!, 10);
          result.behind = parseInt(abMatch[2]!, 10);
        }
      }
    } else if (line.startsWith("1 ")) {
      // Changed entry: 1 XY sub mH mI mW hH hI path
      const parts = line.split(" ");
      // parts: [1, XY, sub, mH, mI, mW, hH, hI, ...path]
      const xy = parts[1]!;
      const path = toForwardSlash(parts.slice(8).join(" "));
      const indexStatus = xy[0]!;
      const worktreeStatus = xy[1]!;

      if (indexStatus !== ".") {
        result.staged.push({
          path,
          status: indexStatus,
          staged: true,
          insertions: 0,
          deletions: 0,
        });
      }
      if (worktreeStatus !== ".") {
        result.unstaged.push({
          path,
          status: worktreeStatus,
          staged: false,
          insertions: 0,
          deletions: 0,
        });
      }
    } else if (line.startsWith("2 ")) {
      // Rename/copy entry: 2 XY sub mH mI mW hH hI Xscore path\torigPath
      const parts = line.split(" ");
      const xy = parts[1]!;
      // parts[8] is Xscore (e.g. R100, C090)
      const rest = parts.slice(9).join(" ");
      const tabIndex = rest.indexOf("\t");
      const path = toForwardSlash(tabIndex >= 0 ? rest.slice(0, tabIndex) : rest);
      const origPath = tabIndex >= 0 ? toForwardSlash(rest.slice(tabIndex + 1)) : undefined;
      const indexStatus = xy[0]!;
      const worktreeStatus = xy[1]!;

      if (indexStatus !== ".") {
        result.staged.push({
          path,
          ...(origPath ? { oldPath: origPath } : {}),
          status: indexStatus,
          staged: true,
          insertions: 0,
          deletions: 0,
        });
      }
      if (worktreeStatus !== ".") {
        result.unstaged.push({
          path,
          ...(origPath ? { oldPath: origPath } : {}),
          status: worktreeStatus,
          staged: false,
          insertions: 0,
          deletions: 0,
        });
      }
    } else if (line.startsWith("u ")) {
      // Unmerged entry: u XY sub m1 m2 m3 mW h1 h2 h3 path
      const parts = line.split(" ");
      const path = toForwardSlash(parts.slice(10).join(" "));
      result.conflictFiles.push(path);
      result.mergeInProgress = true;
    } else if (line.startsWith("? ")) {
      // Untracked file
      const path = toForwardSlash(line.slice(2));
      result.unstaged.push({
        path,
        status: "?",
        staged: false,
        insertions: 0,
        deletions: 0,
      });
    }
  }

  return result;
}

// ── Diff stat parser ─────────────────────────────────────

interface DiffStatEntry {
  path: string;
  insertions: number;
  deletions: number;
}

/**
 * Parse `git diff --numstat` output into per-file insertion/deletion counts.
 * Format: <insertions>\t<deletions>\t<path>
 * Binary files show as: -\t-\t<path>
 */
function parseDiffNumstat(output: string): DiffStatEntry[] {
  const entries: DiffStatEntry[] = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const ins = parts[0]!;
    const del = parts[1]!;
    const path = toForwardSlash(parts.slice(2).join("\t")); // path may contain tabs in theory
    if (ins === "-" || del === "-") continue; // binary file
    entries.push({
      path,
      insertions: parseInt(ins, 10) || 0,
      deletions: parseInt(del, 10) || 0,
    });
  }
  return entries;
}

// ── Constants ────────────────────────────────────────────

const EMPTY_STATUS: GitStatusResult = {
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

// ── GitService ───────────────────────────────────────────

export class GitService {
  async getStatus(location: ProjectLocation): Promise<GitStatusResult> {
    // Check if this is a git repo
    try {
      await execGit(location, ["rev-parse", "--is-inside-work-tree"], {
        timeout: GIT_STATUS_TIMEOUT,
      });
    } catch {
      return EMPTY_STATUS;
    }

    // Run status + remote info + numstat in parallel (one porcelain command replaces 4+ calls)
    const [statusOutput, remoteOutput, stagedNumstat, unstagedNumstat] = await Promise.all([
      execGit(location, ["status", "--porcelain=v2", "-b"], {
        timeout: GIT_STATUS_TIMEOUT,
      }),
      execGit(location, ["remote", "-v"], { timeout: GIT_STATUS_TIMEOUT }).catch(() => ""),
      execGit(location, ["diff", "--cached", "--numstat"], { timeout: GIT_STATUS_TIMEOUT }).catch(
        () => "",
      ),
      execGit(location, ["diff", "--numstat"], { timeout: GIT_STATUS_TIMEOUT }).catch(() => ""),
    ]);

    const parsed = parseStatusPorcelainV2(statusOutput);

    // Parse remotes for platform detection
    const remoteLines = remoteOutput.trim().split("\n").filter(Boolean);
    const hasRemote = remoteLines.length > 0;
    let remoteInfo: GitRemoteInfo | null = null;

    if (hasRemote) {
      // Find origin fetch URL, or fall back to first remote
      const originLine =
        remoteLines.find((l) => l.startsWith("origin\t") && l.includes("(fetch)")) ??
        remoteLines.find((l) => l.includes("(fetch)"));
      if (originLine) {
        const urlMatch = originLine.match(/^\S+\t(\S+)/);
        if (urlMatch) {
          remoteInfo = parseRemoteUrl(urlMatch[1]!);
        }
      }
    }

    // Apply numstat to staged files
    const stagedStats = parseDiffNumstat(stagedNumstat);
    for (const stat of stagedStats) {
      const match = parsed.staged.find((f) => f.path === stat.path);
      if (match) {
        match.insertions = stat.insertions;
        match.deletions = stat.deletions;
      }
    }

    // Apply numstat to unstaged files
    const unstagedStats = parseDiffNumstat(unstagedNumstat);
    for (const stat of unstagedStats) {
      const match = parsed.unstaged.find((f) => f.path === stat.path);
      if (match) {
        match.insertions = stat.insertions;
        match.deletions = stat.deletions;
      }
    }

    // Count lines for untracked files (not covered by numstat)
    const repoPath = getRepoPath(location);
    const untrackedFiles = parsed.unstaged.filter((f) => f.status === "?" && f.insertions === 0);
    if (untrackedFiles.length > 0) {
      await Promise.all(
        untrackedFiles.map(async (f) => {
          try {
            const content = await readFile(join(repoPath, f.path), "utf-8");
            f.insertions = content.split("\n").length;
          } catch {
            // best-effort
          }
        }),
      );
    }

    const totalInsertions =
      parsed.staged.reduce((sum, f) => sum + f.insertions, 0) +
      parsed.unstaged.reduce((sum, f) => sum + f.insertions, 0);
    const totalDeletions =
      parsed.staged.reduce((sum, f) => sum + f.deletions, 0) +
      parsed.unstaged.reduce((sum, f) => sum + f.deletions, 0);

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
        ? { mergeInProgress: true, conflictFiles: parsed.conflictFiles }
        : {}),
    };
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

    // For untracked or newly added files, git diff returns empty.
    // Use --no-index to show full file content as additions.
    // git diff --no-index exits with code 1 when files differ — that's expected.
    if (!diff.trim() && filePath) {
      diff = await execGit(location, ["diff", "--no-index", "--", "/dev/null", filePath], {
        timeout: GIT_DIFF_TIMEOUT,
        allowNonZeroExit: true,
      }).catch(() => "");
    }

    return { diff };
  }

  async stage(location: ProjectLocation, filePath: string): Promise<void> {
    await execGit(location, ["add", "--", filePath]);
  }

  async unstage(location: ProjectLocation, filePath: string): Promise<void> {
    await execGit(location, ["reset", "HEAD", "--", filePath]);
  }

  async revert(location: ProjectLocation, filePath: string): Promise<void> {
    // Get file status to determine the right revert strategy
    const statusOutput = await execGit(location, ["status", "--porcelain=v2", "--", filePath], {
      timeout: GIT_STATUS_TIMEOUT,
    });

    const parsed = parseStatusPorcelainV2(statusOutput);
    const unstagedEntry = parsed.unstaged.find(
      (f) => toForwardSlash(f.path) === toForwardSlash(filePath),
    );

    if (unstagedEntry?.status === "?") {
      // Untracked file — clean it
      await execGit(location, ["clean", "-f", "--", filePath]);
      return;
    }

    // Check for renamed file (type 2 entries)
    if (unstagedEntry?.status === "R" && unstagedEntry.oldPath) {
      await execGit(location, ["clean", "-f", "--", filePath]);
      await execGit(location, ["checkout", "--", unstagedEntry.oldPath]);
      return;
    }

    await execGit(location, ["checkout", "--", filePath]);
  }

  /**
   * Split combined `git diff` output into per-file chunks keyed by file path.
   */
  private splitCombinedDiff(raw: string): Record<string, string> {
    if (!raw.trim()) return {};

    const result: Record<string, string> = {};
    const chunks = raw.split(/(?=^diff --git )/m);

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const headerMatch = chunk.match(/^diff --git (?:"a\/.+?"|a\/.+?) (?:"b\/(.+?)"|b\/(.+?))$/m);
      const matched = headerMatch?.[1] ?? headerMatch?.[2];
      if (!matched) continue;
      const filePath = toForwardSlash(matched);
      result[filePath] = chunk;
    }

    return result;
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
        untrackedPaths.map(async (filePath) => {
          const { diff } = await this.getDiff(location, filePath, false);
          return { filePath, diff };
        }),
      );
      for (const { filePath, diff } of untrackedResults) {
        if (diff.trim()) unstaged[filePath] = diff;
      }
    }

    return { staged, unstaged };
  }

  async stageAll(location: ProjectLocation): Promise<void> {
    await execGit(location, ["add", "."]);
  }

  async unstageAll(location: ProjectLocation): Promise<void> {
    await execGit(location, ["reset", "HEAD"]);
  }

  async revertAll(location: ProjectLocation): Promise<void> {
    await execGit(location, ["checkout", "--", "."]);
    await execGit(location, ["clean", "-fd"]);
  }

  async commit(
    location: ProjectLocation,
    message: string,
    addAll: boolean,
  ): Promise<{ hash: string }> {
    if (addAll) await execGit(location, ["add", "."]);
    const output =
      location.kind === "wsl"
        ? await this.execWslCommit(location, message)
        : await execGit(location, ["commit", "-m", message]);
    // Extract hash from first line: "[branch hash] message"
    const hashMatch = output.match(/\[.+?\s+([a-f0-9]+)\]/);
    return { hash: hashMatch?.[1] ?? "" };
  }

  private async execWslCommit(
    location: Extract<ProjectLocation, { kind: "wsl" }>,
    message: string,
  ): Promise<string> {
    const shellPath = await resolveWslShellPathAsync(location.distro);
    const script = `exec ${["git", "commit", "-m", message].map(quotePosixShellArg).join(" ")}`;
    const { stdout } = await execFileAsync(
      getWslCommand(),
      [
        "-d",
        location.distro,
        "--cd",
        location.linuxPath,
        "--",
        shellPath,
        "-l",
        "-i",
        "-c",
        script,
      ],
      {
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        timeout: GIT_DEFAULT_TIMEOUT,
        maxBuffer: 50 * 1024 * 1024,
        windowsHide: true,
      },
    );
    return stdout;
  }

  async getStagedDiff(location: ProjectLocation): Promise<string> {
    return execGit(location, ["diff", "--cached"], { timeout: GIT_DIFF_TIMEOUT });
  }

  async getAllDiff(location: ProjectLocation): Promise<string> {
    return execGit(location, ["diff"], { timeout: GIT_DIFF_TIMEOUT });
  }

  // ── Branch & Worktree ───────────────────────────────────

  async listBranches(
    location: ProjectLocation,
    includeRemote: boolean,
  ): Promise<GitBranchListResult> {
    const args = [
      "branch",
      "--format=%(refname:short)\t%(objectname:short)\t%(HEAD)",
      "--sort=-HEAD",
    ];
    if (includeRemote) args.push("-a");
    const output = await execGit(location, args);

    let current = "";
    const branches: GitBranchInfo[] = [];

    for (const line of output.trim().split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      const name = parts[0]!;
      const commit = parts[1] ?? "";
      const isCurrent = parts[2] === "*";

      // For remote branches like "origin/main", strip the remote prefix for display
      let displayName = name;
      let isRemoteBranch = false;
      if (name.startsWith("remotes/")) {
        displayName = name.replace(/^remotes\/[^/]+\//, "");
        isRemoteBranch = true;
      } else if (includeRemote && name.includes("/") && !isCurrent) {
        // Could be a remote ref from -a that doesn't start with remotes/
        // We keep as-is if it looks like a local branch with slashes
        isRemoteBranch = false;
      }

      if (isCurrent) current = name;
      branches.push({
        name: isRemoteBranch ? displayName : name,
        current: isCurrent,
        commit,
        isRemote: isRemoteBranch,
      });
    }

    return { current, branches };
  }

  async fetch(location: ProjectLocation, remote: string, prune: boolean): Promise<void> {
    const args = ["fetch", remote];
    if (prune) args.push("--prune");
    await execGit(location, args, { timeout: GIT_NETWORK_TIMEOUT });
  }

  async pull(location: ProjectLocation, remote: string): Promise<void> {
    await execGit(location, ["pull", "--ff-only", remote], { timeout: GIT_NETWORK_TIMEOUT });
  }

  async push(
    location: ProjectLocation,
    remote: string,
    branch?: string,
    setUpstream?: boolean,
  ): Promise<void> {
    const args = ["push"];
    if (setUpstream) args.push("--set-upstream");
    args.push(remote);
    if (branch) args.push(branch);
    await execGit(location, args, { timeout: GIT_NETWORK_TIMEOUT });
  }

  async listWorktrees(location: ProjectLocation): Promise<GitWorktreeListResult> {
    const raw = await execGit(location, ["worktree", "list", "--porcelain"]);
    const worktrees: GitWorktreeInfo[] = [];

    for (const block of raw.split(/\r?\n\r?\n+/).filter(Boolean)) {
      const lines = block.trim().split(/\r?\n/);
      let path = "";
      let commit = "";
      let branch = "";

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          path = location.kind === "wsl" ? line.slice(9) : normalize(line.slice(9));
        } else if (line.startsWith("HEAD ")) commit = line.slice(5);
        else if (line.startsWith("branch ")) branch = line.slice(7).replace("refs/heads/", "");
      }

      if (path) {
        worktrees.push({
          path,
          branch,
          commit,
          isMain: worktrees.length === 0,
        });
      }
    }

    return { worktrees };
  }

  async addWorktree(
    location: ProjectLocation,
    path: string | undefined,
    branch?: string,
    createBranch?: boolean,
    startPoint?: string,
  ): Promise<GitAddWorktreeResult> {
    const resolvedPath =
      path ?? (branch ? await computeDefaultWorktreePath(location, branch) : undefined);
    if (!resolvedPath) {
      throw new Error("Cannot create a default worktree path without a branch name.");
    }
    await ensureWorktreeParentExists(location, resolvedPath);
    const args = ["worktree", "add"];
    if (createBranch && branch) {
      args.push("-b", branch, resolvedPath, ...(startPoint ? [startPoint] : []));
    } else {
      args.push(resolvedPath, ...(branch ? [branch] : []));
    }
    await execGit(location, args);

    // Store the source branch in git config so we can merge back later
    if (branch && createBranch) {
      const sourceBranch = startPoint ?? (await this.getCurrentBranch(location));
      if (sourceBranch && sourceBranch !== branch) {
        await this.writeWorktreeSourceBranch(location, branch, sourceBranch);
      }
    }

    return { path: resolvedPath };
  }

  async removeWorktree(location: ProjectLocation, path: string, force: boolean): Promise<void> {
    const args = ["worktree", "remove", ...(force ? ["--force"] : []), path];
    try {
      await execGit(location, args);
    } catch (error) {
      if (!(await this.shouldRetryResidualWorktreeCleanup(location, path, error))) {
        throw error;
      }

      await this.removeResidualWorktreeDirectory(location, path, error);
    }
  }

  async deleteBranch(location: ProjectLocation, branch: string, force: boolean): Promise<void> {
    if (force) {
      await this.deleteBranchWithPruneRetry(location, branch, true);
      return;
    }

    try {
      await this.deleteBranchWithPruneRetry(location, branch, false);
    } catch (error) {
      if (!(await this.canForceDeleteMergedWorktreeBranch(location, branch, error))) {
        throw error;
      }

      await this.deleteBranchWithPruneRetry(location, branch, true);
    }
  }

  // ── Worktree source branch ──────────────────────────────

  async getWorktreeSourceBranch(
    location: ProjectLocation,
    branch: string,
  ): Promise<GitGetWorktreeSourceBranchResult> {
    const sourceBranch = await this.readWorktreeSourceBranch(location, branch);

    let commitsAhead = 0;
    let sourceAhead = 0;
    if (sourceBranch) {
      try {
        // rev-list --left-right --count sourceBranch...branch → "<behind>\t<ahead>"
        const output = await execGit(location, [
          "rev-list",
          "--left-right",
          "--count",
          `${sourceBranch}...${branch}`,
        ]);
        const parts = output.trim().split(/\s+/);
        sourceAhead = parseInt(parts[0]!, 10) || 0;
        commitsAhead = parseInt(parts[1]!, 10) || 0;
      } catch {
        // branches may not share history
      }
    }
    return { sourceBranch, commitsAhead, sourceAhead };
  }

  // ── Merge to source ─────────────────────────────────────

  private async findWorktreeForBranch(
    repoLocation: ProjectLocation,
    branch: string,
  ): Promise<ProjectLocation | null> {
    const { worktrees } = await this.listWorktrees(repoLocation);
    const match = worktrees.find((wt) => wt.branch === branch);
    if (!match) return null;
    if (repoLocation.kind === "wsl") {
      return { ...repoLocation, linuxPath: match.path, uncPath: match.path };
    }
    return { ...repoLocation, path: match.path };
  }

  async mergeToSource(
    repoLocation: ProjectLocation,
    _worktreeLocation: ProjectLocation,
    worktreeBranch: string,
    sourceBranch: string,
  ): Promise<GitMergeToSourceResult> {
    // Check if fast-forward is possible
    let canFF = false;
    try {
      await execGit(repoLocation, ["merge-base", "--is-ancestor", sourceBranch, worktreeBranch]);
      canFF = true;
    } catch {
      // Not an ancestor
    }

    if (canFF) {
      const sourceLocation = await this.findWorktreeForBranch(repoLocation, sourceBranch);

      if (sourceLocation) {
        await execGit(sourceLocation, ["merge", "--ff-only", worktreeBranch]);
        const newCommit = (await execGit(sourceLocation, ["rev-parse", "HEAD"])).trim();
        return { merged: true, fastForward: true, newSourceCommit: newCommit };
      }

      // Source branch not checked out — just move the ref
      const worktreeTip = (await execGit(repoLocation, ["rev-parse", worktreeBranch])).trim();
      await execGit(repoLocation, ["update-ref", `refs/heads/${sourceBranch}`, worktreeTip]);
      return { merged: true, fastForward: true, newSourceCommit: worktreeTip };
    }

    const sourceLocation = await this.findWorktreeForBranch(repoLocation, sourceBranch);

    if (sourceLocation) {
      try {
        await this.ensureWorktreeCleanForMerge(sourceLocation, sourceBranch);
        return await this.mergeBranchIntoSourceLocation(sourceLocation, worktreeBranch);
      } catch (err) {
        return {
          merged: false,
          fastForward: false,
          newSourceCommit: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Non-fast-forward: merge via temporary worktree
    const tempBranchDir = `_merge-temp-${Date.now()}`;
    const tempPath = await computeDefaultWorktreePath(repoLocation, tempBranchDir);

    try {
      await ensureWorktreeParentExists(repoLocation, tempPath);
      await execGit(repoLocation, ["worktree", "add", tempPath, sourceBranch]);

      const tempLocation: ProjectLocation =
        repoLocation.kind === "wsl"
          ? { ...repoLocation, linuxPath: tempPath, uncPath: tempPath }
          : { ...repoLocation, path: tempPath };

      return await this.mergeBranchIntoSourceLocation(tempLocation, worktreeBranch);
    } catch (err: unknown) {
      return {
        merged: false,
        fastForward: false,
        newSourceCommit: "",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await execGit(repoLocation, ["worktree", "remove", "--force", tempPath]).catch(
        () => undefined,
      );
    }
  }

  // ── Pull from source into worktree ──────────────────────

  async pullFromSource(
    worktreeLocation: ProjectLocation,
    sourceBranch: string,
  ): Promise<GitPullFromSourceResult> {
    let canFF = false;
    try {
      await execGit(worktreeLocation, ["merge-base", "--is-ancestor", "HEAD", sourceBranch]);
      canFF = true;
    } catch {
      // Not an ancestor
    }

    if (canFF) {
      try {
        await execGit(worktreeLocation, ["merge", "--ff-only", sourceBranch]);
        return { merged: true, fastForward: true };
      } catch (err: unknown) {
        return {
          merged: false,
          fastForward: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Non-fast-forward merge
    try {
      await execGit(worktreeLocation, ["merge", sourceBranch, "--no-ff", "--no-edit"]);
    } catch (mergeErr: unknown) {
      const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
      if (msg.includes("CONFLICT") || msg.includes("Merge conflict")) {
        const conflictFiles: string[] = [];
        const conflictMatches = msg.matchAll(/CONFLICT.*?:\s*(?:Merge conflict in\s+)?(.+)/g);
        for (const m of conflictMatches) {
          if (m[1]) conflictFiles.push(m[1].trim());
        }
        return {
          merged: false,
          fastForward: false,
          conflicting: true,
          error: "Merge conflicts detected",
          conflictFiles,
        };
      }
      return {
        merged: false,
        fastForward: false,
        error: msg,
      };
    }

    return { merged: true, fastForward: false };
  }

  // ── Conflict resolution helpers ──────────────────────

  async abortMerge(worktreeLocation: ProjectLocation): Promise<void> {
    await execGit(worktreeLocation, ["merge", "--abort"]);
  }

  async runMergetool(
    worktreeLocation: ProjectLocation,
  ): Promise<{ success: boolean; merged?: boolean; error?: string }> {
    try {
      await execGit(worktreeLocation, ["mergetool", "--no-prompt"]);
      // Check for remaining conflicts via porcelain v2
      const statusOutput = await execGit(worktreeLocation, ["status", "--porcelain=v2", "-b"], {
        timeout: GIT_STATUS_TIMEOUT,
      });
      const parsed = parseStatusPorcelainV2(statusOutput);
      if (parsed.conflictFiles.length > 0) {
        return { success: true, merged: false };
      }
      // All resolved — auto-finish the merge
      await execGit(worktreeLocation, ["commit", "--no-edit"]);
      return { success: true, merged: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async shouldRetryResidualWorktreeCleanup(
    location: ProjectLocation,
    path: string,
    error: unknown,
  ): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error);
    const looksLikeDeleteFailure =
      /failed to delete/i.test(message) ||
      /directory not empty/i.test(message) ||
      /access is denied/i.test(message) ||
      /device or resource busy/i.test(message);
    if (!looksLikeDeleteFailure) {
      return false;
    }

    const targetPath = normalizeWorktreePath(location, path);
    const { worktrees } = await this.listWorktrees(location);
    return !worktrees.some(
      (worktree) => normalizeWorktreePath(location, worktree.path) === targetPath,
    );
  }

  private async removeResidualWorktreeDirectory(
    location: ProjectLocation,
    path: string,
    originalError: unknown,
  ): Promise<void> {
    try {
      if (location.kind === "wsl") {
        const result = await readWslCommandOutputAsync(location.distro, "rm", ["-rf", "--", path]);
        if (!result.ok) {
          throw new Error(
            result.stderr || `Failed to remove residual worktree directory "${path}".`,
          );
        }
        return;
      }

      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    } catch (cleanupError) {
      const originalMessage =
        originalError instanceof Error ? originalError.message : String(originalError);
      const cleanupMessage =
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      throw new Error(`${originalMessage}\nResidual cleanup failed: ${cleanupMessage}`, {
        cause: cleanupError,
      });
    }
  }

  private async canForceDeleteMergedWorktreeBranch(
    location: ProjectLocation,
    branch: string,
    error: unknown,
  ): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not fully merged/i.test(message)) {
      return false;
    }

    const sourceBranch = await this.readWorktreeSourceBranch(location, branch);
    if (!sourceBranch) {
      return false;
    }

    try {
      await execGit(location, ["merge-base", "--is-ancestor", branch, sourceBranch]);
      return true;
    } catch {
      return false;
    }
  }

  private async deleteBranchWithPruneRetry(
    location: ProjectLocation,
    branch: string,
    force: boolean,
  ): Promise<void> {
    const args = ["branch", force ? "-D" : "-d", branch];
    try {
      await execGit(location, args);
    } catch (error) {
      if (!this.shouldRetryBranchDeleteAfterPrune(error)) {
        throw error;
      }

      await execGit(location, ["worktree", "prune"]);
      await execGit(location, args);
    }
  }

  private shouldRetryBranchDeleteAfterPrune(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /used by worktree|checked out at/i.test(message);
  }

  private async ensureWorktreeCleanForMerge(
    location: ProjectLocation,
    sourceBranch: string,
  ): Promise<void> {
    const status = await execGit(location, ["status", "--porcelain"]);
    if (!status.trim()) {
      return;
    }

    throw new Error(
      `Source branch '${sourceBranch}' is checked out in worktree '${getRepoPath(location)}' and has uncommitted changes. Commit or stash them before merging.`,
    );
  }

  private async mergeBranchIntoSourceLocation(
    location: ProjectLocation,
    worktreeBranch: string,
  ): Promise<GitMergeToSourceResult> {
    try {
      await execGit(location, ["merge", worktreeBranch, "--no-edit", "--no-ff"]);
    } catch (mergeErr: unknown) {
      const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
      if (msg.includes("CONFLICT") || msg.includes("Merge conflict")) {
        const conflictFiles: string[] = [];
        const conflictMatches = msg.matchAll(/CONFLICT.*?:\s*(?:Merge conflict in\s+)?(.+)/g);
        for (const m of conflictMatches) {
          if (m[1]) conflictFiles.push(m[1].trim());
        }
        await execGit(location, ["merge", "--abort"]).catch(() => undefined);
        return {
          merged: false,
          fastForward: false,
          newSourceCommit: "",
          error: "Merge conflicts detected",
          conflictFiles,
        };
      }
      throw mergeErr;
    }

    const newCommit = (await execGit(location, ["rev-parse", "HEAD"])).trim();
    return { merged: true, fastForward: false, newSourceCommit: newCommit };
  }

  private async readWorktreeSourceBranch(
    location: ProjectLocation,
    branch: string,
  ): Promise<string | null> {
    try {
      const result = await execGit(location, [
        "config",
        "--get",
        `branch.${branch}.lightcodeSource`,
      ]);
      const sourceBranch = result.trim() || null;
      if (sourceBranch) {
        return sourceBranch;
      }
    } catch {
      // no explicit source branch configured
    }
    return this.inferWorktreeSourceBranch(location, branch);
  }

  private async inferWorktreeSourceBranch(
    location: ProjectLocation,
    branch: string,
  ): Promise<string | null> {
    try {
      const { worktrees } = await this.listWorktrees(location);
      const mainWorktreeBranch = worktrees.find((worktree) => worktree.isMain)?.branch || null;
      if (!mainWorktreeBranch || mainWorktreeBranch === branch) {
        return null;
      }

      // Only recover a legacy source branch when the main branch shares history with the worktree.
      await execGit(location, ["merge-base", mainWorktreeBranch, branch]);
      await this.writeWorktreeSourceBranch(location, branch, mainWorktreeBranch);
      return mainWorktreeBranch;
    } catch {
      return null;
    }
  }

  private async getCurrentBranch(location: ProjectLocation): Promise<string | null> {
    try {
      const result = await execGit(location, ["branch", "--show-current"]);
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  private async writeWorktreeSourceBranch(
    location: ProjectLocation,
    branch: string,
    sourceBranch: string,
  ): Promise<void> {
    await execGit(location, ["config", `branch.${branch}.lightcodeSource`, sourceBranch]).catch(
      () => undefined,
    );
  }
}
