import type { ProjectLocation, ProjectWorktreeLocation, WorktreeStorageMode } from "./contracts";
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

/** Global worktree-placement settings (subset of SharedSettings). */
export interface WorktreePlacementSettings {
  worktreeStorageMode: WorktreeStorageMode;
  /** Native custom root; empty = built-in default. */
  worktreeBasePath: string;
  /** WSL custom root (Linux path); empty = built-in default. */
  wslWorktreeBasePath: string;
}

/** Resolved worktree placement passed to the supervisor's worktree create. */
export interface WorktreePlacement {
  /** Worktree root, or `undefined` to use the supervisor's built-in default. */
  root?: string;
  /** True for project-relative placement (skip the disambiguating repo-hash segment). */
  omitRepoDir: boolean;
}

/** Join `base` with `parts` using `sep`, trimming any trailing separators on `base`. */
function joinWorktreeSegments(base: string, parts: string[], sep: "/" | "\\"): string {
  const trimmed = base.replace(/[\\/]+$/, "");
  return [trimmed, ...parts].join(sep);
}

/**
 * Resolve where a project's worktrees should live, applying precedence
 * (per-project override → global settings → built-in default). Pure and
 * renderer-safe (no `node:path`); the supervisor appends the per-branch segment.
 *
 * - **project-relative** → `<project>/.lightcode/worktrees`, `omitRepoDir: true`.
 * - **global + custom base** → that base, `omitRepoDir: false`.
 * - **global + empty base** → `root: undefined` (supervisor default), `omitRepoDir: false`.
 */
export function resolveWorktreePlacement(
  settings: WorktreePlacementSettings,
  override: ProjectWorktreeLocation | undefined,
  location: ProjectLocation,
): WorktreePlacement {
  const mode = override?.mode ?? settings.worktreeStorageMode;

  if (mode === "project-relative") {
    const base = location.kind === "wsl" ? location.linuxPath : location.path;
    const sep = location.kind === "windows" ? "\\" : "/";
    return {
      root: joinWorktreeSegments(base, [".lightcode", "worktrees"], sep),
      omitRepoDir: true,
    };
  }

  const globalBase =
    location.kind === "wsl" ? settings.wslWorktreeBasePath : settings.worktreeBasePath;
  const root = (override?.basePath?.trim() || globalBase).trim();
  return root ? { root, omitRepoDir: false } : { omitRepoDir: false };
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
