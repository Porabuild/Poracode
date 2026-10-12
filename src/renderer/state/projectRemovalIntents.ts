import type { Project } from "@/shared/contracts";

interface ProjectRemovalIntent {
  project: Project;
  confirmed: boolean;
}
const removals = new Map<string, ProjectRemovalIntent>();

export function beginProjectRemoval(project: Project): ProjectRemovalIntent {
  const intent = { project, confirmed: false };
  removals.set(project.id, intent);
  return intent;
}

/** Stale catalog pages cannot restore a project hidden by a pending user intent. */
export function visibleCatalogProjects<T extends Project>(rows: readonly T[]): T[] {
  return rows.filter((row) => {
    const intent = removals.get(row.id);
    if (!intent) return true;
    intent.project =
      row.mcpServers === undefined && intent.project.mcpServers !== undefined
        ? { ...row, mcpServers: intent.project.mcpServers }
        : row;
    return false;
  });
}

/** Membership reconciliation must also query rows that are hidden from display. */
export function pendingProjectRemovalRows(): Project[] {
  return [...removals.values()].map((intent) => intent.project);
}

export function confirmProjectRemoval(projectId: string): void {
  const intent = removals.get(projectId);
  if (intent) intent.confirmed = true;
  removals.delete(projectId);
}

export function cancelProjectRemoval(intent: ProjectRemovalIntent): Project | undefined {
  if (intent.confirmed || removals.get(intent.project.id) !== intent) return undefined;
  removals.delete(intent.project.id);
  return intent.project;
}

/** A complete remote inventory can retire a hidden row even though it is no longer resident. */
export function confirmAbsentProjectRemovals(
  serverId: string,
  projectIds: ReadonlySet<string>,
): string[] {
  const absent: string[] = [];
  for (const [projectId, intent] of removals) {
    if (intent.project.remoteServerId === serverId && !projectIds.has(projectId)) {
      absent.push(projectId);
      confirmProjectRemoval(projectId);
    }
  }
  return absent;
}
