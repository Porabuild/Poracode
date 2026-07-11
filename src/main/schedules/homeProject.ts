import { homedir } from "node:os";
import type { Project, ProjectLocation } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { dbGetProjects, dbUpsertProject } from "../db";

/** Home-scope location, matching the `getHomeScopeLocation` main-local handler. */
export function homeScopeLocation(): ProjectLocation {
  return process.platform === "win32"
    ? { kind: "windows", path: homedir() }
    : { kind: "posix", path: homedir() };
}

/**
 * Resolve the persisted "Home" project row that scheduled-run threads live
 * under. Reuses an existing row if the renderer (or a previous run) already
 * created one, so the two never diverge; otherwise creates it with the exact
 * shape the renderer's `ensureHomeProject` uses (same fixed id/name, disabled).
 */
export function ensureHomeProjectRow(): Project {
  const existing = dbGetProjects().find((project) => project.id === HOME_PROJECT_ID);
  if (existing) return existing;

  const project: Project = {
    id: HOME_PROJECT_ID,
    name: HOME_PROJECT_NAME,
    location: homeScopeLocation(),
    disabled: true,
    createdAt: new Date().toISOString(),
  };
  dbUpsertProject(project, 0);
  return project;
}
