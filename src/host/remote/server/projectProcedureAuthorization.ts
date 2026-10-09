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
 * Returns the matched registry owner identities for volatile file-grant binding.
 * Project-management procedures deliberately permit broader host access.
 */
export function authorizeProjectProcedurePayload(
  procedure: RemoteProcedureName,
  payload: unknown,
  canManageHostFiles: () => boolean = () => false,
): Readonly<Record<string, string>> | undefined {
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
  let locations: { location: ProjectLocation; projectId: string }[];
  try {
    const projects = dbGetProjects().filter(
      (project) =>
        !isHomeProject(project) ||
        spec.scope !== "session:read" ||
        spec.owner !== "projectLocation" ||
        canManageHostFiles(),
    );
    const projectById = new Map(projects.map((project) => [project.id, project]));
    locations = projects.map((project) => ({
      location: project.location,
      projectId: project.id,
    }));
    for (const thread of dbGetThreads()) {
      const project = projectById.get(thread.projectId);
      if (project && thread.worktreePath) {
        locations.push({
          location: buildWorktreeLocation(project.location, thread.worktreePath),
          projectId: project.id,
        });
      }
    }
  } catch {
    throw new RemoteHttpError(
      "project_registry_unavailable",
      "Project ownership could not be verified.",
      503,
    );
  }
  const owners: Record<string, string> = {};
  for (const field of fields) {
    const requested = record[field] as ProjectLocation | undefined;
    const stored = requested && locations.find(({ location }) => sameLocation(location, requested));
    if (!stored) {
      throw new RemoteHttpError(
        "project_location_not_registered",
        "Project location is not registered on this desktop.",
        403,
      );
    }
    record[field] = { ...stored.location };
    owners[field] = JSON.stringify([
      stored.projectId,
      canonicalRegisteredLocation(stored.location),
    ]);
  }
  return owners;
}

/** Fixed field order and native path normalization keep a registered location independent
 * of a representative thread, spelling/trailing separators, or object property order.
 * WSL host routing is included: a stored UNC-root change must not keep a prior file grant.
 */
function canonicalRegisteredLocation(location: ProjectLocation) {
  const remoteServerId = location.remoteServerId ?? null;
  if (location.kind === "wsl")
    return {
      kind: location.kind,
      distro: location.distro.toLowerCase(),
      linuxPath: posix.resolve(location.linuxPath),
      uncPath: win32.resolve(location.uncPath).toLowerCase(),
      remoteServerId,
    };
  return {
    kind: location.kind,
    path:
      location.kind === "windows"
        ? win32.resolve(location.path).toLowerCase()
        : posix.resolve(location.path),
    remoteServerId,
  };
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
