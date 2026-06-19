import { normalize, posix as posixPath, win32 as win32Path } from "node:path";
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
import { buildWorktreeLocation } from "@/shared/worktree";
import {
  computeDefaultWorktreePath,
  ensureWorktreeParentExists,
  execGit,
  GIT_HOOK_TIMEOUT,
  GIT_NETWORK_TIMEOUT,
  GIT_STATUS_TIMEOUT,
  normalizeWorktreePath,
  resolveBuiltInWorktreeRoot,
  type WorktreePathOptions,
} from "./exec";
import { copyIgnoredFilesIntoWorktree } from "./copyIgnoredFiles";
import { parseStatusPorcelainV2 } from "./statusService";

function trimTrailingSeparators(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed || path;
}

function isPathUnderRoot(path: string, root: string): boolean {
  if (path === root) return true;
  if (!path.startsWith(root)) return false;
  const next = path.charAt(root.length);
  return next === "/" || next === "\\";
}

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
    let remotes: string;
    try {
      remotes = await execGit(location, ["remote"], { timeout: GIT_STATUS_TIMEOUT });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not a git repository")) return;
      throw error;
    }
    if (!remotes.split(/\r?\n/).includes(remote)) return;

    const args = ["fetch", remote];
    if (prune) args.push("--prune");
    await execGit(location, args, { timeout: GIT_NETWORK_TIMEOUT });
  }

  async addRemote(location: ProjectLocation, remote: string, url: string): Promise<void> {
    await execGit(location, ["remote", "add", remote, url], { timeout: GIT_STATUS_TIMEOUT });
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
    copyIgnoredPatterns?: string[],
    transferUncommitted?: boolean,
    keepChangesInSource?: boolean,
    worktreePlacement?: WorktreePathOptions,
  ): Promise<GitAddWorktreeResult> {
    const resolvedPath =
      path ??
      (branch ? await computeDefaultWorktreePath(location, branch, worktreePlacement) : undefined);
    if (!resolvedPath) {
      throw new Error(msg("git.worktree.noBranch"));
    }
    await ensureWorktreeParentExists(location, resolvedPath);

    // Optionally bring the main checkout's uncommitted changes into the new
    // worktree: stash (including untracked files), create the worktree, then
    // apply the stash into it. With `keepChangesInSource` we also re-apply the
    // stash in the source (a COPY); otherwise the source is left clean (a MOVE).
    // The stash list is shared across a repository's worktrees, so we pin the
    // exact stash commit by SHA rather than trusting `stash@{0}`.
    const carryChanges =
      transferUncommitted === true && (await this.hasUncommittedChanges(location));
    const stashSha = carryChanges
      ? await this.pushTransferStash(
          location,
          `Lightcode: ${keepChangesInSource ? "copy" : "move"} changes to ${branch ?? resolvedPath}`,
        )
      : undefined;

    // A bare remote-tracking branch name (e.g. "feature/x" when only
    // `origin/feature/x` exists locally) is not a valid object on its own, so
    // `git worktree add -b <new> <path> feature/x` fails with "not a valid
    // object name". Qualify it with its remote before forking.
    const resolvedStartPoint =
      startPoint && createBranch
        ? await this.resolveStartPointRef(location, startPoint)
        : startPoint;

    const args = ["worktree", "add"];
    if (createBranch && branch) {
      args.push("-b", branch, resolvedPath, ...(resolvedStartPoint ? [resolvedStartPoint] : []));
    } else {
      args.push(resolvedPath, ...(branch ? [branch] : []));
    }
    try {
      await execGit(location, args);
    } catch (error) {
      // Creation failed — put the changes back on the source before bailing out.
      if (stashSha) await this.restoreSourceStash(location, stashSha);
      throw error;
    }

    let changesTransferred: boolean | undefined;
    if (stashSha) {
      changesTransferred = await this.applyStashInto(
        buildWorktreeLocation(location, resolvedPath),
        stashSha,
      );
      if (keepChangesInSource) {
        // Copy: restore the source working tree (then drop the stash). This is
        // independent of the worktree apply, so the source keeps its changes
        // even if the worktree apply conflicted.
        await this.restoreSourceStash(location, stashSha);
      } else if (changesTransferred) {
        // Move: drop the stash on success; a conflicting apply keeps it so the
        // work stays recoverable (reported via `changesTransferred: false`).
        await this.dropStashBySha(location, stashSha);
      }
    }

    if (branch && createBranch) {
      // Record the resolved (qualified) start-point so the diff base matches
      // what we actually forked from — e.g. "origin/feature/x", not "feature/x".
      const sourceBranch = resolvedStartPoint ?? (await this.getCurrentBranch(location));
      if (sourceBranch && sourceBranch !== branch) {
        await this.writeWorktreeSourceBranch(location, branch, sourceBranch);
      }
    }

    if (copyIgnoredPatterns?.length) {
      try {
        await copyIgnoredFilesIntoWorktree(location, resolvedPath, copyIgnoredPatterns);
      } catch (err) {
        // Non-fatal: the worktree itself was created successfully.
        console.warn("[supervisor] failed to copy ignored files into worktree:", err);
      }
    }

    return {
      path: resolvedPath,
      ...(changesTransferred !== undefined ? { changesTransferred } : {}),
    };
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
        await this.deleteBranch(location, branchToDelete, force).catch((error) => {
          console.warn(`[git] failed to delete branch ${branchToDelete} after worktree removal:`, error);
        });
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
        await this.deleteBranch(location, branchToDelete, force).catch((branchErr) => {
          console.warn(`[git] failed to delete branch ${branchToDelete} after worktree removal:`, branchErr);
        });
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
      (error) => {
        console.warn(`[git] failed to delete local ref refs/remotes/${remote}/${branch}:`, error);
      },
    );
  }

  async deleteBranch(location: ProjectLocation, branch: string, force: boolean): Promise<void> {
    // The caller decides whether a force delete is safe (e.g. the PR is merged).
    // We intentionally don't second-guess that here: a soft delete simply
    // surfaces git's "not fully merged" error so the UI can offer a force option.
    await this.deleteBranchWithPruneRetry(location, branch, force);
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

  /**
   * Resolve a worktree start-point into a ref `git worktree add` can fork from.
   * A bare remote-tracking branch name (e.g. "feature/x" when only
   * `origin/feature/x` exists) is not a valid object on its own, so we qualify
   * it with its remote. Local branches, tags, SHAs and already-qualified remote
   * refs resolve directly and pass through unchanged. When the name lives on
   * several remotes we prefer `origin` (matching this module's origin-centric
   * defaults — fetch/resolveFetchedSourceRef); a genuinely origin-less clash
   * stays ambiguous, so we leave it for git to report rather than guessing.
   */
  private async resolveStartPointRef(
    location: ProjectLocation,
    startPoint: string,
  ): Promise<string> {
    if (await this.refResolves(location, startPoint)) return startPoint;

    let remotesRaw: string;
    try {
      remotesRaw = await execGit(location, ["remote"], { timeout: GIT_STATUS_TIMEOUT });
    } catch {
      return startPoint;
    }
    const remotes = remotesRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const matchingRemotes: string[] = [];
    for (const remote of remotes) {
      if (await this.refResolves(location, `refs/remotes/${remote}/${startPoint}`)) {
        matchingRemotes.push(remote);
      }
    }
    if (matchingRemotes.length === 1) return `${matchingRemotes[0]}/${startPoint}`;
    if (matchingRemotes.includes("origin")) return `origin/${startPoint}`;
    return startPoint;
  }

  /** True when `ref` resolves to an object in this repository. */
  private async refResolves(location: ProjectLocation, ref: string): Promise<boolean> {
    try {
      await execGit(location, ["rev-parse", "--verify", "--quiet", ref]);
      return true;
    } catch {
      return false;
    }
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
      (error) => {
        console.warn(`[git] failed to write lightcodeSource config for branch ${branch}:`, error);
      },
    );
  }

  /** Re-point linked worktrees after the main repo (or a worktree) moved on disk. */
  async repairWorktrees(location: ProjectLocation): Promise<number> {
    await execGit(location, ["worktree", "repair"]);
    const { worktrees } = await this.listWorktrees(location);
    return worktrees.filter((worktree) => !worktree.isMain).length;
  }

  /**
   * Remove orphaned Lightcode-managed worktrees (registered but not in the
   * active set). A worktree counts as managed only when it lives under one of
   * `managedRoots` — the resolved global root, the project-relative root, and the
   * legacy default. Per-project *custom* bases are intentionally excluded so we
   * never auto-delete a user-chosen directory.
   */
  async pruneWorktrees(
    location: ProjectLocation,
    activeWorktreePaths: string[],
    managedRoots?: string[],
  ): Promise<void> {
    await execGit(location, ["worktree", "prune"]);
    const { worktrees } = await this.listWorktrees(location);
    const roots = (
      managedRoots && managedRoots.length > 0
        ? managedRoots
        : [await resolveBuiltInWorktreeRoot(location)]
    ).map((root) => trimTrailingSeparators(normalize(root).toLowerCase()));

    for (const worktree of worktrees) {
      if (worktree.isMain) continue;
      const normalizedPath = normalize(worktree.path).toLowerCase();
      const isManaged = roots.some((root) => isPathUnderRoot(normalizedPath, root));
      const isActive = activeWorktreePaths.some(
        (path) => normalize(path).toLowerCase() === normalizedPath,
      );
      if (isManaged && !isActive) {
        await this.removeWorktree(location, worktree.path, true).catch((error) => {
          console.warn(`[git] failed to remove stale worktree ${worktree.path}:`, error);
        });
      }
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
      await execGit(location, ["worktree", "prune"]).catch((pruneErr) => {
        console.warn("[git] worktree prune before branch delete retry failed:", pruneErr);
      });
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

  private async hasUncommittedChanges(location: ProjectLocation): Promise<boolean> {
    const status = await execGit(location, ["status", "--porcelain"], {
      timeout: GIT_STATUS_TIMEOUT,
    });
    return status.trim().length > 0;
  }

  /** Resolve the SHA of the topmost stash entry, or null when the list is empty. */
  private async topStashSha(location: ProjectLocation): Promise<string | null> {
    try {
      const out = await execGit(location, ["rev-parse", "--verify", "--quiet", "stash@{0}"]);
      return out.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Stash the working tree (including untracked files) and return the concrete
   * stash commit SHA so callers can pin operations to it instead of `stash@{0}`
   * (which a concurrent stash in another worktree could shadow).
   *
   * Returns undefined when the push saved nothing — `git status` can report a
   * dirty tree that `git stash push` ignores (e.g. a dirty submodule). We detect
   * that by comparing the top-of-stack SHA before and after the push; without
   * this guard, pinning `stash@{0}` would latch onto an unrelated pre-existing
   * user stash and later drop it, destroying work the operation never touched.
   */
  private async pushTransferStash(
    location: ProjectLocation,
    message: string,
  ): Promise<string | undefined> {
    const before = await this.topStashSha(location);
    await execGit(location, ["stash", "push", "-u", "-m", message]);
    const after = await this.topStashSha(location);
    if (!after || after === before) return undefined;
    return after;
  }

  /** Apply a specific stash commit into a checkout. Returns whether it applied cleanly. */
  private async applyStashInto(location: ProjectLocation, stashSha: string): Promise<boolean> {
    try {
      await execGit(location, ["stash", "apply", "--index", stashSha], {
        timeout: GIT_HOOK_TIMEOUT,
      });
      return true;
    } catch (err) {
      console.warn("[supervisor] failed to apply transferred changes:", err);
      return false;
    }
  }

  /**
   * Re-apply the transfer stash into the source checkout and drop it. The drop
   * only runs if the apply succeeded, so a failed restore never discards the
   * user's only copy of the changes.
   */
  private async restoreSourceStash(location: ProjectLocation, stashSha: string): Promise<void> {
    const restored = await this.applyStashInto(location, stashSha);
    if (restored) await this.dropStashBySha(location, stashSha);
  }

  /** Drop the stash entry whose commit matches {@link stashSha}, resolved by SHA. */
  private async dropStashBySha(location: ProjectLocation, stashSha: string): Promise<void> {
    try {
      const list = await execGit(location, ["stash", "list", "--format=%H %gd"]);
      // Each line is "<full-sha> stash@{N}"; both fields are space-free.
      for (const line of list.split("\n")) {
        const [hash, ref] = line.trim().split(" ");
        if (hash === stashSha && ref) {
          await execGit(location, ["stash", "drop", ref]);
          return;
        }
      }
    } catch (err) {
      console.warn("[supervisor] failed to drop transfer stash:", err);
    }
  }
}
