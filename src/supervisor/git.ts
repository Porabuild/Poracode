import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { simpleGit, type SimpleGit, type FileStatusResult } from "simple-git";
import type {
  ProjectLocation,
  GitStatusResult,
  GitDiffResult,
  GitDiffBatchResult,
  GitFileChange,
  GitBranchInfo,
  GitBranchListResult,
  GitWorktreeInfo,
  GitWorktreeListResult,
} from "../shared/contracts";

function getRepoPath(location: ProjectLocation): string {
  if (location.kind === "wsl") return location.uncPath;
  return location.path;
}

/** Convert backslash UNC path to forward-slash so Node/simple-git can resolve it. */
function toForwardSlashUnc(uncPath: string): string {
  return uncPath.replace(/\\/g, "/");
}

function createGit(location: ProjectLocation): SimpleGit {
  if (location.kind === "wsl") {
    return simpleGit({
      baseDir: toForwardSlashUnc(location.uncPath),
      binary: ["wsl", "git"],
    });
  }
  return simpleGit(getRepoPath(location));
}

function mapFileStatus(file: FileStatusResult, staged: boolean): GitFileChange {
  const status = staged ? file.index : file.working_dir;
  return {
    path: file.path,
    ...(file.from ? { oldPath: file.from } : {}),
    status: status || "?",
    staged,
    insertions: 0,
    deletions: 0,
  };
}

const EMPTY_STATUS: GitStatusResult = {
  isRepo: false,
  branch: "",
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

    const status = await git.status();

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
          const match = staged.find(
            (f) => f.path === diffFile.file || f.path === diffFile.file.replace(/\\/g, "/"),
          );
          if (match) {
            match.insertions = diffFile.insertions;
            match.deletions = diffFile.deletions;
          }
        }
      }

      if (unstagedSummary) {
        for (const diffFile of unstagedSummary.files) {
          if (!("insertions" in diffFile)) continue;
          const match = unstaged.find(
            (f) => f.path === diffFile.file || f.path === diffFile.file.replace(/\\/g, "/"),
          );
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

    return {
      isRepo: true,
      branch: status.current ?? "",
      staged,
      unstaged,
      totalInsertions,
      totalDeletions,
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
      const filePath = matched.replace(/\\/g, "/");
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
    for (const block of raw.split(/\n\n+/).filter(Boolean)) {
      const lines = block.trim().split("\n");
      let path = "";
      let commit = "";
      let branch = "";

      for (const line of lines) {
        if (line.startsWith("worktree ")) path = line.slice(9);
        else if (line.startsWith("HEAD ")) commit = line.slice(5);
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
    path: string,
    branch?: string,
    createBranch?: boolean,
    startPoint?: string,
  ): Promise<void> {
    const git = createGit(location);
    const args = ["worktree", "add"];
    if (createBranch && branch) {
      args.push("-b", branch, path, ...(startPoint ? [startPoint] : []));
    } else {
      args.push(path, ...(branch ? [branch] : []));
    }
    await git.raw(args);
  }

  async removeWorktree(location: ProjectLocation, path: string, force: boolean): Promise<void> {
    const git = createGit(location);
    const args = ["worktree", "remove", ...(force ? ["--force"] : []), path];
    await git.raw(args);
  }
}
