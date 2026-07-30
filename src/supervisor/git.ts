import { createHash } from "node:crypto";
import type {
  CaptureExperimentSnapshotPayload,
  CaptureExperimentSnapshotResult,
  CreateExperimentWorktreesPayload,
  CreateExperimentWorktreesResult,
  GitAbortMergeResult,
  GitCommitResult,
  GitAddWorktreeResult,
  GitBranchListResult,
  GitDiffBatchResult,
  GitDiffResult,
  GitFileContentResult,
  GitFinishMergeResult,
  GitGetWorktreeOwnerResult,
  GitGetWorktreeSourceBranchResult,
  GitMergeToSourceResult,
  GitPullFromSourceResult,
  GitStatusDetail,
  GitStatusResult,
  GitSwitchBranchResult,
  GitWorktreeListResult,
  GetExperimentCandidateDiffResult,
  GetExperimentCandidateStatsResult,
  ProjectLocation,
  RemoveExperimentWorktreesPayload,
  RemoveExperimentWorktreesResult,
} from "@/shared/contracts";
import { countUnifiedDiffStats } from "@/shared/lineUnifiedDiff";
import { msg } from "@/shared/messages";
import { buildWorktreeLocation } from "@/shared/worktree";
import {
  computeDefaultWorktreePath,
  execGit,
  execGitBatchWslBridge,
  GIT_CLONE_TIMEOUT,
  GIT_HOOK_TIMEOUT,
  getLocationIdentity,
  ghVersionWslBridge,
  parseRemoteUrl,
  normalizeWorktreePath,
  resolveBuiltInWorktreeRoot,
  resolveClonedProjectPath,
  setWslGitBridgeClient,
  type WorktreePathOptions,
} from "./git/exec";
import { GitMergeService } from "./git/mergeService";
import { buildGitStatusResultFromOutputs, parseStatusPorcelainV2 } from "./git/statusParsing";
import { GitExperimentService } from "./git/experimentService";
import { GitStatusService } from "./git/statusService";
import {
  GitWorktreeService,
  buildBranchListArgs,
  parseBranchListOutput,
  parseWorktreeListOutput,
} from "./git/worktreeService";
import type { WslBridgeClient } from "./wsl/bridge/client";

const GIT_WORKTREE_STATUS_CONCURRENCY = 4;
const EXPERIMENT_SNAPSHOT_CONCURRENCY = 4;

export interface CapturedExperimentSnapshot extends CaptureExperimentSnapshotResult {
  candidates: Array<CaptureExperimentSnapshotResult["candidates"][number] & { diff: string }>;
}

export {
  computeDefaultWorktreePath,
  execGit,
  getLocationIdentity,
  parseRemoteUrl,
  parseStatusPorcelainV2,
  resolveBuiltInWorktreeRoot,
  resolveClonedProjectPath,
};

export class GitService {
  private readonly statusService = new GitStatusService();
  private readonly experimentService = new GitExperimentService(this.statusService);
  private readonly worktreeService = new GitWorktreeService();
  private readonly mergeService = new GitMergeService(this.worktreeService);
  private readonly repositoryMutationTails = new Map<string, Promise<void>>();

  private async withRepositoryMutation<T>(
    location: ProjectLocation,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = getLocationIdentity(location);
    const previous = this.repositoryMutationTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    this.repositoryMutationTails.set(key, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.repositoryMutationTails.get(key) === tail) {
        this.repositoryMutationTails.delete(key);
      }
    }
  }

  setWslClient(client: WslBridgeClient | undefined): void {
    setWslGitBridgeClient(client);
    this.statusService.setWslClient(client);
  }

  async getStatus(
    location: ProjectLocation,
    detail: GitStatusDetail = "full",
  ): Promise<GitStatusResult> {
    return detail === "summary"
      ? this.statusService.getStatusSummary(location)
      : this.statusService.getStatus(location);
  }

  /**
   * WSL fast path for project refresh: run the Git snapshot through the
   * long-lived in-distro bridge.
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
    const results = await execGitBatchWslBridge(location, gitCommands, 30_000);

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
      ghAvailable = (await ghVersionWslBridge(location, 10_000)) ?? false;
    }

    return { status, branches, worktrees, ghAvailable };
  }

  /**
   * Fetch `git status` for many worktree paths at once. WSL routes through
   * the in-distro bridge. Worktrees whose status fetch fails are silently
   * dropped from the result.
   */
  async getWorktreeStatusBatch(
    location: ProjectLocation,
    worktreePaths: string[],
    detail: GitStatusDetail = "full",
  ): Promise<Record<string, GitStatusResult>> {
    if (worktreePaths.length === 0) return {};

    if (location.kind === "wsl") {
      if (detail === "summary") {
        return this.statusService.getWorktreeStatusSummaryBatchWsl(location, worktreePaths);
      }
      return this.statusService.getWorktreeStatusBatchWsl(location, worktreePaths);
    }

    const statuses: Record<string, GitStatusResult> = {};
    let nextIndex = 0;
    const runWorker = async () => {
      while (nextIndex < worktreePaths.length) {
        const path = worktreePaths[nextIndex++]!;
        try {
          const wtLocation = buildWorktreeLocation(location, path);
          statuses[path] =
            detail === "summary"
              ? await this.statusService.getStatusSummary(wtLocation)
              : await this.statusService.getStatus(wtLocation);
        } catch {
          // Worktrees whose status fetch fails are silently dropped.
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(GIT_WORKTREE_STATUS_CONCURRENCY, worktreePaths.length) },
        runWorker,
      ),
    );
    return statuses;
  }

  async getDiff(
    location: ProjectLocation,
    filePath?: string,
    staged?: boolean,
  ): Promise<GitDiffResult> {
    return this.statusService.getDiff(location, filePath, staged);
  }

  async getExperimentCandidateDiff(
    location: ProjectLocation,
    baseRef: string,
  ): Promise<GetExperimentCandidateDiffResult> {
    return this.experimentService.getCandidateDiff(location, baseRef);
  }

  async getExperimentCandidateStats(
    location: ProjectLocation,
    baseRef: string,
  ): Promise<GetExperimentCandidateStatsResult> {
    return this.experimentService.getCandidateStats(location, baseRef);
  }

  async captureExperimentSnapshot(
    payload: CaptureExperimentSnapshotPayload,
    onCandidateCaptured?: (
      candidate: CaptureExperimentSnapshotResult["candidates"][number],
    ) => void,
  ): Promise<CapturedExperimentSnapshot> {
    const { worktrees } = await this.worktreeService.listWorktrees(payload.projectLocation);
    const candidates = new Array<CapturedExperimentSnapshot["candidates"][number]>(
      payload.candidates.length,
    );
    let nextIndex = 0;
    let nextProgressIndex = 0;
    const emitCompletedCandidatesInOrder = () => {
      while (candidates[nextProgressIndex]) {
        onCandidateCaptured?.(candidates[nextProgressIndex]!);
        nextProgressIndex += 1;
      }
    };
    const captureNext = async () => {
      while (nextIndex < payload.candidates.length) {
        const index = nextIndex++;
        const candidate = payload.candidates[index]!;
        const recordedPath = candidate.worktreePath
          ? normalizeWorktreePath(payload.projectLocation, candidate.worktreePath)
          : undefined;
        const atRecordedPath = recordedPath
          ? worktrees.find(
              (worktree) =>
                normalizeWorktreePath(payload.projectLocation, worktree.path) === recordedPath,
            )
          : undefined;
        if (atRecordedPath && atRecordedPath.branch !== candidate.branch) {
          throw new Error(
            msg("experiment.merge.worktreeBranchMismatch", {
              expected: candidate.branch,
              actual: atRecordedPath.branch,
            }),
          );
        }
        const worktree =
          atRecordedPath ?? worktrees.find((entry) => entry.branch === candidate.branch);
        if (!worktree || worktree.isMain) {
          throw new Error(msg("experiment.worktree.unavailable"));
        }
        const owner = await this.worktreeService.getWorktreeOwner(
          payload.projectLocation,
          candidate.branch,
        );
        if (owner.ownerToken !== candidate.ownerToken) {
          throw new Error(
            msg("experiment.worktree.ownerMismatch", {
              expected: candidate.ownerToken,
              actual: owner.ownerToken ?? msg("experiment.worktree.noOwner"),
            }),
          );
        }
        const worktreeLocation = buildWorktreeLocation(payload.projectLocation, worktree.path);
        const status = await this.statusService.getStatusSummary(worktreeLocation);
        if (status.branch !== candidate.branch) {
          throw new Error(
            msg("experiment.merge.worktreeBranchMismatch", {
              expected: candidate.branch,
              actual: status.branch,
            }),
          );
        }
        const snapshot = await this.experimentService.getCandidateDiff(
          worktreeLocation,
          payload.baseCommit,
        );
        const result = {
          threadId: candidate.threadId,
          headCommit: snapshot.headCommit,
          ...countUnifiedDiffStats(snapshot.diff),
          ...(snapshot.omittedFiles ? { omittedFiles: snapshot.omittedFiles } : {}),
          diff: snapshot.diff,
        };
        candidates[index] = result;
        emitCompletedCandidatesInOrder();
      }
    };
    await Promise.all(
      Array.from(
        {
          length: Math.min(EXPERIMENT_SNAPSHOT_CONCURRENCY, payload.candidates.length),
        },
        captureNext,
      ),
    );
    const hash = createHash("sha256");
    for (const candidate of candidates) {
      hash.update(candidate.threadId);
      hash.update("\0");
      hash.update(candidate.diff);
      hash.update("\0");
      hash.update(String(candidate.omittedFiles ?? 0));
      hash.update("\0");
    }
    return { hash: hash.digest("hex"), candidates };
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
    reapplyStashCommit?: string,
  ): Promise<Omit<GitCommitResult, "message">> {
    if (addAll) {
      await execGit(location, ["add", "."]);
    }
    const output = await execGit(location, ["commit", "-m", message], {
      timeout: GIT_HOOK_TIMEOUT,
    });
    const hashMatch = output.match(/\[.+?\s+([a-f0-9]+)\]/);
    const hash = hashMatch?.[1] ?? "";
    if (!reapplyStashCommit) return { hash };

    const reapply = await this.mergeService.reapplyPullStash(location, reapplyStashCommit);
    if (reapply.outcome === "reapplied") return { hash, stashReapplied: true };
    if (reapply.outcome === "conflict") {
      return {
        hash,
        reapplyConflicting: true,
        stashPreserved: true,
        conflictFiles: reapply.conflictFiles,
      };
    }
    return { hash, stashPreserved: true };
  }

  async getStagedDiff(location: ProjectLocation): Promise<string> {
    return execGit(location, ["diff", "--cached"]);
  }

  async init(location: ProjectLocation): Promise<void> {
    await execGit(location, ["init"]);
  }

  /**
   * Clone `url` into a new `name` folder inside `parent`, returning the path of
   * the created folder. The clone runs with `parent` as its working directory,
   * so `parent` must already exist (the renderer picks an existing folder).
   */
  async cloneFromUrl(
    parent: ProjectLocation,
    name: string,
    url: string,
  ): Promise<{ path: string }> {
    await execGit(parent, ["clone", url, name], { timeout: GIT_CLONE_TIMEOUT });
    return { path: resolveClonedProjectPath(parent, name) };
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

  async addRemote(location: ProjectLocation, remote: string, url: string): Promise<void> {
    return this.worktreeService.addRemote(location, remote, url);
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
    copyIgnoredPatterns?: string[],
    transferUncommitted?: boolean,
    keepChangesInSource?: boolean,
    worktreePlacement?: WorktreePathOptions,
    sourceBranch?: string,
    ownerToken?: string,
  ): Promise<GitAddWorktreeResult> {
    return this.withRepositoryMutation(location, () =>
      this.worktreeService.addWorktree(
        location,
        path,
        branch,
        createBranch,
        startPoint,
        copyIgnoredPatterns,
        transferUncommitted,
        keepChangesInSource,
        worktreePlacement,
        sourceBranch,
        ownerToken,
      ),
    );
  }

  async createExperimentWorktrees(
    payload: CreateExperimentWorktreesPayload,
  ): Promise<CreateExperimentWorktreesResult> {
    return this.withRepositoryMutation(payload.projectLocation, () =>
      this.worktreeService.addOwnedWorktreesBatch(payload),
    );
  }

  async removeExperimentWorktrees(
    payload: RemoveExperimentWorktreesPayload,
    onWorktreesResolved?: (
      worktrees: readonly { threadId: string; path: string }[],
    ) => Promise<void>,
  ): Promise<RemoveExperimentWorktreesResult> {
    return this.withRepositoryMutation(payload.projectLocation, () =>
      this.worktreeService.removeOwnedWorktreesBatch(payload, onWorktreesResolved),
    );
  }

  async removeWorktree(
    location: ProjectLocation,
    path: string,
    force: boolean,
    deleteBranch?: boolean,
    expectedBranch?: string,
    expectedOwnerToken?: string,
  ): Promise<void> {
    return this.withRepositoryMutation(location, () =>
      this.worktreeService.removeWorktree(
        location,
        path,
        force,
        deleteBranch,
        expectedBranch,
        expectedOwnerToken,
      ),
    );
  }

  async deleteRemoteBranch(
    location: ProjectLocation,
    remote: string,
    branch: string,
  ): Promise<void> {
    return this.worktreeService.deleteRemoteBranch(location, remote, branch);
  }

  async deleteBranch(
    location: ProjectLocation,
    branch: string,
    force: boolean,
    expectedOwnerToken?: string,
  ): Promise<void> {
    return this.withRepositoryMutation(location, () =>
      this.worktreeService.deleteBranch(location, branch, force, expectedOwnerToken),
    );
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

  async getWorktreeOwner(
    location: ProjectLocation,
    branch: string,
  ): Promise<GitGetWorktreeOwnerResult> {
    return this.worktreeService.getWorktreeOwner(location, branch);
  }

  async mergeToSource(
    repoLocation: ProjectLocation,
    worktreeLocation: ProjectLocation,
    worktreeBranch: string,
    sourceBranch: string,
    expectedWorktreeCommit?: string,
  ): Promise<GitMergeToSourceResult> {
    return this.mergeService.mergeToSource(
      repoLocation,
      worktreeLocation,
      worktreeBranch,
      sourceBranch,
      expectedWorktreeCommit,
    );
  }

  async pullFromSource(
    worktreeLocation: ProjectLocation,
    sourceBranch: string,
    preserveLocalChanges = false,
  ): Promise<GitPullFromSourceResult> {
    return this.mergeService.pullFromSource(worktreeLocation, sourceBranch, preserveLocalChanges);
  }

  async abortMerge(
    worktreeLocation: ProjectLocation,
    reapplyStashCommit?: string,
  ): Promise<GitAbortMergeResult> {
    return this.mergeService.abortMerge(worktreeLocation, reapplyStashCommit);
  }

  async finishMerge(
    worktreeLocation: ProjectLocation,
    reapplyStashCommit?: string,
  ): Promise<GitFinishMergeResult> {
    return this.mergeService.finishMerge(worktreeLocation, reapplyStashCommit);
  }

  async pruneWorktrees(
    location: ProjectLocation,
    activeWorktreePaths: string[],
    managedRoots?: string[],
  ): Promise<void> {
    return this.worktreeService.pruneWorktrees(location, activeWorktreePaths, managedRoots);
  }

  async repairWorktrees(location: ProjectLocation): Promise<number> {
    return this.worktreeService.repairWorktrees(location);
  }
}
