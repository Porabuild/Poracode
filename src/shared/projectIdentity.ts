import type { Project, ProjectLocation } from "./contracts";
import { HOME_PROJECT_ID } from "./homeScope";

export interface ProjectIdentityOptions {
  /** macOS's default volume comparison is case-insensitive. */
  caseInsensitivePosix?: boolean;
}

/**
 * Stable identity for a project location. Project names are labels and may be
 * changed, while a location can only represent one project on a given host.
 */
export function projectLocationKey(
  location: ProjectLocation,
  options: ProjectIdentityOptions = {},
): string {
  if (location.kind === "wsl") {
    return `wsl:${location.distro.trim().toLocaleLowerCase()}:${normalizePath(location.linuxPath, false)}`;
  }
  return `${location.kind}:${normalizePath(
    location.path,
    location.kind === "windows" ||
      (location.kind === "posix" && options.caseInsensitivePosix === true),
    location.kind === "windows",
  )}`;
}

/** Include the owning desktop so equal paths on different machines remain distinct. */
export function projectIdentityKey(
  project: {
    id?: string | undefined;
    location: ProjectLocation;
    remoteServerId?: string | undefined;
  },
  options?: ProjectIdentityOptions,
): string {
  // Home is a synthetic project, not a project registered at the home path.
  if (project.id === HOME_PROJECT_ID) return `home:${project.id}`;
  const remoteServerId = project.remoteServerId ?? project.location.remoteServerId;
  // A remote host canonicalizes its own POSIX paths. The client's filesystem
  // policy must not collapse two distinct Linux folders when viewed on macOS.
  return `${remoteServerId ?? "local"}:${projectLocationKey(
    project.location,
    remoteServerId ? { caseInsensitivePosix: false } : options,
  )}`;
}

export function dedupeProjects(
  projects: readonly Project[],
  options?: ProjectIdentityOptions,
): {
  projects: Project[];
  duplicateIds: Map<string, string>;
} {
  const canonicalByIdentity = new Map<string, string>();
  const duplicateIds = new Map<string, string>();
  const unique: Project[] = [];
  for (const project of projects) {
    const existingId = canonicalByIdentity.get(projectIdentityKey(project, options));
    if (existingId) {
      if (project.id !== existingId) duplicateIds.set(project.id, existingId);
    } else {
      canonicalByIdentity.set(projectIdentityKey(project, options), project.id);
      unique.push(project);
    }
  }
  return { projects: unique, duplicateIds };
}

export function findProjectLocationConflict(
  projects: readonly Project[],
  project: Project,
  location: ProjectLocation,
  options?: ProjectIdentityOptions,
): Project | undefined {
  const identity = projectIdentityKey({ ...project, location }, options);
  return projects.find(
    (candidate) =>
      candidate.id !== project.id && projectIdentityKey(candidate, options) === identity,
  );
}

function normalizePath(path: string, caseInsensitive: boolean, windowsPath = false): string {
  const separators = windowsPath ? path.replace(/\\/gu, "/") : path;
  const hasUncPrefix = windowsPath && separators.startsWith("//") && !separators.startsWith("///");
  let normalized = separators.replace(/\/{2,}/gu, "/");
  if (hasUncPrefix) normalized = `/${normalized}`;
  // A drive root is absolute; a bare drive name is relative to that drive's cwd.
  const isDriveRoot = windowsPath && /^[a-z]:\/$/iu.test(normalized);
  if (normalized.length > 1 && !isDriveRoot) normalized = normalized.replace(/\/+$/u, "");
  if (caseInsensitive) normalized = normalized.toLocaleLowerCase();
  return normalized;
}
