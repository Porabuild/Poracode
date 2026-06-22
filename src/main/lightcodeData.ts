import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveLightcodePaths, type LightcodePaths } from "@/shared/lightcodePaths";

function ensureBaseDirectories(paths: LightcodePaths): void {
  mkdirSync(paths.baseDir, { recursive: true });
  mkdirSync(paths.worktreesDir, { recursive: true });
  mkdirSync(paths.attachmentsDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.cacheDir, { recursive: true });
}

export function prepareLightcodeDataRoot(baseDir?: string): LightcodePaths {
  const paths = resolveLightcodePaths(baseDir);
  ensureBaseDirectories(paths);
  return paths;
}

/**
 * Remove attachment subdirectories that don't belong to any known thread.
 * Call after the database is initialized.
 */
export function cleanupOrphanedAttachments(attachmentsDir: string, validThreadIds: string[]): void {
  if (!existsSync(attachmentsDir)) return;

  const validDirNames = new Set(validThreadIds.map((id) => id.replace(/:/g, "-").slice(0, 12)));

  let entries: string[];
  try {
    entries = readdirSync(attachmentsDir);
  } catch (error) {
    console.warn("[attachments] failed to read attachments directory for cleanup:", error);
    return;
  }

  for (const entry of entries) {
    // Draft-pane attachments live under directories prefixed with `draft-` and
    // are referenced by file path from persisted user messages once the draft
    // is sent. Keep them so re-opened threads can still resolve their images.
    if (entry.startsWith("draft-")) continue;
    if (!validDirNames.has(entry)) {
      rmSync(join(attachmentsDir, entry), { recursive: true, force: true });
    }
  }
}
