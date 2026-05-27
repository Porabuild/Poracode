import { homedir } from "node:os";
import { join, normalize, posix as posixPath, win32 as win32Path } from "node:path";
import {
  type GitAddWorktreeResult,
  type GitBranchListResult,
  type GitGetWorktreeSourceBranchResult,
  type GitSwitchBranchResult,
  type GitWorktreeInfo,
  type GitWorktreeListResult,
  type ProjectLocation,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import { resolveLightcodePaths } from "@/shared/lightcodePaths";
import {
  computeDefaultWorktreePath,
  ensureWorktreeParentExists,
  execGit,
  GIT_NETWORK_TIMEOUT,
  GIT_STATUS_TIMEOUT,
  normalizeWorktreePath,
} from "./exec";
import { parseStatusPorcelainV2 } from "./statusService";

/** Argv for `git branch` to feed {@link parseBranchListOutput}. */
export function buildBranchListArgs(includeRemote: boolean): string[] {
  const args = ["branch", "--format=%(refname)\t%(objectname:short)\t%(HEAD)", "--sort=-HEAD"];
  if (includeRemote) args.push("-a");
  return args;
}

export function parseBranchListOutput(output: string): GitBranchListResult {
  let current = "";
  const branches: GitBranchListResult["branches"] = [];
  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    const ref = parts[0]!;
    const commit = parts[1] ?? "";
    const isCurrent = parts[2] === "*";
    if (ref.endsWith("/HEAD")) continue;

    const isRemoteBranch = ref.startsWith("refs/remotes/");
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

export function parseWorktreeListOutput(
  raw: string,
  locationKind: ProjectLocation["kind"],
): GitWorktreeListResult {
  const worktrees: GitWorktreeInfo[] = [];
  for (const block of raw.split(/\r?\n\r?\n+/).filter(Boolean)) {
    const lines = block.trim().split(/\r?\n/);
    let path = "";
    let commit = "";
    let branch = "";
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        const rawPath = line.slice(9);
        if (locationKind === "wsl") {
          path = rawPath;
        } else if (locationKind === "windows") {
          path = win32Path.normalize(rawPath);
        } else {
          path = posixPath.normalize(rawPath);
        }
      } else if (line.startsWith("HEAD ")) {
        commit = line.slice(5);
      } else if (line.startsWith("branch ")) {
        const fullRef = line.slice(7);
        branch = fullRef.startsWith("refs/heads/") ? fullRef.slice(11) : fullRef;
      }
    }
    if (path) {
      worktrees.push({ path, branch, commit, isMain: worktrees.length === 0 });
    }
  }
  return { worktrees };
}

export class GitWorktreeService {
  async listBranches(
    location: ProjectLocation,
    includeRemote: boolean,
  ): Promise<GitBranchListResult> {
    const args = buildBranchListArgs(includeRemote);
    const output = await execGit(location, args);
    return parseBranchListOutput(output);
  }

  async fetch(location: ProjectLocation, remote: string, prune: boolean): Promise<void> {
    const remotes = await execGit(location, ["remote"], { timeout: GIT_STATUS_TIMEOUT });
    if (!remotes.split(/\r?\n/).includes(remote)) return;

    const args = ["fetch", remote];
    if (prune) args.push("--prune");
    await execGit(location, args, { timeout: GIT_NETWORK_TIMEOUT });
  }

  async pull(location: ProjectLocation, remote: string): Promise<void> {
    await execGit(location, ["pull", remote], { timeout: GIT_NETWORK_TIMEOUT });
  }

  async pullRebase(location: ProjectLocation, remote: string): Promise<void> {
    await execGit(location, ["pull", "--rebase", remote], { timeout: GIT_NETWORK_TIMEOUT });
  }

  async push(
    location: ProjectLocation,
    remote: string,
    branch?: string,
    setUpstream?: boolean,
  ): Promise<void> {
    const args = ["push"];
    if (setUpstream) args.push("--set-upstream");
    if (setUpstream && !branch) {
      branch = (await this.getCurrentBranch(location)) ?? undefined;
    }
    args.push(remote);
    if (branch) args.push(branch);
    await execGit(location, args, { timeout: GIT_NETWORK_TIMEOUT });
  }

  async listWorktrees(location: ProjectLocation): Promise<GitWorktreeListResult> {
    const raw = await execGit(location, ["worktree", "list", "--porcelain"]);
    return parseWorktreeListOutput(raw, location.kind);
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
    let registeredWorktree: GitWorktreeInfo | undefined;
    let listedWorktrees = false;

    try {
      const { worktrees } = await this.listWorktrees(location);
      listedWorktrees = true;
      registeredWorktree = worktrees.find(
        (entry) => normalizeWorktreePath(location, entry.path) === targetPath,
      );
      if (registeredWorktree?.isMain) {
        throw new Error("Cannot remove the main worktree.");
      }
      if (deleteBranch) {
        branchToDelete = registeredWorktree?.branch;
        if (branchToDelete === "detached") branchToDelete = undefined;
      }
    } catch (error) {
      if (deleteBranch) {
        console.error("[supervisor] failed to identify branch for worktree removal:", error);
      } else {
        throw error;
      }
    }

    if (force && listedWorktrees && !registeredWorktree) {
      await execGit(location, ["worktree", "prune"]);
      return;
    }

    const removeArgs = ["worktree", "remove", ...(force ? ["--force", "--force"] : []), path];
    try {
      await execGit(location, removeArgs);
      if (branchToDelete) {
        await this.deleteBranch(location, branchToDelete, force).catch(() => undefined);
      }
    } catch (error) {
      if (!force || registeredWorktree?.isMain) {
        throw error;
      }
      await execGit(location, ["worktree", "prune"]);
      const { worktrees } = await this.listWorktrees(location);
      if (
        worktrees.some((worktree) => normalizeWorktreePath(location, worktree.path) === targetPath)
      ) {
        throw error;
      }
      if (branchToDelete) {
        await this.deleteBranch(location, branchToDelete, force).catch(() => undefined);
      }
    }
  }

  async deleteRemoteBranch(
    location: ProjectLocation,
    remote: string,
    branch: string,
  ): Promise<void> {
    await execGit(location, ["push", remote, "--delete", branch], { timeout: GIT_NETWORK_TIMEOUT });
    await execGit(location, ["update-ref", "-d", `refs/remotes/${remote}/${branch}`]).catch(
      () => undefined,
    );
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
  ): Promise<GitSwitchBranchResult> {
    const args = ["switch"];
    if (createNew) args.push("-c", branch);
    else args.push(branch);
    await execGit(location, args);

    const statusOutput = await execGit(location, ["status", "--porcelain=v2", "-b"], {
      timeout: GIT_STATUS_TIMEOUT,
    });
    const parsed = parseStatusPorcelainV2(statusOutput);
    return {
      branch,
      created: createNew,
      tracking: parsed.tracking,
      ahead: parsed.ahead,
      behind: parsed.behind,
    };
  }

  async getWorktreeSourceBranch(
    location: ProjectLocation,
    branch: string,
    sourceBranchOverride?: string,
  ): Promise<GitGetWorktreeSourceBranchResult> {
    const sourceBranch =
      sourceBranchOverride && sourceBranchOverride !== branch
        ? sourceBranchOverride
        : await this.readWorktreeSourceBranch(location, branch);
    let commitsAhead = 0;
    let sourceAhead = 0;
    if (sourceBranch) {
      try {
        const sourceRef = await this.resolveFetchedSourceRef(location, sourceBranch);
        const output = await execGit(location, [
          "rev-list",
          "--left-right",
          "--count",
          `${sourceRef}...${branch}`,
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

  async resolveFetchedSourceRef(location: ProjectLocation, sourceBranch: string): Promise<string> {
    await this.fetch(location, "origin", true);
    if (sourceBranch.startsWith("origin/")) return sourceBranch;

    const remoteRef = `origin/${sourceBranch}`;
    try {
      await execGit(location, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remoteRef}`]);
      return remoteRef;
    } catch {
      return sourceBranch;
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

  async pruneWorktrees(location: ProjectLocation, activeWorktreePaths: string[]): Promise<void> {
    await execGit(location, ["worktree", "prune"]);
    const { worktrees } = await this.listWorktrees(location);
    const managedBase = resolveLightcodePaths(join(homedir(), ".lightcode")).worktreesDir;
    const normalizedManagedBase = normalize(managedBase).toLowerCase();

    for (const worktree of worktrees) {
      if (worktree.isMain) continue;
      const normalizedPath = normalize(worktree.path);
      const isManaged = normalizedPath.toLowerCase().startsWith(normalizedManagedBase);
      const isActive = activeWorktreePaths.some(
        (path) => normalize(path).toLowerCase() === normalizedPath.toLowerCase(),
      );
      if (isManaged && !isActive) {
        await this.removeWorktree(location, worktree.path, true).catch(() => undefined);
      }
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
      await execGit(location, ["worktree", "prune"]).catch(() => undefined);
      await execGit(location, args);
    }
  }

  private shouldRetryBranchDeleteAfterPrune(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /used by worktree|checked out at|is already checked out|worktree/i.test(message);
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
      if (mainWorktreeBranch && mainWorktreeBranch !== branch) {
        await execGit(location, ["merge-base", mainWorktreeBranch, branch]);
        await this.writeWorktreeSourceBranch(location, branch, mainWorktreeBranch);
        return mainWorktreeBranch;
      }
    } catch {
      // worktree inference failed
    }

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
        if (source && source !== "HEAD" && source !== branch && !/^[0-9a-f]+$/i.test(source)) {
          await execGit(location, ["rev-parse", "--verify", `refs/heads/${source}`]);
          return source;
        }
      }
    } catch {
      // reflog unavailable
    }

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
}
