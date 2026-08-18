import type { Project, ProjectLocation } from "./contracts";

// Persisted in project/thread rows; keep the legacy ID so upgraded databases
// do not create a second Home project or orphan existing Home threads.
export const HOME_PROJECT_ID = "__lightcode_home__";
export const HOME_PROJECT_NAME = "Home";

export function isHomeProjectId(projectId: string | undefined): boolean {
  return projectId === HOME_PROJECT_ID;
}

export function isHomeProject(project: Pick<Project, "id"> | undefined): boolean {
  return isHomeProjectId(project?.id);
}

/**
 * True when the workspace *is* the user home directory (Poracode's Home
 * scope). Home is a projectless OS-level session, so agents must not be
 * confined to that folder — every provider, not just ACP.
 */
export function isHomeScopeLocation(location: ProjectLocation): boolean {
  const raw = location.kind === "wsl" ? location.linuxPath : location.path;
  const normalized = raw.replace(/\\/gu, "/").replace(/\/+$/u, "");
  if (location.kind === "windows" || /^[A-Za-z]:\//.test(normalized)) {
    return /^[A-Za-z]:\/Users\/[^/]+$/i.test(normalized);
  }
  return /^\/(?:home\/[^/]+|Users\/[^/]+|root)$/.test(normalized);
}
