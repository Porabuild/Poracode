import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolvePoracodePaths, type PoracodePaths } from "@/shared/poracodePaths";
import { migrateLegacyDataOnLaunch, type LegacyDataMigrationOptions } from "./legacyDataMigration";

function ensureBaseDirectories(paths: PoracodePaths): void {
  mkdirSync(paths.baseDir, { recursive: true });
  mkdirSync(paths.worktreesDir, { recursive: true });
  mkdirSync(paths.attachmentsDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.cacheDir, { recursive: true });
}

export function preparePoracodeDataRoot(
  baseDir?: string,
  migrationOptions?: Omit<LegacyDataMigrationOptions, "baseDir">,
): PoracodePaths {
  const paths = resolvePoracodePaths(baseDir);
  try {
    const result = migrateLegacyDataOnLaunch({
      baseDir: paths.baseDir,
      ...migrationOptions,
    });
    if (result.status === "migrated") {
      console.info(`[migrate] imported all available Lightcode data into ${paths.baseDir}`);
    }
  } catch (error) {
    // The source remains untouched and any existing Poracode directory is
    // restored by the migration helper. Keep the app usable so Settings can
    // schedule another attempt instead of presenting an empty fatal launch.
    console.warn(`[migrate] failed to import Lightcode data into ${paths.baseDir}:`, error);
  }
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
