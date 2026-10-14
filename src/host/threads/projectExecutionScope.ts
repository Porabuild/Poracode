import { isDeepStrictEqual } from "node:util";
import type { Project } from "@/shared/contracts";

export type ProjectExecutionScope = Pick<Project, "location" | "remoteServerId">;

/** Capture every execution target field; sidebar identity normalization is not admission. */
export function captureProjectExecutionScope(
  project: ProjectExecutionScope,
): ProjectExecutionScope {
  return {
    location: structuredClone(project.location),
    ...(project.remoteServerId !== undefined ? { remoteServerId: project.remoteServerId } : {}),
  };
}

/** Home IDs, normalized paths, or one remote tag must not hide a changed target. */
export function hasSameProjectExecutionScope(
  project: ProjectExecutionScope,
  captured: ProjectExecutionScope,
): boolean {
  return (
    project.remoteServerId === captured.remoteServerId &&
    isDeepStrictEqual(project.location, captured.location)
  );
}
