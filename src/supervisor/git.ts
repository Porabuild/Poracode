import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize, posix } from "node:path";
import { promisify } from "node:util";
import type {
  ProjectLocation,
  GitStatusResult,
  GitDiffResult,
  GitDiffBatchResult,
  GitFileContentResult,
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
import { msg, errorDetail } from "../shared/messages";

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
    const detail = errorDetail(err);
    throw new Error(msg("git.commandFailed", { command: args[0]!, detail }), { cause: err });
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
  if (location.kind === "wsl") return path;
  // Use lower-case and forward slashes for stable comparison on Windows
  return normalize(path).replace(/\\/g, "/").toLowerCase();
}

export function getLocationIdentity(location: ProjectLocation): string {
  if (location.kind === "wsl") {
    return `wsl:${location.distro}:${location.linuxPath}`;
  }
  if (location.kind === "windows") {
    return `windows:${toForwardSlash(location.path).toLowerCase()}`;
  }
  return `posix:${location.path}`;
}

function getWorktreeRepoDirName(location: ProjectLocation): string {
  const repoName = sanitizeWorktreePathSegment(getProjectName(location));
  const hash = createHash("sha256").update(getLocationIdentity(location)).digest("hex").slice(0, 4);
  return `${repoName}-${hash}`;
}

async function resolveWslHomeDirectory(distro: string): Promise<string> {
  const result = await readWslCommandOutputAsync(distro, "sh", ["-lc", 'printf %s "$HOME"']);
  const homePath = result.stdout.trim();
  if (!result.ok || !homePath) {
    throw new Error(msg("git.wsl.homeNotFound", { distro }));
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
        result.stderr || msg("git.wsl.mkdirFailed", { path: parentPath }),
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
    for (const entry of stagedStats) {
      const match = parsed.staged.find((f) => f.path === entry.path);
      if (match) {
        match.insertions = entry.insertions;
        match.deletions = entry.deletions;
      }
    }

    // Apply numstat to unstaged files
    const unstagedStats = parseDiffNumstat(unstagedNumstat);
    for (const entry of unstagedStats) {
      const match = parsed.unstaged.find((f) => f.path === entry.path);
      if (match) {
        match.insertions = entry.insertions;
        match.deletions = entry.deletions;
      }
    }

    // Count lines for untracked files (not covered by numstat).
    // Directories are reported as single "?" entries by porcelain v2 — expand them
    // into individual file entries so the UI matches VS Code behavior.
    const repoPath = getRepoPath(location);
    const untrackedFiles = parsed.unstaged.filter((f) => f.status === "?" && f.insertions === 0);
    if (untrackedFiles.length > 0) {
      const toRemove = new Set<string>();
      const toAdd: GitFileChange[] = [];
      await Promise.all(
        untrackedFiles.map(async (f) => {
          try {
            const fullPath = join(repoPath, f.path);
            const st = await stat(fullPath);
            if (st.isDirectory()) {
              toRemove.add(f.path);
              const entries = await readdir(fullPath, { recursive: true });
              await Promise.all(
                entries.map(async (entry) => {
                  const filePath = join(fullPath, entry);
                  try {
                    const entryStat = await stat(filePath);
                    if (!entryStat.isFile()) return;
                    const content = await readFile(filePath, "utf-8");
                    toAdd.push({
                      path: toForwardSlash(join(f.path, entry)),
                      status: "?",
                      staged: false,
                      insertions: content.split("\n").length,
                      deletions: 0,
                    });
                  } catch {
                    // skip binary / unreadable files
                  }
                }),
              );
              return;
            }
            const content = await readFile(fullPath, "utf-8");
            f.insertions = content.split("\n").length;
          } catch {
            // best-effort
          }
        }),
      );
      if (toRemove.size > 0) {
        parsed.unstaged = parsed.unstaged.filter((f) => !toRemove.has(f.path));
      }
      if (toAdd.length > 0) {
        parsed.unstaged.push(...toAdd);
      }
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

  async getFileContent(
    location: ProjectLocation,
    filePath: string,
    staged: boolean,
  ): Promise<GitFileContentResult> {
    if (staged) {
      // Staged diff: old = HEAD version, new = index version
      const [oldContent, newContent] = await Promise.all([
        execGit(location, ["show", `HEAD:${filePath}`], { timeout: GIT_DIFF_TIMEOUT }).catch(
          () => "",
        ),
        execGit(location, ["show", `:${filePath}`], { timeout: GIT_DIFF_TIMEOUT }).catch(
          () => "",
        ),
      ]);
      return { oldContent, newContent };
    }

    // Unstaged diff: old = index version, new = working tree
    const repoPath = getRepoPath(location);
    const [oldContent, newContent] = await Promise.all([
      execGit(location, ["show", `:${filePath}`], { timeout: GIT_DIFF_TIMEOUT }).catch(() => ""),
      readFile(join(repoPath, filePath), "utf-8").catch(() => ""),
    ]);
    return { oldContent, newContent };
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

  async getLogRange(
    location: ProjectLocation,
    base: string,
    head: string,
  ): Promise<string> {
    return execGit(location, ["log", "--oneline", `${base}..${head}`], {
      timeout: GIT_DIFF_TIMEOUT,
    });
  }

  async getDiffRange(
    location: ProjectLocation,
    base: string,
    head: string,
  ): Promise<string> {
    return execGit(location, ["diff", `${base}...${head}`], { timeout: GIT_DIFF_TIMEOUT });
  }

  // ── Branch & Worktree ───────────────────────────────────

  async listBranches(
    location: ProjectLocation,
    includeRemote: boolean,
  ): Promise<GitBranchListResult> {
    const args = [
      "branch",
      "--format=%(refname)\t%(objectname:short)\t%(HEAD)",
      "--sort=-HEAD",
    ];
    if (includeRemote) args.push("-a");
    const output = await execGit(location, args);

    let current = "";
    const branches: GitBranchInfo[] = [];

    for (const line of output.trim().split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      const ref = parts[0]!;
      const commit = parts[1] ?? "";
      const isCurrent = parts[2] === "*";

      // Skip symbolic refs like refs/remotes/origin/HEAD
      if (ref.endsWith("/HEAD")) continue;

      const isRemoteBranch = ref.startsWith("refs/remotes/");
      // Strip refs/heads/ for local, refs/remotes/<remote>/ for remote
      let remoteName: string | undefined;
      const name = isRemoteBranch
        ? (() => {
            const match = ref.match(/^refs\/remotes\/([^/]+)\/(.*)/);
            remoteName = match?.[1];
            return match?.[2] ?? ref;
          })()
        : ref.replace(/^refs\/heads\//, "");

      if (isCurrent) current = name;
      branches.push({
        name,
        current: isCurrent,
        commit,
        isRemote: isRemoteBranch,
        ...(remoteName ? { remote: remoteName } : {}),
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
        else if (line.startsWith("branch ")) {
          const fullRef = line.slice(7);
          branch = fullRef.startsWith("refs/heads/") ? fullRef.slice(11) : fullRef;
        }
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
      throw new Error(msg("git.worktree.noBranch"));
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

  async removeWorktree(
    location: ProjectLocation,
    path: string,
    force: boolean,
    deleteBranch?: boolean,
  ): Promise<void> {
    const targetPath = normalizeWorktreePath(location, path);
    let branchToDelete: string | undefined;

    if (deleteBranch) {
      try {
        // Run prune first to ensure worktree list is fresh
        await execGit(location, ["worktree", "prune"]).catch(() => {});

        const { worktrees } = await this.listWorktrees(location);
        const wt = worktrees.find((w) => normalizeWorktreePath(location, w.path) === targetPath);

        branchToDelete = wt?.branch;
        if (branchToDelete === "detached") branchToDelete = undefined;

        console.log(
          `[supervisor] removeWorktree target=${targetPath} identifiedBranch=${branchToDelete || "(none)"}`,
        );
      } catch (err) {
        console.error("[supervisor] failed to identify branch for worktree removal:", err);
      }
    }

    const args = ["worktree", "remove", ...(force ? ["--force"] : []), path];

    try {
      await execGit(location, args);
      // If success, clean up the branch
      if (branchToDelete) {
        console.log(`[supervisor] worktree removed, now deleting branch ${branchToDelete}`);
        await this.deleteBranch(location, branchToDelete, force).catch((err) => {
          console.warn(`[supervisor] best-effort branch delete failed for ${branchToDelete}:`, err);
        });
      }
    } catch (error) {
      console.log(`[supervisor] git worktree remove failed for ${path}, checking if unregistered: ${error}`);
      
      if (await this.shouldRetryResidualWorktreeCleanup(location, path, error)) {
        // Worktree is unregistered from Git, so we can clean up the branch now
        if (branchToDelete) {
          console.log(`[supervisor] worktree unregistered despite error, deleting branch ${branchToDelete}`);
          await this.deleteBranch(location, branchToDelete, force).catch((err) => {
            console.warn(`[supervisor] best-effort branch delete failed for ${branchToDelete}:`, err);
          });
        }

        // Now try best-effort manual directory removal
        console.log(`[supervisor] performing residual directory cleanup for ${path}`);
        await this.removeResidualWorktreeDirectory(location, path, error).catch((cleanupErr) => {
          console.warn(`[supervisor] residual directory cleanup failed for ${path}:`, cleanupErr);
          // Don't throw here if we already managed to unregister the worktree and delete the branch
        });
      } else {
        throw error;
      }
    }
  }

  async deleteRemoteBranch(location: ProjectLocation, remote: string, branch: string): Promise<void> {
    await execGit(location, ["push", remote, "--delete", branch], { timeout: GIT_NETWORK_TIMEOUT });
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

  async switchBranch(
    location: ProjectLocation,
    branch: string,
    createNew: boolean,
  ): Promise<{ branch: string; created: boolean; tracking: string; ahead: number; behind: number; branches: GitBranchListResult }> {
    const args = ["switch"];
    if (createNew) {
      args.push("-c", branch);
    } else {
      args.push(branch);
    }
    await execGit(location, args);

    // Quick status + branch list in parallel — avoids the expensive
    // diff/numstat/untracked-file expansion that full getStatus does.
    const [statusOutput, branchList] = await Promise.all([
      execGit(location, ["status", "--porcelain=v2", "-b"], { timeout: GIT_STATUS_TIMEOUT }),
      this.listBranches(location, true),
    ]);
    const parsed = parseStatusPorcelainV2(statusOutput);
    return {
      branch,
      created: createNew,
      tracking: parsed.tracking,
      ahead: parsed.ahead,
      behind: parsed.behind,
      branches: branchList,
    };
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
      const detail = errorDetail(mergeErr);
      if (detail.includes("CONFLICT") || detail.includes("Merge conflict")) {
        const conflictFiles: string[] = [];
        const conflictMatches = detail.matchAll(/CONFLICT.*?:\s*(?:Merge conflict in\s+)?(.+)/g);
        for (const m of conflictMatches) {
          if (m[1]) conflictFiles.push(m[1].trim());
        }
        return {
          merged: false,
          fastForward: false,
          conflicting: true,
          error: msg("git.merge.conflicts"),
          conflictFiles,
        };
      }
      return {
        merged: false,
        fastForward: false,
        error: detail,
      };
    }

    return { merged: true, fastForward: false };
  }

  // ── Conflict resolution helpers ──────────────────────

  async abortMerge(worktreeLocation: ProjectLocation): Promise<void> {
    await execGit(worktreeLocation, ["merge", "--abort"]);
  }

  async finishMerge(
    worktreeLocation: ProjectLocation,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await execGit(worktreeLocation, ["commit", "--no-edit"]);
      return { success: true };
    } catch (err: unknown) {
      return {
        success: false,
        error: errorDetail(err),
      };
    }
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
        error: errorDetail(err),
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
      throw new Error(
        msg("git.worktree.cleanupFailed", {
          original: errorDetail(originalError),
          cleanup: errorDetail(cleanupError),
        }),
        { cause: cleanupError },
      );
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
      const message = error instanceof Error ? error.message : String(error);
      if (!this.shouldRetryBranchDeleteAfterPrune(error)) {
        console.log(`[supervisor] git branch delete failed (no retry): ${message}`);
        throw error;
      }

      console.log(`[supervisor] git branch delete failed, pruning worktrees and retrying: ${message}`);
      await execGit(location, ["worktree", "prune"]).catch(() => {});
      try {
        await execGit(location, args);
      } catch (retryError) {
        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
        console.log(`[supervisor] git branch delete retry failed: ${retryMessage}`);
        throw retryError;
      }
    }
  }

  private shouldRetryBranchDeleteAfterPrune(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /used by worktree|checked out at|is already checked out|worktree/i.test(message);
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
      msg("git.worktree.dirtySource", { branch: sourceBranch, path: getRepoPath(location) }),
    );
  }

  private async mergeBranchIntoSourceLocation(
    location: ProjectLocation,
    worktreeBranch: string,
  ): Promise<GitMergeToSourceResult> {
    try {
      await execGit(location, ["merge", worktreeBranch, "--no-edit", "--no-ff"]);
    } catch (mergeErr: unknown) {
      const detail = errorDetail(mergeErr);
      if (detail.includes("CONFLICT") || detail.includes("Merge conflict")) {
        const conflictFiles: string[] = [];
        const conflictMatches = detail.matchAll(/CONFLICT.*?:\s*(?:Merge conflict in\s+)?(.+)/g);
        for (const m of conflictMatches) {
          if (m[1]) conflictFiles.push(m[1].trim());
        }
        await execGit(location, ["merge", "--abort"]).catch(() => undefined);
        return {
          merged: false,
          fastForward: false,
          newSourceCommit: "",
          error: msg("git.merge.conflicts"),
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
    // 1) Try worktree-based inference: use the main worktree's branch as the source.
    try {
      const { worktrees } = await this.listWorktrees(location);
      const mainWorktreeBranch = worktrees.find((worktree) => worktree.isMain)?.branch || null;
      if (mainWorktreeBranch && mainWorktreeBranch !== branch) {
        // Only recover a legacy source branch when the main branch shares history with the worktree.
        await execGit(location, ["merge-base", mainWorktreeBranch, branch]);
        await this.writeWorktreeSourceBranch(location, branch, mainWorktreeBranch);
        return mainWorktreeBranch;
      }
    } catch {
      // worktree approach failed
    }

    // 2) Check the reflog for the branch creation entry to find the actual parent branch.
    //    `git checkout -b feature stage` records "branch: Created from refs/heads/stage".
    try {
      const reflog = await execGit(location, ["reflog", "show", branch, "--format=%gs"]);
      const creationLine = reflog
        .split("\n")
        .find((line) => line.startsWith("branch: Created from"));
      if (creationLine) {
        const source = creationLine
          .replace("branch: Created from refs/heads/", "")
          .replace("branch: Created from ", "")
          .trim();
        // Only use if it names a real branch (not "HEAD" or a raw commit hash)
        if (source && source !== "HEAD" && source !== branch && !/^[0-9a-f]+$/i.test(source)) {
          await execGit(location, ["rev-parse", "--verify", `refs/heads/${source}`]);
          return source;
        }
      }
    } catch {
      // reflog not available or branch no longer exists
    }

    // 3) Fall back to the remote's default branch (refs/remotes/origin/HEAD).
    try {
      const ref = await execGit(location, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
      const defaultBranch = ref.trim().replace(/^refs\/remotes\/origin\//, "");
      if (defaultBranch && defaultBranch !== branch) {
        await execGit(location, ["merge-base", defaultBranch, branch]);
        return defaultBranch;
      }
    } catch {
      // remote HEAD not configured
    }

    return null;
  }

  private async getCurrentBranch(location: ProjectLocation): Promise<string | null> {
    try {
      const result = await execGit(location, ["branch", "--show-current"]);
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  async writeWorktreeSourceBranch(
    location: ProjectLocation,
    branch: string,
    sourceBranch: string,
  ): Promise<void> {
    await execGit(location, ["config", `branch.${branch}.lightcodeSource`, sourceBranch]).catch(
      () => undefined,
    );
  }

  async pruneWorktrees(
    location: ProjectLocation,
    activeWorktreePaths: string[],
  ): Promise<void> {
    // 1. Git's internal prune for broken/missing worktrees
    await execGit(location, ["worktree", "prune"]);

    // 2. Identify worktrees to remove (those in our managed directory but not active in DB)
    const { worktrees } = await this.listWorktrees(location);
    const managedBase = resolveLightcodePaths(join(homedir(), ".lightcode")).worktreesDir;
    const normalizedManagedBase = normalize(managedBase).toLowerCase();

    for (const wt of worktrees) {
      if (wt.isMain) continue;

      const normalizedWtPath = normalize(wt.path);
      const isManaged = normalizedWtPath.toLowerCase().startsWith(normalizedManagedBase);
      const isActive = activeWorktreePaths.some(
        (p) => normalize(p).toLowerCase() === normalizedWtPath.toLowerCase(),
      );

      if (isManaged && !isActive) {
        await this.removeWorktree(location, wt.path, true).catch(() => {});
      }
    }
  }
}
