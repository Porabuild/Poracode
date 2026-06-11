import type { ProjectLocation } from "./contracts";
import { toWslUncPath } from "./wsl";

/** Sanitize a branch name into a stable directory segment. */
export function sanitizeWorktreeBranchName(branch: string): string {
  const sanitized = branch
    .replace(/^origin\//, "")
    .replace(/\//g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return sanitized || "worktree";
}

/** Sanitize an arbitrary path segment for use in a directory name. */
export function sanitizeWorktreePathSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return sanitized || "project";
}

/**
 * Parse the "copy ignored files" textarea into a clean pattern list:
 * one gitignore-style pattern per line, blanks and `#` comments dropped.
 */
export function parseCopyPatterns(text: string): string[] {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
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
