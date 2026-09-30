import { posix, win32 } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { REMOTE_PROCEDURE_SPECS, type RemoteProcedureName } from "@/shared/remote";
import { buildWorktreeLocation } from "@/shared/worktree";
import { isHomeProject } from "@/shared/homeScope";
import { dbGetProjects, dbGetThreads } from "@/host/db";
import { RemoteHttpError } from "../auth";

/** Session scopes address registered projects and their durable worktrees.
 * Use the stored location after matching, so caller-supplied WSL UNC paths
 * cannot redirect a supervisor operation to a different filesystem root.
 * Project-management procedures deliberately permit broader host access.
 */
export function authorizeProjectProcedurePayload(
  procedure: RemoteProcedureName,
  payload: unknown,
  canManageHostFiles: () => boolean = () => false,
): void {
  const spec = REMOTE_PROCEDURE_SPECS[procedure];
  if (spec.scope === "projects:manage") return;
  const fields =
    spec.owner === "projectLocation" || spec.owner === "optionalProjectLocation"
      ? ["projectLocation"]
      : spec.owner === "worktreeLocation"
        ? ["worktreeLocation"]
        : spec.owner === "location"
          ? ["location"]
          : [];
  if (fields.length === 0) return;
  const record = payload as Record<string, unknown>;
  if (spec.owner === "optionalProjectLocation" && record.projectLocation === undefined) return;
  let locations: ProjectLocation[];
  try {
    const projects = dbGetProjects().filter(
      (project) =>
        !isHomeProject(project) ||
        spec.scope !== "session:read" ||
        spec.owner !== "projectLocation" ||
        canManageHostFiles(),
    );
    const projectById = new Map(projects.map((project) => [project.id, project]));
    locations = projects.map((project) => project.location);
    for (const thread of dbGetThreads()) {
      const project = projectById.get(thread.projectId);
      if (project && thread.worktreePath) {
        locations.push(buildWorktreeLocation(project.location, thread.worktreePath));
      }
    }
  } catch {
    throw new RemoteHttpError(
      "project_registry_unavailable",
      "Project ownership could not be verified.",
      503,
    );
  }
  for (const field of fields) {
    const requested = record[field] as ProjectLocation | undefined;
    const stored = requested && locations.find((location) => sameLocation(location, requested));
    if (!stored) {
      throw new RemoteHttpError(
        "project_location_not_registered",
        "Project location is not registered on this desktop.",
        403,
      );
    }
    record[field] = { ...stored };
  }
}

function sameLocation(left: ProjectLocation, right: ProjectLocation): boolean {
  if (left.kind !== right.kind || left.remoteServerId !== right.remoteServerId) return false;
  if (left.kind === "wsl" && right.kind === "wsl") {
    return (
      left.distro.toLowerCase() === right.distro.toLowerCase() &&
      posix.resolve(left.linuxPath) === posix.resolve(right.linuxPath)
    );
  }
  if (left.kind === "windows" && right.kind === "windows") {
    return win32.resolve(left.path).toLowerCase() === win32.resolve(right.path).toLowerCase();
  }
  return (
    left.kind === "posix" &&
    right.kind === "posix" &&
    posix.resolve(left.path) === posix.resolve(right.path)
  );
}
