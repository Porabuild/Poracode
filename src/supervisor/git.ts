import type {
  GitAddWorktreeResult,
  GitBranchListResult,
  GitDiffBatchResult,
  GitDiffResult,
  GitFileContentResult,
  GitFinishMergeResult,
  GitGetWorktreeSourceBranchResult,
  GitMergeToSourceResult,
  GitPullFromSourceResult,
  GitStatusResult,
  GitSwitchBranchResult,
  GitWorktreeListResult,
  ProjectLocation,
} from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import { parallelWslCommandsAsync, quotePosixShellArg as quote } from "./agents/base";
import {
  computeDefaultWorktreePath,
  execGit,
  execGitBatchWslBridge,
  GIT_HOOK_TIMEOUT,
  getLocationIdentity,
  ghVersionWslBridge,
  parseRemoteUrl,
  setWslGitBridgeClient,
} from "./git/exec";
import { GitMergeService } from "./git/mergeService";
import {
  GitStatusService,
  buildGitStatusResultFromOutputs,
  parseStatusPorcelainV2,
} from "./git/statusService";
import {
  GitWorktreeService,
  buildBranchListArgs,
  parseBranchListOutput,
  parseWorktreeListOutput,
} from "./git/worktreeService";
import type { WslBridgeClient } from "./wsl/bridge/client";

export {
  computeDefaultWorktreePath,
  execGit,
  getLocationIdentity,
  parseRemoteUrl,
  parseStatusPorcelainV2,
};

export class GitService {
  private readonly statusService = new GitStatusService();
  private readonly worktreeService = new GitWorktreeService();
  private readonly mergeService = new GitMergeService(this.worktreeService);

  setWslClient(client: WslBridgeClient | undefined): void {
    setWslGitBridgeClient(client);
  }

  async getStatus(location: ProjectLocation): Promise<GitStatusResult> {
    return this.statusService.getStatus(location);
  }

  /**
   * WSL fast path for project refresh: run the Git snapshot through the
   * long-lived in-distro bridge when available, falling back to the older
   * single `wsl.exe` batch if the bridge is unavailable.
   */
  async batchedWslProjectSnapshot(
    location: ProjectLocation & { kind: "wsl" },
    includeGhCheck: boolean,
  ): Promise<{
    status: GitStatusResult | null;
    branches: GitBranchListResult | null;
    worktrees: GitWorktreeListResult["worktrees"] | null;
    ghAvailable: boolean | null;
  }> {
    const cwd = location.linuxPath;
    const branchListArgs = buildBranchListArgs(true);
    const gitCommands = [
      { cwd, args: ["rev-parse", "--is-inside-work-tree"] },
      { cwd, args: ["status", "--porcelain=v2", "-b"] },
      { cwd, args: ["remote", "-v"] },
      { cwd, args: ["diff", "--cached", "--numstat"] },
      { cwd, args: ["diff", "--numstat"] },
      { cwd, args: branchListArgs },
      { cwd, args: ["worktree", "list", "--porcelain"] },
    ];
    const fallbackCommands = [
      { cwd, cmd: "git rev-parse --is-inside-work-tree" },
      { cwd, cmd: "git status --porcelain=v2 -b" },
      { cwd, cmd: "git remote -v" },
      { cwd, cmd: "git diff --cached --numstat" },
      { cwd, cmd: "git diff --numstat" },
      { cwd, cmd: `git ${branchListArgs.map((a) => quote(a)).join(" ")}` },
      { cwd, cmd: "git worktree list --porcelain" },
      ...(includeGhCheck ? [{ cwd, cmd: "gh --version" }] : []),
    ];
    const bridgeResults = await execGitBatchWslBridge(location, gitCommands, 30_000);
    const usedBridge = bridgeResults !== undefined;
    const results =
      bridgeResults ??
      (await parallelWslCommandsAsync(location.distro, fallbackCommands, { timeoutMs: 30_000 }));

    const isRepo = results[0]!.ok;
    const baseStatus = buildGitStatusResultFromOutputs({
      isRepo,
      statusOutput: results[1]!.stdout,
      remoteOutput: results[2]!.stdout,
      stagedNumstat: results[3]!.stdout,
      unstagedNumstat: results[4]!.stdout,
    });
    const status = isRepo
      ? await this.statusService.applyMergeState(
          location,
          results[1]!.stdout,
          await this.statusService.enrichStatus(location, baseStatus),
        )
      : baseStatus;

    const branches = results[5]!.ok ? parseBranchListOutput(results[5]!.stdout) : null;
    const worktrees = results[6]!.ok
      ? parseWorktreeListOutput(results[6]!.stdout, location.kind).worktrees
      : null;
    let ghAvailable: boolean | null = null;
    if (includeGhCheck) {
      if (usedBridge) {
        ghAvailable =
          (await ghVersionWslBridge(location, 10_000)) ??
          (
            await parallelWslCommandsAsync(location.distro, [{ cwd, cmd: "gh --version" }], {
              timeoutMs: 10_000,
            })
          )[0]?.ok === true;
      } else {
        ghAvailable = results[7]?.ok === true;
      }
    }

    return { status, branches, worktrees, ghAvailable };
  }

  /**
   * Fetch `git status` for many worktree paths at once. WSL routes through
   * the in-distro bridge when available and falls back to one parallel
   * `wsl.exe` batch. Worktrees whose status fetch fails are silently dropped
   * from the result.
   */
  async getWorktreeStatusBatch(
    location: ProjectLocation,
    worktreePaths: string[],
  ): Promise<Record<string, GitStatusResult>> {
    if (worktreePaths.length === 0) return {};

    if (location.kind === "wsl") {
      return this.statusService.getWorktreeStatusBatchWsl(location, worktreePaths);
    }

    const entries = await Promise.all(
      worktreePaths.map(async (path) => {
        try {
          const wtLocation = buildWorktreeLocation(location, path);
          const status = await this.statusService.getStatus(wtLocation);
          return [path, status] as const;
        } catch {
          return undefined;
        }
      }),
    );
    return Object.fromEntries(entries.filter((e) => e !== undefined));
  }

  async getDiff(
    location: ProjectLocation,
    filePath?: string,
    staged?: boolean,
  ): Promise<GitDiffResult> {
    return this.statusService.getDiff(location, filePath, staged);
  }

  async stage(location: ProjectLocation, filePath: string): Promise<void> {
    await execGit(location, ["add", "--", filePath]);
  }

  async unstage(location: ProjectLocation, filePath: string): Promise<void> {
    await execGit(location, ["reset", "HEAD", "--", filePath]);
  }

  async revert(location: ProjectLocation, filePath: string): Promise<void> {
    const statusOutput = await execGit(location, ["status", "--porcelain=v2", "--", filePath]);
    const parsed = parseStatusPorcelainV2(statusOutput);
    const unstagedEntry = parsed.unstaged.find(
      (entry) => entry.path === filePath.replace(/\\/g, "/"),
    );
    if (unstagedEntry?.status === "?") {
      await execGit(location, ["clean", "-f", "--", filePath]);
      return;
    }
    if (unstagedEntry?.status === "R" && unstagedEntry.oldPath) {
      await execGit(location, ["clean", "-f", "--", filePath]);
      await execGit(location, ["checkout", "--", unstagedEntry.oldPath]);
      return;
    }
    await execGit(location, ["checkout", "--", filePath]);
  }

  async getDiffBatch(
    location: ProjectLocation,
    untrackedPaths: string[],
  ): Promise<GitDiffBatchResult> {
    return this.statusService.getDiffBatch(location, untrackedPaths);
  }

  async getFileContent(
    location: ProjectLocation,
    filePath: string,
    staged: boolean,
  ): Promise<GitFileContentResult> {
    return this.statusService.getFileContent(location, filePath, staged);
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
    if (addAll) {
      await execGit(location, ["add", "."]);
    }
    const output = await execGit(location, ["commit", "-m", message], {
      timeout: GIT_HOOK_TIMEOUT,
    });
    const hashMatch = output.match(/\[.+?\s+([a-f0-9]+)\]/);
    return { hash: hashMatch?.[1] ?? "" };
  }

  async getStagedDiff(location: ProjectLocation): Promise<string> {
    return execGit(location, ["diff", "--cached"]);
  }

  async getAllDiff(location: ProjectLocation): Promise<string> {
    return execGit(location, ["diff"]);
  }

  async getLogRange(location: ProjectLocation, base: string, head: string): Promise<string> {
    return execGit(location, ["log", "--oneline", `${base}..${head}`]);
  }

  async getDiffRange(location: ProjectLocation, base: string, head: string): Promise<string> {
    return execGit(location, ["diff", `${base}...${head}`]);
  }

  async listBranches(
    location: ProjectLocation,
    includeRemote: boolean,
  ): Promise<GitBranchListResult> {
    return this.worktreeService.listBranches(location, includeRemote);
  }

  async fetch(location: ProjectLocation, remote: string, prune: boolean): Promise<void> {
    return this.worktreeService.fetch(location, remote, prune);
  }

  async pull(location: ProjectLocation, remote: string): Promise<void> {
    return this.worktreeService.pull(location, remote);
  }

  async pullRebase(location: ProjectLocation, remote: string): Promise<void> {
    return this.worktreeService.pullRebase(location, remote);
  }

  async push(
    location: ProjectLocation,
    remote: string,
    branch?: string,
    setUpstream?: boolean,
  ): Promise<void> {
    return this.worktreeService.push(location, remote, branch, setUpstream);
  }

  async listWorktrees(location: ProjectLocation): Promise<GitWorktreeListResult> {
    return this.worktreeService.listWorktrees(location);
  }

  async addWorktree(
    location: ProjectLocation,
    path: string | undefined,
    branch?: string,
    createBranch?: boolean,
    startPoint?: string,
  ): Promise<GitAddWorktreeResult> {
    return this.worktreeService.addWorktree(location, path, branch, createBranch, startPoint);
  }

  async removeWorktree(
    location: ProjectLocation,
    path: string,
    force: boolean,
    deleteBranch?: boolean,
  ): Promise<void> {
    return this.worktreeService.removeWorktree(location, path, force, deleteBranch);
  }

  async deleteRemoteBranch(
    location: ProjectLocation,
    remote: string,
    branch: string,
  ): Promise<void> {
    return this.worktreeService.deleteRemoteBranch(location, remote, branch);
  }

  async deleteBranch(location: ProjectLocation, branch: string, force: boolean): Promise<void> {
    return this.worktreeService.deleteBranch(location, branch, force);
  }

  async switchBranch(
    location: ProjectLocation,
    branch: string,
    createNew: boolean,
  ): Promise<GitSwitchBranchResult> {
    return this.worktreeService.switchBranch(location, branch, createNew);
  }

  async getWorktreeSourceBranch(
    location: ProjectLocation,
    branch: string,
    sourceBranchOverride?: string,
  ): Promise<GitGetWorktreeSourceBranchResult> {
    return this.worktreeService.getWorktreeSourceBranch(location, branch, sourceBranchOverride);
  }

  async mergeToSource(
    repoLocation: ProjectLocation,
    worktreeLocation: ProjectLocation,
    worktreeBranch: string,
    sourceBranch: string,
  ): Promise<GitMergeToSourceResult> {
    return this.mergeService.mergeToSource(
      repoLocation,
      worktreeLocation,
      worktreeBranch,
      sourceBranch,
    );
  }

  async pullFromSource(
    worktreeLocation: ProjectLocation,
    sourceBranch: string,
    preserveLocalChanges = false,
  ): Promise<GitPullFromSourceResult> {
    return this.mergeService.pullFromSource(worktreeLocation, sourceBranch, preserveLocalChanges);
  }

  async abortMerge(worktreeLocation: ProjectLocation): Promise<void> {
    return this.mergeService.abortMerge(worktreeLocation);
  }

  async finishMerge(worktreeLocation: ProjectLocation): Promise<GitFinishMergeResult> {
    return this.mergeService.finishMerge(worktreeLocation);
  }

  async pruneWorktrees(location: ProjectLocation, activeWorktreePaths: string[]): Promise<void> {
    return this.worktreeService.pruneWorktrees(location, activeWorktreePaths);
  }
}
