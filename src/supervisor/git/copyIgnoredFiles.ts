import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import micromatch from "micromatch";
import type { ProjectLocation } from "@/shared/contracts";
import { getProjectFsPath } from "@/shared/wsl";
import { buildWorktreeLocation } from "@/shared/worktree";
import { execGit } from "./exec";

/**
 * Filter `git ls-files --others --ignored --directory` entries (relative
 * paths, collapsed ignored directories ending in `/`) down to those matching
 * the user's gitignore-style copy patterns.
 */
export function matchIgnoredCopyEntries(entries: string[], patterns: string[]): string[] {
  const normalizedPatterns = patterns.map((pattern) => pattern.replace(/\/+$/, "")).filter(Boolean);
  if (normalizedPatterns.length === 0) return [];
  return entries.filter((entry) =>
    micromatch.isMatch(entry.replace(/\/+$/, ""), normalizedPatterns, {
      dot: true,
      matchBase: true,
    }),
  );
}

/**
 * Copy gitignored files from the main project into a newly created worktree.
 *
 * Candidates are enumerated with git so only files actually ignored in the
 * main project can match — a fresh checkout's tracked files are never
 * touched. Existing destination files are never overwritten. Per-entry copy
 * failures are logged and skipped; enumeration failures propagate to the
 * caller, which treats the whole step as non-fatal.
 */
export async function copyIgnoredFilesIntoWorktree(
  location: ProjectLocation,
  worktreePath: string,
  patterns: string[],
): Promise<void> {
  if (patterns.length === 0) return;

  const raw = await execGit(location, [
    "ls-files",
    "-z",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--directory",
  ]);
  const entries = raw.split("\0").filter(Boolean);
  const matched = matchIgnoredCopyEntries(entries, patterns);

  const sourceRoot = getProjectFsPath(location);
  const destRoot = getProjectFsPath(buildWorktreeLocation(location, worktreePath));

  await Promise.all(
    matched.map(async (entry) => {
      const relative = entry.replace(/\/+$/, "");
      const source = join(sourceRoot, relative);
      const dest = join(destRoot, relative);
      try {
        await mkdir(dirname(dest), { recursive: true });
        await cp(source, dest, { recursive: true, force: false, errorOnExist: false });
      } catch (err) {
        console.warn(`[supervisor] failed to copy ignored file "${entry}" into worktree:`, err);
      }
    }),
  );
}
