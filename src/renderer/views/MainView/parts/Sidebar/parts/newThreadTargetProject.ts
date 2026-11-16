import type { Project, Thread } from "@/shared/contracts";

/**
 * The project a flat list's "New thread" control targets: the most recently
 * updated thread's project (among projects that can take a new thread), else
 * the first actionable project inside the project filter, or the first
 * actionable project when unfiltered, so a fresh workspace still has a target.
 */
export function pickNewThreadProjectId(
  threads: readonly Thread[],
  actionableProjects: readonly Project[],
  projectFilter: ReadonlySet<string> | null,
): string | undefined {
  const inFilter = (projectId: string) => projectFilter === null || projectFilter.has(projectId);
  const actionableIds = new Set(actionableProjects.map((project) => project.id));
  let latestProjectId: string | undefined;
  let latestUpdatedAt = "";
  for (const thread of threads) {
    if (!inFilter(thread.projectId) || !actionableIds.has(thread.projectId)) continue;
    if (thread.updatedAt > latestUpdatedAt) {
      latestUpdatedAt = thread.updatedAt;
      latestProjectId = thread.projectId;
    }
  }
  return latestProjectId ?? actionableProjects.find((project) => inFilter(project.id))?.id;
}
