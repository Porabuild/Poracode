import type { GitRemoteInfo, Project } from "@/shared/contracts";

/**
 * Identity of the repository a project points at, derived from its cached origin
 * remote. Keyed on `owner/repo` only: the same repo is reachable over https and
 * over an SSH host alias, so the URL (and the platform we classify from it)
 * differs between two checkouts that are really the same repository.
 *
 * Returns `null` when the origin remote isn't known yet — such a project must
 * never be collapsed into another one.
 */
export function repoIdentityKey(remoteInfo: GitRemoteInfo | null | undefined): string | null {
  const owner = remoteInfo?.owner.trim().toLocaleLowerCase();
  const repo = remoteInfo?.repo.trim().toLocaleLowerCase();
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

/** Projects mirrored from a remote desktop lose to a local checkout of the same repo. */
function isLocalProject(project: Project): boolean {
  return !project.remoteServerId;
}

/**
 * Collapse projects that are checkouts of the same repository down to one per
 * repo, preferring a local project over one mirrored from a remote desktop.
 * `gh pr list` is repo-wide, so every extra checkout of the same origin only
 * duplicates rows (and, when the remote desktop is unreachable, adds a load
 * error for PRs we already have). The local clone is also the one PR review can
 * check out against.
 *
 * Input order is preserved, and projects whose repo identity is unknown are
 * always kept.
 */
export function dedupePrProjects(
  projects: readonly Project[],
  repoKeyOf: (project: Project) => string | null,
): Project[] {
  const primaryByRepo = new Map<string, Project>();
  for (const project of projects) {
    const key = repoKeyOf(project);
    if (!key) continue;
    const current = primaryByRepo.get(key);
    // First project wins unless a later one is local and the incumbent is not.
    if (!current || (isLocalProject(project) && !isLocalProject(current))) {
      primaryByRepo.set(key, project);
    }
  }
  return projects.filter((project) => {
    const key = repoKeyOf(project);
    return key === null || primaryByRepo.get(key) === project;
  });
}
