import { posix, win32 } from "node:path";
import type { ProjectLocation, ThreadConfig, ThreadPresentationMode } from "@/shared/contracts";
import { threadCrewBinding } from "@/shared/crew";
import { relativePathInside } from "@/shared/pathContainment";
import { parseWslUncPath } from "@/shared/wsl";
import { crewEditingRoleIds } from "@/supervisor/crossagentMcp/crewBrief";

/**
 * Whether the lead's own edits are watched: the thread has a crew with a role
 * that may edit. A crew whose roles are all told not to edit leaves the edits
 * to the lead, so there is nothing to remind it of.
 */
export function watchesCrewLeadEdits(config: ThreadConfig | undefined): boolean {
  const binding = threadCrewBinding(config);
  return binding !== undefined && crewEditingRoleIds(binding).length > 0;
}

/**
 * Whether a launch is for a GUI crew lead the edit monitor may steer
 * (`CreateStructuredSessionInput.mayReceiveContextSteers`): its crew has a
 * role that may edit and the launch attached Crossagents. A crew change after
 * launch takes effect at the session's next launch.
 */
export function launchMayReceiveContextSteers(
  launchConfig: ThreadConfig,
  presentationMode: ThreadPresentationMode,
  crossagentsAttached: boolean,
): boolean {
  return presentationMode === "gui" && crossagentsAttached && watchesCrewLeadEdits(launchConfig);
}

/**
 * The non-empty `path` of a canonical `file_change` payload. Absent while a
 * provider has not reported it yet, and for tools misread as edits by their
 * name (an MCP tool called `*_replace`, say), which carry an empty path.
 */
export function fileChangePath(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("path" in payload)) return undefined;
  const { path } = payload;
  return typeof path === "string" && path.length > 0 ? path : undefined;
}

/**
 * Whether `path`, as an agent reports it, names a file inside the project.
 * A relative path resolves against the project root; a WSL agent reports
 * Linux paths, or the distro's UNC form. Lexical: links are not resolved.
 */
export function isProjectFilePath(location: ProjectLocation, path: string): boolean {
  return Boolean(projectRelativePath(location, path));
}

/** Whether two locations share files: one is the other or lies inside it. */
export function projectLocationsOverlap(a: ProjectLocation, b: ProjectLocation): boolean {
  return containsOrIs(a, b) || containsOrIs(b, a);
}

function containsOrIs(root: ProjectLocation, other: ProjectLocation): boolean {
  if (other.kind !== root.kind) return false;
  if (other.kind === "wsl") {
    if (root.kind !== "wsl" || !sameDistro(root.distro, other.distro)) return false;
    return projectRelativePath(root, other.linuxPath) !== undefined;
  }
  return projectRelativePath(root, other.path) !== undefined;
}

/** `path` relative to the project root, "" for the root itself; undefined outside it. */
function projectRelativePath(location: ProjectLocation, path: string): string | undefined {
  if (location.kind === "windows") return relativeWithin(win32, location.path, path);
  let linuxPath = path;
  if (location.kind === "wsl" && path.startsWith("\\\\")) {
    const unc = parseWslUncPath(path);
    if (!unc || !sameDistro(unc.distro, location.distro)) return undefined;
    linuxPath = unc.linuxPath;
  }
  // A Windows drive path never lies inside a POSIX or in-distro root.
  if (/^[A-Za-z]:[\\/]/u.test(linuxPath)) return undefined;
  return relativeWithin(
    posix,
    location.kind === "wsl" ? location.linuxPath : location.path,
    linuxPath,
  );
}

function relativeWithin(paths: typeof posix, root: string, path: string): string | undefined {
  const target = paths.resolve(root, path);
  return paths.relative(root, target) === "" ? "" : relativePathInside(root, target, paths);
}

function sameDistro(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
