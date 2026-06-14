import { mkdir } from "node:fs/promises";
import { posix, win32 } from "node:path";
import type { ScratchKind } from "@/shared/createProject";

export interface CreateProjectDirectoryPayload {
  /** Absolute parent directory (native path, or a `\\wsl...` UNC path). */
  parent: string;
  /** New folder name (already validated by the renderer). */
  name: string;
  kind: ScratchKind;
}

/** Translate a Node `mkdir` error into a message fit to show the user. */
export function describeMkdirError(error: unknown, name: string): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  switch (code) {
    case "EACCES":
    case "EPERM":
      return `You don't have permission to create "${name}" there.`;
    case "ENOSPC":
      return "There isn't enough disk space to create the folder.";
    case "ENOENT":
      return "That parent folder no longer exists. Pick another location.";
    case "ENOTDIR":
      return "The chosen location is not a folder.";
    case "EEXIST":
      return `A folder named "${name}" already exists here.`;
    default:
      return error instanceof Error ? error.message : `Couldn't create "${name}".`;
  }
}

/**
 * Create the directory for a "start from scratch" project. Joins with the
 * separator appropriate to the location kind (posix uses `/`; windows and WSL
 * UNC paths use `\`), refusing to clobber an existing folder. The parent must
 * already exist — `mkdir` is non-recursive so a stale/removed parent (ENOENT)
 * or an existing target (EEXIST) surfaces as a clear error rather than silently
 * materializing the path elsewhere or clobbering it.
 */
export async function createProjectDirectory(
  payload: CreateProjectDirectoryPayload,
): Promise<{ path: string }> {
  const join = payload.kind === "posix" ? posix.join : win32.join;
  const target = join(payload.parent, payload.name);

  try {
    await mkdir(target);
  } catch (error) {
    throw new Error(describeMkdirError(error, payload.name), { cause: error });
  }
  return { path: target };
}
