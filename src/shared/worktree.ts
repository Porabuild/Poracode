import type { ProjectLocation } from "./contracts";
import { toWslUncPath } from "./wsl";

/** Sanitize a branch name into a safe directory segment. */
function sanitizeBranchName(branch: string): string {
  return branch
    .replace(/^origin\//, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
}

/**
 * Compute the worktree directory path for a given project location and branch.
 * Places the worktree as a sibling to the project directory:
 *   <projectDir>/../<projectName>-<sanitizedBranch>
 */
export function computeWorktreePath(location: ProjectLocation, branch: string): string {
  const sanitized = sanitizeBranchName(branch);
  if (location.kind === "wsl") {
    const segments = location.linuxPath.split("/").filter(Boolean);
    const basename = segments.at(-1) ?? "project";
    const parentPath = "/" + segments.slice(0, -1).join("/");
    return `${parentPath}/${basename}-${sanitized}`;
  }
  const sep = location.path.includes("/") ? "/" : "\\";
  const segments = location.path.split(/[\\/]/).filter(Boolean);
  const basename = segments.at(-1) ?? "project";
  const parentSegments = segments.slice(0, -1);
  if (sep === "\\") {
    return parentSegments.join("\\") + `\\${basename}-${sanitized}`;
  }
  return "/" + parentSegments.join("/") + `/${basename}-${sanitized}`;
}

/**
 * Build a ProjectLocation pointing at a worktree directory.
 * Inherits kind/distro from the original project location.
 */
export function buildWorktreeLocation(
  original: ProjectLocation,
  worktreePath: string,
): ProjectLocation {
  if (original.kind === "wsl") {
    return {
      kind: "wsl",
      distro: original.distro,
      linuxPath: worktreePath,
      uncPath: toWslUncPath(original.distro, worktreePath),
    };
  }
  if (original.kind === "posix") {
    return { kind: "posix", path: worktreePath };
  }
  return { kind: "windows", path: worktreePath };
}
