import type { Project, ProjectLocation } from "./contracts";

/**
 * Stable identity for a project location. Project names are labels and may be
 * changed, while a location can only represent one project on a given host.
 */
export function projectLocationKey(location: ProjectLocation): string {
  if (location.kind === "wsl") {
    return `wsl:${location.distro.trim().toLocaleLowerCase()}:${normalizePath(location.linuxPath, false)}`;
  }
  return `${location.kind}:${normalizePath(location.path, location.kind === "windows")}`;
}

/** Include the owning desktop so equal paths on different machines remain distinct. */
export function projectIdentityKey(project: Pick<Project, "location" | "remoteServerId">): string {
  return `${project.remoteServerId ?? "local"}:${projectLocationKey(project.location)}`;
}

export function dedupeProjects(projects: readonly Project[]): {
  projects: Project[];
  duplicateIds: Map<string, string>;
} {
  const canonicalByIdentity = new Map<string, string>();
  const duplicateIds = new Map<string, string>();
  const unique: Project[] = [];
  for (const project of projects) {
    const existingId = canonicalByIdentity.get(projectIdentityKey(project));
    if (existingId) {
      duplicateIds.set(project.id, existingId);
    } else {
      canonicalByIdentity.set(projectIdentityKey(project), project.id);
      unique.push(project);
    }
  }
  return { projects: unique, duplicateIds };
}

function normalizePath(path: string, caseInsensitive: boolean): string {
  let normalized = path
    .trim()
    .replace(/\\/gu, "/")
    .replace(/\/{2,}/gu, "/");
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/u, "");
  if (caseInsensitive) normalized = normalized.toLocaleLowerCase();
  return normalized;
}
