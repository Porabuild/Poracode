import { randomUUID } from "node:crypto";
import { copyFile, rm, stat } from "node:fs/promises";
import type {
  ProjectLocation,
  ThreadTransferExportGitPayload,
  ThreadTransferExportGitResult,
  ThreadTransferGitHavesResult,
  ThreadTransferGitState,
  ThreadTransferImportGitPayload,
  ThreadTransferImportGitResult,
  ThreadTransferInspectGitResult,
  ThreadTransferRepoProbeResult,
} from "@/shared/contracts";
import { msg } from "@/shared/messages";
import {
  THREAD_TRANSFER_HAVES_MAX,
  THREAD_TRANSFER_PACKAGE_MAX_BYTES,
  THREAD_TRANSFER_REPO_IDENTITIES_MAX,
  threadTransferRepoIdentity,
} from "@/shared/threadTransfer";
import { buildWorktreeLocation } from "@/shared/worktree";
import { CHECKPOINT_FALLBACK_IDENT_ENV, isMissingGitIdentityError } from "./checkpointService";
import {
  computeDefaultWorktreePath,
  ensureWorktreeParentExists,
  execGit,
  GIT_CLONE_TIMEOUT,
  type WorktreePathOptions,
} from "./exec";
import { isValidGitBranchName } from "./worktreeService";

/**
 * Git steps of a thread transfer (see `src/shared/threadTransfer.ts`).
 *
 * Export snapshots the working directory without touching it: the index and
 * the working tree are written as commits on top of HEAD through a private
 * copy of the index (the file-checkpoint technique), pinned by temporary refs,
 * and bundled against the commits the target already has. Import fetches the
 * bundle into a private ref namespace, adds a NEW worktree at the same HEAD
 * and replays the working tree and index snapshots into it. Neither side ever
 * rewrites an existing branch or checkout. WSL checkouts are refused by the
 * caller; these steps use host filesystem paths.
 */

const REF_ROOT = "refs/poracode/transfers";
const LONG = { admissionClass: "long" as const, timeout: GIT_CLONE_TIMEOUT };
const MAX_BRANCH_SUFFIX = 50;

function assertNativeLocation(location: ProjectLocation): void {
  if (location.kind === "wsl") throw new Error(msg("thread.transferUnsupportedLocation"));
}

async function isRepository(location: ProjectLocation): Promise<boolean> {
  try {
    return (await execGit(location, ["rev-parse", "--is-inside-work-tree"])).trim() === "true";
  } catch {
    return false;
  }
}

async function resolveCommit(location: ProjectLocation, rev: string): Promise<string | undefined> {
  const output = await execGit(location, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], {
    acceptedExitCodes: [1],
  });
  return output.trim() || undefined;
}

async function currentBranch(location: ProjectLocation): Promise<string | undefined> {
  const output = await execGit(location, ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    acceptedExitCodes: [1],
  });
  return output.trim() || undefined;
}

async function readRepoIdentities(location: ProjectLocation): Promise<string[]> {
  const output = await execGit(location, ["config", "--get-regexp", "^remote\\..*\\.url$"], {
    acceptedExitCodes: [1],
  });
  const identities = new Set<string>();
  for (const line of output.split(/\r?\n/u)) {
    const url = line.slice(line.indexOf(" ") + 1).trim();
    const identity = line.includes(" ") ? threadTransferRepoIdentity(url) : null;
    if (identity) identities.add(identity);
  }
  return [...identities].slice(0, THREAD_TRANSFER_REPO_IDENTITIES_MAX);
}

/** Entries of `git status --porcelain=v1 -z`; a rename or copy carries its old path as a second field. */
export function countPorcelainEntries(output: string): number {
  const fields = output.split("\0");
  let count = 0;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    if (field.length < 4) continue;
    count += 1;
    if (/[RC]/u.test(field.slice(0, 2))) index += 1;
  }
  return count;
}

async function countChangedFiles(location: ProjectLocation): Promise<number> {
  return countPorcelainEntries(
    await execGit(location, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  );
}

async function existingCommits(
  location: ProjectLocation,
  shas: readonly string[],
): Promise<string[]> {
  if (shas.length === 0) return [];
  const output = await execGit(location, ["cat-file", "--batch-check"], {
    input: `${shas.join("\n")}\n`,
  });
  return output
    .split(/\r?\n/u)
    .map((line) => line.split(" "))
    .filter((parts) => parts[1] === "commit")
    .map((parts) => parts[0]!);
}

async function commitTree(
  location: ProjectLocation,
  tree: string,
  parent: string,
  subject: string,
): Promise<string> {
  const args = ["commit-tree", tree, "-p", parent, "-F", "-"];
  const input = `${subject}\n`;
  try {
    return (await execGit(location, args, { env: { LC_ALL: "C" }, input })).trim();
  } catch (error) {
    if (!isMissingGitIdentityError(error) && !isMissingGitIdentityError((error as Error)?.cause)) {
      throw error;
    }
    return (await execGit(location, args, { env: CHECKPOINT_FALLBACK_IDENT_ENV, input })).trim();
  }
}

async function deleteRefsUnder(location: ProjectLocation, prefix: string): Promise<void> {
  const output = await execGit(location, ["for-each-ref", "--format=%(refname)", `${prefix}/`]);
  for (const ref of output.split(/\r?\n/u).map((line) => line.trim())) {
    if (ref) await execGit(location, ["update-ref", "-d", ref]).catch(() => undefined);
  }
}

export async function inspectThreadTransferGit(
  location: ProjectLocation,
): Promise<ThreadTransferInspectGitResult> {
  if (!(await isRepository(location))) {
    return { repository: false, changedFiles: 0, repoIdentities: [] };
  }
  const [head, branch, changedFiles, repoIdentities] = await Promise.all([
    resolveCommit(location, "HEAD"),
    currentBranch(location),
    countChangedFiles(location),
    readRepoIdentities(location),
  ]);
  return {
    repository: true,
    ...(branch ? { branch } : {}),
    ...(head ? { head } : {}),
    changedFiles,
    repoIdentities,
  };
}

export async function probeThreadTransferRepositories(
  locations: readonly ProjectLocation[],
): Promise<ThreadTransferRepoProbeResult> {
  const repositories: ThreadTransferRepoProbeResult["repositories"] = [];
  for (const location of locations) {
    if (location.kind === "wsl" || !(await isRepository(location))) {
      repositories.push({ repository: false, repoIdentities: [] });
      continue;
    }
    repositories.push({
      repository: true,
      repoIdentities: await readRepoIdentities(location).catch(() => []),
    });
  }
  return { repositories };
}

/**
 * Commits this checkout already has, newest first: what the other side may
 * leave out of a bundle. Local and remote-tracking branch tips plus HEAD.
 */
export async function threadTransferGitHaves(
  location: ProjectLocation,
): Promise<ThreadTransferGitHavesResult> {
  if (location.kind === "wsl" || !(await isRepository(location))) {
    return { repository: false, haves: [] };
  }
  const head = await resolveCommit(location, "HEAD");
  const output = await execGit(location, [
    "for-each-ref",
    "--sort=-committerdate",
    `--count=${THREAD_TRANSFER_HAVES_MAX}`,
    "--format=%(objectname) %(objecttype)",
    "refs/heads",
    "refs/remotes",
  ]);
  const haves = new Set<string>(head ? [head] : []);
  for (const line of output.split(/\r?\n/u)) {
    const [sha, type] = line.trim().split(" ");
    if (sha && type === "commit") haves.add(sha);
  }
  return { repository: true, haves: [...haves].slice(0, THREAD_TRANSFER_HAVES_MAX) };
}

export async function exportThreadTransferGit(
  payload: ThreadTransferExportGitPayload,
): Promise<ThreadTransferExportGitResult> {
  const location = payload.projectLocation;
  assertNativeLocation(location);
  const head = await resolveCommit(location, "HEAD");
  if (!head) throw new Error(msg("thread.transferNoCommits"));
  const branch = await currentBranch(location);
  const sourceBranch = branch
    ? (
        await execGit(location, ["config", "--get", `branch.${branch}.poracodeSource`], {
          acceptedExitCodes: [1],
        })
      ).trim() || undefined
    : undefined;
  const headTree = (await execGit(location, ["rev-parse", "--verify", "HEAD^{tree}"])).trim();
  const indexPath = (
    await execGit(location, ["rev-parse", "--path-format=absolute", "--git-path", "index"])
  ).trim();
  const tempIndex = `${indexPath}.poracode-transfer-${randomUUID()}`;
  const env = { GIT_INDEX_FILE: tempIndex };
  const refRoot = `${REF_ROOT}/${payload.transferId}`;
  try {
    // A private copy keeps the user's index (and its lock) untouched.
    const hasIndex = await copyFile(indexPath, tempIndex).then(
      () => true,
      () => false,
    );
    if (!hasIndex) await execGit(location, ["read-tree", headTree], { env });
    // Unmerged entries cannot be written as a tree; the index then follows HEAD.
    const indexTree = await execGit(location, ["write-tree"], { env }).then(
      (output) => output.trim(),
      () => undefined,
    );
    if (indexTree === undefined) await execGit(location, ["read-tree", headTree], { env });
    await execGit(location, ["add", "-A", "--", ":/"], { env, ...LONG });
    const worktreeTree = (await execGit(location, ["write-tree"], { env })).trim();
    const worktreeCommit =
      worktreeTree !== headTree
        ? await commitTree(location, worktreeTree, head, "Poracode transfer: working tree")
        : undefined;
    const indexCommit =
      indexTree === undefined || indexTree === headTree
        ? undefined
        : indexTree === worktreeTree && worktreeCommit
          ? worktreeCommit
          : await commitTree(location, indexTree, head, "Poracode transfer: index");
    const refs = new Map<string, string>([[`${refRoot}/head`, head]]);
    if (worktreeCommit) refs.set(`${refRoot}/worktree`, worktreeCommit);
    if (indexCommit && indexCommit !== worktreeCommit) refs.set(`${refRoot}/index`, indexCommit);
    for (const [ref, sha] of refs) await execGit(location, ["update-ref", ref, sha]);
    const basis = await existingCommits(location, payload.haves);
    const notBasis = basis.length > 0 ? ["--not", ...basis] : [];
    const missing = Number(
      (await execGit(location, ["rev-list", "--count", ...refs.keys(), ...notBasis])).trim(),
    );
    let bundleBytes = 0;
    if (missing > 0) {
      await execGit(
        location,
        ["bundle", "create", payload.bundlePath, ...refs.keys(), ...notBasis],
        LONG,
      );
      bundleBytes = (await stat(payload.bundlePath)).size;
      if (bundleBytes > THREAD_TRANSFER_PACKAGE_MAX_BYTES) {
        throw new Error(
          msg("thread.transferTooLarge", { size: `${Math.ceil(bundleBytes / 1024 / 1024)} MB` }),
        );
      }
    }
    return {
      ...(branch ? { branch } : {}),
      head,
      ...(worktreeCommit ? { worktreeCommit } : {}),
      ...(indexCommit ? { indexCommit } : {}),
      ...(sourceBranch ? { sourceBranch } : {}),
      basis,
      changedFiles: await countChangedFiles(location),
      bundleBytes,
    };
  } finally {
    await rm(tempIndex, { force: true }).catch(() => undefined);
    await deleteRefsUnder(location, refRoot).catch(() => undefined);
  }
}

async function branchExists(location: ProjectLocation, branch: string): Promise<boolean> {
  return (await resolveCommit(location, `refs/heads/${branch}`)) !== undefined;
}

async function checkedOutBranches(location: ProjectLocation): Promise<Set<string>> {
  const output = await execGit(location, ["worktree", "list", "--porcelain"]);
  const branches = new Set<string>();
  for (const line of output.split(/\r?\n/u)) {
    if (line.startsWith("branch refs/heads/"))
      branches.add(line.slice("branch refs/heads/".length));
  }
  return branches;
}

async function uniqueBranchName(location: ProjectLocation, base: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_BRANCH_SUFFIX; attempt += 1) {
    const candidate = attempt === 1 ? `${base}-moved` : `${base}-moved-${attempt}`;
    if (!(await branchExists(location, candidate))) return candidate;
  }
  throw new Error(msg("thread.transferBranchUnavailable", { branch: base }));
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function uniqueWorktreePath(
  location: ProjectLocation,
  name: string,
  placement: WorktreePathOptions,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_BRANCH_SUFFIX; attempt += 1) {
    const candidate = await computeDefaultWorktreePath(
      location,
      attempt === 1 ? name : `${name}-${attempt}`,
      placement,
    );
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error(msg("thread.transferBranchUnavailable", { branch: name }));
}

/** Where an incoming branch lands: the same name when free, else a new `-moved` name. */
async function chooseBranch(
  location: ProjectLocation,
  git: ThreadTransferGitState,
): Promise<{ branch?: string; create: boolean; renamed: boolean }> {
  if (!git.branch) return { create: false, renamed: false };
  if (!isValidGitBranchName(git.branch)) throw new Error(msg("thread.transferBranchInvalid"));
  const existing = await resolveCommit(location, `refs/heads/${git.branch}`);
  if (existing === undefined) return { branch: git.branch, create: true, renamed: false };
  if (existing === git.head && !(await checkedOutBranches(location)).has(git.branch)) {
    return { branch: git.branch, create: false, renamed: false };
  }
  return { branch: await uniqueBranchName(location, git.branch), create: true, renamed: true };
}

export async function importThreadTransferGit(
  payload: ThreadTransferImportGitPayload,
): Promise<ThreadTransferImportGitResult> {
  const location = payload.projectLocation;
  const { git } = payload;
  assertNativeLocation(location);
  if (!(await isRepository(location))) throw new Error(msg("thread.transferTargetNotGit"));
  const refRoot = `${REF_ROOT}/${payload.transferId}`;
  let worktreePath: string | undefined;
  let createdBranch: string | undefined;
  try {
    if (payload.bundlePath) {
      // Verification refuses a bundle whose prerequisite commits are absent.
      await execGit(location, ["bundle", "verify", "--quiet", payload.bundlePath], LONG).catch(
        (error: unknown) => {
          throw new Error(msg("thread.transferHistoryMissing"), { cause: error });
        },
      );
      // Only the transfer namespace is fetched; any other ref in the bundle is ignored.
      await execGit(
        location,
        [
          "fetch",
          "--no-tags",
          "--quiet",
          payload.bundlePath,
          `+${REF_ROOT}/*:${refRoot}/incoming/*`,
        ],
        LONG,
      );
    }
    for (const sha of [git.head, git.worktreeCommit, git.indexCommit]) {
      if (sha && (await resolveCommit(location, sha)) !== sha) {
        throw new Error(msg("thread.transferHistoryMissing"));
      }
    }
    // Every needed object is now reachable from a private ref until the worktree exists.
    await execGit(location, ["update-ref", `${refRoot}/head`, git.head]);
    const choice = await chooseBranch(location, git);
    const placement: WorktreePathOptions = {
      ...(payload.worktreeRoot ? { root: payload.worktreeRoot } : {}),
      ...(payload.worktreeOmitRepoDir ? { omitRepoDir: true } : {}),
    };
    worktreePath = await uniqueWorktreePath(
      location,
      choice.branch ?? `moved-${payload.transferId.slice(0, 8)}`,
      placement,
    );
    await ensureWorktreeParentExists(location, worktreePath);
    const addArgs = choice.branch
      ? choice.create
        ? ["worktree", "add", "--no-track", "-b", choice.branch, worktreePath, git.head]
        : ["worktree", "add", worktreePath, choice.branch]
      : ["worktree", "add", "--detach", worktreePath, git.head];
    await execGit(location, addArgs, LONG);
    if (choice.create && choice.branch) createdBranch = choice.branch;
    const worktree = buildWorktreeLocation(location, worktreePath);
    if (git.worktreeCommit) {
      await execGit(worktree, ["read-tree", "--reset", "-u", git.worktreeCommit], LONG);
      await execGit(worktree, ["read-tree", git.indexCommit ?? "HEAD"]);
    }
    if (choice.branch && choice.create) {
      const candidates = [git.sourceBranch, choice.renamed ? git.branch : undefined].filter(
        (value): value is string =>
          !!value && value !== choice.branch && isValidGitBranchName(value),
      );
      for (const candidate of candidates) {
        if ((await resolveCommit(location, candidate)) === undefined) continue;
        await execGit(location, ["config", `branch.${choice.branch}.poracodeSource`, candidate]);
        break;
      }
    }
    return {
      worktreePath,
      ...(choice.branch ? { branch: choice.branch } : {}),
      branchRenamed: choice.renamed,
      branchCreated: createdBranch !== undefined,
    };
  } catch (error) {
    if (worktreePath && (await pathExists(worktreePath))) {
      await execGit(location, ["worktree", "remove", "--force", "--force", worktreePath]).catch(
        () => rm(worktreePath!, { recursive: true, force: true }).catch(() => undefined),
      );
      await execGit(location, ["worktree", "prune"]).catch(() => undefined);
    }
    if (createdBranch) {
      await execGit(location, ["branch", "-D", createdBranch]).catch(() => undefined);
    }
    throw error;
  } finally {
    await deleteRefsUnder(location, refRoot).catch(() => undefined);
  }
}
