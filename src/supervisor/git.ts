import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize, posix } from "node:path";
import { simpleGit, type SimpleGit, type FileStatusResult } from "simple-git";
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
import { readWslCommandOutputAsync } from "./agents/base";
import { resolveLightcodePaths } from "../shared/lightcodePaths";
import { sanitizeWorktreeBranchName, sanitizeWorktreePathSegment } from "../shared/worktree";
import { getProjectName } from "../shared/wsl";

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

export function createGit(location: ProjectLocation): SimpleGit {
  if (location.kind === "wsl") {
    return simpleGit({
      baseDir: toForwardSlash(location.uncPath),
      binary: ["wsl", "git"],
    });
  }
  return simpleGit(getRepoPath(location));
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

function mapFileStatus(file: FileStatusResult, staged: boolean): GitFileChange {
  const status = staged ? file.index : file.working_dir;
  return {
    path: toForwardSlash(file.path),
    ...(file.from ? { oldPath: toForwardSlash(file.from) } : {}),
    status: status || "?",
    staged,
    insertions: 0,
    deletions: 0,
  };
}

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

export class GitService {
  async getStatus(location: ProjectLocation): Promise<GitStatusResult> {
    const git = createGit(location);

    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return EMPTY_STATUS;
    } catch {
      return EMPTY_STATUS;
    }

    const [status, remotes] = await Promise.all([git.status(), git.getRemotes(true)]);
    const hasRemote = remotes.length > 0;

    // Parse remote URL for platform detection
    const origin = remotes.find((r) => r.name === "origin") ?? remotes[0];
    const remoteInfo = origin?.refs?.fetch ? parseRemoteUrl(origin.refs.fetch) : null;

    const staged: GitFileChange[] = status.files
      .filter((f) => f.index && f.index !== " " && f.index !== "?")
      .map((f) => mapFileStatus(f, true));

    const unstaged: GitFileChange[] = status.files
      .filter((f) => f.working_dir && f.working_dir !== " ")
      .map((f) => mapFileStatus(f, false));

    // Get per-file line stats
    try {
      const [stagedSummary, unstagedSummary] = await Promise.all([
        staged.length > 0 ? git.diffSummary(["--cached"]) : null,
        unstaged.length > 0 ? git.diffSummary() : null,
      ]);

      if (stagedSummary) {
        for (const diffFile of stagedSummary.files) {
          if (!("insertions" in diffFile)) continue;
          const diffPath = toForwardSlash(diffFile.file);
          const match = staged.find((f) => f.path === diffPath);
          if (match) {
            match.insertions = diffFile.insertions;
            match.deletions = diffFile.deletions;
          }
        }
      }

      if (unstagedSummary) {
        for (const diffFile of unstagedSummary.files) {
          if (!("insertions" in diffFile)) continue;
          const diffPath = toForwardSlash(diffFile.file);
          const match = unstaged.find((f) => f.path === diffPath);
          if (match) {
            match.insertions = diffFile.insertions;
            match.deletions = diffFile.deletions;
          }
        }
      }
    } catch {
      // Line stats are best-effort
    }

    // Count lines for untracked files (not covered by diffSummary)
    const repoPath = getRepoPath(location);
    const untrackedFiles = unstaged.filter((f) => f.status === "?" && f.insertions === 0);
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
      staged.reduce((sum, f) => sum + f.insertions, 0) +
      unstaged.reduce((sum, f) => sum + f.insertions, 0);
    const totalDeletions =
      staged.reduce((sum, f) => sum + f.deletions, 0) +
      unstaged.reduce((sum, f) => sum + f.deletions, 0);

    // Detect merge-in-progress (MERGE_HEAD exists)
    let mergeInProgress = false;
    try {
      await git.raw(["rev-parse", "--verify", "MERGE_HEAD"]);
      mergeInProgress = true;
    } catch {
      // No MERGE_HEAD — not in a merge
    }

    return {
      isRepo: true,
      branch: status.current ?? "",
      tracking: status.tracking ?? "",
      hasRemote,
      remoteInfo,
      ahead: status.ahead,
      behind: status.behind,
      staged,
      unstaged,
      totalInsertions,
      totalDeletions,
      ...(mergeInProgress
        ? { mergeInProgress, conflictFiles: (status.conflicted ?? []).map(toForwardSlash) }
        : {}),
    };
  }

  async getDiff(
    location: ProjectLocation,
    filePath?: string,
    staged?: boolean,
  ): Promise<GitDiffResult> {
    const git = createGit(location);
    const args: string[] = [];

    if (staged) args.push("--cached");
    if (filePath) args.push("--", filePath);

    let diff = await git.diff(args);

    // For untracked or newly added files, git diff returns empty.
    // Use --no-index to show full file content as additions.
    if (!diff.trim() && filePath) {
      try {
        diff = await git.diff(["--no-index", "--", "/dev/null", filePath]);
      } catch {
        // --no-index exits with code 1 when files differ, which simple-git
        // treats as an error. Catch and extract the diff from the error.
      }

      if (!diff.trim()) {
        // Fallback: raw command that captures stdout even on exit code 1
        try {
          diff = await git.raw(["diff", "--no-index", "--", "/dev/null", filePath]);
        } catch (err: unknown) {
          // simple-git wraps the output in the error for non-zero exits
          if (err && typeof err === "object" && "stdout" in err) {
            diff = String((err as { stdout: unknown }).stdout);
          }
        }
      }
    }

    return { diff };
  }

  async stage(location: ProjectLocation, filePath: string): Promise<void> {
    const git = createGit(location);
    await git.add(filePath);
  }

  async unstage(location: ProjectLocation, filePath: string): Promise<void> {
    const git = createGit(location);
    await git.raw(["reset", "HEAD", "--", filePath]);
  }

  async revert(location: ProjectLocation, filePath: string): Promise<void> {
    const git = createGit(location);
    const status = await git.status();
    const entry = status.files.find(
      (file) =>
        file.path === filePath || file.path.replace(/\\/g, "/") === filePath.replace(/\\/g, "/"),
    );

    if (entry?.working_dir === "?") {
      await git.clean("f", ["--", filePath]);
      return;
    }

    if (entry?.working_dir === "R" && entry.from) {
      await git.clean("f", ["--", filePath]);
      await git.checkout(["--", entry.from]);
      return;
    }

    await git.checkout(["--", filePath]);
  }

  /**
   * Split combined `git diff` output into per-file chunks keyed by file path.
   */
  private splitCombinedDiff(raw: string): Record<string, string> {
    if (!raw.trim()) return {};

    const result: Record<string, string> = {};
    // Split on "diff --git " at the start of a line
    const chunks = raw.split(/(?=^diff --git )/m);

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      // Extract file path from "diff --git a/... b/..."
      // Handles both quoted and unquoted paths
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
    const git = createGit(location);

    // Fetch all staged and unstaged diffs in 2 calls instead of N
    const [stagedRaw, unstagedRaw] = await Promise.all([
      git.diff(["--cached"]).catch(() => ""),
      git.diff().catch(() => ""),
    ]);

    const staged = this.splitCombinedDiff(stagedRaw);
    const unstaged = this.splitCombinedDiff(unstagedRaw);

    // Untracked files don't appear in git diff — fetch in parallel
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
    const git = createGit(location);
    await git.add(".");
  }

  async unstageAll(location: ProjectLocation): Promise<void> {
    const git = createGit(location);
    await git.reset(["HEAD"]);
  }

  async revertAll(location: ProjectLocation): Promise<void> {
    const git = createGit(location);
    await git.checkout(["--", "."]);
    await git.clean("f", ["-d"]);
  }

  async commit(
    location: ProjectLocation,
    message: string,
    addAll: boolean,
  ): Promise<{ hash: string }> {
    const git = createGit(location);
    if (addAll) await git.add(".");
    const result = await git.commit(message);
    return { hash: result.commit };
  }

  async getStagedDiff(location: ProjectLocation): Promise<string> {
    const git = createGit(location);
    return git.diff(["--cached"]);
  }

  async getAllDiff(location: ProjectLocation): Promise<string> {
    const git = createGit(location);
    return git.diff();
  }

  // ── Branch & Worktree ───────────────────────────────────

  async listBranches(
    location: ProjectLocation,
    includeRemote: boolean,
  ): Promise<GitBranchListResult> {
    const git = createGit(location);
    const summary = await git.branch(includeRemote ? ["-a"] : []);

    const branches: GitBranchInfo[] = Object.values(summary.branches).map((b) => {
      const isRemote = b.name.startsWith("remotes/");
      const displayName = isRemote ? b.name.replace(/^remotes\/[^/]+\//, "") : b.name;
      return {
        name: displayName,
        current: b.current,
        commit: b.commit,
        isRemote,
      };
    });

    return { current: summary.current, branches };
  }

  async fetch(location: ProjectLocation, remote: string, prune: boolean): Promise<void> {
    const git = createGit(location);
    await git.fetch(remote, ...(prune ? [["--prune"]] : []));
  }

  async pull(location: ProjectLocation, remote: string): Promise<void> {
    const git = createGit(location);
    await git.pull(remote);
  }

  async push(
    location: ProjectLocation,
    remote: string,
    branch?: string,
    setUpstream?: boolean,
  ): Promise<void> {
    const git = createGit(location);
    const args: string[] = [];
    if (setUpstream) args.push("--set-upstream");
    await git.push(remote, branch, args);
  }

  async listWorktrees(location: ProjectLocation): Promise<GitWorktreeListResult> {
    const git = createGit(location);
    const raw = await git.raw(["worktree", "list", "--porcelain"]);
    const worktrees: GitWorktreeInfo[] = [];

    // Porcelain output: blocks separated by blank lines.
    // Each block has lines like:
    //   worktree /path/to/dir
    //   HEAD abc123
    //   branch refs/heads/main
    // The first entry is always the main working tree.
    for (const block of raw.split(/\r?\n\r?\n+/).filter(Boolean)) {
      const lines = block.trim().split(/\r?\n/);
      let path = "";
      let commit = "";
      let branch = "";

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          // Normalize slashes so the path matches addWorktree's join()-based
          // output (backslashes on Windows). Git may output forward slashes.
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
    const git = createGit(location);
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
    await git.raw(args);

    // Store the source branch in git config so we can merge back later
    if (startPoint && branch) {
      await git
        .raw(["config", `branch.${branch}.lightcodeSource`, startPoint])
        .catch(() => undefined);
    }

    return { path: resolvedPath };
  }

  async removeWorktree(location: ProjectLocation, path: string, force: boolean): Promise<void> {
    const git = createGit(location);
    const args = ["worktree", "remove", ...(force ? ["--force"] : []), path];
    try {
      await git.raw(args);
    } catch (error) {
      if (!(await this.shouldRetryResidualWorktreeCleanup(location, path, error))) {
        throw error;
      }

      await this.removeResidualWorktreeDirectory(location, path, error);
    }
  }

  async deleteBranch(location: ProjectLocation, branch: string, force: boolean): Promise<void> {
    const git = createGit(location);
    await git.deleteLocalBranch(branch, force);
  }

  // ── Worktree source branch ──────────────────────────────

  async getWorktreeSourceBranch(
    location: ProjectLocation,
    branch: string,
  ): Promise<GitGetWorktreeSourceBranchResult> {
    const git = createGit(location);
    let sourceBranch: string | null = null;
    try {
      const result = await git.raw(["config", "--get", `branch.${branch}.lightcodeSource`]);
      sourceBranch = result.trim() || null;
    } catch {
      // no source branch configured
    }

    let commitsAhead = 0;
    if (sourceBranch) {
      try {
        const count = await git.raw(["rev-list", "--count", `${sourceBranch}..${branch}`]);
        commitsAhead = parseInt(count.trim(), 10) || 0;
      } catch {
        // branches may not share history
      }
    }
    return { sourceBranch, commitsAhead };
  }

  // ── Merge to source ─────────────────────────────────────

  /**
   * Find which worktree (if any) has `branch` checked out.
   * Returns its location, or null if the branch is not checked out anywhere.
   */
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
    const repoGit = createGit(repoLocation);

    // Check if fast-forward is possible (source is ancestor of worktree tip)
    let canFF = false;
    try {
      await repoGit.raw(["merge-base", "--is-ancestor", sourceBranch, worktreeBranch]);
      canFF = true;
    } catch {
      // Not an ancestor — fast-forward not possible
    }

    if (canFF) {
      // Find if source branch is checked out in a worktree — if so, use
      // `git merge --ff-only` there so HEAD + index + working tree all update.
      // Plain `update-ref` only moves the pointer, leaving the working tree stale.
      const sourceLocation = await this.findWorktreeForBranch(repoLocation, sourceBranch);

      if (sourceLocation) {
        const sourceGit = createGit(sourceLocation);
        await sourceGit.merge([worktreeBranch, "--ff-only"]);
        const newCommit = (await sourceGit.revparse(["HEAD"])).trim();
        return { merged: true, fastForward: true, newSourceCommit: newCommit };
      }

      // Source branch not checked out anywhere — safe to just move the ref
      const worktreeTip = (await repoGit.revparse([worktreeBranch])).trim();
      await repoGit.raw(["update-ref", `refs/heads/${sourceBranch}`, worktreeTip]);
      return { merged: true, fastForward: true, newSourceCommit: worktreeTip };
    }

    // Non-fast-forward: merge via temporary worktree
    const tempBranchDir = `_merge-temp-${Date.now()}`;
    const tempPath = await computeDefaultWorktreePath(repoLocation, tempBranchDir);

    try {
      await ensureWorktreeParentExists(repoLocation, tempPath);
      await repoGit.raw(["worktree", "add", "--detach", tempPath, sourceBranch]);

      const tempGit = createGit(
        repoLocation.kind === "wsl"
          ? { ...repoLocation, linuxPath: tempPath, uncPath: tempPath }
          : { ...repoLocation, path: tempPath },
      );

      // Checkout the source branch in the temp worktree
      await tempGit.raw(["checkout", "-B", sourceBranch]);

      try {
        await tempGit.merge([worktreeBranch, "--no-edit", "--no-ff"]);
      } catch (mergeErr: unknown) {
        const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
        if (msg.includes("CONFLICT") || msg.includes("Merge conflict")) {
          const conflictFiles: string[] = [];
          const conflictMatches = msg.matchAll(/CONFLICT.*?:\s*(?:Merge conflict in\s+)?(.+)/g);
          for (const m of conflictMatches) {
            if (m[1]) conflictFiles.push(m[1].trim());
          }
          await tempGit.merge(["--abort"]).catch(() => undefined);
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

      const newCommit = (await tempGit.revparse(["HEAD"])).trim();
      return { merged: true, fastForward: false, newSourceCommit: newCommit };
    } catch (err: unknown) {
      if ((err as GitMergeToSourceResult).merged === false) {
        return err as GitMergeToSourceResult;
      }
      return {
        merged: false,
        fastForward: false,
        newSourceCommit: "",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await repoGit.raw(["worktree", "remove", "--force", tempPath]).catch(() => undefined);
    }
  }

  // ── Pull from source into worktree ──────────────────────

  async pullFromSource(
    worktreeLocation: ProjectLocation,
    sourceBranch: string,
  ): Promise<GitPullFromSourceResult> {
    const git = createGit(worktreeLocation);

    // Check if fast-forward is possible (worktree HEAD is ancestor of sourceBranch)
    let canFF = false;
    try {
      await git.raw(["merge-base", "--is-ancestor", "HEAD", sourceBranch]);
      canFF = true;
    } catch {
      // Not an ancestor — fast-forward not possible
    }

    if (canFF) {
      try {
        await git.merge([sourceBranch, "--ff-only"]);
        return { merged: true, fastForward: true };
      } catch (err: unknown) {
        return {
          merged: false,
          fastForward: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Non-fast-forward merge — leave conflicts in working tree for resolution
    try {
      await git.merge([sourceBranch, "--no-ff", "--no-edit"]);
    } catch (mergeErr: unknown) {
      const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
      if (msg.includes("CONFLICT") || msg.includes("Merge conflict")) {
        const conflictFiles: string[] = [];
        const conflictMatches = msg.matchAll(/CONFLICT.*?:\s*(?:Merge conflict in\s+)?(.+)/g);
        for (const m of conflictMatches) {
          if (m[1]) conflictFiles.push(m[1].trim());
        }
        // Don't abort — leave conflict markers so the user can resolve via mergetool
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
    const git = createGit(worktreeLocation);
    await git.merge(["--abort"]);
  }

  async runMergetool(
    worktreeLocation: ProjectLocation,
  ): Promise<{ success: boolean; merged?: boolean; error?: string }> {
    const git = createGit(worktreeLocation);
    try {
      await git.raw(["mergetool", "--no-prompt"]);
      // Check for remaining conflicts
      const status = await git.status();
      if (status.conflicted.length > 0) {
        return { success: true, merged: false };
      }
      // All resolved — auto-finish the merge
      await git.commit([], { "--no-edit": null });
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
    return !worktrees.some((worktree) => normalizeWorktreePath(location, worktree.path) === targetPath);
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
          throw new Error(result.stderr || `Failed to remove residual worktree directory "${path}".`);
        }
        return;
      }

      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    } catch (cleanupError) {
      const originalMessage = originalError instanceof Error ? originalError.message : String(originalError);
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      throw new Error(`${originalMessage}\nResidual cleanup failed: ${cleanupMessage}`, {
        cause: cleanupError,
      });
    }
  }

}
