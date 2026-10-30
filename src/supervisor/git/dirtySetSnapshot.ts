import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { joinProjectPosixPath } from "@/shared/wsl";
import type { WslBridgeClient } from "../wsl/bridge/client";
import { GIT_STATUS_TIMEOUT, execGit } from "./exec";
import { parseStatusPorcelainV2 } from "./statusParsing";

/**
 * The dirty set of a project's subtree: every path `git status` reports there
 * (staged, unstaged, untracked or conflicted), relative to the project
 * directory, mapped to a content fingerprint, `size:mtimeMs`, or `missing` for
 * a deleted path. Two snapshots differ for a path that was written, created
 * or deleted between them.
 */
export type DirtySetSnapshot = ReadonlyMap<string, string>;

/** Above this many dirty paths a snapshot is skipped rather than paid for. */
const MAX_DIRTY_PATHS = 2_000;
const MISSING = "missing";

/**
 * Snapshots the dirty set of `location` with one read-only `git status`
 * (through `execGit`, so WSL locations run inside the distro and native ones
 * take no optional index lock) plus one stat per dirty path: `lstat` on the
 * host, or one batched bridge `stat` for WSL. The `.` pathspec keeps a project
 * that is one package of a larger repository to its own subtree; porcelain v2
 * then reports paths relative to that directory (git's default
 * `status.relativePaths`; with it off they are repository-relative, stat as
 * missing, and only newly dirty paths still register). Undefined when the
 * location is not a git worktree, git or the stat fails, or the dirty set is
 * too large.
 */
export async function readDirtySetSnapshot(
  location: ProjectLocation,
  wslClient: WslBridgeClient | undefined,
): Promise<DirtySetSnapshot | undefined> {
  try {
    const output = await execGit(
      location,
      ["status", "--porcelain=v2", "--untracked-files=all", "--", "."],
      { timeout: GIT_STATUS_TIMEOUT },
    );
    const parsed = parseStatusPorcelainV2(output);
    const paths = [
      ...new Set([
        ...parsed.staged.map((file) => file.path),
        ...parsed.unstaged.map((file) => file.path),
        ...parsed.conflictFiles,
      ]),
    ];
    if (paths.length > MAX_DIRTY_PATHS) return undefined;
    const fingerprints = await fingerprintPaths(location, paths, wslClient);
    return fingerprints
      ? new Map(paths.map((path, index) => [path, fingerprints[index]!]))
      : undefined;
  } catch {
    return undefined;
  }
}

async function fingerprintPaths(
  location: ProjectLocation,
  paths: readonly string[],
  wslClient: WslBridgeClient | undefined,
): Promise<string[] | undefined> {
  if (paths.length === 0) return [];
  if (location.kind === "wsl") {
    if (!wslClient) return undefined;
    const { stats } = await wslClient.stat(
      location,
      paths.map((path) => joinProjectPosixPath(location, path)),
    );
    if (stats.length !== paths.length) return undefined;
    return stats.map((stat) =>
      stat.exists ? fingerprint(stat.size ?? 0, stat.mtimeMs ?? 0) : MISSING,
    );
  }
  return Promise.all(
    paths.map((path) =>
      lstat(join(location.path, path)).then(
        (stat) => fingerprint(stat.size, stat.mtimeMs),
        () => MISSING,
      ),
    ),
  );
}

function fingerprint(size: number, mtimeMs: number): string {
  return `${size}:${mtimeMs}`;
}
