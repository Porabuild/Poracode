import type { GitRemoteInfo, Project } from "@/shared/contracts";
import { parseForgeRemote } from "@/shared/forgeRemote";
import { pullRequestEntryKey, type PullRequestEntry } from "./prListModel";

/**
 * Identity of the repository a project points at, derived from its cached origin
 * remote. The authority and full namespace matter: identical names on two
 * forges, enterprise hosts or Azure organizations are different repositories.
 *
 * Returns `null` when the origin remote isn't known yet — such a project must
 * never be collapsed into another one.
 */
export function repoIdentityKey(remoteInfo: GitRemoteInfo | null | undefined): string | null {
  if (!remoteInfo?.owner.trim() || !remoteInfo.repo.trim()) return null;
  const remote = parseForgeRemote(remoteInfo.url, "origin");
  return remote ? `${remote.host}/${remote.path}`.toLocaleLowerCase() : null;
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

/**
 * Collapse rows that are the same review (same {@link pullRequestEntryKey}). Two
 * checkouts whose origin is not cached yet are both queried, and both return the
 * repository's rows; without this the list shows each review twice under one React
 * key and highlights both as selected. The row from a local project wins over one
 * mirrored from a remote desktop, then the project that comes first in `projects`.
 * Row order is preserved.
 */
export function dedupePullRequestEntries(
  entries: readonly PullRequestEntry[],
  projects: readonly Project[],
): PullRequestEntry[] {
  const rank = new Map(projects.map((project, index) => [project.id, index]));
  const rankOf = (entry: PullRequestEntry) => rank.get(entry.project.id) ?? projects.length;
  const winners = new Map<string, PullRequestEntry>();
  for (const entry of entries) {
    const key = pullRequestEntryKey(entry);
    const incumbent = winners.get(key);
    if (!incumbent) {
      winners.set(key, entry);
      continue;
    }
    const local = isLocalProject(entry.project);
    if (local !== isLocalProject(incumbent.project) ? local : rankOf(entry) < rankOf(incumbent)) {
      winners.set(key, entry);
    }
  }
  return entries.filter((entry) => winners.get(pullRequestEntryKey(entry)) === entry);
}
