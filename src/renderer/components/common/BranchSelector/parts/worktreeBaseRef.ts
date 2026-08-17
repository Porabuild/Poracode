import type { GitBranchInfo } from "@/shared/contracts";

export function qualifiedRemoteName(branch: GitBranchInfo): string | undefined {
  if (!branch.isRemote || !branch.remote) return undefined;
  return `${branch.remote}/${branch.name}`;
}

/** Map `origin/main` (or another remote-qualified ref) back to the local short name. */
export function localBranchNameFromRef(
  ref: string,
  branches: readonly GitBranchInfo[] = [],
): string {
  const remoteMatch = branches.find((branch) => qualifiedRemoteName(branch) === ref);
  if (remoteMatch) return remoteMatch.name;
  if (ref.startsWith("origin/")) return ref.slice("origin/".length);
  return ref;
}

/**
 * Worktree (no changes) should fork from the origin-tracking ref when one
 * exists — same as T3's start-from-origin default. Selecting "main" in the
 * picker must stay on `origin/main`, not flip to the local checkout.
 */
export function resolveWorktreeOriginRef(
  branchName: string,
  branches: readonly GitBranchInfo[] = [],
  tracking?: string | null,
): string {
  if (branches.some((branch) => qualifiedRemoteName(branch) === branchName)) {
    return branchName;
  }

  const localName = localBranchNameFromRef(branchName, branches);

  if (tracking) {
    const trackingLocal = localBranchNameFromRef(tracking, branches);
    if (trackingLocal === localName) return tracking;
  }

  const origin = branches.find(
    (branch) =>
      branch.isRemote && (branch.remote ?? "origin") === "origin" && branch.name === localName,
  );
  const originName = origin ? qualifiedRemoteName(origin) : undefined;
  if (originName) return originName;

  const anyRemote = branches.find(
    (branch) => branch.isRemote && branch.name === localName && branch.remote,
  );
  return (anyRemote ? qualifiedRemoteName(anyRemote) : undefined) ?? localName;
}

export function isCurrentCheckoutRef(
  ref: string,
  currentBranch: string | undefined,
  tracking?: string | null,
): boolean {
  if (!currentBranch) return false;
  return ref === currentBranch || (tracking != null && ref === tracking);
}
