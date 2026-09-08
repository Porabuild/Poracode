import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

/**
 * Filesystem containment used to enforce the Agent Plugins package boundary.
 *
 * The specification requires that every package file remain within the
 * filesystem-resolved root *after* resolving symlinks, junctions, and reparse
 * points — so containment is decided on real paths, not lexical ones.
 *
 * @see https://agent-plugins.org/client-implementers/loading-and-discovery
 */

/** Strips Windows `\\?\` / `\\?\UNC\` prefixes so paths compare consistently. */
export function normalizeWindowsNamespacePath(path: string): string {
  let normalized = path;
  if (normalized.startsWith("\\\\?\\UNC\\")) normalized = `\\\\${normalized.slice(8)}`;
  else if (normalized.startsWith("\\\\?\\")) normalized = normalized.slice(4);
  else if (normalized.startsWith("//?/UNC/")) normalized = `//${normalized.slice(8)}`;
  else if (normalized.startsWith("//?/")) normalized = normalized.slice(4);
  return normalized;
}

/** Lexical containment. Returns the relative path when `target` is under `root`. */
export function relativePathInside(root: string, target: string): string | undefined {
  const candidate = relative(root, target);
  if (!candidate || isAbsolute(candidate) || candidate.split(/[\\/]/u)[0] === "..") {
    return undefined;
  }
  return candidate;
}

/**
 * Real-path containment. Returns the relative path when `target` resolves inside
 * `root`, or `undefined` when it escapes.
 *
 * A path that does not exist yet is placed under the real path of its nearest
 * existing ancestor, so callers validating a *configured* path (not an existing
 * file) still get a real-path answer.
 */
export function relativePolicyPath(root: string, target: string): string | undefined {
  const normalizedRoot = resolve(normalizeWindowsNamespacePath(root));
  const normalizedTarget = resolve(normalizeWindowsNamespacePath(target));
  return relativePathInside(
    realpathOfNearestAncestor(normalizedRoot),
    realpathOfNearestAncestor(normalizedTarget),
  );
}

/**
 * Real path of `path`, resolving as much of it as exists on disk and appending
 * the missing tail verbatim. A path that does not exist yet (a not-yet-written
 * skill, a `nested/SKILL.md` probe) is still placed under its real parent —
 * otherwise a symlinked root (macOS `/var` → `/private/var`) never matches a
 * target spelled through the alias.
 */
function realpathOfNearestAncestor(path: string): string {
  const missing: string[] = [];
  let current = path;
  for (;;) {
    try {
      return missing.length === 0
        ? resolve(realpathSync.native(current))
        : resolve(realpathSync.native(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return path;
      missing.push(basename(current));
      current = parent;
    }
  }
}

/** True when `target` is the same path as `root` or resolves inside it. */
export function isPathInsideRoot(root: string, target: string): boolean {
  if (relativePolicyPath(root, target) !== undefined) return true;
  try {
    return resolve(realpathSync.native(root)) === resolve(realpathSync.native(target));
  } catch {
    return (
      resolve(normalizeWindowsNamespacePath(root)) ===
      resolve(normalizeWindowsNamespacePath(target))
    );
  }
}

/**
 * Resolves the filesystem-resolved package boundary for a plugin directory.
 * Returns `undefined` when the directory cannot be resolved.
 */
export function resolvePackageBoundary(root: string): string | undefined {
  try {
    return resolve(realpathSync.native(root));
  } catch {
    return undefined;
  }
}
